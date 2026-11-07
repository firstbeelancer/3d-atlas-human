import { describe, expect, it } from 'vitest';
import { buildGallbladder } from '../src/models/gallbladder/build';
import { GB_PART_IDS } from '../src/models/gallbladder/parts';

describe('gallbladder geometry', () => {
  const G = buildGallbladder();

  it('builds geometry for every part', () => {
    for (const id of GB_PART_IDS) expect(G[id]?.length, id).toBeGreaterThan(0);
  });

  it('has finite vertex positions everywhere', () => {
    for (const id of GB_PART_IDS) {
      G[id].forEach((d, i) => {
        const a = d.g.getAttribute('position').array as Float32Array;
        let bad = -1;
        for (let k = 0; k < a.length; k++) if (!Number.isFinite(a[k])) { bad = k; break; }
        expect(bad, `${id}[${i}] position NaN at ${bad}`).toBe(-1);
        const n = d.g.getAttribute('normal');
        if (n) for (let k = 0; k < n.array.length; k++) if (!Number.isFinite(n.array[k])) throw new Error(`${id}[${i}] normal NaN`);
      });
    }
  });
});

import { AXIAL_S, contraction, gbAxis, gbPoint, liverFront, radiusAt, rugaeHeight } from '../src/models/gallbladder/anatomy';

describe('gallbladder anatomy', () => {
  it('has a positive radius profile that closes at the fundus and narrows at the neck', () => {
    expect(radiusAt(0)).toBeCloseTo(0, 2);
    for (let s = 0; s <= 1; s += 0.02) expect(radiusAt(s)).toBeGreaterThanOrEqual(0);
    expect(radiusAt(0.4)).toBeGreaterThan(radiusAt(0.95));
    expect(radiusAt(0.42)).toBeGreaterThan(1);
  });

  it('keeps wall layers nested: deeper offsets are closer to the axis', () => {
    const axis = gbAxis(0.4);
    const d = (off: number) => Math.hypot(...(gbPoint(0.4, 1.0, off).map((v, i) => v - axis[i]) as [number, number, number]));
    expect(d(0)).toBeGreaterThan(d(-0.09));
    expect(d(-0.09)).toBeGreaterThan(d(-0.2));
    expect(d(-0.2)).toBeGreaterThan(d(-0.3));
    expect(d(-0.3)).toBeGreaterThan(0.2);
  });

  it('gallbladder lies on the liver surface: the liver is behind the body of the gallbladder', () => {
    const back = gbPoint(0.4, Math.PI, 0);
    expect(liverFront(back[0], back[1])).toBeLessThan(back[2] + 0.9);
    expect(AXIAL_S).toBeGreaterThan(0);
  });

  it('rugae are bounded 0..1, contraction cycles 0..1', () => {
    for (let s = 0.05; s < 0.9; s += 0.07) for (let t = 0; t < 6.3; t += 0.4) {
      const h = rugaeHeight(s, t);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
    const vals = Array.from({ length: 80 }, (_, i) => contraction(i * 0.5));
    expect(Math.min(...vals)).toBe(0);
    expect(Math.max(...vals)).toBe(1);
  });
});
