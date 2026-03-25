/**
 * Unit tests for session cleanup utilities.
 * Tests PID tracking and temp dir cleanup.
 *
 * Note: killProcess, emergencyCleanup, and installShutdownHooks are not exported
 * and involve process signals — they're tested indirectly via integration tests.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { trackSession, untrackSession, cleanupTempDir } from '../../src/session/cleanup.js';

describe('trackSession / untrackSession', () => {
  // Clean up tracked sessions after each test to avoid cross-test pollution.
  // We track PIDs that don't exist so they're harmless.
  const trackedPids: number[] = [];

  afterEach(() => {
    for (const pid of trackedPids) {
      untrackSession(pid);
    }
    trackedPids.length = 0;
  });

  it('trackSession does not throw', () => {
    const pid = 999_999;
    trackedPids.push(pid);
    expect(() => trackSession(pid, '/tmp/test-dir')).not.toThrow();
  });

  it('untrackSession does not throw for unknown PID', () => {
    expect(() => untrackSession(888_888)).not.toThrow();
  });

  it('untrackSession is idempotent', () => {
    const pid = 777_777;
    trackSession(pid, '/tmp/test-dir');
    untrackSession(pid);
    expect(() => untrackSession(pid)).not.toThrow();
  });
});

describe('cleanupTempDir', () => {
  it('removes an existing directory', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cleanup-test-'));
    await fs.promises.writeFile(path.join(dir, 'test.txt'), 'hello');

    await cleanupTempDir(dir);

    expect(fs.existsSync(dir)).toBe(false);
  });

  it('does not throw for non-existent directory', async () => {
    await expect(cleanupTempDir('/tmp/nonexistent-cleanup-test-xyz')).resolves.toBeUndefined();
  });
});
