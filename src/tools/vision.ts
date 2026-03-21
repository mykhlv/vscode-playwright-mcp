/**
 * Tool handlers: vscode_screenshot, vscode_snapshot, vscode_resize, vscode_zoom, vscode_find_element
 */

import type { Page } from 'playwright-core';
import type { SessionManager } from '../session/session-manager.js';
import type { ScreenshotParams, ResizeParams, ZoomParams, FindElementParams } from '../types/tool-params.js';
import { type ToolResult, textResult, imageResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { validateQuality, validateRegion, validateViewportSize } from '../utils/validation.js';
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

type SnapshotPage = { _snapshotForAI(opts: { timeout: number }): Promise<AISnapshotResult> };

/** Take an AI snapshot with retry. Centralizes the unsafe cast. */
async function takeAISnapshot(page: Page): Promise<AISnapshotResult> {
  return withRetry(
    () => (page as unknown as SnapshotPage)._snapshotForAI({ timeout: 10000 }),
    'snapshot',
  );
}

export async function handleSnapshot(
  session: SessionManager,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_snapshot' });

  const page = session.getPage();
  const result = await takeAISnapshot(page);

  const lineCount = result.full.split('\n').length;
  logger.debug('snapshot_captured', { lineCount, mode: 'ai' });

  return textResult(
    `Accessibility snapshot (${lineCount} lines):\n` +
    'Interactive elements have [ref=eN] — use ref with vscode_click or vscode_hover.\n\n' +
    result.full,
  );
}

/** Layout settling delay after viewport resize (ms). */
const RESIZE_SETTLE_MS = 100;

export async function handleResize(
  session: SessionManager,
  params: ResizeParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_resize', params });

  const page = session.getPage();

  validateViewportSize(params.width, params.height);

  await page.setViewportSize({ width: params.width, height: params.height });
  await page.waitForTimeout(RESIZE_SETTLE_MS);

  const actual = page.viewportSize();
  const w = actual?.width ?? params.width;
  const h = actual?.height ?? params.height;
  return textResult(
    `Viewport resized to ${w}x${h}. Take a screenshot to see the result.`,
  );
}

export async function handleZoom(
  session: SessionManager,
  params: ZoomParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_zoom', params });

  const page = session.getPage();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  validateRegion({ x: params.x, y: params.y, width: params.width, height: params.height }, viewport);
  validateQuality(params.quality);

  const result = await withRetry(
    () => captureScreenshot(page, {
      format: params.format,
      quality: params.quality,
      region: { x: params.x, y: params.y, width: params.width, height: params.height },
    }),
    'zoom',
  );

  const metadata = `Cropped region (${params.x},${params.y}) ${result.width}x${result.height}, ${result.format}, ${result.sizeKB}KB. Coordinates in this image are offset: add (${params.x}, ${params.y}) to convert back to window coordinates for clicks.`;
  return imageResult(result.buffer, result.format, metadata);
}

export async function handleFindElement(
  session: SessionManager,
  params: FindElementParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_find_element', params });

  const page = session.getPage();

  if (!params.role && !params.name) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      'At least one of "role" or "name" is required. Examples: role="button", name="Save", or both.',
    );
  }

  const maxResults = params.max_results ?? 20;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 200) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `max_results must be an integer between 1 and 200. Got ${maxResults}.`,
    );
  }

  // Take a snapshot to get fresh refs (invalidates previous refs)
  const snapshotResult = await takeAISnapshot(page);

  const lines = snapshotResult.full.split('\n');

  // Filter lines by role and/or name (case-insensitive)
  const rolePattern = params.role?.toLowerCase();
  const namePattern = params.name?.toLowerCase();

  const matches: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!trimmed) continue;

    // Snapshot lines look like: - button "Save" [ref=e5] or - img [ref=e3]
    // Role is the first word after "- "
    const match = trimmed.match(/^-\s+(\S+)(.*)/);
    if (!match?.[1]) continue;

    const lineRole = match[1].toLowerCase();

    if (rolePattern && lineRole !== rolePattern) continue;

    // Match name against all quoted strings on the line, not refs/attributes
    if (namePattern) {
      const rest = match[2] ?? '';
      const quotedParts: string[] = [];
      for (const m of rest.matchAll(/"([^"]*)"/g)) {
        if (m[1] !== undefined) quotedParts.push(m[1].toLowerCase());
      }
      const allQuoted = quotedParts.join(' ');
      if (!allQuoted.includes(namePattern)) continue;
    }

    matches.push(line);
    if (matches.length >= maxResults) break;
  }

  if (matches.length === 0) {
    const criteria = [
      params.role && `role="${params.role}"`,
      params.name && `name="${params.name}"`,
    ].filter(Boolean).join(', ');
    return textResult(
      `No elements found matching ${criteria}. Use vscode_snapshot to see all available elements.`,
    );
  }

  return textResult(
    `Found ${matches.length} element(s) (refs refreshed — previous refs are now stale):\n\n` +
    matches.join('\n') +
    (matches.length >= maxResults ? `\n\n(Limited to ${maxResults} results. Use more specific filters to narrow down.)` : ''),
  );
}
