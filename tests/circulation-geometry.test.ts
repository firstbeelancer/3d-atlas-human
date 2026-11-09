import { describe, expect, it } from 'vitest';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { getSection } from '../src/content/sections';
import { systemicArteries, systemicVeins } from '../src/models/body/bloodPaths';
import { LUNG_GROUP, MICRO_GROUP, PART_GROUPS, VESSELS } from '../src/models/circulation/anatomy';
import { buildStreams, buildVesselMeshes } from '../src/models/circulation/geometry';

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
