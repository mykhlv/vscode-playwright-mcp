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
import { GET_ACTIVE_FILE_SCRIPT } from '../utils/dom-scripts.js';

/**
 * DOM scraping script for editor state. Runs inside the VS Code renderer.
 * Active-file selectors are shared via GET_ACTIVE_FILE_SCRIPT (dom-scripts.ts).
 */
export const GET_STATE_SCRIPT = `(() => {
  const result = {};

  // Active file name — uses the same selectors as GET_ACTIVE_FILE_SCRIPT
  result.activeFile = ${GET_ACTIVE_FILE_SCRIPT};

  // Cursor position from status bar (line, column) — multiple strategies
  result.cursorPosition = null;

  // Strategy 1: status bar button with "Ln X, Col Y" text
  const statusButtons = document.querySelectorAll('.statusbar-item');
  for (const btn of statusButtons) {
    const text = btn.textContent.trim();
    const match = text.match(/Ln\\s+\\d+,\\s*Col\\s+\\d+/);
    if (match) {
      result.cursorPosition = match[0];
      break;
    }
  }

  // Strategy 2: .editor-status-selection element (legacy selector)
  if (!result.cursorPosition) {
    const cursorEl = document.querySelector('.editor-status-selection');
    if (cursorEl) {
      const text = cursorEl.textContent.trim();
      if (/Ln\\s+\\d+/.test(text)) {
        result.cursorPosition = text;
      }
    }
  }

  // Strategy 3: try to read from the active editor's cursor DOM position
  if (!result.cursorPosition) {
    const cursors = document.querySelectorAll('.cursor.monaco-mouse-cursor-text');
    if (cursors.length > 0) {
      // Cursor element exists — editor is active but status bar didn't report position.
      // Try to infer line from visible line numbers + cursor vertical offset.
      const cursor = cursors[0];
      const cursorRect = cursor.getBoundingClientRect();
      const lineNumberEls = document.querySelectorAll('.margin-view-overlays .line-numbers');
      let closestLine = null;
      let closestDist = Infinity;
      for (const lnEl of lineNumberEls) {
        const lnRect = lnEl.getBoundingClientRect();
        const dist = Math.abs(lnRect.top + lnRect.height / 2 - (cursorRect.top + cursorRect.height / 2));
        if (dist < closestDist) {
          closestDist = dist;
          closestLine = lnEl.textContent.trim();
        }
      }
      if (closestLine && closestDist < 5) {
        result.cursorPosition = 'Ln ' + closestLine + ' (col unknown, from DOM)';
      }
    }
  }

  // Diagnostics (errors, warnings) from status bar
  const errorsEl = document.querySelector('.status-bar-item[id*="status.problems"]');
  result.diagnostics = errorsEl ? errorsEl.textContent.trim() : null;

  // Detailed diagnostics from the Problems panel (if open)
  const markersPanel = document.querySelector('.markers-panel');
  if (markersPanel) {
    const rows = markersPanel.querySelectorAll('.monaco-list-row');
    const items = [];
    let currentFile = null;
    for (const row of rows) {
      // Resource rows (file headers) have .file-icon; marker rows have .marker-icon
      const fileIcon = row.querySelector('.file-icon');
      if (fileIcon) {
        // This is a file header row — track the filename for subsequent markers
        currentFile = fileIcon.textContent ? fileIcon.textContent.trim() : null;
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

      items.push({ severity, message, position, source, code, file: currentFile });
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

  // Completions from the suggest widget (IntelliSense popup)
  const suggestWidget = document.querySelector('.editor-widget.suggest-widget');
  if (suggestWidget &&
      suggestWidget.style.display !== 'none' &&
      (suggestWidget.getAttribute('monaco-visible-content-widget') === 'true' ||
       !suggestWidget.classList.contains('hidden'))) {
    const rows = suggestWidget.querySelectorAll('.monaco-list-row');
    const completions = [];
    for (const row of rows) {
      const labelEl = row.querySelector('.label-name') || row.querySelector('.monaco-icon-label-container .label-name');
      const label = labelEl ? labelEl.textContent.trim() : null;
      if (!label) continue;

      // Kind from the icon class (e.g., codicon-symbol-method, codicon-symbol-property)
      const iconEl = row.querySelector('.codicon[class*="codicon-symbol-"]');
      let kind = null;
      if (iconEl) {
        const cls = iconEl.className;
        const kindMatch = cls.match(/codicon-symbol-(\\w+)/);
        if (kindMatch) kind = kindMatch[1];
      }

      // Detail/qualifier text
      const qualifierEl = row.querySelector('.qualifier') || row.querySelector('.details-label');
      const detail = qualifierEl ? qualifierEl.textContent.trim() : null;

      // Highlighted (selected) row
      const focused = row.classList.contains('focused');

      completions.push({ label, kind, detail, focused });
    }
    if (completions.length > 0) {
      result.completions = completions;
    }
  }

  // Peek widget (Go to References, Go to Definition peek)
  const peekWidget = document.querySelector('.zone-widget .peekview-widget');
  if (peekWidget) {
    // Title: e.g. "3 references" or filename
    const titleEl = peekWidget.querySelector('.peekview-title .filename');
    const metaEl = peekWidget.querySelector('.peekview-title .dirname');
    const peekTitle = titleEl ? titleEl.textContent.trim() : null;
    const peekMeta = metaEl ? metaEl.textContent.trim() : null;

    // Reference/definition list items from the tree
    const treeRows = peekWidget.querySelectorAll('.ref-tree .monaco-list-row');
    const peekItems = [];
    for (const row of treeRows) {
      // File header rows have .reference-file; reference rows have .reference
      const fileHeader = row.querySelector('.reference-file');
      if (fileHeader) {
        const fileName = fileHeader.querySelector('.label-name');
        const fileCount = fileHeader.querySelector('.count');
        peekItems.push({
          type: 'file',
          label: fileName ? fileName.textContent.trim() : fileHeader.textContent.trim(),
          count: fileCount ? fileCount.textContent.trim() : null,
        });
        continue;
      }

      // Individual reference rows show line content with highlighted match
      const refContent = row.querySelector('.referenceMatch') || row.querySelector('.reference');
      if (refContent || row.textContent.trim()) {
        const lineEl = row.querySelector('.line-number');
        peekItems.push({
          type: 'reference',
          text: row.textContent.trim(),
          line: lineEl ? lineEl.textContent.trim() : null,
          highlighted: row.classList.contains('focused') || row.classList.contains('selected'),
        });
      }
    }
    result.peekWidget = {
      title: peekTitle,
      meta: peekMeta,
      items: peekItems,
    };
  }

  // Rename input box (.rename-box is the container; the actual input is inside)
  const renameBox = document.querySelector('.rename-box');
  const renameBoxVisible = renameBox && (
    renameBox.offsetParent !== null ||
    (window.getComputedStyle(renameBox).position === 'fixed' && renameBox.getBoundingClientRect().width > 0)
  );
  if (renameBoxVisible) {
    const renameInput = renameBox.querySelector('input') || renameBox.querySelector('.rename-input');
    result.renameWidget = {
      value: renameInput ? (renameInput.value || renameInput.textContent || '') : '',
    };
  }

  // Suggest details (documentation popup shown alongside completions)
  const detailsContainer = document.querySelector('.suggest-details-container');
  if (detailsContainer && detailsContainer.offsetParent !== null) {
    const detailsBody = detailsContainer.querySelector('.body');
    if (detailsBody) {
      // Get the type/signature from the header
      const typeEl = detailsBody.querySelector('.type');
      // Get the documentation text
      const docsEl = detailsBody.querySelector('.docs');
      result.completionDetails = {
        type: typeEl ? typeEl.textContent.trim() : null,
        documentation: docsEl ? docsEl.textContent.trim() : null,
      };
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

  // Return all visible lines — the handler controls truncation via visible_lines param
  result.visibleLines = {
    all: numberedLines,
    totalVisible: numberedLines.length,
  };

  return result;
})()`;

