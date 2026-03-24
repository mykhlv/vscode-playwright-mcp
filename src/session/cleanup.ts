/**
 * Process cleanup: PID tracking, temp dir cleanup, shutdown hooks.
 * Ensures no orphan Electron processes or temp dirs after exit.
 */

import * as fs from 'node:fs';
import { logger } from '../utils/logger.js';

interface TrackedSession {
  pid: number;
  userDataDir: string;
}

const trackedSessions: TrackedSession[] = [];
let hooksInstalled = false;

export function trackSession(pid: number, userDataDir: string): void {
  trackedSessions.push({ pid, userDataDir });
}

export function untrackSession(pid: number): void {
  const idx = trackedSessions.findIndex((s) => s.pid === pid);
  if (idx !== -1) {
    trackedSessions.splice(idx, 1);
  }
}

/**
 * Clean up a temp user-data-dir. Logs but doesn't throw on failure.
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
    logger.debug('temp_dir_cleaned', { path: dirPath });
  } catch (error) {
    logger.warn('temp_dir_cleanup_failed', { path: dirPath, error: String(error) });
  }
}

/**
 * Kill a process by PID. Logs but doesn't throw on failure.
 */
function killProcess(pid: number): void {
  if (pid <= 0) return;
  try {
    process.kill(pid, 'SIGTERM');
    const escalationTimer = setTimeout(() => {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process already exited
      }
    }, 2000);
    escalationTimer.unref();

    // Clear the SIGKILL escalation timer if the process exits after SIGTERM
    const pollTimer = setInterval(() => {
      try {
        // Signal 0 checks if process exists without sending a signal
        process.kill(pid, 0);
      } catch {
        // Process no longer exists — cancel the SIGKILL escalation
        clearTimeout(escalationTimer);
        clearInterval(pollTimer);
      }
    }, 200);
    pollTimer.unref();

    logger.info('process_killed', { pid });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      logger.warn('process_kill_failed', { pid, error: String(error) });
    }
  }
}

/**
 * Emergency cleanup of all tracked sessions. Called on process exit.
 */
function emergencyCleanup(): void {
  for (const session of trackedSessions) {
    killProcess(session.pid);
    // Synchronous cleanup — we're in an exit handler
    try {
      fs.rmSync(session.userDataDir, { recursive: true, force: true });
    } catch {
      // Best effort during shutdown
    }
  }
  trackedSessions.length = 0;
}

/**
 * Install process exit hooks. Idempotent — safe to call multiple times.
 */
export function installShutdownHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  process.on('SIGINT', () => {
    logger.info('shutdown_sigint');
    emergencyCleanup();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    logger.info('shutdown_sigterm');
    emergencyCleanup();
    process.exit(143);
  });

  process.on('exit', () => {
    emergencyCleanup();
  });

  logger.debug('shutdown_hooks_installed');
}
