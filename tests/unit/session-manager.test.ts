/**
 * Unit tests for SessionManager orchestration.
 *
 * Tests the public API behavior without launching VS Code.
 * Uses vi.mock to stub launchVSCode and cleanup dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ElectronApplication, Page } from 'playwright';
import { SessionManager } from '../../src/session/session-manager.js';
import { SessionState } from '../../src/session/session-state.js';
import { ToolError } from '../../src/types/errors.js';

// Mock launchVSCode to avoid needing a real VS Code binary
vi.mock('../../src/session/vscode-launcher.js', () => ({
  launchVSCode: vi.fn(),
}));

// Mock cleanup to avoid real process/filesystem operations
vi.mock('../../src/session/cleanup.js', () => ({
  trackSession: vi.fn(),
  untrackSession: vi.fn(),
  cleanupTempDir: vi.fn().mockResolvedValue(undefined),
  installShutdownHooks: vi.fn(),
}));

// Mock withTimeout to pass through directly (no real timeout needed in unit tests)
vi.mock('../../src/utils/timeout.js', () => ({
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
}));

// Mock the HelperClient to avoid real HTTP connections
vi.mock('../../src/helper-client.js', () => {
  return {
    HelperClient: class MockHelperClient {
      async healthCheck() { /* no-op */ }
    },
  };
});

// Mock node:fs to control port-file polling behavior.
// Return a valid port:token on first read so pollForHelperPort resolves instantly.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn().mockResolvedValue('12345:test-token'),
      rm: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Import the mocked modules to configure return values
const { launchVSCode } = await import('../../src/session/vscode-launcher.js');

function createMockApp(): ElectronApplication & { _emit: (event: string) => void } {
  const listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();
  return {
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    },
    close: vi.fn().mockResolvedValue(undefined),
    process: () => ({ pid: 12345 }),
    _emit(event: string) {
      for (const fn of listeners.get(event) ?? []) fn();
    },
  } as unknown as ElectronApplication & { _emit: (event: string) => void };
}

