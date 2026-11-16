import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/kozha';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { CanvasTexture, Mesh, type Plane } from 'three';
import { ANATOMY_STRUCTURES, MICRO_TOURS, STRUCTURE_MAP } from '../src/content/ru/skin-atlas';
import { GROUP_OF, SKIN_GROUPS, SKIN_PART_IDS } from '../src/models/skin/parts';
import { skinPartFor, skinStructuresFor } from '../src/models/skin/selectionMap';
import { buildEpidermisAndDermis } from '../src/models/skin/engine/builders/epidermisDermisBuilder';
import { buildHypodermis } from '../src/models/skin/engine/builders/hypodermisBuilder';
import { buildSkinAppendages } from '../src/models/skin/engine/builders/appendagesBuilder';
import { buildNeurovascularSystems } from '../src/models/skin/engine/builders/neurovascularBuilder';
import { buildStratumSliceCapGeometry, type SliceBoundsState } from '../src/models/skin/engine/skinHeightfield';
import type { TissueTextureSet } from '../src/models/skin/engine/proceduralTextures';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('kozha content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(content.slug).toBe('kozha');
    expect(content.stats.length).toBe(4);
    expect(content.does.length).toBeGreaterThanOrEqual(2);
    expect(content.does.length).toBeLessThanOrEqual(3);
    expect(content.kidSay.length).toBeGreaterThanOrEqual(1);
    expect(content.kidSay.length).toBeLessThanOrEqual(2);
    expect(content.facts.length).toBeGreaterThanOrEqual(4);
    expect(content.facts.length).toBeLessThanOrEqual(6);
    expect(content.care.length).toBeGreaterThanOrEqual(4);
    expect(content.care.length).toBeLessThanOrEqual(6);
  });

  it('keeps the page text and only links parts available in the new model', () => {
    expect(content.parts.map((p) => p.id).sort()).toEqual([...SKIN_PART_IDS].sort());
    expect(content.parts.length).toBeGreaterThanOrEqual(35);
    for (const p of content.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(40);
      expect(p.latin, p.id).toBeTruthy();
      expect(p.interactive !== false, p.id).toBe(skinStructuresFor(p.id).length > 0);
    }
  });

  it('puts every part into the same group in the content and in the model', () => {
    expect(content.groups?.map((g) => g.id).sort()).toEqual(Object.keys(SKIN_GROUPS).sort());
    for (const p of content.parts) expect(p.group, p.id).toBe(GROUP_OF[p.id]);
  });

  it('keeps the parts of a group next to each other', () => {
    const seen = new Set<string>();
    let prev: string | undefined;
    for (const p of content.parts) {
      if (p.group !== prev) {
        expect(seen.has(p.group!), `${p.group} is split`).toBe(false);
        seen.add(p.group!);
      }
      prev = p.group;
    }
  });

  it('links every rendered structure and every group to existing scene IDs', () => {
    for (const { id, focusTarget, focusCameraOffset } of ANATOMY_STRUCTURES) {
      expect(skinStructuresFor(skinPartFor(id)), id).toContain(id);
      expect([...focusTarget, ...focusCameraOffset].every(Number.isFinite), id).toBe(true);
    }
    for (const group of Object.keys(SKIN_GROUPS)) {
      const ids = skinStructuresFor(group);
      expect(ids.length, group).toBeGreaterThan(0);
      for (const id of ids) expect(STRUCTURE_MAP[id], group).toBeDefined();
    }
    for (const tour of MICRO_TOURS) expect(STRUCTURE_MAP[tour.structureId], tour.id).toBeDefined();
  });

  it('uses the new viewer at the existing section route', async () => {
    expect(getSection('kozha')?.ready).toBe(true);
    expect(hasSectionContent('kozha')).toBe(true);
    expect((await loadSectionContent('kozha'))?.slug).toBe('kozha');
    expect(MODELS.kozha.Viewer).toBeDefined();
  });

  it('links to related sections that exist', () => {
    for (const slug of content.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(content))).toEqual([]);
  });
});

describe('kozha geometry', () => {
  it('builds every part with finite, non-empty meshes', () => {
    const sampleTexture = new CanvasTexture(document.createElement('canvas'));
    const textures = new Proxy({} as TissueTextureSet, { get: () => sampleTexture });
    const clipping: Plane[] = [];
    const data = new Map([
      ...buildEpidermisAndDermis(textures, clipping).groups,
      ...buildHypodermis(textures, clipping),
      ...buildSkinAppendages(textures, clipping),
      ...buildNeurovascularSystems(clipping),
    ]);
    expect([...data.keys()].sort()).toEqual(ANATOMY_STRUCTURES.map(({ id }) => id).sort());
    for (const [id, group] of data) {
      let meshes = 0;
      group.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        meshes++;
        const positions = object.geometry.getAttribute('position');
        expect(positions.count, id).toBeGreaterThan(2);
        if (!positions.array.every(Number.isFinite)) throw new Error(`${id}: non-finite position`);
      });
      expect(meshes, id).toBeGreaterThan(0);
    }
  }, 120000);

  it('builds section faces at the requested X, Y and Z planes', () => {
    const base: SliceBoundsState = {
      xEnabled: false, xPos: 0.25, xInvert: false,
      yEnabled: false, yPos: 0, yInvert: false,
      zEnabled: false, zPos: -0.5, zInvert: false,
    };
    for (const [i, axis] of (['x', 'y', 'z'] as const).entries()) {
      const slice = { ...base, [`${axis}Enabled`]: true };
      const geometry = buildStratumSliceCapGeometry('reticular', slice, 0);
      expect(geometry, axis).not.toBeNull();
      const { array, count } = geometry!.getAttribute('position');
      expect(count, axis).toBeGreaterThan(3);
      expect(array.every(Number.isFinite), axis).toBe(true);
      for (let j = i; j < array.length; j += 3) {
        expect(Math.abs(array[j] - slice[`${axis}Pos`]), axis).toBeLessThan(0.01);
      }
    }
  });
});
