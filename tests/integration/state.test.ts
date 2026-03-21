/**
 * Integration tests: State queries (get_state, get_hover, run_command).
 *
 * Launches a single VS Code instance and tests state-reading tools
 * against the live window.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';
import { handleGetState, handleGetHover } from '../../src/tools/state.js';
import { handleRunCommand } from '../../src/tools/command.js';
import {
  isVSCodeAvailable,
  createSession,
  launchTestVSCode,
  assertText,
  TEST_TIMEOUT,
  LAUNCH_TIMEOUT,
} from './setup.js';

const canRun = isVSCodeAvailable();

describe.skipIf(!canRun)('state', { timeout: 120_000 }, () => {
  let session: SessionManager;

  beforeAll(async () => {
    session = createSession();
    await launchTestVSCode(session);
  }, LAUNCH_TIMEOUT);

  afterAll(async () => {
    await session.close();
  }, LAUNCH_TIMEOUT);

  it('get_state returns activeFile field (may be null with no file open)', { timeout: TEST_TIMEOUT }, async () => {
    const text = assertText(await handleGetState(session, {}));
    expect(text).toContain('Active file:');
  });

  it('get_state returns cursorPosition format', { timeout: TEST_TIMEOUT }, async () => {
    const text = assertText(await handleGetState(session, {}));
    // Cursor may be "(unknown)" if no file is open, which is valid
    expect(text).toContain('Cursor:');
  });

  it('get_state with visible_lines=none omits line output', { timeout: TEST_TIMEOUT }, async () => {
    const text = assertText(await handleGetState(session, { visible_lines: 'none' }));
    expect(text).toContain('Active file:');
    // Should not contain "Visible lines" since we asked for none
    expect(text).not.toContain('Visible lines');
  });

  it('run_command "View: Toggle Terminal" executes without error', { timeout: TEST_TIMEOUT }, async () => {
    const text = assertText(await handleRunCommand(session, { command: 'View: Toggle Terminal' }));
    expect(text).toContain('Executed command');
    expect(text).toContain('View: Toggle Terminal');

    // Toggle it back off to restore clean state
    await handleRunCommand(session, { command: 'View: Toggle Terminal' });
  });

  it('run_command with unknown command does not crash', { timeout: TEST_TIMEOUT }, async () => {
    // Running a nonsense command just types it into Command Palette and presses Enter.
    // It should not throw — the command simply won't match anything meaningful.
    const text = assertText(
      await handleRunCommand(session, { command: 'xyzzy_nonexistent_command_12345' }),
    );
    expect(text).toContain('Executed command');
  });

  it('get_hover with no tooltip returns guidance message', { timeout: TEST_TIMEOUT }, async () => {
    // Dismiss any existing tooltips first
    const page = session.getPage();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const text = assertText(await handleGetHover(session, {}));
    // When no hover is visible, the handler returns guidance text
    expect(text).toContain('No hover tooltip visible');
  });
});
