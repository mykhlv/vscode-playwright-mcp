/**
 * Maps human-readable key combos to Playwright key names.
 *
 * Playwright accepts key names like "Control+Shift+KeyP" or convenience names
 * like "Meta+p". This module validates key strings and normalizes common aliases.
 */

/** Keys recognized by Playwright's keyboard.press() */
const VALID_KEYS = new Set([
  // Modifiers
  'Alt', 'Control', 'Meta', 'Shift',
  // Whitespace
  'Enter', 'Tab', 'Space', 'Backspace', 'Delete',
  // Navigation
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  // Function keys
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  // Misc
  'Escape', 'Insert', 'ContextMenu',
  // Letters (Playwright accepts lowercase a-z)
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  // Digits
  ...'0123456789'.split(''),
  // Punctuation Playwright accepts
  '`', '-', '=', '[', ']', '\\', ';', '\'', ',', '.', '/',
]);

/** Common aliases people might use */
const KEY_ALIASES: Record<string, string> = {
  'Ctrl': 'Control',
  'Cmd': 'Meta',
  'Command': 'Meta',
  'Win': 'Meta',
  'Windows': 'Meta',
  'Option': 'Alt',
  'Opt': 'Alt',
  'Return': 'Enter',
  'Esc': 'Escape',
  'Del': 'Delete',
  'BS': 'Backspace',
  'Up': 'ArrowUp',
  'Down': 'ArrowDown',
  'Left': 'ArrowLeft',
  'Right': 'ArrowRight',
  'PgUp': 'PageUp',
  'PgDn': 'PageDown',
  'PgDown': 'PageDown',
};

/** Set of modifier key names after normalization */
const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift']);

/**
 * Normalize a single key part and report whether it was recognized.
 * Returns [normalizedKey, isRecognized].
 */
function normalizeKeyPart(part: string): [string, boolean] {
  const trimmed = part.trim();

  // Check alias first
  const alias = KEY_ALIASES[trimmed];
  if (alias) return [alias, true];

  // Check if it's already valid
  if (VALID_KEYS.has(trimmed)) return [trimmed, true];

  // Try case-insensitive match for single chars
  const lower = trimmed.toLowerCase();
  if (lower.length === 1 && VALID_KEYS.has(lower)) return [lower, true];

  // Try case-insensitive match for named keys
  for (const key of VALID_KEYS) {
    if (key.toLowerCase() === lower) return [key, true];
  }

  // Check aliases case-insensitively
  for (const [aliasKey, aliasValue] of Object.entries(KEY_ALIASES)) {
    if (aliasKey.toLowerCase() === lower) return [aliasValue, true];
  }

  return [trimmed, false]; // Unrecognized
}

/**
 * Normalize a key combo string like "Ctrl+Shift+P" to Playwright format "Control+Shift+p".
 */
export function normalizeKeyCombo(combo: string): string {
  const parts = combo.split('+');
  const normalized = parts.map((p) => normalizeKeyPart(p)[0]);
  return normalized.join('+');
}

/**
 * Validate that a key combo string contains only recognized keys.
 * Returns null if valid, or an error message if invalid.
 */
export function validateKeyCombo(combo: string): string | null {
  if (!combo || combo.trim().length === 0) {
    return 'Key combo must be a non-empty string.';
  }

  const parts = combo.split('+');
  if (parts.some((p) => p.trim().length === 0)) {
    return `Invalid key combo "${combo}": contains empty parts. Use format like "Control+Shift+p".`;
  }

  // Validate each part is a known key or alias
  const unrecognized: string[] = [];
  const normalizedParts: Array<{ original: string; normalized: string }> = [];

  for (const part of parts) {
    const [normalized, isRecognized] = normalizeKeyPart(part);
    normalizedParts.push({ original: part.trim(), normalized });
    if (!isRecognized) {
      unrecognized.push(part.trim());
    }
  }

  if (unrecognized.length > 0) {
    return `Unrecognized key(s): ${unrecognized.map((k) => `"${k}"`).join(', ')}. ` +
      'Valid keys: letters (a-z), digits (0-9), ' +
      'F1-F12, Enter, Tab, Space, Escape, Backspace, Delete, ' +
      'ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, ' +
      'Control, Shift, Alt, Meta. ' +
      'Common aliases: Ctrl, Cmd, Esc, Del.';
  }

  // Check that combo has at most one non-modifier key
  const nonModifiers = normalizedParts.filter((p) => !MODIFIER_KEYS.has(p.normalized));
  if (nonModifiers.length > 1) {
    return `Key combo "${combo}" has multiple non-modifier keys: ${nonModifiers.map((p) => `"${p.original}"`).join(', ')}. ` +
      'A key combo should have modifiers (Control, Shift, Alt, Meta) plus one action key.';
  }

  // A combo of only modifiers is suspicious but technically valid
  // (Playwright will press/release modifiers). Allow it.

  return null;
}

/**
 * Check if a key name (after normalization) is recognized by Playwright.
 * Exposed for unit testing.
 */
export function isKnownKey(key: string): boolean {
  return normalizeKeyPart(key)[1];
}
