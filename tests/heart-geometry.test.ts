import { describe, expect, it } from 'vitest';
import { PART_IDS, LABEL_AT, FOCUS } from '../src/models/heart/anatomy';
import { classify, cutPlane, evalHeart, hw, LV_CENTER, sdOuter } from '../src/models/heart/field';
import { valveEntities } from '../src/models/heart/valves';
import serdce from '../src/content/ru/serdce';

describe('heart field', () => {
  it('has blood in the left ventricle and muscle around it', () => {
    const c = hw(1.0, 0.29, -0.2);
    const e = evalHeart(...c);
    expect(e.cavity).toBeLessThan(0);
    expect(e.solid).toBeGreaterThan(0);
    // стенка на боковой стороне: внутри тела, вне полости
    const wall = hw(1.0, 0.29 + 0.55, -0.2);
    const w = evalHeart(...wall);
    expect(w.outer).toBeLessThan(0);
    expect(w.solid).toBeLessThan(0);
  });

  it('is empty far away from the heart', () => {
    expect(sdOuter(3, 0, 0)).toBeGreaterThan(0.5);
  });

  it('assigns surfaces of the left ventricle wall to the left ventricle', () => {
    const c = classify(LV_CENTER[0] + 0.05, LV_CENTER[1], LV_CENTER[2], null);
    expect(['left-ventricle', 'septum', 'papillary-muscles']).toContain(c.part);
  });

  it('has two cut planes through the heart', () => {
    for (const k of ['side', 'fundus'] as const) {
      const p = cutPlane(k);
      expect(Math.hypot(...p.n)).toBeCloseTo(1, 5);
      // центр левого желудочка лежит по обе стороны от плоскостей не дальше размера сердца
      expect(Math.abs(p.n[0] * LV_CENTER[0] + p.n[1] * LV_CENTER[1] + p.n[2] * LV_CENTER[2] - p.c)).toBeLessThan(2);
    }
  });
});

describe('heart valves', () => {
  const list = valveEntities();
  it('builds closed and open poses with the same topology', () => {
    const animated = list.filter((e) => e.morph);
    expect(animated.length).toBeGreaterThanOrEqual(6);
    for (const e of animated) {
      expect(e.morph!.positions.length).toBe(e.mesh.positions.length);
      expect(e.morph!.normals.length).toBe(e.mesh.normals.length);
      expect(e.mesh.positions.every(Number.isFinite)).toBe(true);
      expect(e.morph!.positions.every(Number.isFinite)).toBe(true);
    }
  });
  it('covers all four valves and the chordae', () => {
    const parts = new Set(list.map((e) => e.part));
    for (const id of ['tricuspid-valve', 'mitral-valve', 'aortic-valve', 'pulmonary-valve', 'chordae-tendineae']) expect(parts.has(id)).toBe(true);
  });
});

describe('heart anatomy table', () => {
  it('matches the content parts and has labels and camera targets', () => {
    expect([...PART_IDS].sort()).toEqual(serdce.parts.map((p) => p.id).sort());
    for (const id of PART_IDS) {
      expect(LABEL_AT[id], id).toBeDefined();
      expect(FOCUS[id], id).toBeDefined();
    }
  });
});
