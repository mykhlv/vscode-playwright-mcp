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

  it('re-attach clears previous listener and registers a new one', () => {
    collector.attach(mockPage as unknown as Page);
    expect(mockPage.getListeners('console')).toHaveLength(1);

    // Re-attach should replace listener
    collector.attach(mockPage as unknown as Page);
    expect(mockPage.getListeners('console')).toHaveLength(1);
  });

  it('trims buffer when exceeding MAX_MESSAGES without throwing', () => {
    collector.attach(mockPage as unknown as Page);

    // Push MAX_MESSAGES + 1 messages to trigger trim.
    // The internal buffer is private, so we verify the trim path
    // runs without throwing and the collector remains functional.
    for (let i = 0; i <= MAX_MESSAGES; i++) {
      mockPage.emit('console', createMockMessage('log', `msg-${i}`));
    }

    // After trim, new messages should still be collected without error
    mockPage.emit('console', createMockMessage('log', 'after-trim'));

    // Listener should still be active (1 listener registered)
    expect(mockPage.getListeners('console')).toHaveLength(1);
  });
});
