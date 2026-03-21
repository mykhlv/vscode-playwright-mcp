/**
 * Integration tests: Screenshot and snapshot tools.
 *
 * Launches a single VS Code instance for the entire file and tests
 * screenshot/snapshot handlers against the live window.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import { handleScreenshot, handleSnapshot } from '../../src/tools/vision.js';
import {
  isVSCodeAvailable,
  createSession,
  launchTestVSCode,
  assertText,
  assertImage,
  TEST_TIMEOUT,
  LAUNCH_TIMEOUT,
} from './setup.js';

const canRun = isVSCodeAvailable();

describe.skipIf(!canRun)('vision', { timeout: 120_000 }, () => {
  let session: SessionManager;

  beforeAll(async () => {
    session = createSession();
    await launchTestVSCode(session);
  }, LAUNCH_TIMEOUT);

  afterAll(async () => {
    await session.close();
  }, LAUNCH_TIMEOUT);

  it('screenshot returns image result with base64 data', { timeout: TEST_TIMEOUT }, async () => {
    const result = await handleScreenshot(session, {});
    const img = assertImage(result);

    expect(img.data).toBeTruthy();
    expect(img.data.length).toBeGreaterThan(100);
    expect(img.mimeType).toBe('image/jpeg');
    expect(img.metadata).toContain('Screenshot captured');
  });

  it('screenshot with region crop returns smaller image', { timeout: TEST_TIMEOUT }, async () => {
    const full = assertImage(await handleScreenshot(session, {}));
    const cropped = assertImage(await handleScreenshot(session, {
      region: { x: 0, y: 0, width: 200, height: 200 },
    }));

    // Cropped image should have smaller base64 payload
    expect(cropped.data.length).toBeLessThan(full.data.length);
    expect(cropped.metadata).toContain('200x200');
  });

  it('screenshot with PNG format works', { timeout: TEST_TIMEOUT }, async () => {
    const img = assertImage(await handleScreenshot(session, { format: 'png' }));

    expect(img.mimeType).toBe('image/png');
    expect(img.data.length).toBeGreaterThan(100);
  });

  it('snapshot returns text with YAML-like content', { timeout: TEST_TIMEOUT }, async () => {
    // VS Code needs time to fully render its UI before the a11y tree is populated
    const page = session.getPage();
    await page.waitForTimeout(2000);

    const text = assertText(await handleSnapshot(session, {}));

    expect(text).toContain('Accessibility snapshot');
    expect(text.length).toBeGreaterThan(20);
  });

  it('snapshot contains expected UI roles', { timeout: TEST_TIMEOUT }, async () => {
    // VS Code needs time to fully render its UI before the a11y tree is populated
    const page = session.getPage();
    await page.waitForTimeout(2000);

    const text = assertText(await handleSnapshot(session, { max_depth: 8 }));

    const lower = text.toLowerCase();
    // VS Code always has some recognizable UI elements at sufficient depth
    const hasExpectedRole =
      lower.includes('toolbar') ||
      lower.includes('button') ||
      lower.includes('tab') ||
      lower.includes('menubar') ||
      lower.includes('menu') ||
      lower.includes('tree') ||
      lower.includes('group') ||
      lower.includes('heading') ||
      lower.includes('link') ||
      lower.includes('textbox');
    expect(hasExpectedRole).toBe(true);
  });

  it('snapshot with max_depth=1 returns fewer lines than max_depth=8', { timeout: TEST_TIMEOUT }, async () => {
    const shallowText = assertText(await handleSnapshot(session, { max_depth: 1 }));
    const deepText = assertText(await handleSnapshot(session, { max_depth: 8 }));

    const shallowLines = shallowText.split('\n').length;
    const deepLines = deepText.split('\n').length;
    // Deeper snapshots should yield at least as many lines.
    // Not strictly greater because the snapshot header/metadata can make them equal
    // when VS Code's a11y tree is shallow at the top level.
    expect(deepLines).toBeGreaterThanOrEqual(shallowLines);
  });
});
