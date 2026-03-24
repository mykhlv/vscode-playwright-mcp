/**
 * Structured error types with LLM-actionable messages.
 * Errors should tell the LLM what to do next, not dump stack traces.
 */

export const ErrorCode = {
  // Session errors
  NO_SESSION: 'NO_SESSION',
  SESSION_EXISTS: 'SESSION_EXISTS',
  LAUNCH_FAILED: 'LAUNCH_FAILED',
  SESSION_CRASHED: 'SESSION_CRASHED',
  SESSION_UNRESPONSIVE: 'SESSION_UNRESPONSIVE',

  // Validation errors
  INVALID_COORDINATES: 'INVALID_COORDINATES',
  INVALID_PATH: 'INVALID_PATH',
  INVALID_INPUT: 'INVALID_INPUT',

  // Command errors
  COMMAND_NOT_FOUND: 'COMMAND_NOT_FOUND',

  // Runtime errors
  SCREENSHOT_FAILED: 'SCREENSHOT_FAILED',
  SNAPSHOT_FAILED: 'SNAPSHOT_FAILED',
  ACTION_FAILED: 'ACTION_FAILED',
  TIMEOUT: 'TIMEOUT',

  // GIF errors
  GIF_ERROR: 'GIF_ERROR',

  // System errors
  VSCODE_NOT_FOUND: 'VSCODE_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class ToolError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly actionable: string,
    options?: { cause?: unknown },
  ) {
    super(actionable, options ? { cause: options.cause } : undefined);
    this.name = 'ToolError';
  }

  /** Format for MCP error response — LLM sees this directly */
  toMcpText(): string {
    return `Error [${this.code}]: ${this.actionable}`;
  }
}
