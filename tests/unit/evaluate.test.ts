/**
 * Unit tests for vscode_evaluate tool handler.
 */

import { describe, it, expect, vi } from 'vitest';
import { handleEvaluate } from '../../src/tools/evaluate.js';
import type { SessionManager } from '../../src/session/session-manager.js';

function createMockSession(evaluateResult: unknown): SessionManager {
  return {
    getPage: () => ({
      evaluate: async () => evaluateResult,
    }),
  } as unknown as SessionManager;
}

function createThrowingSession(error: Error): SessionManager {
  return {
    getPage: () => ({
      evaluate: async () => { throw error; },
    }),
  } as unknown as SessionManager;
}

function createHangingSession(): SessionManager {
  return {
    getPage: () => ({
      evaluate: () => new Promise(() => { /* never resolves */ }),
    }),
  } as unknown as SessionManager;
}

describe('handleEvaluate', () => {
  it('throws on empty expression', async () => {
    const session = createMockSession(null);
    await expect(handleEvaluate(session, { expression: '' })).rejects.toThrow(
      /non-empty string/,
    );
  });

  it('serializes object result as JSON', async () => {
    const session = createMockSession({ foo: 'bar', count: 42 });
    const result = await handleEvaluate(session, { expression: '({foo: "bar", count: 42})' });
    expect(result.type).toBe('text');
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('Evaluation result:');
    expect(text).toContain('"foo": "bar"');
    expect(text).toContain('"count": 42');
  });

  it('serializes number result', async () => {
    const session = createMockSession(123);
    const result = await handleEvaluate(session, { expression: '1 + 2' });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('123');
  });

  it('serializes null result', async () => {
    const session = createMockSession(null);
    const result = await handleEvaluate(session, { expression: 'null' });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('null');
  });

  it('handles undefined result', async () => {
    const session = createMockSession(undefined);
    const result = await handleEvaluate(session, { expression: 'void 0' });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('undefined');
  });

  it('serializes string result', async () => {
    const session = createMockSession('hello world');
    const result = await handleEvaluate(session, { expression: '"hello world"' });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('"hello world"');
  });

  it('wraps expression errors in ToolError', async () => {
    const session = createThrowingSession(new Error('ReferenceError: foo is not defined'));
    await expect(
      handleEvaluate(session, { expression: 'foo' }),
    ).rejects.toThrow(/Expression evaluation failed/);
  });

  it('wraps syntax errors with actionable message', async () => {
    const session = createThrowingSession(new Error('SyntaxError: Unexpected token }'));
    await expect(
      handleEvaluate(session, { expression: '}' }),
    ).rejects.toThrow(/Syntax error in expression/);
  });

  it('handles non-serializable results (circular ref)', async () => {
    // Simulate a result that causes JSON.stringify to throw
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const session = createMockSession(circular);
    const result = await handleEvaluate(session, { expression: 'circular' });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toContain('[non-serializable]');
  });

  it('times out when expression hangs', async () => {
    vi.useFakeTimers();
    const session = createHangingSession();
    const promise = handleEvaluate(session, { expression: 'while(true){}', timeout: 100 });

    // Advance past the timeout
    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow(/timed out after 100ms/);
    vi.useRealTimers();
  });

  it('rejects timeout <= 0', async () => {
    const session = createMockSession(null);
    await expect(
      handleEvaluate(session, { expression: '1', timeout: 0 }),
    ).rejects.toThrow(/timeout must be a positive number/);
  });
});
