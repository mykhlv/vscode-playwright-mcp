/**
 * MCP server setup: registers all tools and routes calls to handlers.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionManager } from './session/session-manager.js';
import { tools, toolMap } from './tools/index.js';
import { ToolError } from './types/errors.js';
import { logger } from './utils/logger.js';
import type { ToolResult, ImageResult, TextResult } from './types/tool-results.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'vscode-playwright-mcp',
    version: '0.1.0',
  });

  const session = new SessionManager();

  // Register each tool with the MCP server
  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      async (params: Record<string, unknown>) => {
        try {
          const result = await tool.handler(session, params);
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
    const textResult = result as TextResult;
    return {
      content: [{ type: 'text' as const, text: textResult.text }],
    };
  }

  // Image result: return both text metadata and image content
  const imgResult = result as ImageResult;
  return {
    content: [
      { type: 'text' as const, text: imgResult.metadata },
      {
        type: 'image' as const,
        data: imgResult.data,
        mimeType: imgResult.mimeType,
      },
    ],
  };
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
