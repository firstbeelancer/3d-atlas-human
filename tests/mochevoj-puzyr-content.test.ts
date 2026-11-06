import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/mochevoj-puzyr';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { BLADDER_GROUPS, BLADDER_PART_IDS, FOCUS, GROUP_OF, LABEL_AT, SPREAD } from '../src/models/bladder/parts';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('mochevoj-puzyr content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(content.slug).toBe('mochevoj-puzyr');
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
    expect(content.parts.map((p) => p.id).sort()).toEqual([...BLADDER_PART_IDS].sort());
    for (const p of content.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(40);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('puts every part into the same group in the content and in the model', () => {
    expect(content.groups?.map((g) => g.id).sort()).toEqual(Object.keys(BLADDER_GROUPS).sort());
    for (const p of content.parts) expect(p.group, p.id).toBe(GROUP_OF[p.id]);
  });

  it('keeps the parts of a group next to each other (the list prints one heading per run)', () => {
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

  it('gives every part a camera focus, and groups too', () => {
    for (const id of [...BLADDER_PART_IDS, ...Object.keys(BLADDER_GROUPS)]) expect(FOCUS[id], id).toBeDefined();
    for (const id of Object.keys(LABEL_AT)) expect(BLADDER_PART_IDS, id).toContain(id);
    for (const id of Object.keys(SPREAD)) expect(BLADDER_PART_IDS, id).toContain(id);
  });

  it('is ready, loadable and has an explorable model with two cuts', async () => {
    expect(getSection('mochevoj-puzyr')?.ready).toBe(true);
    expect(hasSectionContent('mochevoj-puzyr')).toBe(true);
    const loaded = await loadSectionContent('mochevoj-puzyr');
    expect(loaded?.slug).toBe('mochevoj-puzyr');
    expect(MODELS['mochevoj-puzyr'].hasCutaway).toBe(true);
    expect(MODELS['mochevoj-puzyr'].explorer).toBe(true);
    expect(MODELS['mochevoj-puzyr'].explorerFundusKey).toBe('explorer.fundusBladder');
  });

  it('links to related sections that exist', () => {
    for (const slug of content.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(content))).toEqual([]);
  });
});
