import { describe, expect, it } from 'vitest';
import { frameloopFor } from '../src/three/frameloop';

describe('frameloopFor', () => {
  it('renders continuously only while visible and animating', () => {
    expect(frameloopFor(true, false)).toBe('always');
  });
  it('renders on demand (only on interaction) while paused', () => {
    expect(frameloopFor(true, true)).toBe('demand');
  });
  it('stops rendering off-screen', () => {
    expect(frameloopFor(false, false)).toBe('never');
    expect(frameloopFor(false, true)).toBe('never');
  });
});
