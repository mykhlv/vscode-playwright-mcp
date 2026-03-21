/**
 * Unit tests for vscode_wait_for tool handler.
 */

import { describe, it, expect } from 'vitest';
import { handleWaitFor } from '../../src/tools/wait-for.js';
import type { SessionManager } from '../../src/session/session-manager.js';

function createMockSession(): SessionManager {
  return {
    getPage: () => ({
      waitForSelector: async () => {},
      waitForTimeout: async () => {},
      evaluate: async () => '',
    }),
  } as unknown as SessionManager;
}

describe('handleWaitFor', () => {
  it('throws INVALID_INPUT when both selector and text provided', async () => {
    const session = createMockSession();
    await expect(
      handleWaitFor(session, { selector: '.foo', text: 'bar' }),
    ).rejects.toThrow(/either "selector" or "text", not both/i);
  });

  it('throws INVALID_INPUT when state provided without selector', async () => {
    const session = createMockSession();
    await expect(
      handleWaitFor(session, { state: 'visible' }),
    ).rejects.toThrow(/"state" can only be used with "selector"/);
  });

  it('throws INVALID_INPUT when timeout <= 0', async () => {
    const session = createMockSession();
    await expect(
      handleWaitFor(session, { timeout: 0 }),
    ).rejects.toThrow(/timeout must be a positive number/);
    await expect(
      handleWaitFor(session, { timeout: -1 }),
    ).rejects.toThrow(/timeout must be a positive number/);
  });

  it('simple delay mode calls waitForTimeout', async () => {
    let waitedMs = 0;
    const session = {
      getPage: () => ({
        waitForTimeout: async (ms: number) => { waitedMs = ms; },
      }),
    } as unknown as SessionManager;

    const result = await handleWaitFor(session, { timeout: 1000 });
    expect(result.type).toBe('text');
    expect((result as { type: 'text'; text: string }).text).toContain('Waited 1000ms');
    expect(waitedMs).toBe(1000);
  });

  it('simple delay defaults to 5000ms', async () => {
    let waitedMs = 0;
    const session = {
      getPage: () => ({
        waitForTimeout: async (ms: number) => { waitedMs = ms; },
      }),
    } as unknown as SessionManager;

    const result = await handleWaitFor(session, {});
    expect((result as { type: 'text'; text: string }).text).toContain('Waited 5000ms');
    expect(waitedMs).toBe(5000);
  });

  it('selector mode calls waitForSelector with correct params', async () => {
    let capturedSelector = '';
    let capturedOptions: Record<string, unknown> = {};
    const session = {
      getPage: () => ({
        waitForSelector: async (sel: string, opts: Record<string, unknown>) => {
          capturedSelector = sel;
          capturedOptions = opts;
        },
      }),
    } as unknown as SessionManager;

    const result = await handleWaitFor(session, { selector: '.my-element', state: 'hidden', timeout: 3000 });
    expect(capturedSelector).toBe('.my-element');
    expect(capturedOptions.state).toBe('hidden');
    expect(capturedOptions.timeout).toBe(3000);
    expect((result as { type: 'text'; text: string }).text).toContain('.my-element');
    expect((result as { type: 'text'; text: string }).text).toContain('hidden');
  });

  it('selector mode defaults state to visible', async () => {
    let capturedOptions: Record<string, unknown> = {};
    const session = {
      getPage: () => ({
        waitForSelector: async (_sel: string, opts: Record<string, unknown>) => {
          capturedOptions = opts;
        },
      }),
    } as unknown as SessionManager;

    await handleWaitFor(session, { selector: '.btn' });
    expect(capturedOptions.state).toBe('visible');
  });

  it('selector success message does not mention timeout', async () => {
    const session = {
      getPage: () => ({
        waitForSelector: async () => {},
      }),
    } as unknown as SessionManager;

    const result = await handleWaitFor(session, { selector: '.btn', timeout: 3000 });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toBe('Selector ".btn" is now visible.');
    expect(text).not.toContain('3000');
  });

  it('selector timeout wraps in ToolError', async () => {
    const session = {
      getPage: () => ({
        waitForSelector: async () => {
          throw new Error('Timeout 5000ms exceeded.');
        },
      }),
    } as unknown as SessionManager;

    await expect(
      handleWaitFor(session, { selector: '.missing', timeout: 5000 }),
    ).rejects.toThrow(/did not reach state "visible" within 5000ms/);
  });

  it('text mode returns when text is found', async () => {
    let callCount = 0;
    const session = {
      getPage: () => ({
        evaluate: async () => {
          callCount++;
          return callCount >= 2 ? 'Hello World' : '';
        },
        waitForTimeout: async () => {},
      }),
    } as unknown as SessionManager;

    const result = await handleWaitFor(session, { text: 'Hello', timeout: 5000 });
    const text = (result as { type: 'text'; text: string }).text;
    expect(text).toBe('Text "Hello" found on page.');
    expect(text).not.toContain('5000');
  });

  it('text mode throws ToolError on timeout', async () => {
    const session = {
      getPage: () => ({
        evaluate: async () => 'no match here',
        waitForTimeout: async () => {},
      }),
    } as unknown as SessionManager;

    // Use a very short timeout so the poll loop exits quickly
    await expect(
      handleWaitFor(session, { text: 'MISSING', timeout: 1 }),
    ).rejects.toThrow(/Text "MISSING" not found within 1ms/);
  });
});
