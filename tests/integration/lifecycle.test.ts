/**
 * Integration tests: Session lifecycle (launch, close, error handling).
 *
 * This file manages its own SessionManager instances because it directly
 * tests launch/close behavior. Each test creates and tears down sessions
 * as needed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import { SessionState } from '../../src/session/session-state.js';
import { handleLaunch, handleClose } from '../../src/tools/launch.js';
import { ToolError } from '../../src/types/errors.js';
import { isVSCodeAvailable, assertText, TEST_VIEWPORT, LAUNCH_TIMEOUT, TEST_TIMEOUT } from './setup.js';

const canRun = isVSCodeAvailable();

describe.skipIf(!canRun)('lifecycle', { timeout: 120_000 }, () => {
  // Track sessions so afterEach can clean up even if a test fails
  let activeSession: SessionManager | null = null;

  afterEach(async () => {
    if (activeSession) {
      try {
        await activeSession.close();
      } catch {
        // Ignore cleanup errors
      }
      activeSession = null;
    }
  });

  it('launch succeeds and state becomes READY', { timeout: LAUNCH_TIMEOUT }, async () => {
    const session = new SessionManager();
    activeSession = session;

    expect(session.state).toBe(SessionState.IDLE);

    await session.launch({ viewport: TEST_VIEWPORT });

    expect(session.state).toBe(SessionState.READY);
    expect(session.isReady).toBe(true);
  });

  it('close succeeds and state returns to IDLE', { timeout: TEST_TIMEOUT }, async () => {
    const session = new SessionManager();
    activeSession = session;

    await session.launch({ viewport: TEST_VIEWPORT });
    expect(session.state).toBe(SessionState.READY);

    await session.close();

    expect(session.state).toBe(SessionState.IDLE);
    activeSession = null;
  });

  it('handleClose tool handler returns text result', { timeout: TEST_TIMEOUT }, async () => {
    const session = new SessionManager();
    activeSession = session;

    await session.launch({ viewport: TEST_VIEWPORT });
    expect(session.state).toBe(SessionState.READY);

    const result = await handleClose(session, {});
    const text = assertText(result);

    expect(text).toContain('closed');
    expect(session.state).toBe(SessionState.IDLE);
    activeSession = null;
  });

  it('close is idempotent — calling close twice does not throw', { timeout: TEST_TIMEOUT }, async () => {
    const session = new SessionManager();
    activeSession = session;

    await session.launch({ viewport: TEST_VIEWPORT });

    await session.close();
    expect(session.state).toBe(SessionState.IDLE);

    // Second close should be a no-op
    await session.close();
    expect(session.state).toBe(SessionState.IDLE);
    activeSession = null;
  });

  it('launch after close works — full cycle', { timeout: TEST_TIMEOUT }, async () => {
    const session = new SessionManager();
    activeSession = session;

    // First cycle
    await session.launch({ viewport: TEST_VIEWPORT });
    expect(session.state).toBe(SessionState.READY);

    await session.close();
    expect(session.state).toBe(SessionState.IDLE);

    // Second cycle
    await session.launch({ viewport: TEST_VIEWPORT });
    expect(session.state).toBe(SessionState.READY);
  });

  it('launch while running throws SESSION_EXISTS', { timeout: TEST_TIMEOUT }, async () => {
    const session = new SessionManager();
    activeSession = session;

    await session.launch({ viewport: TEST_VIEWPORT });

    // Single call — assert both error type and message on the same error
    try {
      await session.launch({ viewport: TEST_VIEWPORT });
      expect.unreachable('Expected launch to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as Error).message).toMatch(/already running/);
    }
  });

  it('launch with non-existent workspace throws error', { timeout: LAUNCH_TIMEOUT }, async () => {
    const session = new SessionManager();
    activeSession = session;

    // Validation happens in handleLaunch (the tool handler), not session.launch()
    await expect(
      handleLaunch(session, {
        workspace: '/nonexistent/path/that/does/not/exist',
      }),
    ).rejects.toThrow(ToolError);

    // Session should still be IDLE — validation rejected before launch started
    expect(session.state).toBe(SessionState.IDLE);
    activeSession = null;
  });

  it('launch with invalid executable_path throws VSCODE_NOT_FOUND', { timeout: LAUNCH_TIMEOUT }, async () => {
    const session = new SessionManager();
    activeSession = session;

    // Single call — assert both error type and message on the same error
    try {
      await session.launch({
        executablePath: '/nonexistent/vscode/binary',
        viewport: TEST_VIEWPORT,
      });
      expect.unreachable('Expected launch to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as Error).message).toMatch(/does not exist/);
    }

    activeSession = null;
  });
});
