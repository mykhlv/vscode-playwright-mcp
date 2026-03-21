/**
 * Unit tests for vscode_console tool handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleConsole } from '../../src/tools/console.js';
import { ConsoleCollector } from '../../src/session/console-collector.js';
import type { SessionManager } from '../../src/session/session-manager.js';

function createMockSession(collector: ConsoleCollector): SessionManager {
  return {
    getPage: () => ({}),
    consoleCollector: collector,
  } as unknown as SessionManager;
}

describe('handleConsole', () => {
  let collector: ConsoleCollector;
  let session: SessionManager;

  beforeEach(() => {
    collector = new ConsoleCollector();
    session = createMockSession(collector);
  });

  /** Directly push messages into the collector for testing. */
  function pushMessages(...entries: Array<{ level: string; text: string }>) {
    // Access the internal messages array via getMessages/clear isn't enough,
    // so we use a mock page to emit messages
    const mockPage = {
      on(_event: string, fn: (msg: { type: () => string; text: () => string }) => void) {
        for (const entry of entries) {
          fn({ type: () => entry.level, text: () => entry.text });
        }
      },
      removeListener() {},
    };
    // Attach pushes the listener and triggers the mock emissions
    const existingCount = collector.count;
    if (existingCount === 0) {
      collector.attach(mockPage as never);
    }
  }

  it('returns empty message when no console messages', async () => {
    // Attach a dummy page to avoid issues
    collector.attach({ on() {}, removeListener() {} } as never);
    const result = await handleConsole(session, {});
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toBe('No console messages.');
  });

  it('returns empty message with level note when filtering', async () => {
    collector.attach({ on() {}, removeListener() {} } as never);
    const result = await handleConsole(session, { level: 'error' });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toBe('No console messages (level: error).');
  });

  it('returns formatted messages', async () => {
    pushMessages(
      { level: 'log', text: 'hello' },
      { level: 'error', text: 'oops' },
    );
    const result = await handleConsole(session, {});
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('Console messages (2)');
    expect(text).toContain('[log] hello');
    expect(text).toContain('[error] oops');
  });

  it('uses UTC timestamps', async () => {
    pushMessages({ level: 'log', text: 'test' });
    const result = await handleConsole(session, {});
    const text = (result as { type: 'text'; text: string }).text;
    // Should contain a timestamp in HH:MM:SS.mmm format
    expect(text).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it('clear with level filter only clears matching messages', async () => {
    pushMessages(
      { level: 'log', text: 'keep' },
      { level: 'error', text: 'remove' },
    );
    await handleConsole(session, { level: 'error', clear: true });
    // The log message should still be there
    expect(collector.count).toBe(1);
    expect(collector.getMessages()[0].text).toBe('keep');
  });

  it('clear without level filter clears all messages', async () => {
    pushMessages(
      { level: 'log', text: 'a' },
      { level: 'error', text: 'b' },
    );
    await handleConsole(session, { clear: true });
    expect(collector.count).toBe(0);
  });

  it('limit returns only the most recent N messages', async () => {
    pushMessages(
      { level: 'log', text: 'first' },
      { level: 'log', text: 'second' },
      { level: 'log', text: 'third' },
    );
    const result = await handleConsole(session, { limit: 2 });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('Console messages (2)');
    expect(text).not.toContain('first');
    expect(text).toContain('second');
    expect(text).toContain('third');
  });

  it('shows buffer cleared note when clear is true', async () => {
    pushMessages({ level: 'log', text: 'x' });
    const result = await handleConsole(session, { clear: true });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('(buffer cleared)');
  });
});
