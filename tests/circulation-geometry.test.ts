import { describe, expect, it } from 'vitest';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { getSection } from '../src/content/sections';
import { systemicArteries, systemicVeins } from '../src/models/body/bloodPaths';
import { ARTERY_GROUP, LUNG_GROUP, MICRO_GROUP, PART_GROUPS, SYSTEMIC_BRANCHES, VEIN_GROUP, VESSELS } from '../src/models/circulation/anatomy';
import { buildStreams, buildVesselMeshes } from '../src/models/circulation/geometry';
import { armPoint, fingerChains } from '../src/models/body/skin';

const slug = 'krovenosnaya-sistema';
const endpoints = (id: string, end: 'first' | 'last') => VESSELS
  .filter((vessel) => vessel.part === id)
  .map(({ points }) => points[end === 'first' ? 0 : points.length - 1]);

describe('circulatory atlas', () => {
  it('publishes a description for every selectable structure and group', async () => {
    expect(getSection(slug)?.ready).toBe(true);
    expect(hasSectionContent(slug)).toBe(true);
    const content = await loadSectionContent(slug);
    expect(content?.slug).toBe(slug);
    expect(Object.fromEntries(content!.parts.map(({ id, group }) => [id, group]))).toEqual(PART_GROUPS);
    expect(new Set(content!.groups!.map(({ id }) => id))).toEqual(new Set(Object.values(PART_GROUPS)));
  });

  it('connects the vessels of each capillary bed in the direction of flow', () => {
    const lungArteries = endpoints('pulmonary-arteries', 'last');
    const lungVeins = endpoints('pulmonary-veins', 'first');
    const arterioles = endpoints('arterioles', 'last');
    const venules = endpoints('venules', 'first');
    const lungBeds = VESSELS.filter(({ part }) => part === 'lung-capillaries');
    const tissueBeds = VESSELS.filter(({ part, points }) => part === 'tissue-capillaries' && points[0][0] < -1);
    expect(lungBeds.length).toBeGreaterThan(0);
    expect(tissueBeds).toHaveLength(7);
    for (const { points, blood } of lungBeds) {
      expect(lungArteries).toContainEqual(points[0]);
      expect(lungVeins).toContainEqual(points[points.length - 1]);
      expect(blood).toBe('oxygen-gain');
    }
    for (const { points, blood } of tissueBeds) {
      expect(arterioles).toContainEqual(points[0]);
      expect(venules).toContainEqual(points[points.length - 1]);
      expect(blood).toBe('oxygen-loss');
    }
  });

  it('animates aortic flow away from the heart and caval flow back to it', () => {
    const streams = buildStreams();
    for (const part of ['aorta', 'vena-cava-superior', 'vena-cava-inferior']) {
      const stream = streams.find((item) => item.part === part)!;
      const source = [...systemicArteries, ...systemicVeins].find((item) => item.part === part)!;
      const heartEnd = stream.path.getPointAt(source.reverse ? 1 : 0).toArray();
      heartEnd.forEach((coordinate, axis) => expect(coordinate).toBeCloseTo(source.points[0][axis], 10));
    }
    expect(streams.some(({ group }) => group === LUNG_GROUP)).toBe(true);
    expect(streams.some(({ group }) => group === MICRO_GROUP)).toBe(true);
  });

  it('joins every added systemic branch to its vascular tree at a modeled junction', () => {
    for (const [group, additions] of [[ARTERY_GROUP, SYSTEMIC_BRANCHES.arteries], [VEIN_GROUP, SYSTEMIC_BRANCHES.veins]] as const) {
      const ownPaths = new Set(additions.map(({ points }) => points));
      const junctions = new Set(VESSELS.filter((v) => v.group === group && !ownPaths.has(v.points))
        .flatMap(({ points }) => points.map((point) => point.join(','))));
      let pending = [...additions];
      while (pending.length) {
        const disconnected = pending.filter(({ points }) => {
          if (!junctions.has(points[0].join(','))) return true;
          points.forEach((point) => junctions.add(point.join(',')));
          return false;
        });
        expect(disconnected.length, disconnected.map(({ part, points }) => `${part}: ${points[0]}`).join('; ')).toBeLessThan(pending.length);
        pending = disconnected;
      }
    }
  });

  it('keeps the digital arteries inside the posed fingers on both hands', () => {
    const tips = fingerChains().map((finger) => armPoint(finger[finger.length - 1]));
    const arteries = endpoints('hand-arteries', 'last');
    expect(arteries).toHaveLength(20);
    for (const side of [-1, 1]) {
      for (const tip of tips) {
        expect(arteries.filter(([x, y, z]) => Math.hypot(x * side - tip[0], y - tip[1], z - tip[2]) < 0.04)).toHaveLength(2);
      }
    }
  });

  it('builds finite selectable meshes and colors the gas-exchange beds', () => {
    for (const { id, geometry, gradient } of buildVesselMeshes()) {
      expect(geometry.attributes.position.count, id).toBeGreaterThan(30);
      expect(geometry.boundingBox?.isEmpty(), id).toBe(false);
      for (const coordinate of geometry.attributes.position.array) {
        if (!Number.isFinite(coordinate)) throw new Error(`Non-finite coordinate in ${id}`);
      }
      expect(!!geometry.attributes.color, id).toBe(gradient);
      geometry.dispose();
    }
  });
});
