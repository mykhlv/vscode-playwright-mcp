/**
 * Internal retry for transient CDP transport errors.
 * 1 retry, 500ms delay. Not for application-level errors.
 */

import { logger } from './logger.js';

const RETRY_DELAY_MS = 500;

/**
 * Execute an async function with a single retry on transient errors.
 * Only retries errors that look like CDP transport issues (connection reset, etc).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isTransientError(error)) {
      logger.warn('transient_error_retry', { label, error: String(error) });
      await delay(RETRY_DELAY_MS);
      return await fn();
    }
    throw error;
  }
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('connection refused') ||
    msg.includes('connection reset') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
