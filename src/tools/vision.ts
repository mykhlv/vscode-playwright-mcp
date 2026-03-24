/**
 * Tool handlers: vscode_zoom, vscode_find_element
 *
 * Screenshot and snapshot are delegated to @playwright/mcp's browser_take_screenshot
 * and browser_snapshot. Resize is handled natively by vscode_resize (see resize.ts).
 */

import type { Page } from 'playwright';
import type { SessionManager } from '../session/session-manager.js';
import type { ZoomParams, FindElementParams } from '../types/tool-params.js';
import { type ToolResult, textResult, imageResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { validateQuality, validateRegion, DEFAULT_VIEWPORT } from '../utils/validation.js';
import { captureScreenshot } from '../utils/image.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

/**
 * AI snapshot result from Playwright's internal _snapshotForAI().
 */
interface AISnapshotResult {
  full: string;
  incremental?: string;
}

type SnapshotPage = { _snapshotForAI(opts: { timeout: number }): Promise<AISnapshotResult> };

/** Take an AI snapshot with retry. Used by handleFindElement. */
async function takeAISnapshot(page: Page): Promise<AISnapshotResult> {
  return withRetry(
    () => (page as unknown as SnapshotPage)._snapshotForAI({ timeout: 10000 }),
    'snapshot',
  );
}

export async function handleZoom(
  session: SessionManager,
  params: ZoomParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_zoom', params });

  const page = session.getPage();
  const viewport = page.viewportSize() ?? DEFAULT_VIEWPORT;

  validateRegion({ x: params.x, y: params.y, width: params.width, height: params.height }, viewport);
  validateQuality(params.quality);

  let result;
  try {
    result = await withRetry(
      () => captureScreenshot(page, {
        format: params.format,
        quality: params.quality,
        region: { x: params.x, y: params.y, width: params.width, height: params.height },
      }),
      'zoom',
    );
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(
      ErrorCode.SCREENSHOT_FAILED,
      `Zoom capture failed: ${error instanceof Error ? error.message : String(error)}. VS Code window may be minimized or unresponsive.`,
    );
  }

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
  let snapshotResult;
  try {
    snapshotResult = await takeAISnapshot(page);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(
      ErrorCode.SNAPSHOT_FAILED,
      `Snapshot failed while searching for elements: ${error instanceof Error ? error.message : String(error)}. VS Code may be unresponsive.`,
    );
  }

  const lines = snapshotResult.full.split('\n');

  // Filter lines by role and/or name (case-insensitive)
  const rolePattern = params.role?.toLowerCase();
  const namePattern = params.name?.toLowerCase();

  const matches: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!trimmed) continue;

    // Snapshot lines look like: - button "Save" [ref=e5] or - img [ref=e3]
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
