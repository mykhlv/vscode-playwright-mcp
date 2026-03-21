/**
 * Tool handler: vscode_evaluate
 *
 * Evaluates a JavaScript expression in the VS Code renderer process
 * and returns the serialized result.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { EvaluateParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { validateNonEmptyString } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export async function handleEvaluate(
  session: SessionManager,
  params: EvaluateParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_evaluate', expression: params.expression });

  validateNonEmptyString(params.expression, 'expression');

  const timeout = params.timeout ?? DEFAULT_TIMEOUT_MS;

  if (timeout <= 0) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      'timeout must be a positive number in milliseconds.',
    );
  }

  const page = session.getPage();

  let result: unknown;
  try {
    result = await Promise.race([
      page.evaluate(params.expression),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new ToolError(
            ErrorCode.TIMEOUT,
            `Expression evaluation timed out after ${timeout}ms. Simplify the expression or increase timeout.`,
          )),
          timeout,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('SyntaxError') || msg.includes('Unexpected token')) {
      throw new ToolError(
        ErrorCode.INVALID_INPUT,
        `Syntax error in expression: ${msg}. Check the JavaScript syntax.`,
      );
    }
    throw new ToolError(
      ErrorCode.ACTION_FAILED,
      `Expression evaluation failed: ${msg}`,
    );
  }

  let serialized: string;
  if (result === undefined) {
    serialized = 'undefined';
  } else {
    try {
      serialized = JSON.stringify(result, null, 2);
    } catch {
      serialized = `[non-serializable] ${String(result)}`;
    }
  }

  return textResult(`Evaluation result:\n${serialized}`);
}
