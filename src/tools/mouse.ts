/**
 * Tool handler: vscode_click
 * Phase 1: click only. hover/scroll/drag are Phase 2.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { ClickParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { validateCoordinates, validateClickCount } from '../utils/validation.js';
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
