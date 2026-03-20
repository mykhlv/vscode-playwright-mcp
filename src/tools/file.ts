/**
 * Tool handler: vscode_ensure_file
 *
 * Reliably opens and activates a specific file in the editor.
 * Uses Quick Open (Cmd+P) with the full path, then verifies
 * the correct file became active via DOM scraping.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { EnsureFileParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { validateNonEmptyString } from '../utils/validation.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

/** Max attempts to open the correct file. */
const MAX_RETRIES = 2;

/** Delay after pressing Enter for the file to open. */
const FILE_OPEN_SETTLE_MS = 500;

/** Script to read the active file name from VS Code's DOM. */
const GET_ACTIVE_FILE_SCRIPT = `(() => {
  const activeTab = document.querySelector('.tab.active .label-name');
  if (activeTab) return activeTab.textContent.trim();
  const titleEl = document.querySelector('.window-title');
  return titleEl ? titleEl.textContent.trim() : null;
})()`;

/**
 * Check if the active file matches the expected filename.
 * Compares by basename since Quick Open shows only the filename in tabs.
 */
export function isFileMatch(activeFile: string | null, expectedPath: string): boolean {
  if (!activeFile) return false;
  // Extract basename, handling both / and \ separators
  const segments = expectedPath.split(/[/\\]/);
  const expectedBasename = segments[segments.length - 1] || expectedPath;
  // Active tab shows "filename" or "filename - folder" for disambiguation
  return activeFile === expectedBasename || activeFile.startsWith(expectedBasename + ' ');
}

export async function handleEnsureFile(
  session: SessionManager,
  params: EnsureFileParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_ensure_file', path: params.path });

  validateNonEmptyString(params.path, 'path');

  const page = session.getPage();

  // Check if the file is already active — skip Quick Open entirely
  const currentFile = await page.evaluate(GET_ACTIVE_FILE_SCRIPT) as string | null;
  if (isFileMatch(currentFile, params.path)) {
    return textResult(`File already active: ${currentFile}`);
  }

  const quickOpenShortcut = process.platform === 'darwin' ? 'Meta+KeyP' : 'Control+KeyP';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Open Quick Open
    await withRetry(
      () => page.keyboard.press(quickOpenShortcut),
      'open_quick_open',
    );
    await page.waitForTimeout(200);

    // Clear any existing text in Quick Open input
    const selectAllShortcut = process.platform === 'darwin' ? 'Meta+KeyA' : 'Control+KeyA';
    await page.keyboard.press(selectAllShortcut);
    await page.waitForTimeout(50);

    // Type the full path for precise matching
    await page.keyboard.type(params.path, { delay: 0 });
    await page.waitForTimeout(200);

    // Press Enter to open the top match
    await page.keyboard.press('Enter');
    await page.waitForTimeout(FILE_OPEN_SETTLE_MS);

    // Verify the correct file is now active
    const activeFile = await page.evaluate(GET_ACTIVE_FILE_SCRIPT) as string | null;

    if (isFileMatch(activeFile, params.path)) {
      return textResult(`Opened file: ${activeFile}`);
    }

    // Wrong file — close Quick Open if it's still open and retry
    if (attempt < MAX_RETRIES) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      logger.warn('ensure_file_retry', {
        attempt: attempt + 1,
        expected: params.path,
        got: activeFile,
      });
    }
  }

  // All retries exhausted — dismiss Quick Open if still open
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  const finalFile = await page.evaluate(GET_ACTIVE_FILE_SCRIPT) as string | null;
  throw new ToolError(
    ErrorCode.ACTION_FAILED,
    `Failed to open "${params.path}". Active file is "${finalFile ?? '(none)'}". ` +
    'The file may not exist in the workspace, or Quick Open matched a different file. ' +
    'Verify the path is correct and the file exists in the open workspace.',
  );
}
