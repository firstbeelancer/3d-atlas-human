import { describe, expect, it } from 'vitest';
import zub from '../src/content/ru/zub';
import { getSection } from '../src/content/sections';
import { MODELS } from '../src/models/registry';
import { loadSectionContent } from '../src/content/loadSection';
import { TEETH_PART_IDS, TEETH_GROUPS, GROUP_OF } from '../src/models/teeth/parts';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('zub content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(zub.slug).toBe('zub');
    expect(zub.stats.length).toBeGreaterThanOrEqual(3);
    expect(zub.stats.length).toBeLessThanOrEqual(5);
    expect(zub.does.length).toBeGreaterThanOrEqual(2);
    expect(zub.does.length).toBeLessThanOrEqual(3);
    expect(zub.kidSay.length).toBeGreaterThanOrEqual(1);
    expect(zub.kidSay.length).toBeLessThanOrEqual(2);
    expect(zub.facts.length).toBeGreaterThanOrEqual(3);
    expect(zub.facts.length).toBeLessThanOrEqual(6);
    expect(zub.care.length).toBeGreaterThanOrEqual(3);
    expect(zub.care.length).toBeLessThanOrEqual(6);
  });

  it('describes exactly the parts the model has', () => {
    expect(zub.parts.map((p) => p.id).sort()).toEqual([...TEETH_PART_IDS].sort());
    for (const p of zub.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(30);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('puts every part into the same group in the content and in the model', () => {
    expect(zub.groups?.map((g) => g.id).sort()).toEqual(Object.keys(TEETH_GROUPS).sort());
    for (const p of zub.parts) expect(p.group, p.id).toBe(GROUP_OF[p.id]);
  });

  it('keeps the parts of a group next to each other (the list prints one heading per run)', () => {
    const seen = new Set<string>();
    let prev: string | undefined;
    for (const p of zub.parts) {
      if (p.group !== prev) {
        expect(seen.has(p.group!), `${p.group} is split`).toBe(false);
        seen.add(p.group!);
      }
      prev = p.group;
    }
  });

  it('is ready, loads through the content loader and has an explorable model with a cutaway', async () => {
    expect(getSection('zub')?.ready).toBe(true);
    expect((await loadSectionContent('zub'))?.slug).toBe('zub');
    expect(MODELS.zub.hasCutaway).toBe(true);
    expect(MODELS.zub.explorer).toBe(true);
  });

  it('links to related sections that exist', () => {
    for (const slug of zub.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(zub))).toEqual([]);
  });
});
