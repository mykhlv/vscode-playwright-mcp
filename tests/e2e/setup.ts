/**
 * Shared setup for E2E tests — full MCP protocol loop over stdio.
 *
 * Spawns the built MCP server as a child process, connects via
 * @modelcontextprotocol/sdk Client over stdio transport.
 */

import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolveVSCodePath } from '../../src/session/vscode-launcher.js';

const SERVER_PATH = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

/** Check whether a VS Code binary is available on this machine. */
export function isVSCodeAvailable(): boolean {
  try {
    resolveVSCodePath();
    return true;
  } catch {
    return false;
  }
}

/** Spawn MCP server and return a connected Client. */
export async function createMcpClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_PATH],
    stderr: 'pipe',
  });

  const client = new Client({
    name: 'e2e-test-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  return client;
}

/** Call a tool and return the result content array. */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }> {
  const result = await client.callTool({ name, arguments: args });
  return result as { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean };
}

/** Extract text from the first text content block. */
export function getTextContent(result: { content: Array<{ type: string; text?: string }> }): string {
  const block = result.content.find((c) => c.type === 'text');
  if (!block || !block.text) throw new Error('No text content in result');
  return block.text;
}

/** Timeout constants */
export const LAUNCH_TIMEOUT = 30_000;
export const TOOL_TIMEOUT = 10_000;
