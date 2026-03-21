/**
 * Shared timeout utility.
 * Wraps a promise with a deadline — rejects with TIMEOUT ToolError if exceeded.
 */

import { ErrorCode, ToolError } from '../types/errors.js';

/** Run a promise with a timeout. Rejects with TIMEOUT error if exceeded. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ToolError(
        ErrorCode.TIMEOUT,
        `${label} timed out after ${ms}ms. Try vscode_screenshot to see current state, or vscode_close and relaunch.`,
      ));
    }, ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
