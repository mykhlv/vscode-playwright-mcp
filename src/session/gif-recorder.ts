/**
 * GIF recorder: captures frames as PNG buffers and encodes them into an animated GIF.
 * Frames are captured automatically after each tool call while recording is active.
 */

import { writeFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import type { Page } from 'playwright-core';
/** Lazy-load gifenc to handle CJS/ESM interop differences across runtimes */
async function loadGifenc() {
  // @ts-expect-error -- gifenc has no type declarations
  const mod = await import('gifenc');
  // CJS interop: might be mod.default.GIFEncoder or mod.GIFEncoder
  const api = mod.default?.GIFEncoder ? mod.default : mod;
  return api as {
    GIFEncoder: () => any;
    quantize: (rgba: Uint8Array, maxColors: number) => number[][];
    applyPalette: (rgba: Uint8Array, palette: number[][]) => Uint8Array;
  };
}
import { PNG } from 'pngjs';
import { logger } from '../utils/logger.js';

/** Maximum number of frames to prevent memory issues */
const MAX_FRAMES = 100;

/** Minimum delay between frames in ms */
const MIN_FRAME_DELAY_MS = 100;

/** Maximum delay between frames in ms */
const MAX_FRAME_DELAY_MS = 2000;

/** Output GIF dimensions (scaled down from 1280x720 for file size) */
const GIF_WIDTH = 640;
const GIF_HEIGHT = 360;

interface Frame {
  png: Buffer;
  timestamp: number;
}

/**
 * Scale RGBA pixel data from source dimensions to target dimensions
 * using nearest-neighbor interpolation.
 */
function scaleDown(
  rgba: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  const dst = new Uint8Array(dstWidth * dstHeight * 4);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    const srcY = Math.floor(y * yRatio);
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (y * dstWidth + x) * 4;
      dst[dstIdx] = rgba[srcIdx]!;
      dst[dstIdx + 1] = rgba[srcIdx + 1]!;
      dst[dstIdx + 2] = rgba[srcIdx + 2]!;
      dst[dstIdx + 3] = rgba[srcIdx + 3]!;
    }
  }

  return dst;
}

export class GifRecorder {
  private frames: Frame[] = [];
  private recording = false;

  get isRecording(): boolean {
    return this.recording;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /**
   * Start recording. Clears any existing frames.
   */
  startRecording(): void {
    this.frames = [];
    this.recording = true;
    logger.info('gif_recording_started');
  }

  /**
   * Capture a single frame from the current page.
   * Called automatically after each tool call while recording.
   */
  async captureFrame(page: Page): Promise<void> {
    if (!this.recording) return;

    try {
      const png = await page.screenshot({ type: 'png', timeout: 5000 });
      this.frames.push({ png, timestamp: Date.now() });

      // If we exceeded the limit, drop every other frame to free memory
      if (this.frames.length > MAX_FRAMES) {
        logger.warn('gif_frame_limit_exceeded', {
          frameCount: this.frames.length,
          limit: MAX_FRAMES,
        });
        this.frames = this.frames.filter((_, i) => i % 2 === 0);
      }

      logger.debug('gif_frame_captured', { frameCount: this.frames.length });
    } catch (error) {
      // Don't fail the tool call just because frame capture failed
      logger.warn('gif_frame_capture_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Stop recording. Frames are preserved for save().
   */
  stopRecording(): void {
    this.recording = false;
    logger.info('gif_recording_stopped', { frameCount: this.frames.length });
  }

  /**
   * Encode all captured frames into an animated GIF and write to disk.
   * Returns the absolute path and file size.
   */
  async save(filename: string, frameDelay?: number): Promise<{ path: string; size: number; frameCount: number }> {
    if (this.frames.length === 0) {
      throw new Error('No frames captured. Start recording and perform some actions first.');
    }

    const absolutePath = isAbsolute(filename) ? filename : resolve(process.cwd(), filename);

    const { GIFEncoder, quantize, applyPalette } = await loadGifenc();
    const encoder = GIFEncoder();

    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i]!;
      const parsed = PNG.sync.read(frame.png);

      // Scale down if the source is larger than target GIF dimensions
      let rgba: Uint8Array;
      if (parsed.width !== GIF_WIDTH || parsed.height !== GIF_HEIGHT) {
        rgba = scaleDown(
          new Uint8Array(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength),
          parsed.width,
          parsed.height,
          GIF_WIDTH,
          GIF_HEIGHT,
        );
      } else {
        rgba = new Uint8Array(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
      }

      // Use explicit delay or calculate from timestamps
      let delay: number;
      if (frameDelay != null) {
        delay = Math.max(MIN_FRAME_DELAY_MS, Math.min(MAX_FRAME_DELAY_MS, frameDelay));
      } else if (i < this.frames.length - 1) {
        delay = this.frames[i + 1]!.timestamp - frame.timestamp;
        delay = Math.max(MIN_FRAME_DELAY_MS, Math.min(MAX_FRAME_DELAY_MS, delay));
      } else {
        // Last frame: hold for 1 second
        delay = 1000;
      }

      const palette = quantize(rgba, 256);
      const indexed = applyPalette(rgba, palette);

      encoder.writeFrame(indexed, GIF_WIDTH, GIF_HEIGHT, {
        palette,
        delay,
      });
    }

    encoder.finish();
    const bytes = encoder.bytes() as Uint8Array;
    const buffer = Buffer.from(bytes);

    await writeFile(absolutePath, buffer);

    const result = {
      path: absolutePath,
      size: buffer.length,
      frameCount: this.frames.length,
    };

    logger.info('gif_saved', result);

    // Clear frames after save to free memory
    this.frames = [];

    return result;
  }
}
