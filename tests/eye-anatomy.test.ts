import { describe, expect, it } from 'vitest';
import {
  CILIARY,
  IRIS,
  LENS,
  LENS_BACK,
  LENS_FRONT,
  POSTERIOR,
  WALL,
  aqueousProfile,
  foveaPit,
  retinaRadius,
  vitreousProfile,
  dirAt,
  FOVEA_DIR,
} from '../src/models/eye/anatomy';
import { bandCap, latheGeometry, ringCapAtZ, solidCap } from '../src/models/eye/geometry';

const radius = ([r, z]: [number, number]) => Math.hypot(r, z);

describe('eye anatomy', () => {
  it('is about 24 mm from the cornea to the back of the globe', () => {
    const length = WALL.outer[WALL.count - 1][1] - WALL.outer[0][1];
    expect(length).toBeGreaterThan(23.5);
    expect(length).toBeLessThan(24.6);
  });

  it('keeps the wall thicker than the cornea centre and thinner than 1.1 mm everywhere', () => {
    for (let i = 0; i < WALL.count; i++) {
      const t = Math.hypot(WALL.outer[i][0] - WALL.inner[i][0], WALL.outer[i][1] - WALL.inner[i][1]);
      expect(t, `point ${i}`).toBeGreaterThan(0.45);
      expect(t, `point ${i}`).toBeLessThan(1.1);
    }
  });

  it('nests the layers from the sclera to the retina without crossings', () => {
    const n = POSTERIOR.choroid.outer.length;
    for (let i = 0; i < n; i++) {
      const rs = [POSTERIOR.choroid.outer[i], POSTERIOR.choroid.inner[i], POSTERIOR.rpe.inner[i], POSTERIOR.retina.inner[i]].map(radius);
      for (let k = 1; k < rs.length; k++) expect(rs[k], `layer ${k} at ${i}`).toBeLessThan(rs[k - 1]);
    }
  });

  it('makes the retina about a quarter of a millimetre to half a millimetre thick', () => {
    const t = radius(POSTERIOR.retina.outer[0]) - radius(POSTERIOR.retina.inner[0]);
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(0.6);
  });

  it('has a biconvex lens about 4 mm thick and 9 mm wide, sitting behind the iris', () => {
    expect(LENS_FRONT - LENS_BACK).toBeCloseTo(4, 1);
    expect(LENS.rEq * 2).toBeGreaterThan(8.5);
    expect(LENS.rEq * 2).toBeLessThan(10);
    expect(LENS.profile[0][0]).toBe(0);
    expect(LENS.profile[LENS.profile.length - 1][0]).toBe(0);
    expect(IRIS.front(IRIS.pupil)).toBeGreaterThan(LENS_FRONT);
  });

  it('leaves a gap between the ciliary body and the lens equator', () => {
    const tip = CILIARY.tips[CILIARY.count - 1];
    expect(tip[0] - LENS.rEq).toBeGreaterThan(0.2);
    for (const [r, z] of CILIARY.tips) {
      const d = LENS.profile.reduce((m, [lr, lz]) => Math.min(m, Math.hypot(lr - r, lz - z)), Infinity);
      expect(d).toBeGreaterThan(0.25);
    }
  });

  it('puts the iris root where the iris plane meets the ciliary body', () => {
    const tip = CILIARY.tips[CILIARY.count - 1];
    expect(Math.abs(tip[0] - IRIS.root)).toBeLessThan(0.15);
    expect(Math.abs(tip[1] - IRIS.front(IRIS.root))).toBeLessThan(0.5);
  });

  it('closes the transparent volumes on the axis', () => {
    for (const prof of [aqueousProfile(), vitreousProfile()]) {
      expect(prof.length).toBeGreaterThan(10);
      expect(Math.abs(prof[0][0])).toBeLessThan(1e-9);
    }
  });

  it('digs the fovea pit only around the fovea', () => {
    expect(foveaPit(FOVEA_DIR)).toBeGreaterThan(0.1);
    expect(foveaPit(dirAt(40, 20))).toBeLessThan(1e-6);
    expect(retinaRadius(0.1)).toBeGreaterThan(9);
    expect(retinaRadius(0.1)).toBeLessThan(10.5);
  });
});

describe('eye geometry', () => {
  it('builds lathe surfaces whose normals point outward', () => {
    const g = latheGeometry(WALL.outer.slice(0, WALL.iLimbus + 1), { segments: 32 });
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    // на экваторе склеры (середина профиля) нормаль смотрит от центра
    for (let i = 20; i < p.count; i += 331) {
      const dot = p.getX(i) * n.getX(i) + p.getY(i) * n.getY(i) + p.getZ(i) * n.getZ(i);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('flips normals for inward-facing surfaces', () => {
    const g = latheGeometry(WALL.inner.slice(0, WALL.iLimbus + 1), { segments: 32, flip: true });
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 20; i < p.count; i += 331) {
      const dot = p.getX(i) * n.getX(i) + p.getY(i) * n.getY(i) + p.getZ(i) * n.getZ(i);
      expect(dot).toBeLessThan(0);
    }
  });

  it('builds cut faces lying exactly in the cutting plane', () => {
    const side = bandCap(POSTERIOR.choroid.outer, POSTERIOR.choroid.inner);
    const sp = side.getAttribute('position');
    for (let i = 0; i < sp.count; i++) expect(sp.getY(i)).toBe(0);
    expect(solidCap(LENS.profile).getAttribute('position').count).toBeGreaterThan(10);
    const ring = ringCapAtZ(POSTERIOR.retina.outer, POSTERIOR.retina.inner, 2.5)!;
    const rp = ring.getAttribute('position');
    for (let i = 0; i < rp.count; i++) expect(rp.getZ(i)).toBe(2.5);
  });
});
