import { describe, expect, it } from 'vitest';
import { labelSide } from '../src/three/labelSide';

// плашка 120 px + выноска и точка ~44 px; сцена 480 px
describe('labelSide', () => {
  it('keeps the side towards the edge of the screen when the label fits', () => {
    expect(labelSide(300, 120, 480, false)).toBe('right');
    expect(labelSide(200, 120, 480, true)).toBe('left');
  });

  it('flips to the right when a left label would leave the stage', () => {
    expect(labelSide(60, 120, 480, true)).toBe('right');
  });

  it('flips to the left when a right label would leave the stage', () => {
    expect(labelSide(420, 120, 480, false)).toBe('left');
  });

  it('keeps the preferred side when the label does not fit either way', () => {
    expect(labelSide(100, 400, 300, true)).toBe('left');
  });
});
