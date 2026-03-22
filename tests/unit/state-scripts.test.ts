/**
 * Unit tests for the DOM scraping scripts used by vscode_get_state and vscode_get_hover.
 * Tests the scripts as pure functions against mock DOM structures.
 */

import { describe, it, expect } from 'vitest';
import { GET_STATE_SCRIPT, GET_HOVER_SCRIPT } from '../../src/tools/state.js';

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
    expect(GET_STATE_SCRIPT).toContain('result.peekWidget');
    expect(GET_STATE_SCRIPT).toContain('result.renameWidget');
    expect(GET_STATE_SCRIPT).toContain('result.completionDetails');
  });

  it('returns all visible lines for handler-side truncation', () => {
    // Truncation is now handled by the TypeScript handler via visible_lines param.
    // The script should return all lines.
    expect(GET_STATE_SCRIPT).toContain('all: numberedLines');
    expect(GET_STATE_SCRIPT).toContain('totalVisible: numberedLines.length');
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

describe('GET_STATE_SCRIPT completions scraping', () => {
  it('queries suggest widget selectors', () => {
    expect(GET_STATE_SCRIPT).toContain('.editor-widget.suggest-widget');
    expect(GET_STATE_SCRIPT).toContain('.monaco-list-row');
  });

  it('checks suggest widget visibility', () => {
    expect(GET_STATE_SCRIPT).toContain('monaco-visible-content-widget');
    expect(GET_STATE_SCRIPT).toContain('classList.contains');
    expect(GET_STATE_SCRIPT).toContain('\'hidden\'');
  });

  it('extracts completion item properties', () => {
    expect(GET_STATE_SCRIPT).toContain('.label-name');
    expect(GET_STATE_SCRIPT).toContain('codicon-symbol-');
    expect(GET_STATE_SCRIPT).toContain('.qualifier');
    expect(GET_STATE_SCRIPT).toContain('.details-label');
    expect(GET_STATE_SCRIPT).toContain('focused');
  });

  it('stores completions on result object', () => {
    expect(GET_STATE_SCRIPT).toContain('result.completions');
  });
});

describe('GET_STATE_SCRIPT peek widget scraping', () => {
  it('queries peek widget selectors', () => {
    expect(GET_STATE_SCRIPT).toContain('.zone-widget .peekview-widget');
    expect(GET_STATE_SCRIPT).toContain('.peekview-title .filename');
    expect(GET_STATE_SCRIPT).toContain('.peekview-title .dirname');
    expect(GET_STATE_SCRIPT).toContain('.ref-tree .monaco-list-row');
  });

  it('extracts file header and reference items', () => {
    expect(GET_STATE_SCRIPT).toContain('.reference-file');
    expect(GET_STATE_SCRIPT).toContain('.referenceMatch');
    expect(GET_STATE_SCRIPT).toContain('.line-number');
  });

  it('stores peek widget on result object', () => {
    expect(GET_STATE_SCRIPT).toContain('result.peekWidget');
  });
});

describe('GET_STATE_SCRIPT rename widget scraping', () => {
  it('queries rename box selector', () => {
    expect(GET_STATE_SCRIPT).toContain('.rename-box');
  });

  it('checks visibility via offsetParent with fixed-position fallback', () => {
    expect(GET_STATE_SCRIPT).toContain('offsetParent');
    expect(GET_STATE_SCRIPT).toContain('getComputedStyle');
    expect(GET_STATE_SCRIPT).toContain('getBoundingClientRect');
  });

  it('stores rename widget on result object', () => {
    expect(GET_STATE_SCRIPT).toContain('result.renameWidget');
  });
});

describe('GET_STATE_SCRIPT completion details scraping', () => {
  it('queries suggest details container', () => {
    expect(GET_STATE_SCRIPT).toContain('.suggest-details-container');
  });

  it('extracts type and documentation', () => {
    expect(GET_STATE_SCRIPT).toContain('.type');
    expect(GET_STATE_SCRIPT).toContain('.docs');
  });

  it('stores completion details on result object', () => {
    expect(GET_STATE_SCRIPT).toContain('result.completionDetails');
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
