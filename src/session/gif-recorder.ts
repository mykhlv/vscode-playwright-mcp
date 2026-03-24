/**
 * GIF recorder: captures frames as PNG buffers and encodes them into an animated GIF.
 * Frames are captured automatically after each tool call while recording is active.
 */

import { writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Page } from 'playwright';
import { PNG } from 'pngjs';
import { ErrorCode, ToolError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

/** Minimal type for the gifenc GIFEncoder instance (no upstream types available). */
interface GifEncoderInstance {
  writeFrame(indexed: Uint8Array, width: number, height: number, opts: { palette: number[][]; delay: number }): void;
  finish(): void;
  bytes(): Uint8Array;
}

/** Lazy-load gifenc to handle CJS/ESM interop differences across runtimes */
async function loadGifenc() {
  // @ts-expect-error -- gifenc has no type declarations
  const mod = await import('gifenc');
  // CJS interop: might be mod.default.GIFEncoder or mod.GIFEncoder
  const api = mod.default?.GIFEncoder ? mod.default : mod;
  return api as {
    GIFEncoder: () => GifEncoderInstance;
    quantize: (rgba: Uint8Array, maxColors: number) => number[][];
  };
}

/** Maximum number of frames to prevent memory issues */
const MAX_FRAMES = 100;

/** Minimum delay between frames in ms */
const MIN_FRAME_DELAY_MS = 100;

/** Maximum delay between frames in ms */
const MAX_FRAME_DELAY_MS = 2000;

/** Output GIF dimensions (75% of 1280x720 source for quality/size balance) */
const GIF_WIDTH = 960;
const GIF_HEIGHT = 540;

interface Frame {
  png: Buffer;
  timestamp: number;
}

/**
 * Scale RGBA pixel data from source dimensions to target dimensions
 * using bilinear interpolation. Produces smoother results than nearest-neighbor,
 * especially important for text and UI elements.
 */
function scaleRGBA(
  rgba: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  const dst = new Uint8Array(dstWidth * dstHeight * 4);
  const xRatio = dstWidth > 1 ? (srcWidth - 1) / (dstWidth - 1) : 0;
  const yRatio = dstHeight > 1 ? (srcHeight - 1) / (dstHeight - 1) : 0;

  for (let y = 0; y < dstHeight; y++) {
    const srcYf = y * yRatio;
    const srcY0 = Math.floor(srcYf);
    const srcY1 = Math.min(srcY0 + 1, srcHeight - 1);
    const yLerp = srcYf - srcY0;

    for (let x = 0; x < dstWidth; x++) {
      const srcXf = x * xRatio;
      const srcX0 = Math.floor(srcXf);
      const srcX1 = Math.min(srcX0 + 1, srcWidth - 1);
      const xLerp = srcXf - srcX0;

      const i00 = (srcY0 * srcWidth + srcX0) * 4;
      const i10 = (srcY0 * srcWidth + srcX1) * 4;
      const i01 = (srcY1 * srcWidth + srcX0) * 4;
      const i11 = (srcY1 * srcWidth + srcX1) * 4;
      const dstIdx = (y * dstWidth + x) * 4;

      for (let c = 0; c < 4; c++) {
        const top = rgba[i00 + c]! * (1 - xLerp) + rgba[i10 + c]! * xLerp;
        const bot = rgba[i01 + c]! * (1 - xLerp) + rgba[i11 + c]! * xLerp;
        dst[dstIdx + c] = Math.round(top * (1 - yLerp) + bot * yLerp);
      }
    }
  }

  return dst;
}

/**
 * Find the closest color in a palette to the given RGB values.
 * Returns the palette index.
 */
function nearestColorIndex(r: number, g: number, b: number, palette: number[][]): number {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < palette.length; i++) {
    const pr = palette[i]![0]!;
    const pg = palette[i]![1]!;
    const pb = palette[i]![2]!;
    const dist = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}

/**
 * Apply Floyd-Steinberg error-diffusion dithering to RGBA data in place.
 * Reduces color banding when quantizing to a 256-color palette.
 */
function ditherFloydSteinberg(rgba: Uint8Array, width: number, height: number, palette: number[][]): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = rgba[idx]!;
      const oldG = rgba[idx + 1]!;
      const oldB = rgba[idx + 2]!;

      const pi = nearestColorIndex(oldR, oldG, oldB, palette);
      const newR = palette[pi]![0]!;
      const newG = palette[pi]![1]!;
      const newB = palette[pi]![2]!;

      rgba[idx] = newR;
      rgba[idx + 1] = newG;
      rgba[idx + 2] = newB;

      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      // Distribute error to neighboring pixels (Floyd-Steinberg weights inlined)
      if (x + 1 < width) {
        const ni = idx + 4; // same row, next column
        rgba[ni] = Math.max(0, Math.min(255, Math.round(rgba[ni]! + errR * (7 / 16))));
        rgba[ni + 1] = Math.max(0, Math.min(255, Math.round(rgba[ni + 1]! + errG * (7 / 16))));
        rgba[ni + 2] = Math.max(0, Math.min(255, Math.round(rgba[ni + 2]! + errB * (7 / 16))));
      }
      if (y + 1 < height) {
        if (x - 1 >= 0) {
          const ni = ((y + 1) * width + (x - 1)) * 4;
          rgba[ni] = Math.max(0, Math.min(255, Math.round(rgba[ni]! + errR * (3 / 16))));
          rgba[ni + 1] = Math.max(0, Math.min(255, Math.round(rgba[ni + 1]! + errG * (3 / 16))));
          rgba[ni + 2] = Math.max(0, Math.min(255, Math.round(rgba[ni + 2]! + errB * (3 / 16))));
        }
        {
          const ni = ((y + 1) * width + x) * 4;
          rgba[ni] = Math.max(0, Math.min(255, Math.round(rgba[ni]! + errR * (5 / 16))));
          rgba[ni + 1] = Math.max(0, Math.min(255, Math.round(rgba[ni + 1]! + errG * (5 / 16))));
          rgba[ni + 2] = Math.max(0, Math.min(255, Math.round(rgba[ni + 2]! + errB * (5 / 16))));
        }
        if (x + 1 < width) {
          const ni = ((y + 1) * width + (x + 1)) * 4;
          rgba[ni] = Math.max(0, Math.min(255, Math.round(rgba[ni]! + errR * (1 / 16))));
          rgba[ni + 1] = Math.max(0, Math.min(255, Math.round(rgba[ni + 1]! + errG * (1 / 16))));
          rgba[ni + 2] = Math.max(0, Math.min(255, Math.round(rgba[ni + 2]! + errB * (1 / 16))));
        }
      }
    }
  }
}

