/**
 * Integration tests: GIF recording flow.
 *
 * Launches a single VS Code instance and tests the GIF recorder
 * end-to-end: start recording, capture frames via screenshot, save to disk.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import { GifRecorder } from '../../src/session/gif-recorder.js';
import { handleGif } from '../../src/tools/gif.js';
import { handleScreenshot } from '../../src/tools/vision.js';
import {
  isVSCodeAvailable,
  createSession,
  createRecorder,
  launchTestVSCode,
  assertText,
  TEST_TIMEOUT,
  LAUNCH_TIMEOUT,
} from './setup.js';

const canRun = isVSCodeAvailable();

describe.skipIf(!canRun)('gif', { timeout: 120_000 }, () => {
  let session: SessionManager;
  let recorder: GifRecorder;

  beforeAll(async () => {
    session = createSession();
    await launchTestVSCode(session);
  }, LAUNCH_TIMEOUT);

  afterAll(async () => {
    await session.close();
  }, LAUNCH_TIMEOUT);

  it('start recording, capture frame, save produces a GIF file', { timeout: TEST_TIMEOUT }, async () => {
    recorder = createRecorder();
    const gifPath = join(tmpdir(), `test-integration-${Date.now()}.gif`);

    try {
      // Start recording
      const startText = assertText(await handleGif(recorder, { action: 'start' }));
      expect(startText).toContain('recording started');
      expect(recorder.isRecording).toBe(true);

      // Capture a frame by taking a screenshot through the recorder
      const page = session.getPage();
      await recorder.captureFrame(page);
      expect(recorder.frameCount).toBe(1);

      // Capture another frame
      await recorder.captureFrame(page);
      expect(recorder.frameCount).toBe(2);

      // Save the GIF
      const saveText = assertText(await handleGif(recorder, {
        action: 'save',
        filename: gifPath,
      }));

      expect(saveText).toContain('GIF saved');
      expect(saveText).toContain(gifPath);
      expect(saveText).toContain('Frames: 2');

      // Verify the file exists on disk
      expect(existsSync(gifPath)).toBe(true);
    } finally {
      // Clean up temp file
      if (existsSync(gifPath)) {
        unlinkSync(gifPath);
      }
    }
  });

  it('save without any captured frames throws', { timeout: TEST_TIMEOUT }, async () => {
    recorder = createRecorder();
    const gifPath = join(tmpdir(), `test-empty-${Date.now()}.gif`);

    // Do not start recording or capture frames
    await expect(
      handleGif(recorder, { action: 'save', filename: gifPath }),
    ).rejects.toThrow(/No frames captured/);
  });

  it('start → stop → save flow works end-to-end', { timeout: TEST_TIMEOUT }, async () => {
    recorder = createRecorder();
    const gifPath = join(tmpdir(), `test-stop-flow-${Date.now()}.gif`);

    try {
      // Start
      assertText(await handleGif(recorder, { action: 'start' }));
      expect(recorder.isRecording).toBe(true);

      // Capture a frame
      const page = session.getPage();
      await recorder.captureFrame(page);

      // Stop via handler
      const stopText = assertText(await handleGif(recorder, { action: 'stop' }));
      expect(stopText).toContain('recording stopped');
      expect(stopText).toContain('1 frames captured');
      expect(recorder.isRecording).toBe(false);

      // Save after stopping
      const saveText = assertText(await handleGif(recorder, {
        action: 'save',
        filename: gifPath,
      }));
      expect(saveText).toContain('GIF saved');
      expect(saveText).toContain('Frames: 1');
      expect(existsSync(gifPath)).toBe(true);
    } finally {
      if (existsSync(gifPath)) {
        unlinkSync(gifPath);
      }
    }
  });

  it('manual capture mode only captures when explicitly called', { timeout: TEST_TIMEOUT }, async () => {
    recorder = createRecorder();
    const gifPath = join(tmpdir(), `test-manual-${Date.now()}.gif`);

    try {
      // Start with manual capture mode
      const startText = assertText(await handleGif(recorder, {
        action: 'start',
        capture_on: 'manual',
      }));

      expect(startText).toContain('manual');
      expect(recorder.captureMode).toBe('manual');

      // In manual mode, frames are only captured when explicitly calling captureFrame
      // The recorder does not auto-capture — verify no frames exist yet
      expect(recorder.frameCount).toBe(0);

      // Explicitly capture a frame
      const page = session.getPage();
      await recorder.captureFrame(page);
      expect(recorder.frameCount).toBe(1);

      // Save
      const saveText = assertText(await handleGif(recorder, {
        action: 'save',
        filename: gifPath,
      }));

      expect(saveText).toContain('Frames: 1');
      expect(existsSync(gifPath)).toBe(true);
    } finally {
      if (existsSync(gifPath)) {
        unlinkSync(gifPath);
      }
    }
  });
});
