import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeGet, safeSet } from '../src/lib/storage';

afterEach(() => vi.restoreAllMocks());

describe('safe storage', () => {
  it('round-trips a value', () => {
    safeSet('k', 'v');
    expect(safeGet('k')).toBe('v');
  });

  it('returns null instead of throwing when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(safeGet('k')).toBeNull();
  });

  it('does not throw when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => safeSet('k', 'v')).not.toThrow();
  });
});
