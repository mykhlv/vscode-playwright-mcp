import { describe, it, expect } from 'vitest';
import { SessionState, SessionStateMachine } from '../../src/session/session-state.js';

describe('SessionStateMachine', () => {
  it('starts in IDLE state', () => {
    const sm = new SessionStateMachine();
    expect(sm.state).toBe(SessionState.IDLE);
    expect(sm.isIdle).toBe(true);
    expect(sm.isReady).toBe(false);
  });

  it('follows happy path: IDLE -> LAUNCHING -> READY -> CLOSING -> IDLE', () => {
    const sm = new SessionStateMachine();

    sm.transition(SessionState.LAUNCHING);
    expect(sm.state).toBe(SessionState.LAUNCHING);

    sm.transition(SessionState.READY);
    expect(sm.state).toBe(SessionState.READY);
    expect(sm.isReady).toBe(true);

    sm.transition(SessionState.CLOSING);
    expect(sm.state).toBe(SessionState.CLOSING);

    sm.transition(SessionState.IDLE);
    expect(sm.state).toBe(SessionState.IDLE);
    expect(sm.isIdle).toBe(true);
  });

  it('allows LAUNCHING -> ERROR for failed launch', () => {
    const sm = new SessionStateMachine();
    sm.transition(SessionState.LAUNCHING);
    sm.transition(SessionState.ERROR);
    expect(sm.state).toBe(SessionState.ERROR);
  });

  it('allows ERROR -> IDLE for recovery', () => {
    const sm = new SessionStateMachine();
    sm.transition(SessionState.LAUNCHING);
    sm.transition(SessionState.ERROR);
    sm.transition(SessionState.IDLE);
    expect(sm.isIdle).toBe(true);
  });

  it('allows READY -> CRASHED for crash detection', () => {
    const sm = new SessionStateMachine();
    sm.transition(SessionState.LAUNCHING);
    sm.transition(SessionState.READY);
    sm.transition(SessionState.CRASHED);
    expect(sm.state).toBe(SessionState.CRASHED);
  });

  it('allows CRASHED -> IDLE for cleanup', () => {
    const sm = new SessionStateMachine();
    sm.transition(SessionState.LAUNCHING);
    sm.transition(SessionState.READY);
    sm.transition(SessionState.CRASHED);
    sm.transition(SessionState.IDLE);
    expect(sm.isIdle).toBe(true);
  });

  it('allows READY -> UNRESPONSIVE', () => {
    const sm = new SessionStateMachine();
    sm.transition(SessionState.LAUNCHING);
    sm.transition(SessionState.READY);
    sm.transition(SessionState.UNRESPONSIVE);
    expect(sm.state).toBe(SessionState.UNRESPONSIVE);
  });

  it('allows UNRESPONSIVE -> CLOSING or IDLE', () => {
    const sm1 = new SessionStateMachine();
    sm1.transition(SessionState.LAUNCHING);
    sm1.transition(SessionState.READY);
    sm1.transition(SessionState.UNRESPONSIVE);
    sm1.transition(SessionState.CLOSING);
    expect(sm1.state).toBe(SessionState.CLOSING);

    const sm2 = new SessionStateMachine();
    sm2.transition(SessionState.LAUNCHING);
    sm2.transition(SessionState.READY);
    sm2.transition(SessionState.UNRESPONSIVE);
    sm2.transition(SessionState.IDLE);
    expect(sm2.isIdle).toBe(true);
  });

  it('rejects invalid transitions', () => {
    const sm = new SessionStateMachine();
    // Can't go from IDLE to READY directly
    expect(() => sm.transition(SessionState.READY)).toThrow('Invalid session state transition');
    // Can't go from IDLE to CLOSING
    expect(() => sm.transition(SessionState.CLOSING)).toThrow();
  });

  it('rejects going from READY to LAUNCHING', () => {
    const sm = new SessionStateMachine();
    sm.transition(SessionState.LAUNCHING);
    sm.transition(SessionState.READY);
    expect(() => sm.transition(SessionState.LAUNCHING)).toThrow();
  });

  it('reset() forces back to IDLE from any state', () => {
    const sm = new SessionStateMachine();
    sm.transition(SessionState.LAUNCHING);
    sm.reset();
    expect(sm.state).toBe(SessionState.IDLE);

    sm.transition(SessionState.LAUNCHING);
    sm.transition(SessionState.READY);
    sm.reset();
    expect(sm.state).toBe(SessionState.IDLE);
  });

  it('allows LAUNCHING -> IDLE for abort', () => {
    const sm = new SessionStateMachine();
    sm.transition(SessionState.LAUNCHING);
    sm.transition(SessionState.IDLE);
    expect(sm.isIdle).toBe(true);
  });
});
