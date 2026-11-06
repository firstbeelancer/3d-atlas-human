import { describe, expect, it } from 'vitest';
import {
  ORIFICE_Y,
  PROFILE,
  WALL_OFF,
  Y_BOTTOM,
  Y_TOP,
  fillFraction,
  orificePoint,
  radiusAt,
  urineLevelY,
  wallPoint,
} from '../src/models/bladder/anatomy';
import { buildBladder } from '../src/models/bladder/build';
import { trigoneGeometry } from '../src/models/bladder/geometry';
import { BLADDER_PART_IDS } from '../src/models/bladder/parts';

describe('bladder anatomy', () => {
  it('has a pear profile: narrow neck, wide body, closed apex', () => {
    expect(radiusAt(Y_BOTTOM)).toBeCloseTo(0.4, 1);
    expect(radiusAt(Y_TOP)).toBeLessThan(0.1);
    expect(radiusAt(0.4)).toBeGreaterThan(2.9);
    expect(radiusAt(0.4)).toBeLessThan(3.1);
    // самая широкая точка — тело, не шейка и не верхушка
    let maxY = Y_BOTTOM;
    let maxR = 0;
    for (let y = Y_BOTTOM; y <= Y_TOP; y += 0.05) {
      const r = radiusAt(y);
      if (r > maxR) {
        maxR = r;
        maxY = y;
      }
    }
    expect(maxY).toBeGreaterThan(-0.6);
    expect(maxY).toBeLessThan(1.2);
    expect(PROFILE.length).toBeGreaterThanOrEqual(10);
  });

  it('is wider than deep and leans the neck forward', () => {
    const side = wallPoint(0, Math.PI / 2);
    const front = wallPoint(0, 0);
    const back = wallPoint(0, Math.PI);
    expect(side[0]).toBeCloseTo(radiusAt(0), 5);
    expect(front[2] - back[2]).toBeGreaterThan(4);
    expect(front[2] - back[2]).toBeLessThan(side[0] * 2);
    // шейка подана вперёд сильнее, чем верхушка
    expect(wallPoint(-2.9, 0)[2] - wallPoint(-2.9, Math.PI)[2]).toBeLessThan(front[2] - back[2]);
  });

  it('nests the wall layers from the serosa to the lumen without crossings', () => {
    const offs = [WALL_OFF.serosa, WALL_OFF.detrusor, WALL_OFF.submucosa, WALL_OFF.mucosa, WALL_OFF.lumen];
    for (let i = 1; i < offs.length; i++) expect(offs[i]).toBeLessThan(offs[i - 1]);
    expect(WALL_OFF.detrusor - WALL_OFF.mucosa).toBeGreaterThan(0.2);
  });

  it('puts the ureteric orifices on the posterior inner wall, apart from each other', () => {
    const r = orificePoint(1);
    const l = orificePoint(-1);
    expect(r[2]).toBeLessThan(-0.7);
    expect(l[2]).toBeLessThan(-0.7);
    expect(Math.abs(r[0] - l[0])).toBeGreaterThan(2);
    expect(r[1]).toBeCloseTo(ORIFICE_Y, 5);
    // устья внутри стенки, а не снаружи
    expect(Math.hypot(r[0], (r[2] - 0.22) / 0.84)).toBeLessThan(radiusAt(ORIFICE_Y));
  });

  it('fills and empties in a bounded cycle', () => {
    for (let t = 0; t < 120; t += 0.37) {
      const f = fillFraction(t);
      expect(f).toBeGreaterThanOrEqual(0.22);
      expect(f).toBeLessThanOrEqual(0.9);
    }
    expect(fillFraction(8)).toBeGreaterThan(fillFraction(0));
    expect(urineLevelY(0.9)).toBeGreaterThan(urineLevelY(0.22));
  });

  it('keeps the trigone on the smooth posterior wall above the neck', () => {
    const g = trigoneGeometry();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    // верхний край — на задней стенке, нижняя точка спускается к шейке и подаётся вперёд
    expect(bb.min.z).toBeLessThan(-0.7);
    expect(bb.max.z).toBeLessThan(-0.3);
    expect(bb.min.y).toBeGreaterThan(-2.6);
    expect(bb.max.y).toBeLessThan(-1.2);
  });
});

describe('bladder geometry build', () => {
  const built = buildBladder();

  it('builds every part of the model', () => {
    expect(Object.keys(built).sort()).toEqual([...BLADDER_PART_IDS].sort());
    const total = Object.values(built).reduce((n, defs) => n + defs.length, 0);
    expect(total).toBeGreaterThanOrEqual(55);
  });

  it('produces finite geometry with positions and normals', () => {
    for (const [id, defs] of Object.entries(built)) {
      for (const d of defs) {
        const pos = d.g.getAttribute('position');
        expect(pos, id).toBeDefined();
        expect(pos.count, id).toBeGreaterThan(0);
        for (let i = 0; i < pos.count; i += 37) {
          expect(Number.isFinite(pos.getX(i)), id).toBe(true);
          expect(Number.isFinite(pos.getY(i)), id).toBe(true);
          expect(Number.isFinite(pos.getZ(i)), id).toBe(true);
        }
        expect(d.g.getAttribute('normal'), id).toBeDefined();
      }
    }
  });

  it('keeps the whole model in a sane box', () => {
    let maxAbs = 0;
    for (const defs of Object.values(built)) {
      for (const d of defs) {
        d.g.computeBoundingBox();
        const bb = d.g.boundingBox!;
        maxAbs = Math.max(maxAbs, Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.y), Math.abs(bb.max.y), Math.abs(bb.min.z), Math.abs(bb.max.z));
      }
    }
    expect(maxAbs).toBeLessThan(6);
    expect(maxAbs).toBeGreaterThan(4);
  });
});
