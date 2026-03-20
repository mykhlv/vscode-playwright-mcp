/**
 * Tool handlers: vscode_get_state, vscode_get_hover
 *
 * These tools use page.evaluate() + DOM scraping to read VS Code state
 * as structured text. Much cheaper than screenshots for getting editor metadata.
 */

import type { Page } from 'playwright-core';
import type { SessionManager } from '../session/session-manager.js';
import type { GetStateParams, GetHoverParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
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

  // Detailed diagnostics from the Problems panel (if open)
  const markersPanel = document.querySelector('.markers-panel');
  if (markersPanel) {
    const rows = markersPanel.querySelectorAll('.monaco-list-row');
    const items = [];
    for (const row of rows) {
      // Resource rows (file headers) have .file-icon; marker rows have .marker-icon
      const fileIcon = row.querySelector('.file-icon');
      if (fileIcon) {
        // This is a file header row — skip, individual markers carry the info
        continue;
      }

      const iconEl = row.querySelector('.marker-icon .codicon');
      let severity = 'unknown';
      if (iconEl) {
        const cls = iconEl.className || '';
        if (cls.includes('codicon-error')) severity = 'error';
        else if (cls.includes('codicon-warning')) severity = 'warning';
        else if (cls.includes('codicon-info')) severity = 'info';
      }

      // The marker row typically has: icon, message span, source span, code span, position span
      const messageEl = row.querySelector('.marker-message-detail-text') ||
                        row.querySelector('.marker-message');
      const message = messageEl ? messageEl.textContent.trim() : row.textContent.trim();

      // Position (line, column) is in a span with class "marker-line" or similar
      const posEl = row.querySelector('.marker-line');
      const position = posEl ? posEl.textContent.trim() : null;

      // Source (e.g., "typescript", "eslint")
      const sourceEl = row.querySelector('.marker-source');
      const source = sourceEl ? sourceEl.textContent.trim() : null;

      // Code (e.g., "ts(2304)")
      const codeEl = row.querySelector('.marker-code');
      const code = codeEl ? codeEl.textContent.trim() : null;

      items.push({ severity, message, position, source, code });
    }
    if (items.length > 0) {
      result.diagnosticsList = items;
    }
  }

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

interface DiagnosticItem {
  severity: string;
  message: string;
  position: string | null;
  source: string | null;
  code: string | null;
}

interface EditorState {
  activeFile: string | null;
  cursorPosition: string | null;
  diagnostics: string | null;
  diagnosticsList?: DiagnosticItem[];
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

  if (state.diagnosticsList && state.diagnosticsList.length > 0) {
    parts.push('');
    parts.push(`Problems panel (${state.diagnosticsList.length} items):`);
    for (const d of state.diagnosticsList) {
      const pos = d.position ? ` [${d.position}]` : '';
      const src = d.source ? ` (${d.source}` + (d.code ? ` ${d.code}` : '') + ')' : (d.code ? ` (${d.code})` : '');
      parts.push(`  ${d.severity.toUpperCase()}${pos}: ${d.message}${src}`);
    }
  }

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

/**
 * DOM scraping script that resolves editor line:column to pixel coordinates.
 * Takes targetLine and targetCol as arguments via page.evaluate().
 */
export const RESOLVE_EDITOR_POSITION_SCRIPT = `([targetLine, targetCol]) => {
  // Find the line number element matching the target line
  const lineNumberEls = document.querySelectorAll('.margin-view-overlays .line-numbers');

  for (const el of lineNumberEls) {
    const lineNum = parseInt(el.textContent.trim(), 10);
    if (lineNum !== targetLine) continue;

    const lineRect = el.getBoundingClientRect();

    // Find the corresponding view-line at the same vertical position
    const viewLines = document.querySelectorAll('.view-lines .view-line');
    for (const viewLine of viewLines) {
      const viewRect = viewLine.getBoundingClientRect();
      if (Math.abs(viewRect.top - lineRect.top) > 2) continue;

      // Calculate character width from the first text span
      const firstSpan = viewLine.querySelector('span span');
      let charWidth = 7.2; // reasonable monospace fallback
      if (firstSpan && firstSpan.textContent.length > 0) {
        charWidth = firstSpan.getBoundingClientRect().width / firstSpan.textContent.length;
      }

      const x = viewRect.left + (targetCol - 1) * charWidth;
      const y = viewRect.top + viewRect.height / 2;
      return { x: Math.round(x), y: Math.round(y), found: true };
    }
  }

  return { x: 0, y: 0, found: false };
}`;

interface EditorPositionResult {
  x: number;
  y: number;
  found: boolean;
}

/**
 * Resolve editor line:column to pixel coordinates via DOM scraping.
 * The target line must be visible in the editor viewport.
 */
export async function resolveEditorPosition(
  page: Page,
  line: number,
  column: number,
): Promise<{ x: number; y: number }> {
  const result = await withRetry(
    () => page.evaluate(
      RESOLVE_EDITOR_POSITION_SCRIPT,
      [line, column],
    ) as Promise<EditorPositionResult>,
    'resolve_editor_position',
  );

  if (!result.found) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Could not resolve editor position at line ${line}, column ${column}. ` +
      'Make sure the line is visible in the editor viewport. ' +
      'Use vscode_scroll or vscode_run_command with "Go to Line" to scroll the target line into view.',
    );
  }

  return { x: result.x, y: result.y };
}