/**
 * Build a Map from RGB triplet (packed as r<<16|g<<8|b) to palette index.
 * Used for O(1) palette lookup after dithering has snapped every pixel to an exact palette color.
 */
function buildPaletteLookup(palette: number[][]): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < palette.length; i++) {
    const key = (palette[i]![0]! << 16) | (palette[i]![1]! << 8) | palette[i]![2]!;
    map.set(key, i);
  }
  return map;
}

/**
 * Map dithered RGBA pixels to palette indices using direct lookup.
 * After Floyd-Steinberg dithering, every pixel is already an exact palette color,
 * so a Map lookup is O(1) per pixel instead of the O(256) nearest-color search
 * that gifenc's applyPalette would perform.
 */
function applyPaletteFromMap(
  rgba: Uint8Array,
  width: number,
  height: number,
  lookup: Map<number, number>,
): Uint8Array {
  const totalPixels = width * height;
  const indexed = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const key = (rgba[off]! << 16) | (rgba[off + 1]! << 8) | rgba[off + 2]!;
    indexed[i] = lookup.get(key) ?? 0;
  }
  return indexed;
}

/**
 * Sample pixels from multiple frames to build a representative RGBA buffer
 * for global palette generation. Takes every Nth pixel from each frame.
 */
function sampleFramePixels(frames: Uint8Array[], pixelsPerFrame: number): Uint8Array {
  const totalSamples = frames.length * pixelsPerFrame;
  const sampled = new Uint8Array(totalSamples * 4);
  let writePos = 0;

  for (const rgba of frames) {
    const totalPixels = rgba.length / 4;
    const step = Math.max(1, Math.floor(totalPixels / pixelsPerFrame));
    for (let i = 0; i < totalPixels && writePos < totalSamples; i += step) {
      const srcIdx = i * 4;
      const dstIdx = writePos * 4;
      sampled[dstIdx] = rgba[srcIdx]!;
      sampled[dstIdx + 1] = rgba[srcIdx + 1]!;
      sampled[dstIdx + 2] = rgba[srcIdx + 2]!;
      sampled[dstIdx + 3] = rgba[srcIdx + 3]!;
      writePos++;
    }
  }

  // Return only the filled portion
  return sampled.subarray(0, writePos * 4);
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

export type CaptureMode = 'auto' | 'manual';

export class GifRecorder {
  private frames: Frame[] = [];
  private recording = false;
  private _captureMode: CaptureMode = 'auto';

  get isRecording(): boolean {
    return this.recording;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /** How frames are captured: 'auto' after visual tool calls, 'manual' only on vscode_screenshot. */
  get captureMode(): CaptureMode {
    return this._captureMode;
  }

  /**
   * Start recording. Clears any existing frames.
   */
  startRecording(captureMode: CaptureMode = 'auto'): void {
    this.frames = [];
    this._captureMode = captureMode;
    this.recording = true;
    logger.info('gif_recording_started', { captureMode });
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
      throw new ToolError(
        ErrorCode.GIF_ERROR,
        'No frames captured. Start recording with vscode_gif action "start", perform some actions, then save.',
      );
    }

    if (!isAbsolute(filename)) {
      throw new ToolError(
        ErrorCode.INVALID_INPUT,
        `GIF save path must be absolute, got: "${filename}". Resolve the path before calling save().`,
      );
    }

    const absolutePath = filename;

    let buffer: Buffer;
    try {
      const { GIFEncoder, quantize } = await loadGifenc();
      const encoder = GIFEncoder();

      // Pre-parse and scale all frames
      const scaledFrames: (Uint8Array | null)[] = [];
      for (const frame of this.frames) {
        const parsed = PNG.sync.read(frame.png);
        let rgba: Uint8Array;
        if (parsed.width !== GIF_WIDTH || parsed.height !== GIF_HEIGHT) {
          rgba = scaleRGBA(
            new Uint8Array(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength),
            parsed.width, parsed.height, GIF_WIDTH, GIF_HEIGHT,
          );
        } else {
          // Copy so dithering doesn't mutate the original parsed data
          const src = new Uint8Array(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
          rgba = new Uint8Array(src.length);
          rgba.set(src);
        }
        scaledFrames.push(rgba);
      }

      // Build a global palette from sampled pixels across all frames
      // to eliminate color flicker between frames.
      // Safety: the cast is safe here because nulling only happens in the encoding
      // loop below (scaledFrames[i] = null). At this point all entries are non-null
      // Uint8Array values populated by the pre-parse loop above.
      const SAMPLES_PER_FRAME = 2000;
      const sampledPixels = sampleFramePixels(scaledFrames as Uint8Array[], SAMPLES_PER_FRAME);
      const globalPalette = quantize(sampledPixels, 256);

      // Build O(1) lookup map from palette colors to indices (used after dithering)
      const paletteLookup = buildPaletteLookup(globalPalette);

      for (let i = 0; i < this.frames.length; i++) {
        const rgba = scaledFrames[i]!;

        // Use explicit delay or calculate from timestamps
        let delay: number;
        if (frameDelay != null) {
          delay = Math.max(MIN_FRAME_DELAY_MS, Math.min(MAX_FRAME_DELAY_MS, frameDelay));
        } else if (i < this.frames.length - 1) {
          delay = this.frames[i + 1]!.timestamp - this.frames[i]!.timestamp;
          delay = Math.max(MIN_FRAME_DELAY_MS, Math.min(MAX_FRAME_DELAY_MS, delay));
        } else {
          // Last frame: hold for 1 second
          delay = 1000;
        }

        if (progressBar) {
          drawProgressBar(rgba, GIF_WIDTH, GIF_HEIGHT, i, this.frames.length);
        }

        // Apply Floyd-Steinberg dithering to reduce color banding,
        // then map to indexed colors via direct palette lookup (O(1) per pixel)
        ditherFloydSteinberg(rgba, GIF_WIDTH, GIF_HEIGHT, globalPalette);
        const indexed = applyPaletteFromMap(rgba, GIF_WIDTH, GIF_HEIGHT, paletteLookup);

        encoder.writeFrame(indexed, GIF_WIDTH, GIF_HEIGHT, {
          palette: globalPalette,
          delay,
        });

        // Release scaled frame to allow GC to reclaim memory progressively
        scaledFrames[i] = null;
      }

      encoder.finish();
      const bytes = encoder.bytes() as Uint8Array;
      buffer = Buffer.from(bytes);

      await writeFile(absolutePath, buffer);
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw new ToolError(
        ErrorCode.GIF_ERROR,
        `GIF encoding/save failed: ${error instanceof Error ? error.message : String(error)}. Check disk space and path permissions.`,
      );
    }

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
