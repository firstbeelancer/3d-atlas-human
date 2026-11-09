import { describe, expect, it } from 'vitest';
import { buildMuscles } from '../src/models/muscles/build';

/** Объём замкнутой оболочки со знаком: положительный, если треугольники смотрят наружу. */
function volume(g: import('three').BufferGeometry): number {
  const p = g.attributes.position;
  const idx = g.index!;
  let v = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a);
    const bx = p.getX(b), by = p.getY(b), bz = p.getZ(b);
    const cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

describe('геометрия мышц', () => {
  const built = buildMuscles();
  it('все мышцы построены и без NaN', () => {
    expect(built.length).toBeGreaterThan(70);
    for (const b of built) {
      const arr = b.geometry.attributes.position.array as Float32Array;
      expect(arr.every(Number.isFinite), b.def.id).toBe(true);
      expect(b.geometry.index!.count, b.def.id).toBeGreaterThan(30);
    }
  });
  it('треугольники смотрят наружу', () => {
    const bad = built.filter((b) => volume(b.geometry) < 0).map((b) => `${b.def.id}:${volume(b.geometry).toFixed(3)}`);
    expect(bad).toEqual([]);
  });
});
