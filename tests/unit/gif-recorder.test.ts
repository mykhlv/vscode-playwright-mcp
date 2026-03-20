import { describe, it, expect, beforeEach } from 'vitest';
import { GifRecorder } from '../../src/session/gif-recorder.js';
import { PNG } from 'pngjs';

/** Create a minimal valid PNG buffer with the given dimensions and solid color. */
function createPngBuffer(width: number, height: number, r = 255, g = 0, b = 0): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255; // alpha
    }
  }
  return PNG.sync.write(png);
}

describe('GifRecorder', () => {
  let recorder: GifRecorder;

  beforeEach(() => {
    recorder = new GifRecorder();
  });

  it('starts in non-recording state', () => {
    expect(recorder.isRecording).toBe(false);
    expect(recorder.frameCount).toBe(0);
  });

  it('transitions to recording state on start', () => {
    recorder.startRecording();
    expect(recorder.isRecording).toBe(true);
    expect(recorder.frameCount).toBe(0);
  });

  it('stops recording and preserves frame count', () => {
    recorder.startRecording();
    recorder.stopRecording();
    expect(recorder.isRecording).toBe(false);
  });

  it('clears frames when starting a new recording', async () => {
    recorder.startRecording();

    // Simulate capturing a frame by calling captureFrame with a mock page
    const mockPage = {
      screenshot: async () => createPngBuffer(1280, 720),
    } as any;

    await recorder.captureFrame(mockPage);
    expect(recorder.frameCount).toBe(1);

    // Starting again should clear frames
    recorder.startRecording();
    expect(recorder.frameCount).toBe(0);
  });

  it('captures frames when recording', async () => {
    const mockPage = {
      screenshot: async () => createPngBuffer(1280, 720),
    } as any;

    recorder.startRecording();
    await recorder.captureFrame(mockPage);
    await recorder.captureFrame(mockPage);
    expect(recorder.frameCount).toBe(2);
  });

  it('does not capture frames when not recording', async () => {
    const mockPage = {
      screenshot: async () => createPngBuffer(1280, 720),
    } as any;

    await recorder.captureFrame(mockPage);
    expect(recorder.frameCount).toBe(0);
  });

  it('handles screenshot failures gracefully', async () => {
    const mockPage = {
      screenshot: async () => { throw new Error('page crashed'); },
    } as any;

    recorder.startRecording();
    // Should not throw
    await recorder.captureFrame(mockPage);
    expect(recorder.frameCount).toBe(0);
  });

  it('throws on save with no frames', async () => {
    await expect(recorder.save('/tmp/test.gif')).rejects.toThrow('No frames captured');
  });

  it('saves a valid GIF file', async () => {
    const { existsSync, unlinkSync } = await import('node:fs');
    const path = '/tmp/gif-recorder-test-output.gif';

    const mockPage = {
      screenshot: async () => createPngBuffer(1280, 720, 0, 128, 255),
    } as any;

    recorder.startRecording();
    await recorder.captureFrame(mockPage);
    await recorder.captureFrame(mockPage);
    recorder.stopRecording();

    const result = await recorder.save(path);

    expect(result.path).toBe(path);
    expect(result.frameCount).toBe(2);
    expect(result.size).toBeGreaterThan(0);
    expect(existsSync(path)).toBe(true);

    // Verify it starts with GIF magic bytes
    const { readFileSync } = await import('node:fs');
    const fileData = readFileSync(path);
    expect(fileData.subarray(0, 3).toString('ascii')).toBe('GIF');

    // Cleanup
    unlinkSync(path);

    // Frames should be cleared after save
    expect(recorder.frameCount).toBe(0);
  });

  it('drops every other frame when exceeding max limit', async () => {
    const mockPage = {
      screenshot: async () => createPngBuffer(4, 4), // tiny PNG for speed
    } as any;

    recorder.startRecording();

    // Capture 101 frames (exceeds MAX_FRAMES of 100)
    for (let i = 0; i < 101; i++) {
      await recorder.captureFrame(mockPage);
    }

    // After exceeding 100, should have been halved
    expect(recorder.frameCount).toBeLessThanOrEqual(100);
    expect(recorder.frameCount).toBeGreaterThan(0);
  });
});
