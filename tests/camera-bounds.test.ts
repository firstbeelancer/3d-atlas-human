import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { clampTarget } from '../src/three/cameraBounds';

const min: [number, number, number] = [-1, 0, -1];
const max: [number, number, number] = [1, 18, 1];

describe('clampTarget', () => {
  it('leaves a target inside the bounds untouched', () => {
    const target = new Vector3(0.5, 16, 0);
    const camera = new Vector3(0.5, 16, 4);
    expect(clampTarget(target, camera, min, max)).toBe(false);
    expect(target.toArray()).toEqual([0.5, 16, 0]);
    expect(camera.toArray()).toEqual([0.5, 16, 4]);
  });

  it('pulls a target that left the model back to the edge', () => {
    const target = new Vector3(5, 20, 0);
    const camera = new Vector3(5, 20, 4);
    expect(clampTarget(target, camera, min, max)).toBe(true);
    expect(target.toArray()).toEqual([1, 18, 0]);
  });

  it('moves the camera by the same amount, so the view does not jump or rotate', () => {
    const target = new Vector3(0, -3, 0);
    const camera = new Vector3(1, -2, 6);
    clampTarget(target, camera, min, max);
    expect(target.toArray()).toEqual([0, 0, 0]);
    expect(camera.toArray()).toEqual([1, 1, 6]);
  });
});
