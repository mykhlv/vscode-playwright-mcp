/**
 * Unit tests for watchdog timeout behavior.
 * Tests the UNRESPONSIVE state transition and tool timeout configuration.
 */

import { describe, it, expect } from 'vitest';
import { SessionStateMachine, SessionState } from '../../src/session/session-state.js';
import { createTools } from '../../src/tools/index.js';
import { GifRecorder } from '../../src/session/gif-recorder.js';

describe('watchdog: UNRESPONSIVE state transition', () => {
  it('transitions from READY to UNRESPONSIVE', () => {
    const machine = new SessionStateMachine();
    machine.transition(SessionState.LAUNCHING);
    machine.transition(SessionState.READY);
    machine.transition(SessionState.UNRESPONSIVE);
    expect(machine.state).toBe(SessionState.UNRESPONSIVE);
  });

  it('can close from UNRESPONSIVE', () => {
    const machine = new SessionStateMachine();
    machine.transition(SessionState.LAUNCHING);
    machine.transition(SessionState.READY);
    machine.transition(SessionState.UNRESPONSIVE);
    machine.transition(SessionState.CLOSING);
    expect(machine.state).toBe(SessionState.CLOSING);
  });

  it('can go IDLE from UNRESPONSIVE', () => {
    const machine = new SessionStateMachine();
    machine.transition(SessionState.LAUNCHING);
    machine.transition(SessionState.READY);
    machine.transition(SessionState.UNRESPONSIVE);
    machine.transition(SessionState.IDLE);
    expect(machine.state).toBe(SessionState.IDLE);
  });

  it('cannot launch from UNRESPONSIVE', () => {
    const machine = new SessionStateMachine();
    machine.transition(SessionState.LAUNCHING);
    machine.transition(SessionState.READY);
    machine.transition(SessionState.UNRESPONSIVE);
    expect(() => machine.transition(SessionState.LAUNCHING)).toThrow();
  });

  it('markUnresponsive is a no-op when already UNRESPONSIVE', () => {
    // SessionManager.markUnresponsive() guards with isReady check,
    // so calling it twice should not throw (UNRESPONSIVE → UNRESPONSIVE is invalid in state machine)
    const machine = new SessionStateMachine();
    machine.transition(SessionState.LAUNCHING);
    machine.transition(SessionState.READY);
    machine.transition(SessionState.UNRESPONSIVE);
    // Direct transition would throw:
    expect(() => machine.transition(SessionState.UNRESPONSIVE)).toThrow();
    // But isReady is false, so markUnresponsive's guard prevents the call
    expect(machine.isReady).toBe(false);
  });
});

describe('watchdog: tool timeout configuration', () => {
  const tools = createTools(new GifRecorder());

  it('every tool has a timeoutMs > 0', () => {
    for (const tool of tools) {
      expect(tool.timeoutMs).toBeGreaterThan(0);
    }
  });

  it('fast tools have 5s timeout', () => {
    const fastTools = [
      'vscode_screenshot', 'vscode_click', 'vscode_type',
      'vscode_press_key', 'vscode_hover', 'vscode_scroll',
      'vscode_drag', 'vscode_get_hover', 'vscode_gif', 'vscode_console',
    ];
    for (const name of fastTools) {
      const tool = tools.find((t) => t.name === name);
      expect(tool!.timeoutMs).toBe(5_000);
    }
  });

  it('medium tools have 10-15s timeout', () => {
    const medium: Record<string, number> = {
      vscode_snapshot: 10_000,
      vscode_run_command: 10_000,
      vscode_ensure_file: 10_000,
      vscode_wait_for: 10_000,
      vscode_get_state: 15_000,
      vscode_close: 15_000,
    };
    for (const [name, expected] of Object.entries(medium)) {
      const tool = tools.find((t) => t.name === name);
      expect(tool!.timeoutMs).toBe(expected);
    }
  });

  it('evaluate and launch share the longest base watchdog (35s)', () => {
    const evaluate = tools.find((t) => t.name === 'vscode_evaluate');
    expect(evaluate!.timeoutMs).toBe(35_000);
    const launch = tools.find((t) => t.name === 'vscode_launch');
    expect(launch!.timeoutMs).toBe(35_000);
  });
});
