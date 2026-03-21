/**
 * Tool handler: vscode_run_command
 *
 * Executes VS Code commands via Command Palette automation.
 * The VS Code Extension API (vscode.commands) is not available from the renderer process,
 * so we automate the Command Palette UI instead: Meta+Shift+P → type command → Enter.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { RunCommandParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { validateNonEmptyString } from '../utils/validation.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

/** Delay in ms after pressing Enter to let the command take effect. */
const COMMAND_SETTLE_MS = 300;

export async function handleRunCommand(
  session: SessionManager,
  params: RunCommandParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_run_command', command: params.command });

  validateNonEmptyString(params.command, 'command');

  const page = session.getPage();

  // Open Command Palette (Meta on macOS, Control on Linux/Windows)
  const commandPaletteShortcut = process.platform === 'darwin' ? 'Meta+Shift+KeyP' : 'Control+Shift+KeyP';
  await withRetry(
    () => page.keyboard.press(commandPaletteShortcut),
    'open_command_palette',
  );

  // Brief delay for the palette to appear
  await page.waitForTimeout(200);

  // Type the command name
  await page.keyboard.type(params.command, { delay: 0 });

  // Brief delay for filtering to settle
  await page.waitForTimeout(200);

  // Check if Command Palette found a match before pressing Enter.
  // When no match exists, the palette shows "No matching commands" or
  // the list is empty — pressing Enter would dismiss the palette and
  // type the command text directly into the editor, silently corrupting the file.
  const hasMatch = await page.evaluate(() => {
    // Command Palette uses .quick-input-list with .monaco-list-row elements
    const rows = document.querySelectorAll('.quick-input-list .monaco-list-row');
    if (rows.length === 0) return false;
    // Also check for "No matching commands" message
    const noResults = document.querySelector('.quick-input-message');
    if (noResults && noResults.textContent?.includes('No matching')) return false;
    return true;
  });

  if (!hasMatch) {
    // Dismiss the palette without executing
    await page.keyboard.press('Escape');
    throw new ToolError(
      ErrorCode.COMMAND_NOT_FOUND,
      `Command not found: "${params.command}". No matching command in Command Palette. ` +
      'Use the exact command label (e.g. "Go to Line" not "goToLine"). ' +
      'Use vscode_snapshot on the Command Palette to see available commands.',
    );
  }

  // Press Enter to execute the top match
  await page.keyboard.press('Enter');

  // If there's additional text input, type it after the command executes
  if (params.input) {
    await page.waitForTimeout(200);
    await page.keyboard.type(params.input, { delay: 0 });
    await page.keyboard.press('Enter');
  }

  // Let the command take effect
  await page.waitForTimeout(COMMAND_SETTLE_MS);

  const inputDesc = params.input ? ` with input "${params.input}"` : '';
  return textResult(
    `Executed command "${params.command}"${inputDesc} via Command Palette. Use vscode_screenshot or vscode_get_state to verify the result.`,
  );
}
