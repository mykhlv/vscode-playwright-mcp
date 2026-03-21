/**
 * Shared setup utilities for integration tests.
 *
 * Provides helpers to:
 * - Skip tests if VS Code binary is not available
 * - Create pre-configured SessionManager + GifRecorder instances
 * - Launch/close VS Code with sensible defaults for testing
 */

import { expect } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import { GifRecorder } from '../../src/session/gif-recorder.js';
import { resolveVSCodePath } from '../../src/session/vscode-launcher.js';
import type { ToolResult } from '../../src/types/tool-results.js';

/** Check whether a VS Code binary is available on this machine. */
export function isVSCodeAvailable(): boolean {
  try {
    resolveVSCodePath();
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a fresh SessionManager instance.
 * Each test file should get its own instance to avoid cross-contamination.
 */
export function createSession(): SessionManager {
  return new SessionManager();
}

/**
 * Create a fresh GifRecorder instance.
 */
export function createRecorder(): GifRecorder {
  return new GifRecorder();
}

/** Standard viewport size for integration tests */
export const TEST_VIEWPORT = { width: 1280, height: 720 };

/**
 * Launch VS Code on a SessionManager with default test settings.
 * Uses small viewport and suppresses all UI noise.
 */
export async function launchTestVSCode(session: SessionManager): Promise<void> {
  await session.launch({
    viewport: TEST_VIEWPORT,
  });
}

/**
 * Assert that a ToolResult is a text result and return the text string.
 * Fails the test if the result is not of type 'text'.
 */
export function assertText(result: ToolResult): string {
  expect(result.type).toBe('text');
  if (result.type !== 'text') throw new Error('unreachable');
  return result.text;
}

/**
 * Assert that a ToolResult is an image result and return its fields.
 * Fails the test if the result is not of type 'image'.
 */
export function assertImage(result: ToolResult): { data: string; mimeType: string; metadata: string } {
  expect(result.type).toBe('image');
  if (result.type !== 'image') throw new Error('unreachable');
  return { data: result.data, mimeType: result.mimeType, metadata: result.metadata };
}

/** Timeout constants for integration tests */
export const LAUNCH_TIMEOUT = 30_000;
export const TOOL_TIMEOUT = 10_000;
export const TEST_TIMEOUT = 60_000;
