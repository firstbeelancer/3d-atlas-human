import { describe, expect, it } from 'vitest';
import { crownSurface, rootSurface, occlusalTop, TYPES, DIMENSIONS } from '../src/models/teeth/geometry';

describe('permanent upper teeth geometry', () => {
  for (const kind of TYPES) for (const cut of [false, true]) {
    it(`${kind}: dense finite indexed surfaces, cut=${cut}`, () => {
      const geometries = [
        crownSurface(kind, { cut }),
        ...DIMENSIONS[kind].roots.map((_, i) => rootSurface(kind, i, { cut })),
      ];
      for (const g of geometries) {
        const positions = g.getAttribute('position');
        expect(positions.count, kind).toBeGreaterThan(5000);
        expect(g.index!.count, kind).toBeGreaterThan(10000);
        for (const value of positions.array) expect(Number.isFinite(value)).toBe(true);
        for (const value of g.getAttribute('normal').array) expect(Number.isFinite(value)).toBe(true);
        g.computeBoundingBox();
        expect(g.boundingBox!.max.y - g.boundingBox!.min.y, kind).toBeGreaterThan(0.5);
        g.dispose();
      }
    });
  }

  it('root surfaces reach the spec length and close at the apex', () => {
    for (const kind of TYPES)
      DIMENSIONS[kind].roots.forEach((r, i) => {
        const g = rootSurface(kind, i);
        g.computeBoundingBox();
        expect(g.boundingBox!.min.y, kind).toBeLessThan(-r.len * 0.9);
        // кончик корня замкнут: верхнее кольцо не шире основания
        expect(g.boundingBox!.max.x - g.boundingBox!.min.x, kind).toBeLessThan(r.rx * 2.6);
        g.dispose();
      });
  });

  it('crown surfaces span the whole crown height', () => {
    for (const kind of TYPES) {
      const g = crownSurface(kind);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.y, kind).toBeGreaterThan(DIMENSIONS[kind].crownH * 0.9);
      expect(g.boundingBox!.min.y, kind).toBeLessThanOrEqual(0.01);
      g.dispose();
    }
  });

  it('distinguishes cutting, tearing and chewing surfaces', () => {
    expect(occlusalTop('incisor', 0, 0)).toBeGreaterThan(occlusalTop('incisor', 0, 0.85 * DIMENSIONS.incisor.d));
    expect(occlusalTop('canine', 0, 0)).toBeGreaterThan(occlusalTop('canine', 0.8 * DIMENSIONS.canine.w, 0));
    expect(occlusalTop('premolar', 0, -0.4 * DIMENSIONS.premolar.d)).toBeGreaterThan(occlusalTop('premolar', 0, 0));
    expect(occlusalTop('molar', -0.5 * DIMENSIONS.molar.w, 0.5 * DIMENSIONS.molar.d)).toBeGreaterThan(
      occlusalTop('molar', 0, 0),
    );
    expect(DIMENSIONS.incisor.roots).toHaveLength(1);
    expect(DIMENSIONS.canine.roots).toHaveLength(1);
    expect(DIMENSIONS.premolar.roots).toHaveLength(2);
    expect(DIMENSIONS.molar.roots).toHaveLength(3);
  });
});
