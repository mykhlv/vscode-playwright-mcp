/**
 * Screenshot capture helpers.
 * Handles JPEG/PNG capture, optional crop, and metadata generation.
 */

import type { Page } from 'playwright-core';

export interface CaptureOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
  region?: { x: number; y: number; width: number; height: number };
  scale?: number;
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
  const scale = options.scale ?? 1;

  const screenshotOptions: Parameters<Page['screenshot']>[0] = {
    type: format,
    quality,
    scale: scale === 1 ? undefined : 'css',
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

  // Calculate effective dimensions
  let width: number;
  let height: number;
  if (options.region) {
    width = Math.round(options.region.width * scale);
    height = Math.round(options.region.height * scale);
  } else {
    const viewport = page.viewportSize();
    width = Math.round((viewport?.width ?? 1280) * scale);
    height = Math.round((viewport?.height ?? 720) * scale);
  }

  return {
    buffer,
    format,
    width,
    height,
    sizeKB: Math.round(buffer.length / 1024 * 10) / 10,
  };
}
