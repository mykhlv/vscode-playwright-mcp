/**
 * MCP server setup: composites @playwright/mcp browser tools with our VS Code-specific tools.
 *
 * Architecture:
 * 1. createConnection() from @playwright/mcp registers ~28 browser_* tools on a raw Server
 * 2. We intercept the Server's tools/list and tools/call handlers
 * 3. tools/list → filter irrelevant tools, alias browser_* → vscode_*, append our tools
 * 4. tools/call → resolve vscode_* aliases back to browser_*, route to handlers
 *
 * Lazy discovery:
 * Before vscode_launch, only vscode_launch is visible (saves ~10k context tokens).
 * After launch, sends tools/list_changed notification → client sees all 26 tools.
 * After close, sends tools/list_changed again → back to 1 tool.
 * Clients that don't support list_changed get all tools upfront (fallback).
 */

import { createConnection } from '@playwright/mcp';
import { SessionManager } from './session/session-manager.js';
import { GifRecorder } from './session/gif-recorder.js';
import { ContextBridge } from './context-bridge.js';
import { createVSCodeTools } from './tools/index.js';
import { ErrorCode, ToolError } from './types/errors.js';
import { withTimeout } from './utils/timeout.js';
import { logger } from './utils/logger.js';
import type { ToolResult } from './types/tool-results.js';

// ── Alias map: browser_* → vscode_* ─────────────────────────
// Upstream tools exposed under the vscode_* namespace for a unified LLM experience.

const BROWSER_TO_VSCODE: Record<string, string> = {
  browser_snapshot:          'vscode_snapshot',
  browser_take_screenshot:   'vscode_screenshot',
  browser_click:             'vscode_click',
  browser_type:              'vscode_type',
  browser_press_key:         'vscode_press_key',
  browser_hover:             'vscode_hover',
  browser_drag:              'vscode_drag',
  browser_evaluate:          'vscode_evaluate',
  browser_wait_for:          'vscode_wait_for',
  browser_console_messages:  'vscode_console',
  browser_mouse_click_xy:    'vscode_click_xy',
  browser_mouse_move_xy:     'vscode_hover_xy',
  browser_mouse_drag_xy:     'vscode_drag_xy',
  browser_select_option:     'vscode_select_option',
  browser_fill_form:         'vscode_fill_form',
};

// Reverse map: vscode_* alias → browser_* upstream name
const VSCODE_TO_BROWSER = new Map(
  Object.entries(BROWSER_TO_VSCODE).map(([browser, vscode]) => [vscode, browser]),
);

/** Override upstream descriptions to add VS Code-specific guidance. */
const DESCRIPTION_OVERRIDES: Record<string, string> = {
  vscode_type: 'Type text into focused UI element (search box, input field, Command Palette). ' +
    'NOTE: Does NOT work in the Monaco code editor — use vscode_press_key for typing into the editor.',
};

/** Browser tools to filter out completely (nonsensical for VS Code Electron). */
const FILTERED_BROWSER_TOOLS = new Set([
  'browser_resize',          // Superseded by native vscode_resize (Electron BrowserWindow resize)
  'browser_close',           // Must use vscode_close for cleanup (temp dirs, PIDs, state)
  'browser_navigate',        // No URL navigation in Electron
  'browser_navigate_back',   // No navigation history
  'browser_file_upload',     // Not typically used with VS Code
  'browser_handle_dialog',   // VS Code dialogs work differently
  'browser_install',         // Not relevant for Electron
  'browser_tabs',            // VS Code has editor tabs, not browser tabs
  'browser_mouse_down',      // Too low-level, vscode_click is sufficient
  'browser_mouse_up',        // Pairs with mouse_down
  'browser_mouse_wheel',     // Duplicates vscode_scroll with worse API
  'browser_network_requests', // Niche, confuses LLM
  'browser_run_code',        // Dangerous, overlaps with vscode_evaluate
]);

