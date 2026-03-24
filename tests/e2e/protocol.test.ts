/**
 * E2E: MCP protocol-level tests.
 *
 * These verify the JSON-RPC protocol loop works correctly:
 * initialize, listTools, error handling — no VS Code binary needed.
 *
 * All tests share a single MCP server process since they only exercise
 * protocol-level features (no VS Code session is created).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpClient, callTool, getTextContent } from './setup.js';

describe('MCP protocol', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createMcpClient();
  });

  afterAll(async () => {
    if (client) {
      await client.close().catch(() => {});
    }
  });

  it('connects and initializes successfully', () => {
    // If beforeAll succeeded, the handshake worked
    expect(client).toBeDefined();
  });

  it('listTools returns all registered tools', async () => {
    const { tools } = await client.listTools();

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'vscode_click',
      'vscode_click_xy',
      'vscode_close',
      'vscode_console',
      'vscode_drag',
      'vscode_drag_xy',
      'vscode_ensure_file',
      'vscode_evaluate',
      'vscode_fill_form',
      'vscode_find_element',
      'vscode_get_hover',
      'vscode_get_state',
      'vscode_gif',
      'vscode_hover',
      'vscode_hover_xy',
      'vscode_launch',
      'vscode_press_key',
      'vscode_resize',
      'vscode_run_command',
      'vscode_screenshot',
      'vscode_scroll',
      'vscode_select_option',
      'vscode_snapshot',
      'vscode_type',
      'vscode_wait_for',
      'vscode_zoom',
    ]);
  });

  it('each tool has description and inputSchema', async () => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description!.length).toBeGreaterThan(0);
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
    const result = await callTool(client, toolName as string, args as Record<string, unknown>);

    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toContain('NO_SESSION');
  });

  it('vscode_close with no session is idempotent (no error)', async () => {
    const result = await callTool(client, 'vscode_close');

    // close() is idempotent — succeeds even with no session
    expect(result.isError).toBe(undefined);
    const text = getTextContent(result);
    expect(text).toContain('closed');
  });
});
