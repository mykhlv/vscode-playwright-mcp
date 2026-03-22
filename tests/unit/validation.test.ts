import { describe, it, expect } from 'vitest';
import {
  validateCoordinates,
  validateNonEmptyString,
  validateQuality,
  validateRegion,
  validateClickCount,
  validateScrollAmount,
} from '../../src/utils/validation.js';
import { ToolError } from '../../src/types/errors.js';

describe('validateCoordinates', () => {
  const viewport = { width: 1280, height: 720 };

  it('accepts valid coordinates', () => {
    expect(() => validateCoordinates(0, 0, viewport)).not.toThrow();
    expect(() => validateCoordinates(640, 360, viewport)).not.toThrow();
    expect(() => validateCoordinates(1279, 719, viewport)).not.toThrow();
  });

  it('rejects negative coordinates', () => {
    expect(() => validateCoordinates(-1, 0, viewport)).toThrow(ToolError);
    expect(() => validateCoordinates(0, -1, viewport)).toThrow(ToolError);
  });

  it('rejects coordinates at or beyond viewport edge', () => {
    expect(() => validateCoordinates(1280, 0, viewport)).toThrow(ToolError);
    expect(() => validateCoordinates(0, 720, viewport)).toThrow(ToolError);
    expect(() => validateCoordinates(1281, 0, viewport)).toThrow(ToolError);
    expect(() => validateCoordinates(0, 721, viewport)).toThrow(ToolError);
  });

  it('rejects non-finite coordinates', () => {
    expect(() => validateCoordinates(NaN, 0, viewport)).toThrow(ToolError);
    expect(() => validateCoordinates(0, Infinity, viewport)).toThrow(ToolError);
  });

  it('includes viewport dimensions in error message', () => {
    try {
      validateCoordinates(1500, 900, viewport);
      expect.fail('Should have thrown ToolError');
    } catch (e) {
      expect((e as ToolError).actionable).toContain('1280x720');
      expect((e as ToolError).code).toBe('INVALID_COORDINATES');
    }
  });
});

describe('validateNonEmptyString', () => {
  it('accepts non-empty strings', () => {
    expect(() => validateNonEmptyString('hello', 'text')).not.toThrow();
  });

  it('rejects empty strings', () => {
    expect(() => validateNonEmptyString('', 'text')).toThrow(ToolError);
  });

  it('rejects non-string values', () => {
    expect(() => validateNonEmptyString(undefined, 'text')).toThrow(ToolError);
    expect(() => validateNonEmptyString(null, 'text')).toThrow(ToolError);
    expect(() => validateNonEmptyString(42, 'text')).toThrow(ToolError);
  });
});

describe('validateQuality', () => {
  it('accepts undefined (use default)', () => {
    expect(() => validateQuality(undefined)).not.toThrow();
  });

  it('accepts valid quality values', () => {
    expect(() => validateQuality(1)).not.toThrow();
    expect(() => validateQuality(50)).not.toThrow();
    expect(() => validateQuality(100)).not.toThrow();
  });

  it('rejects out-of-range values', () => {
    expect(() => validateQuality(0)).toThrow(ToolError);
    expect(() => validateQuality(101)).toThrow(ToolError);
  });

  it('rejects non-integer values', () => {
    expect(() => validateQuality(50.5)).toThrow(ToolError);
  });
});

describe('validateRegion', () => {
  const viewport = { width: 1280, height: 720 };

  it('accepts undefined', () => {
    expect(() => validateRegion(undefined, viewport)).not.toThrow();
  });

  it('accepts valid regions', () => {
    expect(() => validateRegion({ x: 0, y: 0, width: 100, height: 100 }, viewport)).not.toThrow();
    expect(() => validateRegion({ x: 0, y: 0, width: 1280, height: 720 }, viewport)).not.toThrow();
  });

  it('rejects regions with non-positive dimensions', () => {
    expect(() => validateRegion({ x: 0, y: 0, width: 0, height: 100 }, viewport)).toThrow(ToolError);
    expect(() => validateRegion({ x: 0, y: 0, width: 100, height: -1 }, viewport)).toThrow(ToolError);
  });

  it('rejects regions with non-finite values', () => {
    expect(() => validateRegion({ x: NaN, y: 0, width: 100, height: 100 }, viewport)).toThrow(ToolError);
    expect(() => validateRegion({ x: 0, y: 0, width: Infinity, height: 100 }, viewport)).toThrow(ToolError);
  });

  it('rejects regions that exceed viewport', () => {
    expect(() => validateRegion({ x: 1200, y: 0, width: 100, height: 100 }, viewport)).toThrow(ToolError);
    expect(() => validateRegion({ x: 0, y: 700, width: 100, height: 100 }, viewport)).toThrow(ToolError);
  });
});

describe('validateClickCount', () => {
  it('accepts undefined and valid counts', () => {
    expect(() => validateClickCount(undefined)).not.toThrow();
    expect(() => validateClickCount(1)).not.toThrow();
    expect(() => validateClickCount(2)).not.toThrow();
    expect(() => validateClickCount(3)).not.toThrow();
  });

  it('rejects invalid counts', () => {
    expect(() => validateClickCount(0)).toThrow(ToolError);
    expect(() => validateClickCount(4)).toThrow(ToolError);
    expect(() => validateClickCount(1.5)).toThrow(ToolError);
  });
});

describe('validateScrollAmount', () => {
  it('accepts undefined (use default)', () => {
    expect(() => validateScrollAmount(undefined)).not.toThrow();
  });

  it('accepts valid amounts', () => {
    expect(() => validateScrollAmount(1)).not.toThrow();
    expect(() => validateScrollAmount(3)).not.toThrow();
    expect(() => validateScrollAmount(50)).not.toThrow();
    expect(() => validateScrollAmount(100)).not.toThrow();
  });

  it('rejects zero and negative amounts', () => {
    expect(() => validateScrollAmount(0)).toThrow(ToolError);
    expect(() => validateScrollAmount(-1)).toThrow(ToolError);
  });

  it('rejects amounts above 100', () => {
    expect(() => validateScrollAmount(101)).toThrow(ToolError);
  });

  it('rejects non-finite amounts', () => {
    expect(() => validateScrollAmount(NaN)).toThrow(ToolError);
    expect(() => validateScrollAmount(Infinity)).toThrow(ToolError);
  });
});
