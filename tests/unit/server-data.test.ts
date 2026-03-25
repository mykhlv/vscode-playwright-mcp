/**
 * Unit tests for server.ts data structures.
 * Tests alias maps, filter sets, and GIF capture skip list for invariant violations.
 *
 * Imports directly from server.ts — tests break immediately if data changes
 * introduce contradictions (e.g., aliasing AND filtering the same tool).
 */

import { describe, it, expect } from 'vitest';
import { BROWSER_TO_VSCODE, FILTERED_BROWSER_TOOLS, SKIP_GIF_CAPTURE } from '../../src/server.js';

const VSCODE_TO_BROWSER = new Map(
  Object.entries(BROWSER_TO_VSCODE).map(([browser, vscode]) => [vscode, browser]),
);

describe('server alias maps', () => {
  it('all vscode aliases use vscode_ prefix', () => {
    for (const vscode of Object.values(BROWSER_TO_VSCODE)) {
      expect(vscode).toMatch(/^vscode_/);
    }
  });

  it('all browser names use browser_ prefix', () => {
    for (const browser of Object.keys(BROWSER_TO_VSCODE)) {
      expect(browser).toMatch(/^browser_/);
    }
  });

  it('no duplicate vscode aliases', () => {
    const vsNames = Object.values(BROWSER_TO_VSCODE);
    expect(new Set(vsNames).size).toBe(vsNames.length);
  });

  it('no duplicate browser source names', () => {
    const brNames = Object.keys(BROWSER_TO_VSCODE);
    expect(new Set(brNames).size).toBe(brNames.length);
  });

  it('reverse map has same size as forward map', () => {
    expect(VSCODE_TO_BROWSER.size).toBe(Object.keys(BROWSER_TO_VSCODE).length);
  });
});

describe('server filtered tools', () => {
  it('no aliased tool is also filtered (would create contradictions)', () => {
    const aliasedBrowserNames = new Set(Object.keys(BROWSER_TO_VSCODE));
    for (const filtered of FILTERED_BROWSER_TOOLS) {
      expect(aliasedBrowserNames.has(filtered)).toBe(false);
    }
  });

  it('all filtered tools use browser_ prefix', () => {
    for (const tool of FILTERED_BROWSER_TOOLS) {
      expect(tool).toMatch(/^browser_/);
    }
  });
});

describe('server GIF capture skip list', () => {
  it('all skip-list tools use vscode_ prefix', () => {
    for (const tool of SKIP_GIF_CAPTURE) {
      expect(tool).toMatch(/^vscode_/);
    }
  });

  it.each([
    'vscode_click', 'vscode_type', 'vscode_press_key',
    'vscode_hover', 'vscode_drag', 'vscode_scroll',
    'vscode_screenshot', 'vscode_editor_insert', 'vscode_run_command',
  ])('visual tool %s is NOT in skip list', (tool) => {
    expect(SKIP_GIF_CAPTURE.has(tool)).toBe(false);
  });

  it.each([
    'vscode_get_state', 'vscode_get_text', 'vscode_get_diagnostics',
    'vscode_get_hover', 'vscode_snapshot', 'vscode_console',
  ])('read-only tool %s IS in skip list', (tool) => {
    expect(SKIP_GIF_CAPTURE.has(tool)).toBe(true);
  });
});
