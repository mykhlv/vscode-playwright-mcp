import { describe, it, expect } from 'vitest';
import { normalizeKeyCombo, validateKeyCombo } from '../../src/utils/key-mapping.js';

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
});

describe('validateKeyCombo', () => {
  it('returns null for valid combos', () => {
    expect(validateKeyCombo('Control+Shift+p')).toBeNull();
    expect(validateKeyCombo('F2')).toBeNull();
    expect(validateKeyCombo('a')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateKeyCombo('')).not.toBeNull();
  });

  it('returns error for combos with empty parts', () => {
    expect(validateKeyCombo('Control+')).not.toBeNull();
    expect(validateKeyCombo('+p')).not.toBeNull();
    expect(validateKeyCombo('Control++p')).not.toBeNull();
  });
});
