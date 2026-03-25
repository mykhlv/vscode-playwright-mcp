/**
 * Unit tests for editor tool handlers (vscode_get_text, vscode_editor_insert, vscode_get_diagnostics).
 */

import { describe, it, expect, vi } from 'vitest';
import { handleGetText, handleEditorInsert, handleGetDiagnostics } from '../../src/tools/editor.js';
import type { SessionManager } from '../../src/session/session-manager.js';
import type { HelperClient } from '../../src/helper-client.js';
import { ToolError } from '../../src/types/errors.js';

function createMockSession(client: Partial<HelperClient> | null): SessionManager {
  return {
    getHelperClient: () => client as HelperClient | null,
  } as unknown as SessionManager;
}

describe('handleGetText', () => {
  it('returns formatted text result from helper client', async () => {
    const session = createMockSession({
      getText: vi.fn().mockResolvedValue({
        text: 'const x = 1;',
        uri: 'file:///src/index.ts',
        fileName: '/src/index.ts',
        languageId: 'typescript',
        lineCount: 1,
      }),
    });

    const result = await handleGetText(session, {});
    expect(result.type).toBe('text');
    const text = (result as { text: string }).text;
    expect(text).toContain('File: /src/index.ts');
    expect(text).toContain('Language: typescript');
    expect(text).toContain('const x = 1;');
  });

  it('passes uri parameter to helper client', async () => {
    const getText = vi.fn().mockResolvedValue({
      text: '',
      uri: 'file:///other.ts',
      fileName: '/other.ts',
      languageId: 'typescript',
      lineCount: 0,
    });
    const session = createMockSession({ getText });

    await handleGetText(session, { uri: 'file:///other.ts' });
    expect(getText).toHaveBeenCalledWith('file:///other.ts');
  });

  it('throws when helper client is not available', async () => {
    const session = createMockSession(null);

    await expect(handleGetText(session, {})).rejects.toThrow(ToolError);
    try {
      await handleGetText(session, {});
    } catch (err) {
      expect((err as ToolError).actionable).toContain('Helper extension is not available');
    }
  });
});

describe('handleEditorInsert', () => {
  it('inserts text at cursor position', async () => {
    const editorInsert = vi.fn().mockResolvedValue(undefined);
    const session = createMockSession({ editorInsert });

    const result = await handleEditorInsert(session, { text: 'hello' });
    expect(result.type).toBe('text');
    expect((result as { text: string }).text).toContain('5 characters');
    expect((result as { text: string }).text).toContain('at cursor position');
    expect(editorInsert).toHaveBeenCalledWith('hello', undefined);
  });

  it('inserts text at specific position', async () => {
    const editorInsert = vi.fn().mockResolvedValue(undefined);
    const session = createMockSession({ editorInsert });

    const result = await handleEditorInsert(session, { text: 'hi', line: 5, character: 10 });
    expect((result as { text: string }).text).toContain('at line 5, character 10');
    expect(editorInsert).toHaveBeenCalledWith('hi', { line: 5, character: 10 });
  });

  it('defaults character to 0 when line is provided without character', async () => {
    const editorInsert = vi.fn().mockResolvedValue(undefined);
    const session = createMockSession({ editorInsert });

    const result = await handleEditorInsert(session, { text: 'x', line: 3 });
    expect((result as { text: string }).text).toContain('at line 3, character 0');
    expect(editorInsert).toHaveBeenCalledWith('x', { line: 3, character: 0 });
  });

  it('throws when helper client is not available', async () => {
    const session = createMockSession(null);
    await expect(handleEditorInsert(session, { text: 'x' })).rejects.toThrow(ToolError);
  });
});

describe('handleGetDiagnostics', () => {
  it('formats diagnostics as structured text', async () => {
    const getDiagnostics = vi.fn().mockResolvedValue([
      {
        uri: 'file:///src/index.ts',
        range: { start: { line: 4, character: 2 }, end: { line: 4, character: 10 } },
        message: 'Cannot find name "foo"',
        severity: 'Error',
        source: 'ts',
        code: 2304,
      },
    ]);
    const session = createMockSession({ getDiagnostics });

    const result = await handleGetDiagnostics(session, {});
    const text = (result as { text: string }).text;
    expect(text).toContain('Diagnostics (1)');
    expect(text).toContain('Error');
    expect(text).toContain('Cannot find name "foo"');
    expect(text).toContain('[ts]');
    expect(text).toContain('(2304)');
    // Line numbers should be 1-based in output
    expect(text).toContain(':5:3');
  });

  it('returns "No diagnostics found" when empty', async () => {
    const getDiagnostics = vi.fn().mockResolvedValue([]);
    const session = createMockSession({ getDiagnostics });

    const result = await handleGetDiagnostics(session, {});
    expect((result as { text: string }).text).toContain('No diagnostics found');
  });

  it('passes uri and severity filters to helper client', async () => {
    const getDiagnostics = vi.fn().mockResolvedValue([]);
    const session = createMockSession({ getDiagnostics });

    await handleGetDiagnostics(session, { uri: 'file:///test.ts', severity: 'error' });
    expect(getDiagnostics).toHaveBeenCalledWith('file:///test.ts', 'error');
  });

  it('throws when helper client is not available', async () => {
    const session = createMockSession(null);
    await expect(handleGetDiagnostics(session, {})).rejects.toThrow(ToolError);
  });
});