/** DOM scraping script for hover tooltip content. Runs inside the VS Code renderer. */
export const GET_HOVER_SCRIPT = `(() => {
  function isVisible(el) {
    if (!el) return false;
    // Walk up to the hover widget container and check its display/visibility
    let node = el;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      node = node.parentElement;
    }
    return true;
  }

  // Try the main Monaco hover content container
  const hoverContent = document.querySelector('.monaco-hover-content');
  if (hoverContent && isVisible(hoverContent)) {
    return { found: true, text: hoverContent.textContent.trim() };
  }

  // Try alternate hover containers
  const hoverContents = document.querySelector('.hover-contents');
  if (hoverContents && isVisible(hoverContents)) {
    return { found: true, text: hoverContents.textContent.trim() };
  }

  // Try the hover widget itself
  const hoverWidget = document.querySelector('.monaco-hover');
  if (hoverWidget && isVisible(hoverWidget)) {
    return { found: true, text: hoverWidget.textContent.trim() };
  }

  return { found: false, text: null };
})()`;

interface DiagnosticItem {
  severity: string;
  message: string;
  position: string | null;
  source: string | null;
  code: string | null;
  file: string | null;
}

interface CompletionItem {
  label: string;
  kind: string | null;
  detail: string | null;
  focused: boolean;
}

