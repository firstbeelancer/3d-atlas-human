import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('findEmoji', () => {
  it('returns nothing for plain Russian text', () => {
    expect(findEmoji('Сердце бьётся')).toEqual([]);
  });

  it('finds a heart emoji with variation selector', () => {
    expect(findEmoji('Сердце ❤️')).toHaveLength(1);
  });

  it('finds an astral-plane emoji', () => {
    expect(findEmoji('\u{1F9E0} мозг')).toHaveLength(1);
  });

  it('finds text-default pictographs that phones still draw as emoji', () => {
    expect(findEmoji('❤')).toHaveLength(1);
    expect(findEmoji('✔')).toHaveLength(1);
    expect(findEmoji('☀')).toHaveLength(1);
    expect(findEmoji('✈')).toHaveLength(1);
  });

  it('allows arrows', () => {
    expect(findEmoji('↔ ↕ →')).toEqual([]);
  });

  it('does not flag typography', () => {
    expect(findEmoji('18+ · © — № ® ™ « » ≈ ×')).toEqual([]);
  });
});
