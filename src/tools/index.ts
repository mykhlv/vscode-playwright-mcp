/**
 * VS Code-specific tool registry.
 * Only tools that @playwright/mcp does NOT provide — our unique value layer.
 */

import { z } from 'zod';
import type { SessionManager } from '../session/session-manager.js';
import type { ContextBridge } from '../context-bridge.js';
import type { GifRecorder } from '../session/gif-recorder.js';
import type { ToolResult } from '../types/tool-results.js';
import type {
  LaunchParams, CloseParams,
  RunCommandParams, GetStateParams, GetHoverParams,
  EnsureFileParams, GifParams,
  ZoomParams, FindElementParams,
  ScrollParams, ResizeParams,
} from '../types/tool-params.js';
import { handleLaunch, handleClose } from './launch.js';
import { handleZoom, handleFindElement } from './vision.js';
import { handleScroll } from './mouse.js';
import { handleRunCommand } from './command.js';
import { handleGetState, handleGetHover } from './state.js';
import { handleEnsureFile } from './file.js';
import { handleGif } from './gif.js';
import { handleResize } from './resize.js';

export interface VSCodeToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Watchdog timeout in ms. */
  timeoutMs: number;
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Create VS Code-specific tool definitions.
 * Each handler captures session, bridge, and recorder by closure.
 */
