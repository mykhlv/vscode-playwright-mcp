/**
 * Tool handler: vscode_wait_for
 *
 * Waits for a CSS selector, text content, or a simple delay.
 * Useful for synchronizing with VS Code UI updates.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { WaitForParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 5000;
const TEXT_POLL_INTERVAL_MS = 250;

export async function handleWaitFor(
  session: SessionManager,
  params: WaitForParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_wait_for', params });

  // Validate: cannot provide both selector and text
  if (params.selector && params.text) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      'Provide either "selector" or "text", not both. Use selector for CSS-based waits, text for content-based waits.',
    );
  }

  // Validate: state only makes sense with selector
  if (params.state && !params.selector) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      '"state" can only be used with "selector". Remove "state" or provide a CSS selector.',
    );
  }

  const page = session.getPage();
  const timeout = params.timeout ?? DEFAULT_TIMEOUT_MS;

  // Validate timeout
  if (timeout <= 0) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      'timeout must be a positive number in milliseconds.',
    );
  }

  // Mode 1: Wait for CSS selector
  if (params.selector) {
    const state = params.state ?? 'visible';
    try {
      await page.waitForSelector(params.selector, { state, timeout });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Timeout') || msg.includes('timeout')) {
        throw new ToolError(
          ErrorCode.TIMEOUT,
          `Selector "${params.selector}" did not reach state "${state}" within ${timeout}ms. Use vscode_screenshot to see current state.`,
        );
      }
      throw new ToolError(
        ErrorCode.ACTION_FAILED,
        `waitForSelector failed: ${msg}`,
      );
    }
    return textResult(`Selector "${params.selector}" is now ${state}.`);
  }

  // Mode 2: Wait for text content
  if (params.text) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const bodyText = await page.evaluate(() => document.body.textContent || '');
      if (bodyText.includes(params.text!)) {
        return textResult(`Text "${params.text}" found on page.`);
      }
      await page.waitForTimeout(TEXT_POLL_INTERVAL_MS);
    }
    throw new ToolError(
      ErrorCode.TIMEOUT,
      `Text "${params.text}" not found within ${timeout}ms. Use vscode_screenshot to see current state.`,
    );
  }

  // Mode 3: Simple delay
  await page.waitForTimeout(timeout);
  return textResult(`Waited ${timeout}ms.`);
}
