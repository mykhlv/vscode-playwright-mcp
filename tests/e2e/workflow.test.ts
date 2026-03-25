/**
 * E2E: Full workflow tests over MCP protocol.
 *
 * Spawns the MCP server, connects via stdio, launches VS Code,
 * exercises tools, and verifies responses through the protocol.
 * Requires a VS Code binary on the machine.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  isVSCodeAvailable,
  createMcpClient,
  callTool,
  getTextContent,
  LAUNCH_TIMEOUT,
  TOOL_TIMEOUT,
} from './setup.js';

const canRun = isVSCodeAvailable();

describe.skipIf(!canRun)('MCP workflow', () => {
  let client: Client;

  afterEach(async () => {
    if (client) {
      // Try to close VS Code session if one is running
      await callTool(client, 'vscode_close').catch(() => {});
      await client.close().catch(() => {});
    }
  });

  it('launch → screenshot → close', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    // Launch
    const launchResult = await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });
    expect(launchResult.isError).toBeFalsy();
    const launchText = getTextContent(launchResult);
    expect(launchText).toContain('launched');

    // Screenshot
    const screenshotResult = await callTool(client, 'vscode_screenshot');
    expect(screenshotResult.isError).toBeFalsy();
    // Should have at least text metadata + image content
    expect(screenshotResult.content.length).toBeGreaterThanOrEqual(2);
    const imageBlock = screenshotResult.content.find((c) => c.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock!.data).toBeTruthy();
    expect(imageBlock!.mimeType).toBe('image/png');

    // Close
    const closeResult = await callTool(client, 'vscode_close');
    expect(closeResult.isError).toBeFalsy();
  });

  it('launch → snapshot → verify a11y tree', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 3 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    // Wait for VS Code activity bar to render before taking snapshot
    await callTool(client, 'vscode_wait_for', {
      selector: '.activitybar',
      state: 'visible',
      timeout: 5000,
    });

    const result = await callTool(client, 'vscode_snapshot');
    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    // A11y tree should contain standard VS Code elements
    expect(text).toMatch(/application|toolbar|button/i);

    await callTool(client, 'vscode_close');
  });

  it('launch → get_state → verify editor metadata', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    const result = await callTool(client, 'vscode_get_state', {
      visible_lines: 'none',
    });
    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    // Should return some state info even without an open file
    expect(text).toBeTruthy();

    await callTool(client, 'vscode_close');
  });

  it('launch → press_key → verify response', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    // Press Escape (safe no-op key)
    const result = await callTool(client, 'vscode_press_key', { key: 'Escape' });
    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    expect(text).toBeTruthy();

    await callTool(client, 'vscode_close');
  });

  it('launch → evaluate → verify result', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    // Upstream browser_evaluate expects a callable function string
    const result = await callTool(client, 'vscode_evaluate', {
      function: '() => document.title',
    });
    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    // VS Code window title should contain something
    expect(text).toBeTruthy();

    await callTool(client, 'vscode_close');
  });

  it('launch → console → verify empty buffer', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    const result = await callTool(client, 'vscode_console', { level: 'error' });
    expect(result.isError).toBeFalsy();
    // May or may not have error messages depending on VS Code startup
    const text = getTextContent(result);
    expect(text).toBeTruthy();

    await callTool(client, 'vscode_close');
  });

  it('launch → click_xy → verify response', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    // Click somewhere safe (center of window) — use click_xy for coordinate-based clicks
    const result = await callTool(client, 'vscode_click_xy', { x: 640, y: 360 });
    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    expect(text).toBeTruthy();

    await callTool(client, 'vscode_close');
  });

  it('launch → press_key (character) → verify response', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    // vscode_type (upstream browser_type) requires a ref from snapshot.
    // For a simple typing test, use press_key with a character instead.
    const result = await callTool(client, 'vscode_press_key', { key: 'a' });
    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    expect(text).toBeTruthy();

    await callTool(client, 'vscode_close');
  });

  it('launch → scroll → verify response', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    const result = await callTool(client, 'vscode_scroll', {
      x: 640, y: 360, direction: 'down', amount: 3,
    });
    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    expect(text).toContain('Scrolled');

    await callTool(client, 'vscode_close');
  });

  it('double launch returns SESSION_EXISTS error', { timeout: LAUNCH_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    // Second launch should fail
    const result = await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });
    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toContain('SESSION_EXISTS');

    await callTool(client, 'vscode_close');
  });

  it('zoom with crop region', { timeout: LAUNCH_TIMEOUT + TOOL_TIMEOUT * 2 }, async () => {
    client = await createMcpClient();

    await callTool(client, 'vscode_launch', {
      viewport: { width: 1280, height: 720 },
    });

    // Crop is a native vscode_zoom feature, not upstream vscode_screenshot
    const result = await callTool(client, 'vscode_zoom', {
      x: 0, y: 0, width: 200, height: 200,
    });
    expect(result.isError).toBeFalsy();
    const metadata = getTextContent(result);
    expect(metadata).toContain('200x200');
    // vscode_zoom returns JPEG by default
    const imageBlock = result.content.find((c) => c.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock!.mimeType).toBe('image/jpeg');

    await callTool(client, 'vscode_close');
  });
});
