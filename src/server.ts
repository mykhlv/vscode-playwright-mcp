/**
 * MCP server setup: registers all tools and routes calls to handlers.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionManager } from './session/session-manager.js';
import { GifRecorder } from './session/gif-recorder.js';
import { createTools } from './tools/index.js';
import { ToolError } from './types/errors.js';
import { logger } from './utils/logger.js';
import type { ToolResult } from './types/tool-results.js';

/** Tools that should NOT trigger auto-capture of GIF frames.
 * Read-only queries and keyboard input don't produce immediate visual changes —
 * the result is visible after the next screenshot/click/hover. */
const SKIP_GIF_CAPTURE = new Set([
  'vscode_gif', 'vscode_launch', 'vscode_close',
  'vscode_get_hover', 'vscode_get_state', 'vscode_snapshot',
  'vscode_press_key', 'vscode_type',
]);

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'vscode-playwright-mcp',
    version: '0.1.0',
  });

  const session = new SessionManager();
  const recorder = new GifRecorder();
  const tools = createTools(recorder);

  // Register each tool with the MCP server
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (params: Record<string, unknown>) => {
        try {
          const result = await tool.handler(session, params);

          // Auto-capture GIF frame after successful tool calls.
          // Wrapped separately so a capture failure doesn't mask a successful tool result.
          try {
            if (recorder.isRecording && session.isReady) {
              const shouldCapture =
                recorder.captureMode === 'manual'
                  ? tool.name === 'vscode_screenshot'
                  : !SKIP_GIF_CAPTURE.has(tool.name);

              if (shouldCapture) {
                await recorder.captureFrame(session.getPage());
              }
            }
          } catch (captureError) {
            logger.warn('gif_capture_after_tool_failed', {
              tool: tool.name,
              error: captureError instanceof Error ? captureError.message : String(captureError),
            });
          }

          return toMcpResponse(result);
        } catch (error) {
          return toMcpError(error);
        }
      },
    );
  }

  logger.info('server_created', { toolCount: tools.length, tools: tools.map(t => t.name) });

  return server;
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
  throw new Error(`Unknown result type: ${(_exhaustive as any).type}`);
}

/**
 * Convert errors to MCP error response.
 */
function toMcpError(error: unknown) {
  if (error instanceof ToolError) {
    logger.warn('tool_error', { code: error.code, message: error.actionable });
    return {
      content: [{ type: 'text' as const, text: error.toMcpText() }],
      isError: true,
    };
  }

  // Unexpected error — log full details but give LLM a clean message
  const message = error instanceof Error ? error.message : String(error);
  logger.error('unexpected_error', { error: message, stack: error instanceof Error ? error.stack : undefined });
  return {
    content: [{ type: 'text' as const, text: `Unexpected error: ${message}` }],
    isError: true,
  };
}
