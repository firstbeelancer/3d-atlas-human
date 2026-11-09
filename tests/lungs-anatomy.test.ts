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

describe('arch branches and the lung apices', () => {
  it('starts the right subclavian and right carotid at the end of the brachiocephalic trunk', async () => {
    const { ARCH_BRANCHES } = await import('../src/models/lungs/field');
    const trunkEnd = ARCH_BRANCHES[0].path.at(-1)!;
    const starts = ARCH_BRANCHES.slice(1).map((b) => b.path[0]);
    const fromTrunk = starts.filter((p) => Math.hypot(p[0] - trunkEnd[0], p[1] - trunkEnd[1], p[2] - trunkEnd[2]) < 1e-6);
    expect(fromTrunk.length).toBe(2);
  });

  it('never runs an arch branch through a lung (they only groove its surface)', async () => {
    const { ARCH_BRANCHES, lungField, LUNG_OPTS } = await import('../src/models/lungs/field');
    const { CatmullRomCurve3, Vector3 } = await import('three');
    for (const br of ARCH_BRANCHES) {
      const c = new CatmullRomCurve3(br.path.map((p) => new Vector3(...p)));
      for (let i = 0; i <= 40; i++) {
        const p = c.getPointAt(i / 40);
        for (const side of [-1, 1] as const) expect(lungField(side, p.x, p.y, p.z, LUNG_OPTS), `${side} ${p.toArray()}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('lungs text accuracy', () => {
  const all = () => JSON.stringify(legkie);
  it('uses the right length of the airways (≈2 400 km, not 1 500 miles taken as km)', () => {
    expect(all()).not.toMatch(/1 500 км/);
    expect(all()).toMatch(/2 400 км/);
  });
  it('does not claim alveoli/surfactant appeared only in reptiles', () => {
    expect(all()).not.toMatch(/рептили/);
  });
  it('does not call the lungs the only floating organ', () => {
    expect(all()).not.toMatch(/единственный орган/);
  });
  it('does not say the right hilum is higher', () => {
    expect(legkie.parts.find((p) => p.id === 'hilum')!.text).not.toMatch(/Справа ворота выше/);
  });
  it('does not say lower lobes get almost no air at rest', () => {
    expect(all()).not.toMatch(/в покое почти не доходит воздух/);
  });
});
