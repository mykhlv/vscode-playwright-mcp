/**
 * Input validation utilities.
 * All validation happens before touching Playwright — fail fast with LLM-actionable messages.
 */

import * as fs from 'node:fs';
import { ErrorCode, ToolError } from '../types/errors.js';

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export function validateCoordinates(
  x: number,
  y: number,
  viewport: { width: number; height: number } = DEFAULT_VIEWPORT,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new ToolError(
      ErrorCode.INVALID_COORDINATES,
      `Coordinates must be finite numbers. Got x=${x}, y=${y}.`,
    );
  }

  if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) {
    throw new ToolError(
      ErrorCode.INVALID_COORDINATES,
      `Coordinates (${x}, ${y}) are outside window bounds (${viewport.width}x${viewport.height}). Use vscode_screenshot to see the current window.`,
    );
  }
}

export function validateNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `${fieldName} must be a non-empty string.`,
    );
  }
}

export function validatePathExists(filePath: string, description: string): void {
  if (!fs.existsSync(filePath)) {
    throw new ToolError(
      ErrorCode.INVALID_PATH,
      `${description} does not exist: ${filePath}`,
    );
  }
}

export function validateQuality(quality: number | undefined): void {
  if (quality !== undefined && (quality < 1 || quality > 100 || !Number.isInteger(quality))) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Screenshot quality must be an integer between 1 and 100. Got ${quality}.`,
    );
  }
}

export function validateScale(scale: number | undefined): void {
  if (scale !== undefined && (scale <= 0 || scale > 2)) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Screenshot scale must be between 0 (exclusive) and 2 (inclusive). Got ${scale}.`,
    );
  }
}

export function validateRegion(
  region: { x: number; y: number; width: number; height: number } | undefined,
  viewport: { width: number; height: number } = DEFAULT_VIEWPORT,
): void {
  if (!region) return;

  const { x, y, width, height } = region;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Screenshot region must have non-negative x/y and positive width/height. Got {x:${x}, y:${y}, width:${width}, height:${height}}.`,
    );
  }

  if (x + width > viewport.width || y + height > viewport.height) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Screenshot region {x:${x}, y:${y}, width:${width}, height:${height}} exceeds window bounds (${viewport.width}x${viewport.height}).`,
    );
  }
}

export function validateClickCount(count: number | undefined): void {
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 3)) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `click_count must be 1, 2, or 3. Got ${count}.`,
    );
  }
}

export function validateScrollAmount(amount: number | undefined): void {
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 100)) {
    throw new ToolError(
      ErrorCode.INVALID_INPUT,
      `Scroll amount must be a positive number up to 100. Got ${amount}.`,
    );
  }
}
