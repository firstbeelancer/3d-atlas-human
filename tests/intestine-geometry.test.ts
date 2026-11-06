import { describe, expect, it } from 'vitest';
import { buildIntestine, triangleCount } from '../src/models/intestine/build';
import {
  COLON_MARKS,
  SMALL_MARKS,
  colonBaseR,
  colonOuterR,
  colonPath,
  plicaDepth,
  smallBaseR,
  smallPath,
  WALL_COLON,
  WALL_SMALL,
} from '../src/models/intestine/anatomy';
import { INTESTINE_PART_IDS, MACRO_PART_IDS } from '../src/models/intestine/parts';

describe('intestine anatomy', () => {
  it('orders colon landmarks from the caecum to the anus', () => {
    const m = COLON_MARKS;
    const order = [m.start, m.icLevel, m.ascEnd, m.hepEnd, m.transEnd, m.splEnd, m.sigStart, m.rectoSigmoid, m.anorectal, m.anus];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });

  it('orders small bowel landmarks and keeps lengths in a sensible ratio', () => {
    const m = SMALL_MARKS;
    expect(m.start).toBeLessThan(m.bulb);
    expect(m.bulb).toBeLessThan(m.papilla);
    expect(m.papilla).toBeLessThan(m.dj);
    expect(m.dj).toBeLessThan(m.jejEnd);
    expect(m.jejEnd).toBeLessThan(m.end);
    expect(smallPath.len).toBeGreaterThan(colonPath.len);
  });

  it('never lets the wall layers swallow the lumen', () => {
    const sSum = WALL_SMALL.reduce((a, b) => a + b, 0);
    const cSum = WALL_COLON.reduce((a, b) => a + b, 0);
    for (let i = 0; i < smallPath.n; i += 7) {
      for (let k = 0; k < 8; k++) expect(smallBaseR(i) - sSum - plicaDepth(i, (k / 8) * Math.PI * 2)).toBeGreaterThan(0.04);
    }
    for (let i = 40; i < colonPath.n; i += 5) {
      for (let k = 0; k < 8; k++) {
        const r = colonOuterR(i, (k / 8) * Math.PI * 2);
        expect(r).toBeGreaterThan(0.2);
        expect(r - cSum * Math.min(1, r / colonBaseR(i)) - colonBaseR(i) * 0.1).toBeGreaterThan(0.02);
      }
    }
  });
});

describe('intestine geometry', () => {
  const G = buildIntestine();

  it('builds geometry for every macro part and none for the microscope-only ones', () => {
    for (const id of MACRO_PART_IDS) {
      if (id === 'chyme') continue; // порции химуса рисуются отдельным компонентом
      expect(G[id].length, id).toBeGreaterThan(0);
    }
    for (const id of INTESTINE_PART_IDS.filter((x) => !MACRO_PART_IDS.includes(x))) expect(G[id]).toEqual([]);
  });

  it('keeps every vertex finite and the triangle budget under control', () => {
    for (const [id, defs] of Object.entries(G)) {
      for (const d of defs) {
        const pos = d.g.getAttribute('position').array as Float32Array;
        for (let i = 0; i < pos.length; i += 97) expect(Number.isFinite(pos[i]), id).toBe(true);
      }
    }
    expect(triangleCount(G)).toBeLessThan(330_000);
  });

  it('gives the small bowel peristalsis attributes and the colon none', () => {
    expect(G.jejunum[0].g.getAttribute('aC')).toBeDefined();
    expect(G.jejunum[0].g.getAttribute('aS')).toBeDefined();
    expect(G.ascending[0].g.getAttribute('aC')).toBeUndefined();
  });

  it('marks inner layers so they are hidden until needed', () => {
    for (const id of ['muscularis', 'submucosa', 'mucosa', 'feces', 'haustra']) for (const d of G[id]) expect(d.inner, id).toBe(true);
    for (const d of G.jejunum) expect(d.inner).toBeFalsy();
  });
});
