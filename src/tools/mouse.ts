/**
 * Tool handler: vscode_scroll
 *
 * Click, hover, and drag are now delegated to @playwright/mcp's
 * browser_click, browser_hover, and browser_drag.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { ScrollParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { validateCoordinates, validateScrollAmount, DEFAULT_VIEWPORT } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

/** Pixels per scroll unit — maps to typical mouse wheel behavior. */
const PIXELS_PER_SCROLL_UNIT = 100;

export async function handleScroll(
  session: SessionManager,
  params: ScrollParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_scroll', params });

  const page = session.getPage();
  const viewport = page.viewportSize() ?? DEFAULT_VIEWPORT;

  validateCoordinates(params.x, params.y, viewport);
  validateScrollAmount(params.amount);

  const amount = params.amount ?? 3;

  // Playwright mouse.wheel takes deltaX, deltaY in pixels.
  let deltaX = 0;
  let deltaY = 0;

  switch (params.direction) {
    case 'up':
      deltaY = -amount * PIXELS_PER_SCROLL_UNIT;
      break;
    case 'down':
      deltaY = amount * PIXELS_PER_SCROLL_UNIT;
      break;
    case 'left':
      deltaX = -amount * PIXELS_PER_SCROLL_UNIT;
      break;
    case 'right':
      deltaX = amount * PIXELS_PER_SCROLL_UNIT;
      break;
  }

  await page.mouse.move(params.x, params.y);
  await page.mouse.wheel(deltaX, deltaY);

  return textResult(
    `Scrolled ${params.direction} by ${amount} units at (${params.x}, ${params.y}). Take a screenshot to see the result.`,
  );
}
