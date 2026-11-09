import { describe, expect, it } from 'vitest';
import { buildFemale, makeFollicleGeos } from '../src/models/female/build';
import { CUTS, endometriumThickness, ENDO_MAX, ENDO_MIN, follicleScale, FOLLICLES, phaseOf } from '../src/models/female/anatomy';
import { blob, sliceSolid } from '../src/models/female/geometry';
import { FEMALE_PART_IDS, FEMALE_GROUPS } from '../src/models/female/parts';

describe('женская репродуктивная система: геометрия', () => {
  const t0 = performance.now();
  const G = buildFemale();
  const built = performance.now() - t0;

  it('строится быстро и без NaN', () => {
    expect(built).toBeLessThan(6000);
    for (const [id, defs] of Object.entries(G)) {
      for (const d of defs) {
        const p = d.g.getAttribute('position').array as Float32Array;
        for (let i = 0; i < p.length; i += 997) expect(Number.isFinite(p[i]), `${id} position`).toBe(true);
        const n = d.g.getAttribute('normal').array as Float32Array;
        for (let i = 0; i < n.length; i += 331) expect(Number.isFinite(n[i]), `${id} normal`).toBe(true);
      }
    }
  });

  it('у каждой части с моделью есть геометрия (кроме фолликулярных и яйцеклетки)', () => {
    const dynamic = new Set(['follicle-primary', 'follicle-secondary', 'follicle-antral', 'follicle-graafian', 'oocyte', 'corpus-luteum', 'corpus-albicans']);
    for (const id of FEMALE_PART_IDS) if (!dynamic.has(id)) expect(G[id].length, id).toBeGreaterThan(0);
  });

  it('части сгруппированы без повторов', () => {
    const all = Object.values(FEMALE_GROUPS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('срез шара даёт круг нужной площади', () => {
    const g = blob([1, 2, 3], [2, 2, 2], { detail: 40 });
    const cap = sliceSolid(g.getAttribute('position').array, g.getIndex()!.array, 1, 2.5);
    expect(cap).not.toBeNull();
    const p = cap!.position, ix = cap!.index;
    let a = 0;
    for (let i = 0; i < ix.length; i += 3) {
      const [x0, z0] = [p[ix[i] * 3], p[ix[i] * 3 + 2]], [x1, z1] = [p[ix[i + 1] * 3], p[ix[i + 1] * 3 + 2]], [x2, z2] = [p[ix[i + 2] * 3], p[ix[i + 2] * 3 + 2]];
      a += Math.abs((x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0)) / 2;
    }
    const r2 = 4 - 0.25;
    expect(a).toBeGreaterThan(Math.PI * r2 * 0.97);
    expect(a).toBeLessThan(Math.PI * r2 * 1.01);
  });

  it('срез матки по сагиттальной плоскости и стенка с просветом дают контуры', () => {
    const myo = G.myometrium[1].g;
    const cap = sliceSolid(myo.getAttribute('position').array, myo.getIndex()!.array, 0, 0.0);
    expect(cap).not.toBeNull();
    expect(cap!.index.length).toBeGreaterThan(30);
    const endo = G.endometrium[0].g;
    const cap2 = sliceSolid(endo.getAttribute('position').array, endo.getIndex()!.array, 2, 0.3);
    expect(cap2).not.toBeNull();
  });

  it('диапазоны срезов покрывают матку', () => {
    expect(CUTS.side.min).toBeLessThan(0);
    expect(CUTS.fundus.max).toBeGreaterThan(5.3);
  });

  it('цикл: эндометрий тоньше в менструацию и толще после овуляции', () => {
    expect(endometriumThickness(0.02)).toBeCloseTo(ENDO_MIN, 1);
    expect(endometriumThickness(0.8)).toBeGreaterThan(ENDO_MAX * 0.85);
    expect(endometriumThickness(0.99)).toBeLessThan(endometriumThickness(0.8));
  });

  it('цикл: фолликул растёт до овуляции, после неё появляется жёлтое тело', () => {
    const gr = FOLLICLES.find((f) => f.id === 'a-graafian')!;
    const cl = FOLLICLES.find((f) => f.id === 'a-luteum')!;
    expect(follicleScale(gr, 0.4)).toBeGreaterThan(follicleScale(gr, 0.1));
    expect(follicleScale(gr, 0.7)).toBeLessThan(0.01);
    expect(follicleScale(cl, 0.3)).toBeLessThan(0.01);
    expect(follicleScale(cl, 0.7)).toBeGreaterThan(0.5);
    expect(phaseOf(42)).toBeCloseTo(0, 5);
  });

  it('шаблоны фолликулов строятся', () => {
    const g = makeFollicleGeos();
    expect(g.smooth.getAttribute('position').count).toBeGreaterThan(100);
  });
});
