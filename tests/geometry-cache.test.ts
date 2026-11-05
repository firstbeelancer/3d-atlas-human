import { describe, expect, it } from 'vitest';
import { blobGeometry, type BlobShape } from '../src/three/geometry';

describe('blobGeometry', () => {
  it('reuses one geometry per shape so toggling a cutaway does not allocate new GPU buffers', () => {
    const shape: BlobShape = { taper: 0.3, power: 0.7, sx: 1, sy: 1.2, sz: 0.6 };
    const a = blobGeometry(shape);
    const b = blobGeometry(shape);
    expect(b).toBe(a);
  });

  it('builds different geometry for different shapes', () => {
    const a = blobGeometry({ taper: 0.3, power: 0.7, sx: 1, sy: 1, sz: 1 });
    const b = blobGeometry({ taper: 0.5, power: 0.7, sx: 1, sy: 1, sz: 1 });
    expect(b).not.toBe(a);
  });
});
