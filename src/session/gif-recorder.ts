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

const PROGRESS_BAR_HEIGHT = 4;
const PROGRESS_BAR_COLOR = [0, 122, 204, 255] as const; // VS Code blue (#007ACC)
const PROGRESS_BAR_BG = [30, 30, 30, 255] as const;     // Dark background

/** Draw a thin progress bar at the bottom of an RGBA frame buffer (mutates in place). */
function drawProgressBar(
  rgba: Uint8Array,
  width: number,
  height: number,
  frameIndex: number,
  totalFrames: number,
): void {
  const progress = (frameIndex + 1) / totalFrames;
  const filledWidth = Math.round(width * progress);
  const startY = height - PROGRESS_BAR_HEIGHT;

  for (let y = startY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const color = x < filledWidth ? PROGRESS_BAR_COLOR : PROGRESS_BAR_BG;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = color[3];
    }
  }
}

export class GifRecorder {
  private frames: Frame[] = [];
  private recording = false;
  /** Set to true if frames were ever halved (safety fallback). */
  private halved = false;

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
    this.halved = false;
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
      // Stop accepting new frames once the limit is reached
      if (this.frames.length >= MAX_FRAMES) {
        logger.warn('gif_frame_limit_reached', {
          limit: MAX_FRAMES,
          hint: 'Recording stopped automatically. Stop and save the GIF to continue.',
        });
        this.recording = false;
        return;
      }

      const png = await page.screenshot({ type: 'png', timeout: 5000 });
      this.frames.push({ png, timestamp: Date.now() });

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
  async save(filename: string, frameDelay?: number, progressBar?: boolean): Promise<{ path: string; size: number; frameCount: number }> {
    // Auto-stop recording if still active to prevent capturing more frames
    // while we iterate over the frame list
    if (this.recording) {
      logger.info('gif_auto_stopped_for_save');
      this.stopRecording();
    }

    if (this.frames.length === 0) {
      throw new Error('No frames captured. Start recording and perform some actions first.');
    }

    const absolutePath = isAbsolute(filename) ? filename : resolve(process.cwd(), filename);

    const { GIFEncoder, quantize, applyPalette } = await loadGifenc();
    const encoder = GIFEncoder();

    /** Fixed delay used as safety fallback if frames were ever halved */
    const HALVED_FIXED_DELAY_MS = 500;

    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i]!;
      const parsed = PNG.sync.read(frame.png);

      // Only scale down when the source is larger than target dimensions.
      // If the source is smaller, use its original dimensions to avoid
      // blocky nearest-neighbor upscaling.
      let rgba: Uint8Array;
      let frameWidth: number;
      let frameHeight: number;

      if (parsed.width > GIF_WIDTH || parsed.height > GIF_HEIGHT) {
        rgba = scaleDown(
          new Uint8Array(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength),
          parsed.width,
          parsed.height,
          GIF_WIDTH,
          GIF_HEIGHT,
        );
        frameWidth = GIF_WIDTH;
        frameHeight = GIF_HEIGHT;
      } else {
        rgba = new Uint8Array(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
        frameWidth = parsed.width;
        frameHeight = parsed.height;
      }

      // Use explicit delay or calculate from timestamps
      let delay: number;
      if (frameDelay != null) {
        delay = Math.max(MIN_FRAME_DELAY_MS, Math.min(MAX_FRAME_DELAY_MS, frameDelay));
      } else if (this.halved) {
        // After halving, timestamp-based delays are meaningless — use a fixed delay
        delay = HALVED_FIXED_DELAY_MS;
      } else if (i < this.frames.length - 1) {
        delay = this.frames[i + 1]!.timestamp - frame.timestamp;
        delay = Math.max(MIN_FRAME_DELAY_MS, Math.min(MAX_FRAME_DELAY_MS, delay));
      } else {
        // Last frame: hold for 1 second
        delay = 1000;
      }

      if (progressBar) {
        drawProgressBar(rgba, frameWidth, frameHeight, i, this.frames.length);
      }

      const palette = quantize(rgba, 256);
      const indexed = applyPalette(rgba, palette);

      encoder.writeFrame(indexed, frameWidth, frameHeight, {
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
