import { describe, expect, it } from 'vitest';
import {
  CONUS_Y, CORD_TOP, KNOTS, NERVES, PART_GROUPS, PART_IDS, REFLEX, SPINAL_NERVES, canalZ, cordRadius, foramenOf, viewOf,
} from '../src/models/nerves/anatomy';
import { buildNerveSet, tubeDetail } from '../src/models/nerves/build';
import { buildNeuron, nodes, sheaths } from '../src/models/nerves/neuron';

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('nervous system anatomy', () => {
  it('has 31 pairs of spinal nerves in the right order', () => {
    expect(SPINAL_NERVES).toHaveLength(31);
    const count = (r: string) => SPINAL_NERVES.filter((n) => n.region === r).length;
    expect([count('cervical'), count('thoracic'), count('lumbar'), count('sacral'), count('coccygeal')]).toEqual([8, 12, 5, 5, 1]);
    for (let i = 1; i < SPINAL_NERVES.length; i++) {
      expect(SPINAL_NERVES[i].exitY, SPINAL_NERVES[i].name).toBeLessThan(SPINAL_NERVES[i - 1].exitY);
      expect(SPINAL_NERVES[i].originY, SPINAL_NERVES[i].name).toBeLessThan(SPINAL_NERVES[i - 1].originY);
    }
  });

  it('starts every root on the cord and makes the lower roots descend (cauda equina)', () => {
    for (const n of SPINAL_NERVES) {
      expect(n.originY, n.name).toBeLessThanOrEqual(CORD_TOP);
      expect(n.originY, n.name).toBeGreaterThan(CONUS_Y);
      expect(n.originY, n.name).toBeGreaterThanOrEqual(n.exitY - 0.06);
    }
    const drop = (name: string) => { const n = SPINAL_NERVES.find((s) => s.name === name)!; return n.originY - n.exitY; };
    expect(drop('S1')).toBeGreaterThan(drop('L1'));
    expect(drop('L1')).toBeGreaterThan(drop('T6'));
    expect(drop('T6')).toBeGreaterThan(drop('C4'));
    expect(NERVES.filter((p) => p.part === 'cauda-equina').length).toBeGreaterThanOrEqual(2 * 10);
  });

  it('has a spinal ganglion at every foramen on both sides', () => {
    const ganglia = KNOTS.filter((k) => k.part === 'spinal-ganglia');
    expect(ganglia).toHaveLength(62);
    for (const n of SPINAL_NERVES) {
      const f = foramenOf(n);
      expect(ganglia.some((g) => dist(g.at, f) < 1e-9), n.name).toBe(true);
      expect(ganglia.some((g) => dist(g.at, [-f[0], f[1], f[2]]) < 1e-9), n.name).toBe(true);
    }
  });

  it('thickens the cord at both enlargements and tapers it into the conus', () => {
    const mid = cordRadius(13.2);
    expect(cordRadius(14.85)).toBeGreaterThan(mid * 1.25);
    expect(cordRadius(11.75)).toBeGreaterThan(mid * 1.25);
    expect(cordRadius(CONUS_Y + 0.02)).toBeLessThan(mid * 0.4);
    expect(canalZ(13)).toBeLessThan(-0.6);
  });

  it('keeps every path finite, every part known, and pairs symmetric', () => {
    const known = new Set(PART_IDS);
    for (const p of NERVES) {
      expect(known.has(p.part), p.part).toBe(true);
      expect(p.points.length, p.part).toBeGreaterThanOrEqual(2);
      for (const pt of p.points) for (const c of pt) if (!Number.isFinite(c)) throw new Error(`NaN in ${p.part}`);
      expect(p.r[0]).toBeGreaterThan(0);
    }
    for (const id of ['median-nerve', 'sciatic-nerve', 'femoral-nerve', 'brachial-plexus', 'intercostal-nerves']) {
      const left = NERVES.filter((p) => p.part === id && p.points[0][0] > 0).length;
      const right = NERVES.filter((p) => p.part === id && p.points[0][0] < 0).length;
      expect(left, id).toBeGreaterThan(0);
      expect(right, id).toBe(left);
    }
    expect(NERVES.filter((p) => p.part === 'intercostal-nerves')).toHaveLength(24);
  });

  it('builds a reflex arc that runs finger to cord to muscle without gaps', () => {
    const last = (a: number[][]) => a[a.length - 1];
    expect(dist(last(REFLEX.sensory), REFLEX.inter[0])).toBeLessThan(1e-9);
    expect(dist(last(REFLEX.inter), REFLEX.motor[0])).toBeLessThan(1e-9);
    expect(REFLEX.sensory[0][1]).toBeLessThan(8);
    expect(Math.abs(REFLEX.inter[1][0])).toBeLessThan(0.05);
    expect(dist(last(REFLEX.motor), REFLEX.muscle)).toBeLessThan(0.3);
    const { sensory, inter, motor } = REFLEX.timing;
    expect(sensory[1]).toBe(inter[0]);
    expect(inter[1]).toBe(motor[0]);
    expect(motor[1]).toBeLessThan(1);
  });

  it('picks the scene from modes and selection', () => {
    expect(viewOf({}, undefined)).toBe('body');
    expect(viewOf({ reflex: true }, undefined)).toBe('reflex');
    expect(viewOf({ neuron: true }, undefined)).toBe('neuron');
    expect(viewOf({}, 'g-neuron')).toBe('neuron');
    expect(viewOf({}, PART_GROUPS['interneuron'])).toBe('reflex');
    expect(viewOf({ neuron: true }, 'g-cns')).toBe('body');
  });
});

