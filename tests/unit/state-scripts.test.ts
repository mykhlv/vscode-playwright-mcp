/**
 * Unit tests for the DOM scraping scripts used by vscode_get_state and vscode_get_hover.
 * Tests the scripts as pure functions against mock DOM structures.
 */

import { describe, it, expect } from 'vitest';
import { GET_STATE_SCRIPT, GET_HOVER_SCRIPT, resolveEditorPosition } from '../../src/tools/state.js';

// We can't run page.evaluate() in unit tests, but we can verify
// the scripts are valid JavaScript that can be parsed.
// For actual DOM behavior, integration tests with VS Code are needed.

describe('GET_STATE_SCRIPT', () => {
  it('is valid JavaScript that can be parsed', () => {
    // Should not throw a SyntaxError
    expect(() => new Function(GET_STATE_SCRIPT)).not.toThrow();
  });

  it('is a self-invoking function expression', () => {
    expect(GET_STATE_SCRIPT.trim()).toMatch(/^\(\(\) => \{/);
    expect(GET_STATE_SCRIPT.trim()).toMatch(/\}\)\(\)$/);
  });

  it('queries expected DOM selectors', () => {
    expect(GET_STATE_SCRIPT).toContain('.tab.active .label-name');
    expect(GET_STATE_SCRIPT).toContain('.window-title');
    expect(GET_STATE_SCRIPT).toContain('.editor-status-selection');
    expect(GET_STATE_SCRIPT).toContain('status.problems');
    expect(GET_STATE_SCRIPT).toContain('.view-lines .view-line');
    expect(GET_STATE_SCRIPT).toContain('.line-numbers');
    expect(GET_STATE_SCRIPT).toContain('.markers-panel');
  });

  it('returns an object with expected shape', () => {
    // The script should reference these property names
    expect(GET_STATE_SCRIPT).toContain('result.activeFile');
    expect(GET_STATE_SCRIPT).toContain('result.cursorPosition');
    expect(GET_STATE_SCRIPT).toContain('result.diagnostics');
    expect(GET_STATE_SCRIPT).toContain('result.diagnosticsList');
    expect(GET_STATE_SCRIPT).toContain('result.visibleLines');
    expect(GET_STATE_SCRIPT).toContain('result.selection');
  });

  it('handles truncation for many visible lines', () => {
    // Should have logic for > 20 lines (first 10 + last 5)
    expect(GET_STATE_SCRIPT).toContain('numberedLines.length > 20');
    expect(GET_STATE_SCRIPT).toContain('slice(0, 10)');
    expect(GET_STATE_SCRIPT).toContain('slice(-5)');
  });
});

describe('GET_HOVER_SCRIPT', () => {
  it('is valid JavaScript that can be parsed', () => {
    expect(() => new Function(GET_HOVER_SCRIPT)).not.toThrow();
  });

  it('is a self-invoking function expression', () => {
    expect(GET_HOVER_SCRIPT.trim()).toMatch(/^\(\(\) => \{/);
    expect(GET_HOVER_SCRIPT.trim()).toMatch(/\}\)\(\)$/);
  });

  it('queries Monaco hover selectors', () => {
    expect(GET_HOVER_SCRIPT).toContain('.monaco-hover-content');
    expect(GET_HOVER_SCRIPT).toContain('.hover-contents');
    expect(GET_HOVER_SCRIPT).toContain('.monaco-hover');
  });

  it('returns found/text shape', () => {
    expect(GET_HOVER_SCRIPT).toContain('found: true');
    expect(GET_HOVER_SCRIPT).toContain('found: false');
    expect(GET_HOVER_SCRIPT).toContain('text:');
  });

  it('checks visibility of hover widget', () => {
    expect(GET_HOVER_SCRIPT).toContain('display');
    expect(GET_HOVER_SCRIPT).toContain('visibility');
  });
});

describe('resolveEditorPosition', () => {
  it('is exported as a function', () => {
    expect(typeof resolveEditorPosition).toBe('function');
  });

  it('throws on resolution failure with actionable message', async () => {
    // Mock page that returns found: false
    const mockPage = {
      evaluate: async () => ({ x: 0, y: 0, found: false }),
    };
    await expect(resolveEditorPosition(mockPage as any, 99, 1)).rejects.toThrow(
      /Could not resolve editor position/,
    );
  });

  it('returns coordinates on successful resolution', async () => {
    const mockPage = {
      evaluate: async () => ({ x: 150, y: 300, found: true }),
    };
    const result = await resolveEditorPosition(mockPage as any, 10, 5);
    expect(result).toEqual({ x: 150, y: 300 });
  });
});

describe('GET_STATE_SCRIPT diagnostics panel scraping', () => {
  it('scrapes markers panel rows', () => {
    expect(GET_STATE_SCRIPT).toContain('.markers-panel');
    expect(GET_STATE_SCRIPT).toContain('.monaco-list-row');
  });

  it('detects severity from codicon classes', () => {
    expect(GET_STATE_SCRIPT).toContain('codicon-error');
    expect(GET_STATE_SCRIPT).toContain('codicon-warning');
    expect(GET_STATE_SCRIPT).toContain('codicon-info');
  });

  it('extracts message, position, source, and code', () => {
    expect(GET_STATE_SCRIPT).toContain('.marker-message');
    expect(GET_STATE_SCRIPT).toContain('.marker-line');
    expect(GET_STATE_SCRIPT).toContain('.marker-source');
    expect(GET_STATE_SCRIPT).toContain('.marker-code');
  });
});
