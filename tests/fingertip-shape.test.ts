import { describe, expect, it } from 'vitest';
import { buildScene } from '../src/models/hair/build';
import { insideFinger, nailPlate, plateBottom, plateHW, plateTop, sectionTop } from '../src/models/hair/fingertip';

/** Ложе и матрикс лежат прямо под пластинкой — это тоже внутри пальца. */
const underPlate = (x: number, y: number, z: number) =>
  x > nailPlate.x0 - 0.3 && x < nailPlate.bodyEnd + 0.3 && Math.abs(z) < plateHW(x) - 0.05 && y < plateBottom(x, z) + 0.005;

// ткани, которые по анатомии лежат на поверхности или выходят из среза основания
const SURFACE = new Set([
  'finger-skin', 'proximal-fold', 'lateral-folds', 'fingerprint',
  'nail-dorsal', 'nail-root', 'lunula', 'nail-body', 'free-edge', 'nail-ventral', 'onychodermal-band', 'nail-ridges',
  'eponychium', 'nail-cuticle', 'hyponychium',
]);

describe('fingertip shape', () => {
  it('keeps every inner tissue inside the skin', () => {
    const { parts } = buildScene('nail');
    const outside: string[] = [];
    for (const [id, defs] of Object.entries(parts)) {
      if (SURFACE.has(id)) continue;
      let bad = 0;
      let total = 0;
      for (const d of defs) {
        if (d.longitudinalFace) continue;
        const p = d.g.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          if (x < -13.7) continue; // срез у основания модели
          total++;
          if (!insideFinger(x, p.getY(i), p.getZ(i), 0.02) && !underPlate(x, p.getY(i), p.getZ(i))) bad++;
        }
      }
      if (bad > total * 0.002) outside.push(`${id}: ${bad}/${total}`);
    }
    expect(outside).toEqual([]);
  }, 120000);

  it('follows the finger curvature with a symmetric plate', () => {
    for (const x of [12, 16, 20]) {
      const w = plateHW(x);
      expect(plateTop(x, w * 0.7)).toBeCloseTo(plateTop(x, -w * 0.7), 6);
      // пластинка лежит над тылом пальца, но не парит над ним
      expect(plateTop(x, 0) - sectionTop(x, 0)).toBeGreaterThan(0.05);
      expect(plateTop(x, 0) - sectionTop(x, 0)).toBeLessThan(0.4);
    }
    expect(nailPlate.x1).toBeGreaterThan(nailPlate.bodyEnd);
  });
});