describe('nervous system geometry', () => {
  it('builds one finite mesh for every body part and keeps the scene light', () => {
    const set = buildNerveSet();
    const neuronIds = new Set(PART_IDS.filter((id) => PART_GROUPS[id] === 'g-neuron'));
    const bodyIds = PART_IDS.filter((id) => !neuronIds.has(id) && id !== 'brain' && id !== 'cerebellum');
    expect(Object.keys(set).sort()).toEqual(bodyIds.sort());
    let vertices = 0;
    for (const [id, g] of Object.entries(set)) {
      const pos = g.attributes.position.array;
      expect(pos.length, id).toBeGreaterThan(60);
      for (const c of pos) if (!Number.isFinite(c)) throw new Error(`Non-finite coordinate in ${id}`);
      vertices += g.attributes.position.count;
      g.dispose();
    }
    // около 150 тысяч треугольников на всё тело: тонкие ветви грубые и короткие
    expect(vertices).toBeLessThan(600_000);
  });

  it('gives thin branches coarse tubes', () => {
    expect(tubeDetail(0.008, 1).radial).toBe(5);
    expect(tubeDetail(0.075, 5).radial).toBe(12);
    expect(tubeDetail(0.01, 0.3).segments).toBeLessThanOrEqual(8);
    expect(tubeDetail(0.05, 50).segments).toBe(160);
  });

  it('builds the neuron with myelin sheaths separated by nodes of Ranvier', () => {
    const s = sheaths();
    const n = nodes();
    expect(n).toHaveLength(s.length - 1);
    n.forEach((x, i) => {
      expect(x).toBeGreaterThan(s[i][1]);
      expect(x).toBeLessThan(s[i + 1][0]);
    });
    const parts = buildNeuron();
    expect(Object.keys(parts).sort()).toEqual(PART_IDS.filter((id) => PART_GROUPS[id] === 'g-neuron').sort());
    for (const [id, g] of Object.entries(parts)) {
      expect(g.boundingBox?.isEmpty(), id).toBe(false);
      for (const c of g.attributes.position.array) if (!Number.isFinite(c)) throw new Error(`Non-finite coordinate in ${id}`);
    }
  });
});
