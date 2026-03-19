/**
 * Tool handlers: vscode_click, vscode_hover, vscode_scroll, vscode_drag
 */

import type { SessionManager } from '../session/session-manager.js';
import type { ClickParams, HoverParams, ScrollParams, DragParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { validateCoordinates, validateClickCount, validateScrollAmount } from '../utils/validation.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

export async function handleClick(
  session: SessionManager,
  params: ClickParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_click', params });

  const page = session.getPage();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  validateCoordinates(params.x, params.y, viewport);
  validateClickCount(params.click_count);

  const button = params.button ?? 'left';
  const clickCount = params.click_count ?? 1;
  const modifiers = params.modifiers ?? [];

  await withRetry(async () => {
    // Press modifiers
    for (const mod of modifiers) {
      await page.keyboard.down(mod);
    }

    await page.mouse.click(params.x, params.y, {
      button,
      clickCount,
    });

    // Release modifiers in reverse order
    for (const mod of [...modifiers].reverse()) {
      await page.keyboard.up(mod);
    }
  }, 'click');

  const clickType = clickCount === 2 ? 'Double-clicked' : clickCount === 3 ? 'Triple-clicked' : 'Clicked';
  const buttonDesc = button !== 'left' ? ` (${button} button)` : '';
  const modDesc = modifiers.length > 0 ? ` with ${modifiers.join('+')}` : '';

  return textResult(
    `${clickType} at (${params.x}, ${params.y})${buttonDesc}${modDesc}. Take a screenshot or snapshot to verify the result.`,
  );
}

export async function handleHover(
  session: SessionManager,
  params: HoverParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_hover', params });

  const page = session.getPage();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  validateCoordinates(params.x, params.y, viewport);

  await withRetry(
    () => page.mouse.move(params.x, params.y),
    'hover',
  );

  return textResult(
    `Hovered at (${params.x}, ${params.y}). Take a screenshot to see tooltips or hover effects.`,
  );
}

export async function handleScroll(
  session: SessionManager,
  params: ScrollParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_scroll', params });

  const page = session.getPage();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  validateCoordinates(params.x, params.y, viewport);
  validateScrollAmount(params.amount);

  const amount = params.amount ?? 3;

  // Playwright mouse.wheel takes deltaX, deltaY in pixels.
  // Each "scroll unit" maps to ~100px, matching typical scroll behavior.
  const pixelsPerUnit = 100;
  let deltaX = 0;
  let deltaY = 0;

  switch (params.direction) {
    case 'up':
      deltaY = -amount * pixelsPerUnit;
      break;
    case 'down':
      deltaY = amount * pixelsPerUnit;
      break;
    case 'left':
      deltaX = -amount * pixelsPerUnit;
      break;
    case 'right':
      deltaX = amount * pixelsPerUnit;
      break;
  }

  await withRetry(async () => {
    // Move to position first, then scroll
    await page.mouse.move(params.x, params.y);
    await page.mouse.wheel(deltaX, deltaY);
  }, 'scroll');

  return textResult(
    `Scrolled ${params.direction} by ${amount} units at (${params.x}, ${params.y}). Take a screenshot to see the result.`,
  );
}

export async function handleDrag(
  session: SessionManager,
  params: DragParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_drag', params });

  const page = session.getPage();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  validateCoordinates(params.start_x, params.start_y, viewport);
  validateCoordinates(params.end_x, params.end_y, viewport);

  await withRetry(async () => {
    await page.mouse.move(params.start_x, params.start_y);
    await page.mouse.down();
    // Move in steps for smooth drag (important for VS Code drag targets)
    await page.mouse.move(params.end_x, params.end_y, { steps: 10 });
    await page.mouse.up();
  }, 'drag');

  return textResult(
    `Dragged from (${params.start_x}, ${params.start_y}) to (${params.end_x}, ${params.end_y}). Take a screenshot to verify the result.`,
  );
}