interface PeekItem {
  type: 'file' | 'reference';
  label?: string;
  count?: string | null;
  text?: string;
  line?: string | null;
  highlighted?: boolean;
}

interface PeekWidget {
  title: string | null;
  meta: string | null;
  items: PeekItem[];
}

interface RenameWidget {
  value: string;
}

interface CompletionDetails {
  type: string | null;
  documentation: string | null;
}

interface EditorState {
  activeFile: string | null;
  cursorPosition: string | null;
  diagnostics: string | null;
  diagnosticsList?: DiagnosticItem[];
  completions?: CompletionItem[];
  completionDetails?: CompletionDetails;
  selection?: string;
  peekWidget?: PeekWidget;
  renameWidget?: RenameWidget;
  visibleLines: {
    all: string[];
    totalVisible: number;
  };
}

interface HoverResult {
  found: boolean;
  text: string | null;
}

/** Severity levels ordered by priority (lower index = higher severity). */
const SEVERITY_LEVELS = ['error', 'warning', 'info'] as const;

/** Check if a diagnostic meets the minimum severity threshold. */
function meetsSeverity(
  severity: string,
  minSeverity: 'error' | 'warning' | 'info',
): boolean {
  const diagIdx = SEVERITY_LEVELS.indexOf(severity as typeof SEVERITY_LEVELS[number]);
  const minIdx = SEVERITY_LEVELS.indexOf(minSeverity);
  // Unknown severities pass through; known ones must be at or above threshold
  if (diagIdx === -1) return true;
  return diagIdx <= minIdx;
}

