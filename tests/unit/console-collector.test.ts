/**
 * Unit tests for ConsoleCollector.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Page, ConsoleMessage } from 'playwright-core';
import { ConsoleCollector, MAX_MESSAGES } from '../../src/session/console-collector.js';

/** Create a minimal mock Page that tracks event listeners. */
function createMockPage() {
  const listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();
  return {
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    },
    removeListener(event: string, fn: (...args: unknown[]) => void) {
      const fns = listeners.get(event);
      if (fns) {
        const idx = fns.indexOf(fn);
        if (idx !== -1) fns.splice(idx, 1);
      }
    },
    /** Emit a fake console event. */
    emit(event: string, ...args: unknown[]) {
      const fns = listeners.get(event);
      if (fns) {
        for (const fn of fns) fn(...args);
      }
    },
    getListeners(event: string) {
      return listeners.get(event) ?? [];
    },
  };
}

/** Create a minimal mock ConsoleMessage. */
function createMockMessage(type: string, text: string): ConsoleMessage {
  return {
    type: () => type,
    text: () => text,
  } as unknown as ConsoleMessage;
}

describe('ConsoleCollector', () => {
  let collector: ConsoleCollector;
  let mockPage: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    collector = new ConsoleCollector();
    mockPage = createMockPage();
  });

  it('attach registers a console listener', () => {
    collector.attach(mockPage as unknown as Page);
    expect(mockPage.getListeners('console')).toHaveLength(1);
  });

  it('detach removes the console listener (no arg needed)', () => {
    collector.attach(mockPage as unknown as Page);
    expect(mockPage.getListeners('console')).toHaveLength(1);
    collector.detach();
    expect(mockPage.getListeners('console')).toHaveLength(0);
  });

  it('detach is safe when no listener attached', () => {
    // Should not throw and should leave listeners unchanged
    collector.detach();
    expect(mockPage.getListeners('console')).toHaveLength(0);
  });

  it('collects console messages after attach', () => {
    collector.attach(mockPage as unknown as Page);

    mockPage.emit('console', createMockMessage('log', 'hello'));
    mockPage.emit('console', createMockMessage('error', 'boom'));

    const messages = collector.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].level).toBe('log');
    expect(messages[0].text).toBe('hello');
    expect(messages[1].level).toBe('error');
    expect(messages[1].text).toBe('boom');
  });

  it('getMessages returns all messages when no level filter', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('log', 'a'));
    mockPage.emit('console', createMockMessage('warning', 'b'));
    mockPage.emit('console', createMockMessage('error', 'c'));

    expect(collector.getMessages()).toHaveLength(3);
    expect(collector.getMessages('all')).toHaveLength(3);
  });

  it('getMessages filters by level', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('log', 'a'));
    mockPage.emit('console', createMockMessage('error', 'b'));
    mockPage.emit('console', createMockMessage('log', 'c'));

    const errors = collector.getMessages('error');
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toBe('b');
  });

  it('getMessages normalizes "warn" to "warning"', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('warning', 'caution'));
    mockPage.emit('console', createMockMessage('log', 'ok'));

    const warns = collector.getMessages('warn');
    expect(warns).toHaveLength(1);
    expect(warns[0].text).toBe('caution');
  });

  it('clear empties the buffer', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('log', 'a'));
    mockPage.emit('console', createMockMessage('log', 'b'));

    expect(collector.count).toBe(2);
    collector.clear();
    expect(collector.count).toBe(0);
    expect(collector.getMessages()).toHaveLength(0);
  });

  it('clearLevel removes only matching messages', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('log', 'a'));
    mockPage.emit('console', createMockMessage('error', 'b'));
    mockPage.emit('console', createMockMessage('log', 'c'));

    collector.clearLevel('log');
    expect(collector.count).toBe(1);
    expect(collector.getMessages()[0].text).toBe('b');
  });

  it('clearLevel normalizes "warn" to "warning"', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('warning', 'w'));
    mockPage.emit('console', createMockMessage('log', 'l'));

    collector.clearLevel('warn');
    expect(collector.count).toBe(1);
    expect(collector.getMessages()[0].text).toBe('l');
  });

  it('clearLevel with "all" clears everything', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('log', 'a'));
    mockPage.emit('console', createMockMessage('error', 'b'));

    collector.clearLevel('all');
    expect(collector.count).toBe(0);
  });

  it('getMessages returns copies, not references', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('log', 'a'));

    const first = collector.getMessages();
    const second = collector.getMessages();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('re-attach clears previous messages and listener', () => {
    collector.attach(mockPage as unknown as Page);
    mockPage.emit('console', createMockMessage('log', 'old'));

    // Re-attach should clear messages and replace listener
    collector.attach(mockPage as unknown as Page);
    expect(collector.count).toBe(0);
    expect(mockPage.getListeners('console')).toHaveLength(1);

    mockPage.emit('console', createMockMessage('log', 'new'));
    expect(collector.count).toBe(1);
    expect(collector.getMessages()[0].text).toBe('new');
  });

  it('count reflects current message count', () => {
    collector.attach(mockPage as unknown as Page);
    expect(collector.count).toBe(0);

    mockPage.emit('console', createMockMessage('log', 'a'));
    expect(collector.count).toBe(1);

    mockPage.emit('console', createMockMessage('error', 'b'));
    expect(collector.count).toBe(2);
  });

  it('trims buffer when exceeding MAX_MESSAGES', () => {
    collector.attach(mockPage as unknown as Page);

    // Push MAX_MESSAGES + 1 messages to trigger trim
    for (let i = 0; i <= MAX_MESSAGES; i++) {
      mockPage.emit('console', createMockMessage('log', `msg-${i}`));
    }

    // Should have been trimmed: MAX_MESSAGES + 1 - 1000 = 9001
    expect(collector.count).toBeLessThanOrEqual(MAX_MESSAGES);
    expect(collector.count).toBe(MAX_MESSAGES + 1 - 1000);
    // Oldest messages should have been dropped
    const messages = collector.getMessages();
    expect(messages[0].text).toBe('msg-1000');
  });
});