export function createVSCodeTools(
  session: SessionManager,
  bridge: ContextBridge,
  recorder: GifRecorder,
): VSCodeToolDefinition[] {
  return [
    // ── Lifecycle ────────────────────────────────────────────
    {
      name: 'vscode_launch',
      description:
        'Launch a new VS Code instance with an isolated environment. ' +
        'Creates a temporary user-data-dir for state isolation. ' +
        'Optionally load an extension from source (extension_development_path) or install .vsix files. ' +
        'After launch, browser_* tools become available for interacting with the UI.',
      inputSchema: zodToJsonSchema(z.object({
        workspace: z.string().optional()
          .describe('Absolute path to a folder or .code-workspace file to open.'),
        extension_development_path: z.string().optional()
          .describe('Absolute path to an extension directory to load in development mode (--extensionDevelopmentPath).'),
        extensions: z.array(z.string()).optional()
          .describe('Paths to .vsix files to pre-install before launch.'),
        settings: z.record(z.string(), z.unknown()).optional()
          .describe('VS Code settings overrides (merged with defaults that suppress Welcome tab and telemetry).'),
        executable_path: z.string().optional()
          .describe('Path to VS Code Electron binary. Auto-detected if omitted.'),
        args: z.array(z.string()).optional()
          .describe('Additional CLI arguments to pass to VS Code.'),
        viewport: z.object({
          width: z.number(),
          height: z.number(),
        }).optional()
          .describe('Viewport size in logical pixels. Default: { width: 1280, height: 720 }.'),
      })),
      timeoutMs: 35_000,
      handler: async (params) => {
        const result = await handleLaunch(session, params as LaunchParams);
        // Provide BrowserContext to @playwright/mcp after successful launch.
        // If provide() fails (e.g., bridge already provided), close the session
        // to avoid an inconsistent state where native tools work but aliased tools hang.
        try {
          bridge.provide(session.getPage().context());
        } catch (err) {
          await handleClose(session, {} as CloseParams).catch(() => {});
          throw err;
        }
        return result;
      },
    },
    {
      name: 'vscode_close',
      description: 'Close the running VS Code instance and clean up temporary files.',
      inputSchema: zodToJsonSchema(z.object({})),
      timeoutMs: 15_000,
      handler: async (params) => {
        bridge.reset();
        return handleClose(session, params as CloseParams);
      },
    },

    // ── VS Code Commands ─────────────────────────────────────
    {
      name: 'vscode_run_command',
      description:
        'Execute a VS Code command via Command Palette automation (Meta+Shift+P → type → Enter). ' +
        'The command is typed into the Command Palette and the top match is executed. ' +
        'Use input for commands that open an input box (e.g., "Go to Line" needs a line number). ' +
        'Common commands: "File: Revert File", "View: Toggle Problems", "Go to Line", "Close Editor".',
      inputSchema: zodToJsonSchema(z.object({
        command: z.string()
          .describe('VS Code command ID or name, e.g. "editor.action.goToDefinition" or "Toggle Sidebar".'),
        input: z.string().optional()
          .describe('Optional text typed into an input box AFTER the command is selected and executed.'),
      })),
      timeoutMs: 10_000,
      handler: (params) => handleRunCommand(session, params as unknown as RunCommandParams),
    },

    // ── State & Inspection ───────────────────────────────────
    {
      name: 'vscode_get_state',
      description:
        'Read current editor state via DOM scraping — no screenshot needed. ' +
        'Returns: active file name, cursor position, diagnostics, selection, visible lines, ' +
        'IntelliSense completions, peek widget results, rename widget value. ' +
        'Much faster than a screenshot for getting editor metadata.',
      inputSchema: zodToJsonSchema(z.object({
        diagnostics_file: z.string().optional()
          .describe('Filter diagnostics to only show entries matching this filename.'),
        diagnostics_severity: z.enum(['error', 'warning', 'info']).optional()
          .describe('Filter diagnostics by minimum severity.'),
        visible_lines: z.union([z.literal('all'), z.literal('none'), z.number()]).optional()
          .describe('Control visible lines output: "all", "none", or a max number. Default: 15.'),
        wait_for_diagnostics: z.boolean().optional()
          .describe('If true, poll until diagnostics appear (or timeout).'),
        timeout: z.number().optional()
          .describe('Max wait time in ms for wait_for_diagnostics. Default: 5000.'),
      })),
      timeoutMs: 15_000,
      handler: (params) => handleGetState(session, params as GetStateParams),
    },
    {
      name: 'vscode_get_hover',
      description:
        'Read the content of a visible hover tooltip as text. ' +
        'Must be called AFTER browser_hover has triggered a tooltip. ' +
        'Returns the hover text without needing a screenshot.',
      inputSchema: zodToJsonSchema(z.object({})),
      timeoutMs: 5_000,
      handler: (params) => handleGetHover(session, params as GetHoverParams),
    },

    // ── File Management ──────────────────────────────────────
    {
      name: 'vscode_ensure_file',
      description:
        'Open and activate a specific file in the editor by its path. ' +
        'More reliable than Quick Open — verifies the correct file became active and retries.',
      inputSchema: zodToJsonSchema(z.object({
        path: z.string()
          .describe('File path to open. Can be absolute or workspace-relative.'),
      })),
      timeoutMs: 10_000,
      handler: (params) => handleEnsureFile(session, params as unknown as EnsureFileParams),
    },

    // ── Vision (VS Code-specific) ────────────────────────────
    {
      name: 'vscode_zoom',
      description:
        'Capture a cropped screenshot of a specific region for closer inspection. ' +
        'Use when the full screenshot is too large to read Monaco editor text or small UI details. ' +
        'Coordinates in the cropped image are relative — add the region origin to get window coordinates.',
      inputSchema: zodToJsonSchema(z.object({
        x: z.number().describe('Left edge of the crop region (logical pixels).'),
        y: z.number().describe('Top edge of the crop region (logical pixels).'),
        width: z.number().describe('Width of the crop region (logical pixels).'),
        height: z.number().describe('Height of the crop region (logical pixels).'),
        format: z.enum(['jpeg', 'png']).optional()
          .describe('Image format. Default: jpeg.'),
        quality: z.number().optional()
          .describe('JPEG quality 1-100. Default: 75. Ignored for PNG.'),
      })),
      timeoutMs: 5_000,
      handler: (params) => handleZoom(session, params as unknown as ZoomParams),
    },
    {
      name: 'vscode_find_element',
      description:
        'Search the accessibility tree for elements matching a role and/or name filter. ' +
        'Returns matching lines with [ref=eN] annotations — use refs with browser_click or browser_hover. ' +
        'Faster than browser_snapshot when you know what you\'re looking for.',
      inputSchema: zodToJsonSchema(z.object({
        role: z.string().optional()
          .describe('ARIA role to filter by (case-insensitive, exact match). Examples: "button", "tab", "textbox".'),
        name: z.string().optional()
          .describe('Text/name to filter by (case-insensitive, partial match).'),
        max_results: z.number().optional()
          .describe('Maximum number of results to return. Default: 20.'),
      })),
      timeoutMs: 10_000,
      handler: (params) => handleFindElement(session, params as FindElementParams),
    },

    // ── Scroll ───────────────────────────────────────────────
    {
      name: 'vscode_scroll',
      description:
        'Scroll at a specific position in the VS Code window. ' +
        'Position the mouse at (x, y) then scroll in the given direction. ' +
        'Works in any scrollable panel: editor, file explorer, terminal, output.',
      inputSchema: zodToJsonSchema(z.object({
        x: z.number().describe('X coordinate to scroll at (logical pixels).'),
        y: z.number().describe('Y coordinate to scroll at (logical pixels).'),
        direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction.'),
        amount: z.number().optional()
          .describe('Scroll units (each ~100px). Default: 3. Max: 100.'),
      })),
      timeoutMs: 5_000,
      handler: (params) => handleScroll(session, params as unknown as ScrollParams),
    },

    // ── Window Management ─────────────────────────────────────
    {
      name: 'vscode_resize',
      description:
        'Resize the VS Code window to the specified dimensions. ' +
        'Both the Electron window and the internal viewport are resized together.',
      inputSchema: zodToJsonSchema(z.object({
        width: z.number().int().min(200).max(7680).describe('Window width in logical pixels (200-7680).'),
        height: z.number().int().min(200).max(4320).describe('Window height in logical pixels (200-4320).'),
      })),
      timeoutMs: 5_000,
      handler: (params) => handleResize(session, params as unknown as ResizeParams),
    },

    // ── GIF Recording ────────────────────────────────────────
    {
      name: 'vscode_gif',
      description:
        'Record VS Code actions as an animated GIF. ' +
        'Use action "start" to begin recording, "stop" to stop, "save" with filename to export.',
      inputSchema: zodToJsonSchema(z.object({
        action: z.enum(['start', 'stop', 'save']).describe('Recording action.'),
        filename: z.string().optional().describe('Output filename for "save" action.'),
        delay: z.number().optional().describe('Frame delay in ms for "save" action. Range: 100-2000ms.'),
        progress_bar: z.boolean().optional().describe('Show progress bar at bottom. Default: false.'),
        capture_on: z.enum(['auto', 'manual']).optional().describe(
          'Frame capture mode for "start". "auto" (default): auto after visual tools. ' +
          '"manual": only on browser_take_screenshot.',
        ),
      })),
      timeoutMs: 5_000,
      handler: (params) => handleGif(recorder, params as unknown as GifParams),
    },
  ];
}

/**
 * Convert a Zod schema to JSON Schema compatible with MCP tool registration.
 */
function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  // Use Zod's built-in JSON Schema generation
  return schema.toJSONSchema() as Record<string, unknown>;
}
