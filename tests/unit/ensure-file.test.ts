/**
 * Unit tests for vscode_ensure_file tool.
 * Tests isFileMatch as a pure function and GET_ACTIVE_FILE_SCRIPT structure.
 */

import { describe, it, expect } from 'vitest';
import { isFileMatch, handleEnsureFile } from '../../src/tools/file.js';

describe('isFileMatch', () => {
  it('returns false for null activeFile', () => {
    expect(isFileMatch(null, 'src/index.ts')).toBe(false);
  });

  it('matches exact basename', () => {
    expect(isFileMatch('index.ts', 'src/index.ts')).toBe(true);
  });

  it('matches basename from absolute path', () => {
    expect(isFileMatch('index.ts', '/Users/me/project/src/index.ts')).toBe(true);
  });

  it('matches basename from Windows path', () => {
    expect(isFileMatch('index.ts', 'C:\\Users\\me\\project\\src\\index.ts')).toBe(true);
  });

  it('matches disambiguated tab format "filename - folder"', () => {
    expect(isFileMatch('index.ts - src', 'src/index.ts')).toBe(true);
  });

  it('does not false-positive on similar prefixes', () => {
    // index.tsx should NOT match when looking for index.ts
    expect(isFileMatch('index.tsx', 'src/index.ts')).toBe(false);
  });

  it('does not false-positive on substring matches', () => {
    expect(isFileMatch('app.json', 'src/app.js')).toBe(false);
  });

  it('matches plain filename without directory', () => {
    expect(isFileMatch('README.md', 'README.md')).toBe(true);
  });

  it('returns false for completely different filename', () => {
    expect(isFileMatch('main.scss', 'src/index.ts')).toBe(false);
  });

  it('returns false for empty string activeFile', () => {
    expect(isFileMatch('', 'src/index.ts')).toBe(false);
  });
});

describe('handleEnsureFile', () => {
  it('is exported as a function', () => {
    expect(typeof handleEnsureFile).toBe('function');
  });

  it('returns early if file is already active', async () => {
    const mockPage = {
      evaluate: async () => 'index.ts',
      keyboard: { press: async () => {}, type: async () => {} },
      waitForTimeout: async () => {},
    };
    const mockSession = {
      getPage: () => mockPage,
    };

    const result = await handleEnsureFile(mockSession as any, { path: 'src/index.ts' });
    expect(result.type).toBe('text');
    expect((result as any).text).toContain('already active');
  });

  it('throws on empty path', async () => {
    const mockSession = {
      getPage: () => ({}),
    };
    await expect(handleEnsureFile(mockSession as any, { path: '' })).rejects.toThrow(
      /non-empty string/,
    );
  });
});