/** Tools that should NOT trigger auto-capture of GIF frames. */
const SKIP_GIF_CAPTURE = new Set([
  // Our native tools
  'vscode_gif', 'vscode_launch', 'vscode_close',
  'vscode_get_hover', 'vscode_get_state',
  'vscode_zoom', 'vscode_find_element', 'vscode_resize',
  // Aliased upstream read-only tools (use vscode_* names since that's what we route)
  'vscode_snapshot', 'vscode_console',
  'vscode_evaluate', 'vscode_wait_for',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandlerFn = (request: any, extra: any) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolSchema = { name: string; description: string; inputSchema: unknown; [key: string]: any };

/** Build a consistent MCP error response. */
function mcpError(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    isError: true as const,
  };
}

export async function createServer() {
  const session = new SessionManager();
  const bridge = new ContextBridge();
  const recorder = new GifRecorder();

  // Create @playwright/mcp server with our context bridge
  const server = await createConnection(
    { capabilities: ['core', 'vision'] },
    () => bridge.getContext(),
  );

  // Enable listChanged capability so clients know we send tools/list_changed notifications.
  // Must be called before server.connect() (enforced by SDK).
  const maybeRegisterCapabilities = (server as unknown as {
    registerCapabilities?: (caps: Record<string, unknown>) => void;
  }).registerCapabilities;
  if (typeof maybeRegisterCapabilities === 'function') {
    maybeRegisterCapabilities.call(server, { tools: { listChanged: true } });
  } else {
    logger.warn('sdk_missing_registerCapabilities', {
      hint: 'server.registerCapabilities not found — listChanged capability will not be advertised. Check @playwright/mcp version.',
    });
  }

  // Get the raw handler map from the MCP SDK Server (Protocol base class).
  // These are private internals — fail fast with a clear message if SDK changes.
  const handlers = (server as unknown as { _requestHandlers: Map<string, HandlerFn> })._requestHandlers;
  const maybeListHandler = handlers.get('tools/list');
  const maybeCallHandler = handlers.get('tools/call');
  if (!maybeListHandler || !maybeCallHandler) {
    throw new Error(
      'Incompatible @playwright/mcp version: expected tools/list and tools/call handlers. ' +
      'Check that @playwright/mcp version matches the range in package.json.',
    );
  }
  // Assigned after null-check so TS narrows the type inside closures
  const originalListHandler = maybeListHandler;
  const originalCallHandler = maybeCallHandler;

  // Notification sender for tools/list_changed
  let listChangedSent = false;
  const maybeNotification = (server as unknown as {
    notification?: (n: { method: string }) => Promise<void>;
  }).notification;
  const sendListChanged = () => {
    listChangedSent = true;
    if (typeof maybeNotification !== 'function') {
      logger.warn('sdk_missing_notification', {
        hint: 'server.notification not found — tools/list_changed will not be sent. Check @playwright/mcp version.',
      });
      return;
    }
    maybeNotification.call(server, { method: 'notifications/tools/list_changed' })
      .catch((err: unknown) => {
        // Client may not support notifications — not fatal
        logger.debug('list_changed_notification_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  };

  // Build our VS Code-specific tool definitions
  const vsCodeTools = createVSCodeTools(session, bridge, recorder);
  const nativeToolMap = new Map(vsCodeTools.map((t) => [t.name, t]));

  // Find the launch tool schema (always visible)
  const launchTool = vsCodeTools.find((t) => t.name === 'vscode_launch')!;
  const launchToolSchema: ToolSchema = {
    name: launchTool.name,
    description: launchTool.description,
    inputSchema: launchTool.inputSchema,
  };

  // All native tool schemas (visible after launch)
  const nativeToolSchemas: ToolSchema[] = vsCodeTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  // ── Cached full tool list (upstream tools are static) ──────
  let cachedFullToolList: ToolSchema[] | null = null;

  async function getFullToolList(request: unknown, extra: unknown): Promise<ToolSchema[]> {
    if (cachedFullToolList) return cachedFullToolList;

    const upstream = await originalListHandler(request, extra);

    // Filter and alias upstream tools
    const aliasedTools: ToolSchema[] = [];
    for (const tool of upstream.tools as ToolSchema[]) {
      if (FILTERED_BROWSER_TOOLS.has(tool.name)) continue;
      const alias = BROWSER_TO_VSCODE[tool.name];
      if (alias) {
        const description = DESCRIPTION_OVERRIDES[alias] ?? tool.description;
        aliasedTools.push({ ...tool, name: alias, description });
      }
    }

    cachedFullToolList = [...aliasedTools, ...nativeToolSchemas];
    logger.debug('tools_list_cached', {
      aliased: aliasedTools.length,
      native: nativeToolSchemas.length,
      total: cachedFullToolList.length,
    });
    return cachedFullToolList;
  }

  // Track whether client supports listChanged (heuristic: if they re-request after notification)
  let clientSupportsListChanged = false;
  let listRequestCount = 0;

  // ── Intercept tools/list ───────────────────────────────────
  handlers.set('tools/list', async (request, extra) => {
    listRequestCount++;

    // Heuristic: if client re-requests after we sent a list_changed notification,
    // it likely supports dynamic tool discovery. Only then do we enable lazy mode.
    if (listRequestCount > 1 && listChangedSent) {
      clientSupportsListChanged = true;
    }

    // Lazy discovery: before launch, only show vscode_launch
    // But only if client supports list_changed (otherwise show all upfront)
    if (!bridge.isProvided && clientSupportsListChanged) {
      logger.debug('tools_list_lazy', { tools: ['vscode_launch'] });
      return { tools: [launchToolSchema] };
    }

    return { tools: await getFullToolList(request, extra) };
  });

  // ── Intercept tools/call ───────────────────────────────────
  handlers.set('tools/call', async (request, extra) => {
    const toolName: string = request.params?.name ?? '';
    const args: Record<string, unknown> = request.params?.arguments ?? {};

    // Route native vscode_* tools to our handlers
    const nativeTool = nativeToolMap.get(toolName);
    if (nativeTool) {
      try {
        const userTimeout = typeof args['timeout'] === 'number' ? args['timeout'] : 0;
        const effectiveTimeout = Math.max(nativeTool.timeoutMs, userTimeout + 5_000);

        const result = await withTimeout(
          nativeTool.handler(args),
          effectiveTimeout,
          toolName,
        ).catch((error) => {
          if (error instanceof ToolError && error.code === ErrorCode.TIMEOUT && session.isReady) {
            logger.warn('tool_timeout', { tool: toolName, timeoutMs: effectiveTimeout });
            session.markUnresponsive();
          }
          throw error;
        });

        // Notify tools/list_changed after launch or close
        if (toolName === 'vscode_launch' || toolName === 'vscode_close') {
          sendListChanged();
        }

        if (recorder.isRecording) await captureGifFrame(recorder, session, toolName);
        return toMcpResponse(result);
      } catch (error) {
        return toMcpError(error);
      }
    }

    // Resolve vscode_* alias → browser_* upstream name
    const upstreamName = VSCODE_TO_BROWSER.get(toolName);
    if (upstreamName) {
      // Guard: upstream tools require a running VS Code session
      if (!bridge.isProvided) {
        return mcpError(`No VS Code instance is running. Call vscode_launch first, then use ${toolName}.`);
      }

      // Rewrite request with the original browser_* name for upstream
      const rewritten = {
        ...request,
        params: { ...request.params, name: upstreamName },
      };
      try {
        const result = await originalCallHandler(rewritten, extra);
        if (recorder.isRecording) await captureGifFrame(recorder, session, toolName);
        return result;
      } catch (error) {
        return toMcpError(error);
      }
    }

    // Block filtered browser_* tools called directly (shouldn't happen, but guard)
    if (FILTERED_BROWSER_TOOLS.has(toolName)) {
      const hint = toolName === 'browser_close'
        ? 'Use vscode_close instead — it cleans up temporary files and processes.'
        : `${toolName} is not available for VS Code Electron.`;
      return mcpError(hint);
    }

    // Unknown tool
    return mcpError(`Unknown tool: ${toolName}`);
  });

  logger.info('server_created', {
    nativeTools: vsCodeTools.map((t) => t.name),
    aliasedTools: Object.values(BROWSER_TO_VSCODE),
    lazyDiscovery: true,
  });

  return server;
}

/**
 * Auto-capture GIF frame after visual tool calls.
 * Caller should guard with `recorder.isRecording` before calling.
 */
async function captureGifFrame(
  recorder: GifRecorder,
  session: SessionManager,
  toolName: string,
): Promise<void> {
  if (!session.isReady || SKIP_GIF_CAPTURE.has(toolName)) return;
  try {
    const shouldCapture = recorder.captureMode === 'manual'
      ? toolName === 'vscode_screenshot'
      : true;
    if (shouldCapture) {
      await recorder.captureFrame(session.getPage());
    }
  } catch (captureError) {
    logger.warn('gif_capture_after_tool_failed', {
      tool: toolName,
      error: captureError instanceof Error ? captureError.message : String(captureError),
    });
  }
}

/**
 * Convert our ToolResult to MCP SDK response format.
 */
function toMcpResponse(result: ToolResult) {
  if (result.type === 'text') {
    return {
      content: [{ type: 'text' as const, text: result.text }],
    };
  }

  if (result.type === 'image') {
    return {
      content: [
        { type: 'text' as const, text: result.metadata },
        {
          type: 'image' as const,
          data: result.data,
          mimeType: result.mimeType,
        },
      ],
    };
  }

  const _exhaustive: never = result;
  throw new Error(`Unknown result type: ${(_exhaustive as { type: string }).type}`);
}

/** Patterns that indicate a crashed/closed VS Code session. */
const SESSION_CLOSED_PATTERNS = [
  'Target closed',
  'Target page, context or browser has been closed',
  'Browser has been closed',
  'Protocol error',
  'Connection closed',
];

/**
 * Convert errors to MCP error response.
 */
function toMcpError(error: unknown) {
  if (error instanceof ToolError) {
    logger.warn('tool_error', { code: error.code, message: error.actionable });
    return mcpError(error.toMcpText());
  }

  const message = error instanceof Error ? error.message : String(error);

  // Detect Playwright errors from a crashed/closed VS Code and surface an actionable hint
  if (SESSION_CLOSED_PATTERNS.some((p) => message.includes(p))) {
    logger.warn('session_closed_detected', { error: message });
    return mcpError(
      'VS Code session appears to have closed or crashed. ' +
      'Call vscode_close to clean up, then vscode_launch to start a new session.',
    );
  }

  logger.error('unexpected_error', { error: message, stack: error instanceof Error ? error.stack : undefined });
  return mcpError(`Unexpected error: ${message}`);
}
