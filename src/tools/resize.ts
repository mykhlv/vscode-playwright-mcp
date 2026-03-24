/**
 * Tool handler for vscode_resize: resize the VS Code Electron window.
 *
 * Unlike upstream browser_resize (which only sets Playwright's internal viewport),
 * this resizes the actual Electron BrowserWindow via app.evaluate(),
 * then syncs the Playwright viewport to match.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { ResizeParams } from '../types/tool-params.js';
import { type ToolResult, textResult } from '../types/tool-results.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

const MIN_DIMENSION = 200;
const MAX_WIDTH = 7680;
const MAX_HEIGHT = 4320;

function validateDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Width and height must be finite numbers. Got width=${width}, height=${height}.`,
    );
  }

  // Round to integers if fractional
  const w = Math.round(width);
  const h = Math.round(height);

  if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Minimum window size is ${MIN_DIMENSION}x${MIN_DIMENSION}. Got ${w}x${h}.`,
    );
  }

  if (w > MAX_WIDTH || h > MAX_HEIGHT) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Maximum window size is ${MAX_WIDTH}x${MAX_HEIGHT}. Got ${w}x${h}.`,
    );
  }

  return { width: w, height: h };
}

export async function handleResize(
  session: SessionManager,
  params: ResizeParams,
): Promise<ToolResult> {
  logger.info('tool_call', { tool: 'vscode_resize', params });

  const { width, height } = validateDimensions(params.width, params.height);

  const app = session.getApp();
  const page = session.getPage();

  // Resize the actual Electron BrowserWindow content area via main process
  try {
    const resized = await app.evaluate(
      ({ BrowserWindow }, { width, height }) => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        if (!win) {
          return false;
        }
        win.setContentSize(width, height);
        return true;
      },
      { width, height },
    );

    if (!resized) {
      throw new ToolError(
        ErrorCode.ACTION_FAILED,
        'No Electron BrowserWindow found. VS Code may have closed unexpectedly. Call vscode_close and relaunch.',
      );
    }
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(
      ErrorCode.ACTION_FAILED,
      `Failed to resize Electron window: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Sync Playwright viewport to match the new window size
  try {
    await page.setViewportSize({ width, height });
  } catch (error) {
    throw new ToolError(
      ErrorCode.ACTION_FAILED,
      `Electron window resized but Playwright viewport sync failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return textResult(
    `VS Code window resized to ${width}x${height}.`,
  );
}
