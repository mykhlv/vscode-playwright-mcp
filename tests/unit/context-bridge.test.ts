/**
 * Unit tests for ContextBridge — deferred promise bridge between
 * our vscode_launch/close lifecycle and @playwright/mcp's contextGetter.
 */

import { describe, it, expect } from 'vitest';
import { ContextBridge } from '../../src/context-bridge.js';
import type { BrowserContext } from 'playwright';

function mockContext(): BrowserContext {
  return { close: async () => {} } as unknown as BrowserContext;
}

describe('ContextBridge', () => {
  it('isProvided is false initially', () => {
    const bridge = new ContextBridge();
    expect(bridge.isProvided).toBe(false);
  });

  it('getContext resolves after provide()', async () => {
    const bridge = new ContextBridge();
    const ctx = mockContext();

    // Start waiting (doesn't resolve yet)
    const promise = bridge.getContext();

    // Provide context
    bridge.provide(ctx);
    expect(bridge.isProvided).toBe(true);

    const result = await promise;
    expect(result).toBe(ctx);
  });

  it('getContext resolves immediately if already provided', async () => {
    const bridge = new ContextBridge();
    const ctx = mockContext();

    bridge.provide(ctx);
    const result = await bridge.getContext();
    expect(result).toBe(ctx);
  });

  it('provide() throws if called twice', () => {
    const bridge = new ContextBridge();
    bridge.provide(mockContext());
    expect(() => bridge.provide(mockContext())).toThrow(/already provided/);
  });

  it('reset() allows a new provide cycle', async () => {
    const bridge = new ContextBridge();
    const ctx1 = mockContext();
    const ctx2 = mockContext();

    bridge.provide(ctx1);
    const result1 = await bridge.getContext();
    expect(result1).toBe(ctx1);

    bridge.reset();
    expect(bridge.isProvided).toBe(false);

    // New cycle
    const promise = bridge.getContext();
    bridge.provide(ctx2);
    const result2 = await promise;
    expect(result2).toBe(ctx2);
  });

  it('reset() rejects pending waiters when context was not provided', async () => {
    const bridge = new ContextBridge();

    // Start waiting
    const promise = bridge.getContext();

    // Reset without providing — should reject
    bridge.reset();

    await expect(promise).rejects.toThrow(/closed/);
  });
});
