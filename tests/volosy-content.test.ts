import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/volosy-i-nogti';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { FOCUS, GROUP_OF, HAIR_GROUPS, HAIR_PART_IDS, LABEL_AT, SPREAD, sceneOf } from '../src/models/hair/parts';
import { CUT_DEFAULT_T, cutPlane, type SceneId } from '../src/models/hair/anatomy';
import { buildScene } from '../src/models/hair/build';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('volosy-i-nogti content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(content.slug).toBe('volosy-i-nogti');
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

  it('describes exactly the parts the model has', () => {
    expect(content.parts.map((p) => p.id).sort()).toEqual([...HAIR_PART_IDS].sort());
    expect(content.parts.length).toBeGreaterThanOrEqual(100);
    for (const p of content.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(40);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('puts every part into the same group in the content and in the model', () => {
    expect(content.groups?.map((g) => g.id).sort()).toEqual(Object.keys(HAIR_GROUPS).sort());
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

  it('gives every part and group a camera focus, a label and a spread vector', () => {
    for (const id of [...HAIR_PART_IDS, ...Object.keys(HAIR_GROUPS)]) expect(FOCUS[id], id).toBeDefined();
    for (const id of HAIR_PART_IDS) {
      expect(LABEL_AT[id], id).toBeDefined();
      expect(SPREAD[id], id).toBeDefined();
    }
  });

  it('is ready, loadable and has an explorable model with three cuts and its modes', async () => {
    expect(getSection('volosy-i-nogti')?.ready).toBe(true);
    expect(hasSectionContent('volosy-i-nogti')).toBe(true);
    expect((await loadSectionContent('volosy-i-nogti'))?.slug).toBe('volosy-i-nogti');
    const m = MODELS['volosy-i-nogti'];
    expect(m.hasCutaway).toBe(true);
    expect(m.explorer).toBe(true);
    expect(m.explorerCuts?.defaults).toEqual(CUT_DEFAULT_T);
    expect(m.modes?.map((x) => x.id).sort()).toEqual(['cycle', 'goose', 'nail', 'shaft', 'xray']);
  });

  it('links to related sections that exist', () => {
    for (const slug of content.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(content))).toEqual([]);
  });
});

describe('volosy-i-nogti geometry', () => {
  const scenes: SceneId[] = ['follicle', 'shaft', 'cycle', 'nail'];

  it('builds every part of every scene with finite, non-empty meshes', () => {
    for (const scene of scenes) {
      const data = buildScene(scene);
      const ids = HAIR_PART_IDS.filter((id) => sceneOf(id) === scene);
      for (const id of ids) {
        const defs = data.parts[id];
        expect(defs?.length, `${scene}/${id}`).toBeGreaterThan(0);
        for (const d of defs) {
          const pos = d.g.getAttribute('position');
          expect(pos.count, `${id}`).toBeGreaterThan(8);
          for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error(`${id}: NaN in positions`);
        }
      }
    }
  }, 120000);

  it('returns unit-length-compatible cut planes for every scene and kind', () => {
    for (const scene of scenes) {
      for (const kind of ['side', 'fundus', 'coronal'] as const) {
        for (const t of [0, 0.5, 1]) {
          const p = cutPlane(scene, kind, t);
          expect(Math.hypot(...p.n)).toBeCloseTo(1, 3);
          expect(Number.isFinite(p.c)).toBe(true);
        }
      }
    }
  });
});
