/**
 * E2E: MCP protocol-level tests.
 *
 * These verify the JSON-RPC protocol loop works correctly:
 * initialize, listTools, error handling — no VS Code binary needed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpClient, callTool, getTextContent } from './setup.js';

describe('MCP protocol', () => {
  let client: Client;

  afterEach(async () => {
    if (client) {
      await client.close().catch(() => {});
    }
  });

  it('connects and initializes successfully', async () => {
    client = await createMcpClient();
    // If we get here, the handshake succeeded
    expect(client).toBeDefined();
  });

  it('listTools returns all registered tools', async () => {
    client = await createMcpClient();
    const { tools } = await client.listTools();

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'vscode_click',
      'vscode_close',
      'vscode_console',
      'vscode_drag',
      'vscode_ensure_file',
      'vscode_evaluate',
      'vscode_get_hover',
      'vscode_get_state',
      'vscode_gif',
      'vscode_hover',
      'vscode_launch',
      'vscode_press_key',
      'vscode_run_command',
      'vscode_screenshot',
      'vscode_scroll',
      'vscode_snapshot',
      'vscode_type',
      'vscode_wait_for',
    ]);
  });

  it('each tool has description and inputSchema', async () => {
    client = await createMcpClient();
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it.each([
    ['vscode_screenshot', {}],
    ['vscode_click', { x: 100, y: 100 }],
    ['vscode_get_state', {}],
    ['vscode_evaluate', { expression: '1+1' }],
    ['vscode_console', {}],
  ])('%s with no session returns NO_SESSION error', async (toolName, args) => {
    client = await createMcpClient();
    const result = await callTool(client, toolName, args);

    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toContain('NO_SESSION');
  });

  it('vscode_close with no session is idempotent (no error)', async () => {
    client = await createMcpClient();
    const result = await callTool(client, 'vscode_close');

    // close() is idempotent — succeeds even with no session
    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    expect(text).toContain('closed');
  });
});
