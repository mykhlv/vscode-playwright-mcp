/**
 * Tool handlers: vscode_type, vscode_press_key
 */

import type { SessionManager } from '../session/session-manager.js';
import type { TypeParams, PressKeyParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { validateNonEmptyString } from '../utils/validation.js';
import { normalizeKeyCombo, validateKeyCombo } from '../utils/key-mapping.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

export async function handleType(
  session: SessionManager,
  params: TypeParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_type', textLength: params.text.length });

  validateNonEmptyString(params.text, 'text');

  if (params.text.length > 10_000) {
    logger.warn('large_text_input', { length: params.text.length });
  }

  const page = session.getPage();
  const delay = params.delay ?? 0;

  await withRetry(
    () => page.keyboard.type(params.text, { delay }),
    'type',
  );

  const preview = params.text.length > 50
    ? params.text.slice(0, 50) + '...'
    : params.text;
  return textResult(
    `Typed "${preview}" (${params.text.length} chars). Take a screenshot or snapshot to verify the result.`,
  );
}

export async function handlePressKey(
  session: SessionManager,
  params: PressKeyParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_press_key', key: params.key });

  validateNonEmptyString(params.key, 'key');

  const validationError = validateKeyCombo(params.key);
  if (validationError) {
    throw new ToolError(ErrorCode.INVALID_KEY, validationError);
  }

  const normalized = normalizeKeyCombo(params.key);
  const page = session.getPage();

  await withRetry(
    () => page.keyboard.press(normalized),
    'press_key',
  );

  return textResult(
    `Pressed "${params.key}"${normalized !== params.key ? ` (normalized: "${normalized}")` : ''}. Take a screenshot or snapshot to verify the result.`,
  );
}
