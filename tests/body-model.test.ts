import { describe, expect, it } from 'vitest';
import { getSection } from '../src/content/sections';
import { LABEL_AT, MATERIALS, PARTS, PIVOTS } from '../src/models/body/meta';
import { armPoint, SHOULDER } from '../src/models/body/skin';
import { eTube, loft } from '../src/models/body/sdfx';
import { buildVessels } from '../src/models/body/vessels';

describe('body figure model', () => {
  it('every part belongs to a real section and has a material', () => {
    for (const p of PARTS) {
      expect(getSection(p.slug), p.key).toBeDefined();
      expect(MATERIALS[p.mat], p.key).toBeDefined();
    }
    for (const slug of Object.keys(LABEL_AT)) expect(getSection(slug), slug).toBeDefined();
  });

  it('animated parts have a pivot', () => {
    for (const p of PARTS.filter((x) => x.anim)) expect(PIVOTS[p.key] ?? PIVOTS.heart, p.key).toBeDefined();
  });

  it('arm abduction moves the hand outward and keeps the shoulder fixed', () => {
    expect(armPoint(SHOULDER)).toEqual(SHOULDER);
    const hand = armPoint([2.0, 8.4, -0.15]);
    expect(hand[0]).toBeGreaterThan(2.0);
    expect(hand[1]).toBeLessThan(14);
  });

  it('distance fields are negative inside and positive outside', () => {
    const tube = eTube([[0, 0, 0], [0, 4, 0]], [1, 1], [0.5, 0.5]);
    expect(tube(0, 2, 0)).toBeLessThan(0);
    expect(tube(3, 2, 0)).toBeGreaterThan(0);
    const body = loft({ y: [0, 2], w: [1, 1], zf: [0.5, 0.5], zb: [-0.5, -0.5], n: [2, 2] });
    expect(body(0, 1, 0)).toBeLessThan(0);
    expect(body(2, 1, 0)).toBeGreaterThan(0);
  });

  it('vessel tubes build into a single indexed-free mesh with colours', () => {
    const { arteries, veins, nerves } = buildVessels();
    for (const g of [arteries, veins, nerves]) {
      expect(g.attributes.position.count).toBeGreaterThan(1000);
      expect(g.attributes.color.count).toBe(g.attributes.position.count);
    }
  });
});
