import { describe, expect, it } from 'vitest';
import skelet from '../src/content/ru/skelet';
import { getSection } from '../src/content/sections';
import { MODELS } from '../src/models/registry';
import { SKELETON_GROUPS, SKELETON_PART_IDS } from '../src/models/skeleton/parts';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('skeleton content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(skelet.slug).toBe('skelet');
    expect(skelet.stats.length).toBeGreaterThanOrEqual(3);
    expect(skelet.stats.length).toBeLessThanOrEqual(5);
    expect(skelet.does.length).toBeGreaterThanOrEqual(2);
    expect(skelet.does.length).toBeLessThanOrEqual(3);
    expect(skelet.kidSay.length).toBeGreaterThanOrEqual(1);
    expect(skelet.kidSay.length).toBeLessThanOrEqual(2);
    expect(skelet.facts.length).toBeGreaterThanOrEqual(3);
    expect(skelet.facts.length).toBeLessThanOrEqual(5);
    expect(skelet.care.length).toBeGreaterThanOrEqual(3);
    expect(skelet.care.length).toBeLessThanOrEqual(5);
  });

  it('describes exactly the parts the model has, in model order', () => {
    expect(skelet.parts.map((p) => p.id)).toEqual(SKELETON_PART_IDS);
    for (const p of skelet.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(30);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('puts every part into the group the model uses', () => {
    expect(skelet.groups?.map((g) => g.id)).toEqual(Object.keys(SKELETON_GROUPS));
    for (const [group, ids] of Object.entries(SKELETON_GROUPS)) {
      for (const id of ids) expect(skelet.parts.find((p) => p.id === id)?.group, id).toBe(group);
    }
  });

  it('keeps the bone counts consistent', () => {
    expect(skelet.stats[0].value).toBe('206');
    const text = JSON.stringify(skelet);
    expect(text).toContain('27 костей');
    expect(text).toContain('26 костей');
    expect(text).toContain('54 в двух кистях и 52 в двух стопах');
  });

  it('is ready and has a model with a cutaway', () => {
    expect(getSection('skelet')?.ready).toBe(true);
    expect(MODELS.skelet.hasCutaway).toBe(true);
    expect(MODELS.skelet.description.length).toBeGreaterThan(80);
  });

  it('links to related sections that exist', () => {
    for (const slug of skelet.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(skelet))).toEqual([]);
  });
});
