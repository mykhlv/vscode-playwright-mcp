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

  // Open Command Palette
  await withRetry(
    () => page.keyboard.press('Meta+Shift+KeyP'),
    'open_command_palette',
  );

  // Brief delay for the palette to appear
  await page.waitForTimeout(200);

  // Type the command name
  await page.keyboard.type(params.command, { delay: 0 });

  // Brief delay for filtering to settle
  await page.waitForTimeout(200);

  // Press Enter to execute the top match
  await page.keyboard.press('Enter');

  // If there's an additional text argument, type it after the command executes
  if (params.args) {
    await page.waitForTimeout(200);
    await page.keyboard.type(params.args, { delay: 0 });
    await page.keyboard.press('Enter');
  }

  // Let the command take effect
  await page.waitForTimeout(COMMAND_SETTLE_MS);

  const argsDesc = params.args ? ` with args "${params.args}"` : '';
  return textResult(
    `Executed command "${params.command}"${argsDesc} via Command Palette. Use vscode_screenshot or vscode_get_state to verify the result.`,
  );
}
