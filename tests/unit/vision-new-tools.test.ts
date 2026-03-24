/**
 * Unit tests for vscode_zoom, vscode_find_element handlers.
 * handleResize was delegated to @playwright/mcp's browser_resize.
 */

import { describe, it, expect } from 'vitest';
import { handleZoom, handleFindElement } from '../../src/tools/vision.js';
import { ToolError } from '../../src/types/errors.js';
import type { SessionManager } from '../../src/session/session-manager.js';

// --- Mock helpers ---

function createMockSession(opts: {
  viewport?: { width: number; height: number };
  snapshotYaml?: string;
} = {}): SessionManager {
  const viewport = { ...(opts.viewport ?? { width: 1280, height: 720 }) };
  return {
    getPage: () => ({
      viewportSize: () => viewport,
      setViewportSize: async (size: { width: number; height: number }) => {
        viewport.width = size.width;
        viewport.height = size.height;
      },
      waitForTimeout: async () => {},
      screenshot: async () => Buffer.from('fake-png'),
      _snapshotForAI: async () => ({
        full: opts.snapshotYaml ?? '',
      }),
    }),
  } as unknown as SessionManager;
}

// --- handleZoom ---

describe('handleZoom', () => {
  it('captures a cropped region', async () => {
    const session = createMockSession();
    const result = await handleZoom(session, { x: 10, y: 20, width: 200, height: 100 });
    expect(result.type).toBe('image');
    expect((result as { metadata: string }).metadata).toContain('add (10, 20)');
  });

  it('rejects region outside viewport', async () => {
    const session = createMockSession({ viewport: { width: 1280, height: 720 } });
    await expect(handleZoom(session, { x: 1200, y: 0, width: 200, height: 100 })).rejects.toThrow(ToolError);
  });

  it('rejects invalid quality', async () => {
    const session = createMockSession();
    await expect(handleZoom(session, { x: 0, y: 0, width: 100, height: 100, quality: 0 })).rejects.toThrow(ToolError);
  });
});

// --- handleFindElement ---

const SAMPLE_SNAPSHOT = [
  '- document "Visual Studio Code"',
  '  - banner',
  '    - button "Toggle Primary Side Bar (Cmd+B)" [ref=e1]',
  '    - button "Toggle Panel (Cmd+J)" [ref=e2]',
  '  - main',
  '    - tab "index.ts" [ref=e3]',
  '    - tab "README.md" [ref=e4]',
  '    - textbox "Search" [ref=e5]',
  '    - img [ref=e6]',
  '    - treeitem "src" [ref=e7]',
  '    - treeitem "package.json" [ref=e8]',
].join('\n');

describe('handleFindElement', () => {
  it('requires at least one filter', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    await expect(handleFindElement(session, {})).rejects.toThrow(/at least one/i);
  });

  it('finds elements by role', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    const result = await handleFindElement(session, { role: 'button' });
    const text = (result as { text: string }).text;
    expect(text).toContain('Found 2 element(s)');
    expect(text).toContain('Toggle Primary Side Bar');
    expect(text).toContain('Toggle Panel');
  });

  it('finds elements by name', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    const result = await handleFindElement(session, { name: 'index' });
    const text = (result as { text: string }).text;
    expect(text).toContain('index.ts');
    expect(text).not.toContain('README');
  });

  it('finds elements by role + name combined', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    const result = await handleFindElement(session, { role: 'tab', name: 'README' });
    const text = (result as { text: string }).text;
    expect(text).toContain('Found 1 element(s)');
    expect(text).toContain('README.md');
  });

  it('returns no-match message when nothing found', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    const result = await handleFindElement(session, { role: 'menuitem' });
    const text = (result as { text: string }).text;
    expect(text).toContain('No elements found');
    expect(text).toContain('vscode_snapshot');
  });

  it('respects max_results', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    const result = await handleFindElement(session, { role: 'treeitem', max_results: 1 });
    const text = (result as { text: string }).text;
    expect(text).toContain('Found 1 element(s)');
    expect(text).toContain('Limited to 1');
  });

  it('rejects invalid max_results', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    await expect(handleFindElement(session, { role: 'button', max_results: 0 })).rejects.toThrow(ToolError);
    await expect(handleFindElement(session, { role: 'button', max_results: -1 })).rejects.toThrow(ToolError);
  });

  it('case-insensitive matching', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    const result = await handleFindElement(session, { role: 'BUTTON' });
    const text = (result as { text: string }).text;
    expect(text).toContain('Found 2 element(s)');
  });

  it('name filter matches only quoted text, not refs', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    // "e3" appears in [ref=e3] but not in any element name
    const result = await handleFindElement(session, { name: 'e3' });
    const text = (result as { text: string }).text;
    expect(text).toContain('No elements found');
  });

  it('handles elements without a name (bare role)', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    // "img" has no quoted name — should match by role but not crash
    const result = await handleFindElement(session, { role: 'img' });
    const text = (result as { text: string }).text;
    expect(text).toContain('Found 1 element(s)');
    expect(text).toContain('img');
  });

  it('bare-role elements are skipped when name filter is used', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    // img has no quoted name, so name="img" should not match it
    const result = await handleFindElement(session, { name: 'img' });
    const text = (result as { text: string }).text;
    expect(text).toContain('No elements found');
  });

  it('role filter is exact match (tab does not match textbox)', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    const result = await handleFindElement(session, { role: 'tab' });
    const text = (result as { text: string }).text;
    expect(text).toContain('Found 2 element(s)');
    expect(text).toContain('index.ts');
    expect(text).toContain('README.md');
    expect(text).not.toContain('textbox');
  });

  it('rejects max_results above upper bound', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    await expect(handleFindElement(session, { role: 'button', max_results: 201 })).rejects.toThrow(ToolError);
  });

  it('rejects non-integer max_results', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    await expect(handleFindElement(session, { role: 'button', max_results: 1.5 })).rejects.toThrow(ToolError);
  });

  it('handles empty snapshot', async () => {
    const session = createMockSession({ snapshotYaml: '' });
    const result = await handleFindElement(session, { role: 'button' });
    const text = (result as { text: string }).text;
    expect(text).toContain('No elements found');
  });

  it('matches name across multiple quoted strings', async () => {
    const snapshot = '- button "File" "Open Recent" [ref=e1]';
    const session = createMockSession({ snapshotYaml: snapshot });
    const result = await handleFindElement(session, { name: 'Open Recent' });
    const text = (result as { text: string }).text;
    expect(text).toContain('Found 1 element(s)');
  });

  it('result text mentions ref refresh', async () => {
    const session = createMockSession({ snapshotYaml: SAMPLE_SNAPSHOT });
    const result = await handleFindElement(session, { role: 'button' });
    const text = (result as { text: string }).text;
    expect(text).toContain('refs refreshed');
  });
});