function createMockPage(): Page {
  return {
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Page;
}

function setupSuccessfulLaunch() {
  const app = createMockApp();
  const page = createMockPage();
  vi.mocked(launchVSCode).mockResolvedValue({
    app,
    window: page,
    userDataDir: '/tmp/vscode-mcp-test',
    pid: 12345,
  });
  return { app, page };
}

describe('SessionManager', () => {
  let session: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    session = new SessionManager();
  });

  // ── Initial state ──────────────────────────────────────────
  describe('initial state', () => {
    it('starts in IDLE state', () => {
      expect(session.state).toBe(SessionState.IDLE);
      expect(session.isReady).toBe(false);
    });

    it('getPage throws NO_SESSION before launch', () => {
      expect.assertions(2);
      expect(() => session.getPage()).toThrow(ToolError);
      try { session.getPage(); } catch (err) {
        expect((err as ToolError).code).toBe('NO_SESSION');
      }
    });

    it('getApp throws NO_SESSION before launch', () => {
      expect(() => session.getApp()).toThrow(ToolError);
    });

    it('getHelperClient returns null before launch', () => {
      expect(session.getHelperClient()).toBeNull();
    });
  });

  // ── Launch ─────────────────────────────────────────────────
  describe('launch', () => {
    it('transitions to READY after successful launch', async () => {
      setupSuccessfulLaunch();

      await session.launch({});

      expect(session.state).toBe(SessionState.READY);
      expect(session.isReady).toBe(true);
    });

    it('getPage returns the page after launch', async () => {
      const { page } = setupSuccessfulLaunch();

      await session.launch({});

      expect(session.getPage()).toBe(page);
    });

    it('getApp returns the app after launch', async () => {
      const { app } = setupSuccessfulLaunch();

      await session.launch({});

      expect(session.getApp()).toBe(app);
    });

    it('throws SESSION_EXISTS if already READY', async () => {
      expect.assertions(2);
      setupSuccessfulLaunch();
      await session.launch({});

      try {
        setupSuccessfulLaunch();
        await session.launch({});
      } catch (err) {
        expect(err).toBeInstanceOf(ToolError);
        expect((err as ToolError).code).toBe('SESSION_EXISTS');
      }
    });

    it('throws LAUNCH_FAILED on launch error', async () => {
      expect.assertions(2);
      vi.mocked(launchVSCode).mockRejectedValue(new Error('binary not found'));

      try {
        await session.launch({});
      } catch (err) {
        expect((err as ToolError).code).toBe('LAUNCH_FAILED');
        expect((err as ToolError).actionable).toContain('binary not found');
      }
    });

    it('resets to IDLE after launch failure', async () => {
      vi.mocked(launchVSCode).mockRejectedValue(new Error('fail'));

      await session.launch({}).catch(() => {});

      expect(session.state).toBe(SessionState.IDLE);
    });

    it('can relaunch after close (full lifecycle)', async () => {
      setupSuccessfulLaunch();
      await session.launch({});
      await session.close();
      expect(session.state).toBe(SessionState.IDLE);

      setupSuccessfulLaunch();
      await session.launch({});
      expect(session.state).toBe(SessionState.READY);
    });
  });

  // ── Close ──────────────────────────────────────────────────
  describe('close', () => {
    it('close from IDLE is idempotent (no error)', async () => {
      await expect(session.close()).resolves.toBeUndefined();
      expect(session.state).toBe(SessionState.IDLE);
    });

    it('close from READY gracefully closes and resets to IDLE', async () => {
      const { app } = setupSuccessfulLaunch();
      await session.launch({});

      await session.close();

      expect(session.state).toBe(SessionState.IDLE);
      expect(app.close).toHaveBeenCalled();
    });

    it('close resets helperClient to null', async () => {
      setupSuccessfulLaunch();
      await session.launch({});

      await session.close();

      expect(session.getHelperClient()).toBeNull();
    });

    it('getPage throws after close', async () => {
      setupSuccessfulLaunch();
      await session.launch({});
      await session.close();

      expect(() => session.getPage()).toThrow(ToolError);
    });

    it('close still reaches IDLE if app.close() throws', async () => {
      const { app } = setupSuccessfulLaunch();
      await session.launch({});
      vi.mocked(app.close).mockRejectedValue(new Error('already dead'));

      await session.close();

      expect(session.state).toBe(SessionState.IDLE);
    });
  });

  // ── Crash detection ────────────────────────────────────────
  describe('crash detection', () => {
    it('app close event transitions READY to CRASHED', async () => {
      const { app } = setupSuccessfulLaunch();
      await session.launch({});

      app._emit('close');

      expect(session.state).toBe(SessionState.CRASHED);
    });

    it('getPage throws SESSION_CRASHED after crash', async () => {
      expect.assertions(2);
      const { app } = setupSuccessfulLaunch();
      await session.launch({});
      app._emit('close');

      try { session.getPage(); } catch (err) {
        expect(err).toBeInstanceOf(ToolError);
        expect((err as ToolError).code).toBe('SESSION_CRASHED');
      }
    });

    it('close from CRASHED state cleans up and resets to IDLE', async () => {
      const { app } = setupSuccessfulLaunch();
      await session.launch({});
      app._emit('close');

      await session.close();

      expect(session.state).toBe(SessionState.IDLE);
    });

    it('launch auto-cleans from CRASHED state before relaunching', async () => {
      const { app } = setupSuccessfulLaunch();
      await session.launch({});
      app._emit('close');
      expect(session.state).toBe(SessionState.CRASHED);

      setupSuccessfulLaunch();
      await session.launch({});

      expect(session.state).toBe(SessionState.READY);
    });
  });

  // ── Unresponsive ───────────────────────────────────────────
  describe('markUnresponsive', () => {
    it('transitions READY to UNRESPONSIVE', async () => {
      setupSuccessfulLaunch();
      await session.launch({});

      session.markUnresponsive();

      expect(session.state).toBe(SessionState.UNRESPONSIVE);
    });

    it('getPage throws SESSION_UNRESPONSIVE', async () => {
      expect.assertions(2);
      setupSuccessfulLaunch();
      await session.launch({});
      session.markUnresponsive();

      try { session.getPage(); } catch (err) {
        expect(err).toBeInstanceOf(ToolError);
        expect((err as ToolError).code).toBe('SESSION_UNRESPONSIVE');
      }
    });

    it('is no-op when not READY', () => {
      session.markUnresponsive();
      expect(session.state).toBe(SessionState.IDLE);
    });

    it('close from UNRESPONSIVE resets to IDLE', async () => {
      setupSuccessfulLaunch();
      await session.launch({});
      session.markUnresponsive();

      await session.close();

      expect(session.state).toBe(SessionState.IDLE);
    });

    it('launch auto-cleans from UNRESPONSIVE state before relaunching', async () => {
      setupSuccessfulLaunch();
      await session.launch({});
      session.markUnresponsive();
      expect(session.state).toBe(SessionState.UNRESPONSIVE);

      setupSuccessfulLaunch();
      await session.launch({});

      expect(session.state).toBe(SessionState.READY);
    });
  });
});
