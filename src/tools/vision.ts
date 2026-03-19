/**
 * Tool handlers: vscode_screenshot, vscode_snapshot
 */

import type { SessionManager } from '../session/session-manager.js';
import type { ScreenshotParams, SnapshotParams } from '../types/tool-params.js';
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

export async function handleSnapshot(
  session: SessionManager,
  params: SnapshotParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_snapshot', params });

  const page = session.getPage();
  const selector = params.selector ?? 'body';
  const maxDepth = params.max_depth ?? 5;

  const snapshot = await withRetry(
    // maxDepth is supported at runtime but not yet in playwright-core types
    () => page.locator(selector).ariaSnapshot({ maxDepth } as Record<string, unknown>),
    'snapshot',
  );

  const lineCount = snapshot.split('\n').length;
  logger.debug('snapshot_captured', { lineCount, maxDepth, selector });

  return textResult(
    `Accessibility snapshot (${lineCount} lines, maxDepth=${maxDepth}):\n\n${snapshot}`,
  );
}
