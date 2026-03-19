import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveVSCodePath } from '../../src/session/vscode-launcher.js';
import { ToolError } from '../../src/types/errors.js';

// Mock fs.existsSync for controlled testing
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    default: { ...actual, existsSync: vi.fn() },
  };
});

import { existsSync } from 'node:fs';
const mockExistsSync = vi.mocked(existsSync);

describe('resolveVSCodePath', () => {
  const originalEnv = process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'];
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'];
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    if (originalEnv !== undefined) {
      process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'] = originalEnv;
    } else {
      delete process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'];
    }
  });

  it('uses explicit path when provided and exists', () => {
    mockExistsSync.mockReturnValue(true);
    expect(resolveVSCodePath('/custom/path/code')).toBe('/custom/path/code');
  });

  it('throws when explicit path does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => resolveVSCodePath('/nonexistent/code')).toThrow(ToolError);
    expect(() => resolveVSCodePath('/nonexistent/code')).toThrow('does not exist');
  });

  it('uses environment variable when set and path exists', () => {
    process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'] = '/env/vscode/code';
    mockExistsSync.mockReturnValue(true);
    expect(resolveVSCodePath()).toBe('/env/vscode/code');
  });

  it('throws when environment variable path does not exist', () => {
    process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'] = '/env/nonexistent/code';
    mockExistsSync.mockReturnValue(false);
    expect(() => resolveVSCodePath()).toThrow(ToolError);
    expect(() => resolveVSCodePath()).toThrow('VSCODE_PLAYWRIGHT_VSCODE_PATH');
  });

  it('falls back to platform detection', () => {
    // First call returns false (no well-known path matches), then second returns true
    mockExistsSync
      .mockReturnValueOnce(false)  // first candidate
      .mockReturnValueOnce(true);  // second candidate

    const result = resolveVSCodePath();
    // Should return whichever well-known path exists
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('throws VSCODE_NOT_FOUND when no paths exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => resolveVSCodePath()).toThrow(ToolError);
  });

  it('prefers explicit path over env var', () => {
    process.env['VSCODE_PLAYWRIGHT_VSCODE_PATH'] = '/env/vscode';
    mockExistsSync.mockReturnValue(true);
    expect(resolveVSCodePath('/explicit/vscode')).toBe('/explicit/vscode');
  });
});
