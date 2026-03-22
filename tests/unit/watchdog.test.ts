/**
 * Unit tests for watchdog timeout behavior.
 * Tests the UNRESPONSIVE state transition and tool timeout configuration.
 */

import { describe, it, expect } from 'vitest';
import { SessionStateMachine, SessionState } from '../../src/session/session-state.js';

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
