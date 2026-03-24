/**
 * Session state machine.
 *
 * State transitions:
 *
 *   IDLE ──> LAUNCHING ──> READY ──> CLOSING ──> IDLE
 *               │            │ │
 *               │            │ └──> CRASHED ──> IDLE
 *               │            │
 *               │            └──> UNRESPONSIVE ──> CLOSING
 *               │                       │
 *               ├──> ERROR ──> IDLE     └──> IDLE
 *               │
 *               └──> IDLE
 *
 * Notes:
 *   - UNRESPONSIVE is reachable only from READY (not from ERROR).
 *   - CRASHED is reachable only from READY.
 *   - LAUNCHING can go to READY, ERROR, or IDLE (cancelled).
 *   - ERROR and CRASHED are terminal — they only transition to IDLE.
 */

export const SessionState = {
  IDLE: 'IDLE',
  LAUNCHING: 'LAUNCHING',
  READY: 'READY',
  CLOSING: 'CLOSING',
  ERROR: 'ERROR',
  CRASHED: 'CRASHED',
  UNRESPONSIVE: 'UNRESPONSIVE',
} as const;

export type SessionState = (typeof SessionState)[keyof typeof SessionState];

/** Valid transitions: from -> set of valid next states */
const TRANSITIONS: Record<SessionState, ReadonlySet<SessionState>> = {
  [SessionState.IDLE]: new Set([SessionState.LAUNCHING]),
  [SessionState.LAUNCHING]: new Set([SessionState.READY, SessionState.ERROR, SessionState.IDLE]),
  [SessionState.READY]: new Set([SessionState.CLOSING, SessionState.CRASHED, SessionState.UNRESPONSIVE]),
  [SessionState.CLOSING]: new Set([SessionState.IDLE]),
  [SessionState.ERROR]: new Set([SessionState.IDLE]),
  [SessionState.CRASHED]: new Set([SessionState.IDLE]),
  [SessionState.UNRESPONSIVE]: new Set([SessionState.IDLE, SessionState.CLOSING]),
};

export class SessionStateMachine {
  private _state: SessionState = SessionState.IDLE;

  get state(): SessionState {
    return this._state;
  }

  get isReady(): boolean {
    return this._state === SessionState.READY;
  }

  get isIdle(): boolean {
    return this._state === SessionState.IDLE;
  }

  /**
   * Transition to a new state.
   * Throws if the transition is not valid.
   */
  transition(to: SessionState): void {
    const allowed = TRANSITIONS[this._state];
    if (!allowed.has(to)) {
      throw new Error(
        `Invalid session state transition: ${this._state} -> ${to}. ` +
        `Allowed from ${this._state}: ${[...allowed].join(', ')}`,
      );
    }
    this._state = to;
  }

  /**
   * Force reset to IDLE. Used during cleanup/shutdown.
   */
  reset(): void {
    this._state = SessionState.IDLE;
  }
}
