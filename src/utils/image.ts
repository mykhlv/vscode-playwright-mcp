/**
 * Screenshot capture helpers.
 * Handles JPEG/PNG capture, optional crop, and metadata generation.
 */

import type { Page } from 'playwright';
import { DEFAULT_VIEWPORT } from './validation.js';

export interface CaptureOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
  region?: { x: number; y: number; width: number; height: number };
}

export interface CaptureResult {
  buffer: Buffer;
  format: 'jpeg' | 'png';
  width: number;
  height: number;
  sizeKB: number;
}

/**
 * Capture a screenshot from a Playwright page.
 * Supports JPEG compression, optional crop region, and scale.
 */
export async function captureScreenshot(
  page: Page,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const format = options.format ?? 'jpeg';
  const quality = format === 'jpeg' ? (options.quality ?? 75) : undefined;

  const screenshotOptions: Parameters<Page['screenshot']>[0] = {
    type: format,
    quality,
  };

  if (options.region) {
    screenshotOptions.clip = {
      x: options.region.x,
      y: options.region.y,
      width: options.region.width,
      height: options.region.height,
    };
  }

  const buffer = await page.screenshot(screenshotOptions);

  let width: number;
  let height: number;
  if (options.region) {
    width = options.region.width;
    height = options.region.height;
  } else {
    const viewport = page.viewportSize();
    width = viewport?.width ?? DEFAULT_VIEWPORT.width;
    height = viewport?.height ?? DEFAULT_VIEWPORT.height;
  }

  return {
    buffer,
    format,
    width,
    height,
    sizeKB: Math.round(buffer.length / 1024 * 10) / 10,
  };
}
