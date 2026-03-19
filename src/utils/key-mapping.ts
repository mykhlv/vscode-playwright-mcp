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
  '`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/',
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

function normalizeKeyPart(part: string): string {
  const trimmed = part.trim();
  // Check alias first
  const alias = KEY_ALIASES[trimmed];
  if (alias) return alias;

  // Check if it's already valid
  if (VALID_KEYS.has(trimmed)) return trimmed;

  // Try case-insensitive match for single chars
  const lower = trimmed.toLowerCase();
  if (lower.length === 1 && VALID_KEYS.has(lower)) return lower;

  // Try case-insensitive match for named keys
  for (const key of VALID_KEYS) {
    if (key.toLowerCase() === lower) return key;
  }

  return trimmed; // Return as-is, let Playwright handle unknown keys
}

/**
 * Normalize a key combo string like "Ctrl+Shift+P" to Playwright format "Control+Shift+p".
 * Returns the normalized string. Throws if a key part is unrecognized.
 */
export function normalizeKeyCombo(combo: string): string {
  const parts = combo.split('+');
  const normalized = parts.map(normalizeKeyPart);
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
  if (parts.some(p => p.trim().length === 0)) {
    return `Invalid key combo "${combo}": contains empty parts. Use format like "Control+Shift+p".`;
  }

  // We don't reject unknown keys strictly — Playwright can handle some we don't list
  return null;
}
