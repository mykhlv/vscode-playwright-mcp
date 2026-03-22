/**
 * Deferred-promise bridge between our launch/close lifecycle and @playwright/mcp's contextGetter.
 *
 * @playwright/mcp calls `contextGetter()` lazily (on first browser_* tool use).
 * This bridge blocks that call until `provide()` is called after vscode_launch,
 * and resets for the next launch cycle after vscode_close.
 */

import type { BrowserContext } from 'playwright';
import { ErrorCode, ToolError } from './types/errors.js';

export class ContextBridge {
  private _resolve!: (ctx: BrowserContext) => void;
  private _reject!: (err: Error) => void;
  private _promise: Promise<BrowserContext>;
  private _provided = false;

  constructor() {
    this._promise = this._createDeferred();
  }

  /**
   * Called by @playwright/mcp's contextGetter.
   * Blocks until provide() is called after vscode_launch.
   */
  async getContext(): Promise<BrowserContext> {
    return this._promise;
  }

  /**
   * Whether a BrowserContext has been provided (VS Code is running).
   */
  get isProvided(): boolean {
    return this._provided;
  }

  /**
   * Provide the BrowserContext after successful vscode_launch.
   * Unblocks any pending contextGetter calls.
   */
  provide(ctx: BrowserContext): void {
    if (this._provided) {
      throw new ToolError(
        ErrorCode.SESSION_EXISTS,
        'BrowserContext already provided. Call reset() before providing a new one.',
      );
    }
    this._provided = true;
    this._resolve(ctx);
  }

  /**
   * Reset for the next launch cycle.
   * Called before vscode_close or on error recovery.
   * Rejects any pending contextGetter calls.
   */
  reset(): void {
    if (!this._provided) {
      // Reject any pending waiters
      this._reject(new ToolError(
        ErrorCode.NO_SESSION,
        'VS Code session was closed before it could be used. Call vscode_launch first.',
      ));
    }
    this._provided = false;
    this._promise = this._createDeferred();
  }

  private _createDeferred(): Promise<BrowserContext> {
    const promise = new Promise<BrowserContext>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    // Prevent unhandled rejection warnings when reset() rejects a promise nobody awaited
    promise.catch(() => {});
    return promise;
  }
}
