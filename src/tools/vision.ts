/**
 * Tool handlers: vscode_screenshot, vscode_snapshot
 */

import type { SessionManager } from '../session/session-manager.js';
import type { ScreenshotParams } from '../types/tool-params.js';
import { type ToolResult, textResult, imageResult } from '../types/tool-results.js';
import { validateQuality, validateRegion } from '../utils/validation.js';
import { captureScreenshot } from '../utils/image.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

export async function handleScreenshot(
  session: SessionManager,
  params: ScreenshotParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_screenshot', params });

  const page = session.getPage();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  validateQuality(params.quality);
  validateRegion(params.region, viewport);

  const result = await withRetry(
    () => captureScreenshot(page, {
      format: params.format,
      quality: params.quality,
      region: params.region,
    }),
    'screenshot',
  );

  const metadata = `Screenshot captured (${result.width}x${result.height}, ${result.format}, ${result.sizeKB}KB).`;
  return imageResult(result.buffer, result.format, metadata);
}

/**
 * AI snapshot result from Playwright's internal _snapshotForAI().
 * Returns YAML with [ref=eN] on interactive elements and populates
 * the aria-ref selector engine for subsequent locator queries.
 */
interface AISnapshotResult {
  full: string;
  incremental?: string;
}

export async function handleSnapshot(
  session: SessionManager,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_snapshot' });

  const page = session.getPage();

  // Use Playwright's AI snapshot which includes [ref=eN] on interactive elements.
  // After this call, page.locator('aria-ref=eN') resolves to the DOM element.
  const result: AISnapshotResult = await withRetry(
    () => (page as unknown as { _snapshotForAI(opts: { timeout: number }): Promise<AISnapshotResult> })._snapshotForAI({ timeout: 10000 }),
    'snapshot',
  );

  const lineCount = result.full.split('\n').length;
  logger.debug('snapshot_captured', { lineCount, mode: 'ai' });

  return textResult(
    `Accessibility snapshot (${lineCount} lines):\n` +
    'Interactive elements have [ref=eN] — use ref with vscode_click or vscode_hover.\n\n' +
    result.full,
  );
}
