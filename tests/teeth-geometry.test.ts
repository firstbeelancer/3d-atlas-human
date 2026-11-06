import { describe, expect, it } from 'vitest';
import { crown, root, TYPES, DIMENSIONS, crownHeight } from '../src/models/teeth/geometry';

describe('permanent upper teeth geometry', () => {
  for (const kind of TYPES) for (const cut of [false, true]) {
    it(`${kind}: finite indexed surfaces, cut=${cut}`, () => {
      const geometries=[crown(kind,1,cut), ...DIMENSIONS[kind].roots.map((_,i)=>root(kind,i,1,cut))];
      for(const g of geometries) {
        const positions=g.getAttribute('position');
        expect(positions.count).toBeGreaterThan(6000);
        expect(g.index!.count).toBeGreaterThan(30000);
        for(const value of positions.array) expect(Number.isFinite(value)).toBe(true);
        for(const value of g.getAttribute('normal').array) expect(Number.isFinite(value)).toBe(true);
        g.computeBoundingBox();
        expect(g.boundingBox!.max.y-g.boundingBox!.min.y).toBeGreaterThan(0.5);
        g.dispose();
      }
    });
  }
  it('distinguishes cutting, tearing and chewing surfaces', () => {
    expect(crownHeight('canine',0,0)).toBeGreaterThan(crownHeight('canine',0.8,0));
    expect(crownHeight('molar',0.44,0.47)).toBeGreaterThan(crownHeight('molar',0,0));
    expect(DIMENSIONS.incisor.roots).toHaveLength(1);
    expect(DIMENSIONS.canine.roots).toHaveLength(1);
    expect(DIMENSIONS.premolar.roots).toHaveLength(2);
    expect(DIMENSIONS.molar.roots).toHaveLength(3);
  });
});
