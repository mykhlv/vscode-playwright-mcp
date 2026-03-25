/**
 * Unit tests for ConsoleCollector.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Page } from 'playwright-core';
import { ConsoleCollector } from '../../src/session/console-collector.js';

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
    getListeners(event: string) {
      return listeners.get(event) ?? [];
    },
  };
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

  it('detach removes the console listener', () => {
    collector.attach(mockPage as unknown as Page);
    expect(mockPage.getListeners('console')).toHaveLength(1);
    collector.detach();
    expect(mockPage.getListeners('console')).toHaveLength(0);
  });

  it('detach is safe when no listener attached', () => {
    collector.detach();
    expect(mockPage.getListeners('console')).toHaveLength(0);
  });

  it('re-attach removes old listener and registers a new one', () => {
    collector.attach(mockPage as unknown as Page);
    const firstListener = mockPage.getListeners('console')[0];
    expect(firstListener).toBeDefined();

    collector.attach(mockPage as unknown as Page);
    const listeners = mockPage.getListeners('console');
    expect(listeners).toHaveLength(1);
    expect(listeners[0]).not.toBe(firstListener);
  });
});