export async function handleGetState(
  session: SessionManager,
  params: GetStateParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_get_state', params });

  const page = session.getPage();

  // If wait_for_diagnostics is set, poll until diagnostics appear or timeout.
  // Reuse the last poll result to avoid an extra evaluate call.
  let state: EditorState | null = null;

  if (params.wait_for_diagnostics) {
    const timeoutMs = params.timeout ?? 5000;
    const pollInterval = 500;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const probe = await page.evaluate(GET_STATE_SCRIPT) as EditorState;
      state = probe;
      if (probe.diagnosticsList && probe.diagnosticsList.length > 0) {
        break;
      }
      // Also check the status bar summary for a non-zero count
      if (probe.diagnostics && !/^0\b/.test(probe.diagnostics.replace(/\s/g, '')) && probe.diagnostics !== '0') {
        break;
      }
      await page.waitForTimeout(pollInterval);
    }
  }

  if (!state) {
    state = await withRetry(
      () => page.evaluate(GET_STATE_SCRIPT) as Promise<EditorState>,
      'get_state',
    );
  }

  const parts: string[] = [];

  parts.push(`Active file: ${state.activeFile ?? '(none)'}`);
  parts.push(`Cursor: ${state.cursorPosition ?? '(unknown)'}`);
  parts.push(`Diagnostics: ${state.diagnostics ?? '(none)'}`);

  if (state.diagnosticsList && state.diagnosticsList.length > 0) {
    let filteredDiagnostics = state.diagnosticsList;

    // Filter by filename if specified
    if (params.diagnostics_file) {
      const filterFile = params.diagnostics_file.toLowerCase();
      filteredDiagnostics = filteredDiagnostics.filter((d) => {
        // Primary: match against the file header from the markers panel
        if (d.file && d.file.toLowerCase().includes(filterFile)) {
          return true;
        }
        // Fallback: check if any diagnostic text references the filename
        const fullText = [d.message, d.position, d.source, d.code]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return fullText.includes(filterFile);
      });
    }

    // Filter by minimum severity if specified
    if (params.diagnostics_severity) {
      filteredDiagnostics = filteredDiagnostics.filter((d) =>
        meetsSeverity(d.severity, params.diagnostics_severity!),
      );
    }

    if (filteredDiagnostics.length > 0) {
      parts.push('');
      const filterNote = (params.diagnostics_file || params.diagnostics_severity)
        ? ` (filtered from ${state.diagnosticsList.length} total)`
        : '';
      parts.push(`Problems panel (${filteredDiagnostics.length} items${filterNote}):`);
      for (const d of filteredDiagnostics) {
        const pos = d.position ? ` [${d.position}]` : '';
        const src = d.source ? ` (${d.source}` + (d.code ? ` ${d.code}` : '') + ')' : (d.code ? ` (${d.code})` : '');
        parts.push(`  ${d.severity.toUpperCase()}${pos}: ${d.message}${src}`);
      }
    }
  }

  if (state.completions && state.completions.length > 0) {
    parts.push('');
    parts.push(`Completions (${state.completions.length} items):`);
    for (const c of state.completions) {
      const prefix = c.kind ? `[${c.kind}] ` : '';
      const detailStr = c.detail ? ` — ${c.detail}` : '';
      const focusStr = c.focused ? ' (selected)' : '';
      parts.push(`  ${prefix}${c.label}${detailStr}${focusStr}`);
    }
  }

  if (state.completionDetails) {
    const cd = state.completionDetails;
    if (cd.type || cd.documentation) {
      parts.push('');
      parts.push('Completion details:');
      if (cd.type) parts.push(`  Type: ${cd.type}`);
      if (cd.documentation) parts.push(`  Docs: ${cd.documentation}`);
    }
  }

  if (state.peekWidget) {
    const pw = state.peekWidget;
    parts.push('');
    const titleStr = pw.title ?? '(unknown)';
    const metaStr = pw.meta ? ` — ${pw.meta}` : '';
    parts.push(`Peek widget: ${titleStr}${metaStr}`);
    if (pw.items.length > 0) {
      for (const item of pw.items) {
        if (item.type === 'file') {
          const countStr = item.count ? ` (${item.count})` : '';
          parts.push(`  [file] ${item.label}${countStr}`);
        } else {
          const lineStr = item.line ? `[${item.line}] ` : '';
          const hlStr = item.highlighted ? ' (selected)' : '';
          parts.push(`  ${lineStr}${item.text ?? ''}${hlStr}`);
        }
      }
    }
  }

  if (state.renameWidget) {
    parts.push('');
    parts.push(`Rename widget: "${state.renameWidget.value}"`);
  }

  if (state.selection) {
    parts.push(`Selection: ${state.selection}`);
  }

  parts.push('');

  // Determine visible lines mode
  const visibleLinesParam = params.visible_lines ?? 15;

  const { visibleLines } = state;
  if (visibleLinesParam === 'none') {
    // Don't output any lines
  } else if (visibleLines.totalVisible === 0) {
    parts.push('No editor lines visible (no file open or editor not focused).');
  } else if (visibleLinesParam === 'all') {
    parts.push(`Visible lines (${visibleLines.totalVisible}):`);
    for (const line of visibleLines.all) {
      parts.push(`  ${line}`);
    }
  } else {
    const maxLines = typeof visibleLinesParam === 'number' ? visibleLinesParam : 15;
    if (visibleLines.all.length <= maxLines) {
      parts.push(`Visible lines (${visibleLines.totalVisible}):`);
      for (const line of visibleLines.all) {
        parts.push(`  ${line}`);
      }
    } else {
      const lastCount = Math.min(5, Math.floor(maxLines / 3));
      const firstCount = maxLines - lastCount;
      parts.push(`Visible lines (${visibleLines.totalVisible} total, showing first ${firstCount} + last ${lastCount}):`);
      for (const line of visibleLines.all.slice(0, firstCount)) {
        parts.push(`  ${line}`);
      }
      parts.push('  ...');
      for (const line of visibleLines.all.slice(-lastCount)) {
        parts.push(`  ${line}`);
      }
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
      'No hover tooltip visible. Use browser_hover first to trigger a tooltip at specific coordinates, then call vscode_get_hover to read it.',
    );
  }

  return textResult(`Hover content:\n${result.text}`);
}

