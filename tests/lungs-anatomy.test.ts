import { describe, expect, it } from 'vitest';
import { lobeAt, lungField, LUNG_OPTS } from '../src/models/lungs/field';
import { buildTree } from '../src/models/lungs/tree';
import { GROUP_OF, LUNG_GROUPS } from '../src/models/lungs/anatomy';
import legkie from '../src/content/ru/legkie';

describe('lungs anatomy', () => {
  it('puts the right lung on the viewer-left (x < 0) with three lobes, the left with two', () => {
    expect(lobeAt(-1.3, 0.5, 0).lobe).toBe('ru');
    expect(lobeAt(-1.5, -0.4, 0.6).lobe).toBe('rm');
    expect(lobeAt(-1.4, -0.8, -0.8).lobe).toBe('rl');
    expect(lobeAt(1.3, 0.5, 0).lobe).toBe('lu');
    expect(lobeAt(1.4, -0.8, -0.8).lobe).toBe('ll');
    expect(lungField(1, -1.3, 0.5, 0, LUNG_OPTS)).toBeGreaterThan(0);
  });

  it('keeps the heart out of the lungs (cardiac impression)', () => {
    expect(lobeAt(0.6, -0.8, 0.4).lobe).toBeNull();
  });

  it('grows a deterministic bronchial tree down to terminal bronchioles', () => {
    const a = buildTree();
    const b = buildTree();
    expect(a.branches.length).toBe(b.branches.length);
    expect(a.branches.length).toBeGreaterThan(2000);
    expect(a.tips.length).toBeGreaterThan(1000);
    const trachea = a.branches[0];
    expect(trachea.part).toBe('trachea');
    expect(trachea.r0).toBeGreaterThan(a.branches[1].r0);
    expect(a.arteries.length).toBeGreaterThan(300);
    expect(a.veins.length).toBeGreaterThan(300);
  });

  it('lists every content part in a group', () => {
    for (const p of legkie.parts) expect(GROUP_OF[p.id], p.id).toBeDefined();
    expect(Object.keys(LUNG_GROUPS)).toEqual((legkie.groups ?? []).map((g) => g.id));
  });
});
