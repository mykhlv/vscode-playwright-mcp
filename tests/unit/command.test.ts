/**
 * Unit tests for vscode_run_command tool handler.
 */

import { describe, it, expect, vi } from 'vitest';
import { handleRunCommand } from '../../src/tools/command.js';
import type { SessionManager } from '../../src/session/session-manager.js';
import { ToolError } from '../../src/types/errors.js';

interface MockPageOptions {
  hasRows?: boolean;
  noMatchMessage?: boolean;
}

function createMockSession(options: MockPageOptions = { hasRows: true }): {
  session: SessionManager;
  actions: string[];
} {
  const actions: string[] = [];

  const page = {
    keyboard: {
      press: vi.fn(async (key: string) => { actions.push(`press:${key}`); }),
      type: vi.fn(async (text: string) => { actions.push(`type:${text}`); }),
    },
    waitForTimeout: vi.fn(async () => {}),
    evaluate: vi.fn(async () => {
      if (!options.hasRows) return { found: false };
      if (options.noMatchMessage) return { found: false };
      return { found: true, topMatch: 'Go to Line' };
    }),
  };

  const session = {
    getPage: () => page,
  } as unknown as SessionManager;

  return { session, actions };
}

describe('handleRunCommand', () => {
  it('executes a matched command via Command Palette', async () => {
    const { session, actions } = createMockSession({ hasRows: true });

    const result = await handleRunCommand(session, { command: 'Go to Line' });

    expect(result.type).toBe('text');
    expect((result as { text: string }).text).toContain('Executed top Command Palette match "Go to Line"');
    expect(actions).toContain('type:Go to Line');
    expect(actions).toContain('press:Enter');
  });

  it('executes command with additional input', async () => {
    const { session, actions } = createMockSession({ hasRows: true });

    const result = await handleRunCommand(session, { command: 'Go to Line', input: '42' });

    expect(result.type).toBe('text');
    expect((result as { text: string }).text).toContain('with input "42"');
    expect(actions).toContain('type:42');
  });

  it('throws ToolError when no matching command found (empty list)', async () => {
    const { session } = createMockSession({ hasRows: false });

    await expect(handleRunCommand(session, { command: 'nonExistentCommand' }))
      .rejects.toThrow(ToolError);
  });

  it('throws ToolError with actionable message for unmatched command', async () => {
    const { session } = createMockSession({ hasRows: false });

    try {
      await handleRunCommand(session, { command: 'cursorBottom' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).actionable).toContain('Command not found: "cursorBottom"');
      expect((error as ToolError).actionable).toContain('exact command label');
    }
  });

  it('dismisses palette with Escape when no match found', async () => {
    const { session, actions } = createMockSession({ hasRows: false });

    try {
      await handleRunCommand(session, { command: 'noSuchCommand' });
    } catch {
      // expected
    }

    expect(actions).toContain('press:Escape');
    // Should NOT press Enter
    const enterPresses = actions.filter((a) => a === 'press:Enter');
    expect(enterPresses).toHaveLength(0);
  });

  it('throws ToolError when "No matching" message is shown', async () => {
    const { session } = createMockSession({ noMatchMessage: true });

    await expect(handleRunCommand(session, { command: 'badCommand' }))
      .rejects.toThrow(ToolError);
  });

  it('rejects empty command', async () => {
    const { session } = createMockSession();

    await expect(handleRunCommand(session, { command: '' }))
      .rejects.toThrow();
  });
});
