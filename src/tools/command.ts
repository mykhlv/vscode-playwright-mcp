/**
 * Tool handler: vscode_run_command
 *
 * Executes VS Code commands via two strategies:
 * 1. Direct API execution via helper extension (preferred — supports command IDs and args)
 * 2. Command Palette automation as fallback (Meta+Shift+P → type command → Enter)
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

/** Maximum allowed length for a command string typed into the Command Palette. */
const MAX_COMMAND_LENGTH = 500;

export async function handleRunCommand(
  session: SessionManager,
  params: RunCommandParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_run_command', command: params.command });

  validateNonEmptyString(params.command, 'command');
  const command = params.command.trim();

  // Try direct API execution first via helper extension
  const client = session.getHelperClient();
  if (client) {
    try {
      const result = await client.executeCommand(command, params.args);
      const argsDesc = params.args?.length ? ` with args ${JSON.stringify(params.args)}` : '';
      const resultDesc = result !== null && result !== undefined ? ` Result: ${JSON.stringify(result)}` : '';
      return textResult(
        `Executed command "${command}"${argsDesc} via VS Code API.${resultDesc} ` +
        'Verify with vscode_screenshot or vscode_get_state if the result is unclear.',
      );
    } catch (err) {
      // Only fall back to Command Palette for command-not-found errors.
      // Other errors (e.g. extension crashed, timeout) should propagate.
      if (err instanceof ToolError && err.code === ErrorCode.COMMAND_NOT_FOUND) {
        logger.debug('command_api_not_found_fallback', { command });
      } else {
        throw err;
      }
    }
  }

  // Fallback: Command Palette automation (args not supported in this mode)
  return executeViaCommandPalette(session, command, params.input);
}

async function executeViaCommandPalette(
  session: SessionManager,
  command: string,
  input?: string,
): Promise<ToolResult> {
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Command string too long (${command.length} chars, max ${MAX_COMMAND_LENGTH}). ` +
      'Use the exact command label from the Command Palette, not arbitrary text.',
    );
  }

  const page = session.getPage();

  // Dismiss any existing overlays (e.g., a previously open Command Palette).
  // Pressing Meta+Shift+P when the palette is already open would close it,
  // causing the typed command text to go into the editor and corrupt the file.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // Open Command Palette (Meta on macOS, Control on Linux/Windows)
  const commandPaletteShortcut = process.platform === 'darwin' ? 'Meta+Shift+KeyP' : 'Control+Shift+KeyP';
  await withRetry(
    () => page.keyboard.press(commandPaletteShortcut),
    'open_command_palette',
  );

  // Brief delay for the palette to appear
  await page.waitForTimeout(200);

  // Type the command name
  await page.keyboard.type(command, { delay: 0 });

  // Brief delay for filtering to settle
  await page.waitForTimeout(200);

  // Check if Command Palette found a match and read the top result label.
  const matchResult = await page.evaluate(() => {
    const noResults = document.querySelector('.quick-input-message');
    if (noResults && noResults.textContent?.includes('No matching')) {
      return { found: false as const };
    }
    const rows = document.querySelectorAll('.quick-input-list .monaco-list-row');
    if (rows.length === 0) return { found: false as const };
    const firstRow = rows[0];
    const label = firstRow?.querySelector('.label-name')?.textContent?.trim()
      ?? firstRow?.textContent?.trim()
      ?? null;
    if (label && /no matching/i.test(label)) {
      return { found: false as const };
    }
    return { found: true as const, topMatch: label };
  });

  if (!matchResult.found) {
    await page.keyboard.press('Escape');
    throw new ToolError(
      ErrorCode.COMMAND_NOT_FOUND,
      `Command not found: "${command}". No matching command in Command Palette. ` +
      'Use the exact command label (e.g. "Go to Line" not "goToLine"). ' +
      'Use vscode_snapshot on the Command Palette to see available commands.',
    );
  }

  // Press Enter to execute the top match
  await page.keyboard.press('Enter');

  // If there's additional text input, type it after the command executes
  if (input) {
    await page.waitForTimeout(200);
    await page.keyboard.type(input, { delay: 0 });
    await page.keyboard.press('Enter');
  }

  // Let the command take effect
  await page.waitForTimeout(COMMAND_SETTLE_MS);

  const inputDesc = input ? ` with input "${input}"` : '';
  const topMatch = matchResult.topMatch;

  if (topMatch) {
    return textResult(
      `Executed top Command Palette match "${topMatch}" (query: "${command}")${inputDesc}. ` +
      'Verify with vscode_screenshot or vscode_get_state if the result is unclear.',
    );
  }

  return textResult(
    `Executed command "${command}"${inputDesc} via Command Palette. ` +
    'Verify with vscode_screenshot or vscode_get_state if the result is unclear.',
  );
}
