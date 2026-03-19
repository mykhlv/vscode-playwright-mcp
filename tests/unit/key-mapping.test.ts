import { describe, it, expect } from 'vitest';
import { normalizeKeyCombo, validateKeyCombo, isKnownKey } from '../../src/utils/key-mapping.js';

describe('normalizeKeyCombo', () => {
  it('passes through already-valid combos', () => {
    expect(normalizeKeyCombo('Control+Shift+p')).toBe('Control+Shift+p');
    expect(normalizeKeyCombo('Meta+b')).toBe('Meta+b');
    expect(normalizeKeyCombo('F2')).toBe('F2');
    expect(normalizeKeyCombo('Escape')).toBe('Escape');
    expect(normalizeKeyCombo('Enter')).toBe('Enter');
  });

  it('normalizes common aliases', () => {
    expect(normalizeKeyCombo('Ctrl+Shift+p')).toBe('Control+Shift+p');
    expect(normalizeKeyCombo('Cmd+b')).toBe('Meta+b');
    expect(normalizeKeyCombo('Command+Shift+p')).toBe('Meta+Shift+p');
    expect(normalizeKeyCombo('Esc')).toBe('Escape');
    expect(normalizeKeyCombo('Del')).toBe('Delete');
    expect(normalizeKeyCombo('Option+a')).toBe('Alt+a');
  });

  it('normalizes arrow key aliases', () => {
    expect(normalizeKeyCombo('Up')).toBe('ArrowUp');
    expect(normalizeKeyCombo('Down')).toBe('ArrowDown');
    expect(normalizeKeyCombo('Left')).toBe('ArrowLeft');
    expect(normalizeKeyCombo('Right')).toBe('ArrowRight');
  });

  it('normalizes case-insensitively for named keys', () => {
    expect(normalizeKeyCombo('escape')).toBe('Escape');
    expect(normalizeKeyCombo('enter')).toBe('Enter');
    expect(normalizeKeyCombo('tab')).toBe('Tab');
  });

  it('handles single character keys', () => {
    expect(normalizeKeyCombo('a')).toBe('a');
    expect(normalizeKeyCombo('Control+a')).toBe('Control+a');
  });

  it('handles function keys', () => {
    expect(normalizeKeyCombo('F1')).toBe('F1');
    expect(normalizeKeyCombo('F12')).toBe('F12');
  });

  it('normalizes page key aliases', () => {
    expect(normalizeKeyCombo('PgUp')).toBe('PageUp');
    expect(normalizeKeyCombo('PgDn')).toBe('PageDown');
    expect(normalizeKeyCombo('PgDown')).toBe('PageDown');
  });

  it('normalizes aliases case-insensitively', () => {
    expect(normalizeKeyCombo('ctrl+a')).toBe('Control+a');
    expect(normalizeKeyCombo('cmd+b')).toBe('Meta+b');
    expect(normalizeKeyCombo('esc')).toBe('Escape');
  });
});

describe('validateKeyCombo', () => {
  it('returns null for valid combos', () => {
    expect(validateKeyCombo('Control+Shift+p')).toBeNull();
    expect(validateKeyCombo('F2')).toBeNull();
    expect(validateKeyCombo('a')).toBeNull();
    expect(validateKeyCombo('Meta+b')).toBeNull();
    expect(validateKeyCombo('Escape')).toBeNull();
  });

  it('returns null for valid alias combos', () => {
    expect(validateKeyCombo('Ctrl+Shift+p')).toBeNull();
    expect(validateKeyCombo('Cmd+b')).toBeNull();
    expect(validateKeyCombo('Esc')).toBeNull();
    expect(validateKeyCombo('Option+a')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateKeyCombo('')).not.toBeNull();
  });

  it('returns error for combos with empty parts', () => {
    expect(validateKeyCombo('Control+')).not.toBeNull();
    expect(validateKeyCombo('+p')).not.toBeNull();
    expect(validateKeyCombo('Control++p')).not.toBeNull();
  });

  it('returns error for unrecognized keys', () => {
    const result = validateKeyCombo('Control+FooBar');
    expect(result).not.toBeNull();
    expect(result).toContain('Unrecognized');
    expect(result).toContain('FooBar');
  });

  it('returns error for multiple non-modifier keys', () => {
    const result = validateKeyCombo('a+b');
    expect(result).not.toBeNull();
    expect(result).toContain('multiple non-modifier');
  });

  it('allows modifier-only combos', () => {
    expect(validateKeyCombo('Control+Shift')).toBeNull();
    expect(validateKeyCombo('Alt')).toBeNull();
  });

  it('allows single digit keys', () => {
    expect(validateKeyCombo('Control+1')).toBeNull();
    expect(validateKeyCombo('5')).toBeNull();
  });

  it('allows punctuation keys', () => {
    expect(validateKeyCombo('Control+[')).toBeNull();
    expect(validateKeyCombo("'")).toBeNull();
  });
});

describe('isKnownKey', () => {
  it('recognizes standard keys', () => {
    expect(isKnownKey('Control')).toBe(true);
    expect(isKnownKey('a')).toBe(true);
    expect(isKnownKey('F1')).toBe(true);
    expect(isKnownKey('Escape')).toBe(true);
    expect(isKnownKey('Enter')).toBe(true);
  });

  it('recognizes aliases', () => {
    expect(isKnownKey('Ctrl')).toBe(true);
    expect(isKnownKey('Cmd')).toBe(true);
    expect(isKnownKey('Esc')).toBe(true);
  });

  it('recognizes case-insensitively', () => {
    expect(isKnownKey('escape')).toBe(true);
    expect(isKnownKey('ENTER')).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(isKnownKey('FooBar')).toBe(false);
    expect(isKnownKey('SuperKey')).toBe(false);
  });
});
