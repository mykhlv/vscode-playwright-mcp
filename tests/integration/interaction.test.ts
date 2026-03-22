/**
 * Integration tests: Mouse and keyboard interactions.
 *
 * Launches a single VS Code instance and tests click, type, press_key,
 * hover, and scroll handlers against the live window.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import { handleClick, handleHover, handleScroll } from '../../src/tools/mouse.js';
import { handleType, handlePressKey } from '../../src/tools/keyboard.js';
import { ToolError } from '../../src/types/errors.js';
import {
  isVSCodeAvailable,
  createSession,
  launchTestVSCode,
  assertText,
  TEST_TIMEOUT,
  LAUNCH_TIMEOUT,
} from './setup.js';

const canRun = isVSCodeAvailable();

describe.skipIf(!canRun)('interaction', { timeout: 120_000 }, () => {
  let session: SessionManager;

  beforeAll(async () => {
    session = createSession();
    await launchTestVSCode(session);
  }, LAUNCH_TIMEOUT);

  afterAll(async () => {
    await session.close();
  }, LAUNCH_TIMEOUT);

  it('click at center of window does not throw', { timeout: TEST_TIMEOUT }, async () => {
    const text = assertText(await handleClick(session, { x: 640, y: 360 }));
    expect(text).toContain('Clicked');
  });

  it('click with out-of-bounds coordinates throws validation error', { timeout: TEST_TIMEOUT }, async () => {
    try {
      await handleClick(session, { x: 9999, y: 9999 });
      expect.unreachable('Expected click to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as Error).message).toMatch(/outside window bounds/);
    }
  });

  it('type text into Command Palette and dismiss it', { timeout: TEST_TIMEOUT }, async () => {
    // Open Command Palette
    const openKey = process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P';
    assertText(await handlePressKey(session, { key: openKey }));

    // Command Palette animation needs a moment to complete before typing
    const page = session.getPage();
    await page.waitForTimeout(300);

    // Type some text
    const typeText = assertText(await handleType(session, { text: 'hello test' }));
    expect(typeText).toContain('Typed');
    expect(typeText).toContain('hello test');

    // Dismiss with Escape
    assertText(await handlePressKey(session, { key: 'Escape' }));
  });

  it('press key Escape does not throw', { timeout: TEST_TIMEOUT }, async () => {
    const text = assertText(await handlePressKey(session, { key: 'Escape' }));
    expect(text).toContain('Pressed');
    expect(text).toContain('Escape');
  });

  it('hover at coordinates does not throw', { timeout: TEST_TIMEOUT }, async () => {
    const text = assertText(await handleHover(session, { x: 640, y: 360 }));
    expect(text).toContain('Hovered');
  });

  it('scroll down does not throw', { timeout: TEST_TIMEOUT }, async () => {
    const text = assertText(await handleScroll(session, {
      x: 640,
      y: 360,
      direction: 'down',
      amount: 3,
    }));
    expect(text).toContain('Scrolled');
    expect(text).toContain('down');
  });
});
