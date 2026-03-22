/**
 * Unit tests for withTimeout utility.
 */

import { describe, it, expect } from 'vitest';
import { withTimeout } from '../../src/utils/timeout.js';
import { ToolError } from '../../src/types/errors.js';

describe('withTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('done'),
      1000,
      'test',
    );
    expect(result).toBe('done');
  });

  it('rejects with TIMEOUT error when promise exceeds timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000));

    try {
      await withTimeout(slow, 50, 'slow_op');
      expect.fail('Should have thrown ToolError');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      const toolError = error as ToolError;
      expect(toolError.code).toBe('TIMEOUT');
      expect(toolError.actionable).toContain('slow_op');
      expect(toolError.actionable).toContain('50ms');
    }
  });

  it('rejects with original error when promise fails before timeout', async () => {
    const failing = Promise.reject(new Error('boom'));

    await expect(
      withTimeout(failing, 1000, 'test'),
    ).rejects.toThrow('boom');
  });

  it('includes label in error message', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000));

    try {
      await withTimeout(slow, 50, 'vscode_screenshot');
      expect.fail('Should have thrown ToolError');
    } catch (error) {
      expect((error as ToolError).actionable).toContain('vscode_screenshot');
      expect((error as ToolError).actionable).toContain('vscode_close');
    }
  });

  it('clears timer when promise resolves', async () => {
    // If timer leaked, this test would hang or cause warnings
    const result = await withTimeout(
      Promise.resolve(42),
      100,
      'test',
    );
    expect(result).toBe(42);
  });
});
