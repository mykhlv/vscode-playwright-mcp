/**
 * Session manager: owns the VS Code lifecycle.
 * One active session at a time. Tools get a reference to the session manager.
 */

import type { ElectronApplication, Page } from 'playwright-core';
import { SessionState, SessionStateMachine } from './session-state.js';
import { launchVSCode, type LaunchConfig } from './vscode-launcher.js';
import { trackSession, untrackSession, cleanupTempDir, installShutdownHooks } from './cleanup.js';
import { ConsoleCollector } from './console-collector.js';
import { ErrorCode, ToolError } from '../types/errors.js';
import { withTimeout } from '../utils/timeout.js';
import { logger } from '../utils/logger.js';

const LAUNCH_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 10_000;

export class SessionManager {
  private stateMachine = new SessionStateMachine();
  private app: ElectronApplication | null = null;
  private page: Page | null = null;
  private userDataDir: string | null = null;
  private pid = 0;
  readonly consoleCollector = new ConsoleCollector();

  constructor() {
    installShutdownHooks();
  }

  get state(): SessionState {
    return this.stateMachine.state;
  }

  get isReady(): boolean {
    return this.stateMachine.isReady;
  }

  /**
   * Get the active Playwright Page. Throws if no session is active.
   */
  getPage(): Page {
    if (this.stateMachine.state === SessionState.UNRESPONSIVE) {
      throw new ToolError(
        ErrorCode.SESSION_UNRESPONSIVE,
        'VS Code instance is unresponsive (previous tool call timed out). Call vscode_close first, then vscode_launch to recover.',
      );
    }
    if (this.stateMachine.state === SessionState.CRASHED) {
      throw new ToolError(
        ErrorCode.SESSION_CRASHED,
        'VS Code instance has crashed. Call vscode_close to clean up, then vscode_launch to start a new session.',
      );
    }
    if (!this.page || !this.stateMachine.isReady) {
      throw new ToolError(
        ErrorCode.NO_SESSION,
        'No VS Code instance is running. Call vscode_launch first.',
      );
    }
    return this.page;
  }

  /**
   * Launch a new VS Code instance. Throws if one is already running.
   */
  async launch(config: LaunchConfig): Promise<void> {
    if (!this.stateMachine.isIdle) {
      const current = this.stateMachine.state;
      if (current === SessionState.READY) {
        throw new ToolError(
          ErrorCode.SESSION_EXISTS,
          'A VS Code instance is already running. Call vscode_close first, then launch again.',
        );
      }
      if (current === SessionState.CRASHED || current === SessionState.ERROR || current === SessionState.UNRESPONSIVE) {
        // Auto-cleanup from error states before relaunch
        logger.info('auto_cleanup_before_relaunch', { previousState: current });
        await this.forceCleanup();
      }
    }

    try {
      this.stateMachine.transition(SessionState.LAUNCHING);
    } catch {
      throw new ToolError(
        ErrorCode.SESSION_EXISTS,
        'A VS Code instance is already running. Call vscode_close first, then launch again.',
      );
    }

    let launchPromise: Promise<import('./vscode-launcher.js').LaunchResult> | null = null;
    try {
      launchPromise = launchVSCode(config);
      const result = await withTimeout(
        launchPromise,
        LAUNCH_TIMEOUT_MS,
        'VS Code launch',
      );

      this.app = result.app;
      this.page = result.window;
      this.userDataDir = result.userDataDir;
      this.pid = result.pid;

      // Start collecting console messages from the renderer
      this.consoleCollector.attach(this.page);

      // Track for cleanup hooks
      trackSession(this.pid, this.userDataDir);

      const currentApp = this.app;
      currentApp.on('close', () => {
        if (this.app === currentApp && this.stateMachine.state === SessionState.READY) {
          logger.warn('vscode_crashed', { pid: this.pid });
          this.stateMachine.transition(SessionState.CRASHED);
          this.app = null;
          this.page = null;
        }
      });

      this.stateMachine.transition(SessionState.READY);
      logger.info('session_ready', { pid: this.pid });
    } catch (error) {
      // If launch timed out, the promise may still resolve with a running process
      if (launchPromise) {
        launchPromise.then(
          (result) => {
            try { result.app.close(); } catch { /* ignore */ }
            cleanupTempDir(result.userDataDir);
          },
          () => { /* launch itself failed, nothing to clean */ },
        );
      }

      try {
        this.stateMachine.transition(SessionState.ERROR);
      } catch {
        this.stateMachine.reset();
      }
      await this.forceCleanup();

      if (error instanceof ToolError) throw error;
      throw new ToolError(
        ErrorCode.LAUNCH_FAILED,
        `VS Code launch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Mark the session as unresponsive (e.g. after a tool-call watchdog timeout).
   * The LLM should call vscode_close and relaunch to recover.
   */
  markUnresponsive(): void {
    if (this.stateMachine.isReady) {
      this.stateMachine.transition(SessionState.UNRESPONSIVE);
    }
  }

  /**
   * Gracefully close the running VS Code instance.
   */
  async close(): Promise<void> {
    if (this.stateMachine.state === SessionState.IDLE || this.stateMachine.state === SessionState.CLOSING) {
      return; // Already closed or closing, idempotent
    }

    if (this.stateMachine.state === SessionState.LAUNCHING) {
      // Close called while launch is still in progress — force cleanup.
      // The in-flight launchPromise may still resolve; its orphan-cleanup
      // handler in launch() will take care of killing the process.
      logger.warn('close_during_launch', { state: this.stateMachine.state });
      await this.forceCleanup();
      return;
    }

    if (this.stateMachine.state === SessionState.CRASHED || this.stateMachine.state === SessionState.ERROR) {
      // Just clean up resources
      await this.forceCleanup();
      return;
    }

    if (this.stateMachine.isReady || this.stateMachine.state === SessionState.UNRESPONSIVE) {
      this.stateMachine.transition(SessionState.CLOSING);
    }

    try {
      if (this.app) {
        await withTimeout(
          this.app.close(),
          CLOSE_TIMEOUT_MS,
          'VS Code close',
        );
      }
    } catch (error) {
      logger.warn('close_error', { error: String(error) });
    } finally {
      await this.cleanupResources();
      this.stateMachine.reset();
      logger.info('session_closed');
    }
  }

  /**
   * Force cleanup without graceful close. Used for error recovery.
   */
  private async forceCleanup(): Promise<void> {
    if (this.app) {
      try {
        await this.app.close();
      } catch {
        // Already dead or unresponsive — ignore
      }
    }
    await this.cleanupResources();
    this.stateMachine.reset();
  }

  private async cleanupResources(): Promise<void> {
    if (this.pid > 0) {
      untrackSession(this.pid);
    }
    if (this.userDataDir) {
      await cleanupTempDir(this.userDataDir);
    }
    this.consoleCollector.detach();
    this.app = null;
    this.page = null;
    this.userDataDir = null;
    this.pid = 0;
  }
}
