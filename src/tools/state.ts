/**
 * Tool handlers: vscode_get_state, vscode_get_hover
 *
 * These tools use page.evaluate() + DOM scraping to read VS Code state
 * as structured text. Much cheaper than screenshots for getting editor metadata.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { GetStateParams, GetHoverParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

/** DOM scraping script for editor state. Runs inside the VS Code renderer. */
export const GET_STATE_SCRIPT = `(() => {
  const result = {};

  // Active file name from the active tab
  const activeTab = document.querySelector('.tab.active .label-name');
  result.activeFile = activeTab ? activeTab.textContent.trim() : null;

  // Also try the title bar as fallback
  if (!result.activeFile) {
    const titleEl = document.querySelector('.window-title');
    result.activeFile = titleEl ? titleEl.textContent.trim() : null;
  }

  // Cursor position from status bar (line, column)
  const cursorEl = document.querySelector('.editor-status-selection');
  result.cursorPosition = cursorEl ? cursorEl.textContent.trim() : null;

  // Diagnostics (errors, warnings) from status bar
  const errorsEl = document.querySelector('.status-bar-item[id*="status.problems"]');
  result.diagnostics = errorsEl ? errorsEl.textContent.trim() : null;

  // Selection info from status bar
  const selectionEl = document.querySelector('.editor-status-selection');
  if (selectionEl) {
    const text = selectionEl.textContent.trim();
    // If there's a selection, it shows something like "Ln 5, Col 10 (42 selected)"
    if (text.includes('selected')) {
      result.selection = text;
    }
  }

  // Visible editor lines
  const viewLines = document.querySelectorAll('.view-lines .view-line');
  const lines = [];
  for (const line of viewLines) {
    const lineContent = line.textContent || '';
    lines.push(lineContent);
  }

  // Get line numbers if available
  const lineNumbers = document.querySelectorAll('.line-numbers');
  const numberedLines = [];
  if (lineNumbers.length > 0 && lineNumbers.length === lines.length) {
    for (let i = 0; i < lines.length; i++) {
      const num = lineNumbers[i].textContent.trim();
      numberedLines.push(num + ': ' + lines[i]);
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      numberedLines.push(lines[i]);
    }
  }

  // Return first 10 and last 5 if there are many lines
  if (numberedLines.length > 20) {
    result.visibleLines = {
      first: numberedLines.slice(0, 10),
      last: numberedLines.slice(-5),
      totalVisible: numberedLines.length,
    };
  } else {
    result.visibleLines = {
      all: numberedLines,
      totalVisible: numberedLines.length,
    };
  }

  return result;
})()`;

/** DOM scraping script for hover tooltip content. Runs inside the VS Code renderer. */
export const GET_HOVER_SCRIPT = `(() => {
  // Try the main Monaco hover content container
  const hoverContent = document.querySelector('.monaco-hover-content');
  if (hoverContent) {
    return { found: true, text: hoverContent.textContent.trim() };
  }

  // Try alternate hover containers
  const hoverContents = document.querySelector('.hover-contents');
  if (hoverContents) {
    return { found: true, text: hoverContents.textContent.trim() };
  }

  // Try the hover widget itself
  const hoverWidget = document.querySelector('.monaco-hover');
  if (hoverWidget) {
    const visible = hoverWidget.style.display !== 'none' &&
                    hoverWidget.style.visibility !== 'hidden';
    if (visible) {
      return { found: true, text: hoverWidget.textContent.trim() };
    }
  }

  return { found: false, text: null };
})()`;

interface EditorState {
  activeFile: string | null;
  cursorPosition: string | null;
  diagnostics: string | null;
  selection?: string;
  visibleLines: {
    first?: string[];
    last?: string[];
    all?: string[];
    totalVisible: number;
  };
}

interface HoverResult {
  found: boolean;
  text: string | null;
}

export async function handleGetState(
  session: SessionManager,
  _params: GetStateParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_get_state' });

  const page = session.getPage();

  const state = await withRetry(
    () => page.evaluate(GET_STATE_SCRIPT) as Promise<EditorState>,
    'get_state',
  );

  const parts: string[] = [];

  parts.push(`Active file: ${state.activeFile ?? '(none)'}`);
  parts.push(`Cursor: ${state.cursorPosition ?? '(unknown)'}`);
  parts.push(`Diagnostics: ${state.diagnostics ?? '(none)'}`);

  if (state.selection) {
    parts.push(`Selection: ${state.selection}`);
  }

  parts.push('');

  const { visibleLines } = state;
  if (visibleLines.totalVisible === 0) {
    parts.push('No editor lines visible (no file open or editor not focused).');
  } else if (visibleLines.all) {
    parts.push(`Visible lines (${visibleLines.totalVisible}):`);
    for (const line of visibleLines.all) {
      parts.push(`  ${line}`);
    }
  } else if (visibleLines.first && visibleLines.last) {
    parts.push(`Visible lines (${visibleLines.totalVisible} total, showing first 10 + last 5):`);
    for (const line of visibleLines.first) {
      parts.push(`  ${line}`);
    }
    parts.push('  ...');
    for (const line of visibleLines.last) {
      parts.push(`  ${line}`);
    }
  }

  return textResult(parts.join('\n'));
}

export async function handleGetHover(
  session: SessionManager,
  _params: GetHoverParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_get_hover' });

  const page = session.getPage();

  const result = await withRetry(
    () => page.evaluate(GET_HOVER_SCRIPT) as Promise<HoverResult>,
    'get_hover',
  );

  if (!result.found || !result.text) {
    return textResult(
      'No hover tooltip visible. Use vscode_hover first to trigger a tooltip at specific coordinates, then call vscode_get_hover to read it.',
    );
  }

  return textResult(`Hover content:\n${result.text}`);
}
