import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/podzheludochnaya';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { FOCUS, GROUP_OF, LABEL_AT, PANC_GROUPS, PANC_PART_IDS, SPREAD, MACRO_PART_IDS } from '../src/models/pancreas/parts';
import { CUT_DEFAULT_T } from '../src/models/pancreas/anatomy';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('podzheludochnaya content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(content.slug).toBe('podzheludochnaya');
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
    expect(content.parts.map((p) => p.id).sort()).toEqual([...PANC_PART_IDS].sort());
    expect(content.parts.length).toBeGreaterThanOrEqual(60);
    for (const p of content.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(40);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('puts every part into the same group in the content and in the model', () => {
    expect(content.groups?.map((g) => g.id).sort()).toEqual(Object.keys(PANC_GROUPS).sort());
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

  it('gives every part and group a camera focus, and anchors only for known parts', () => {
    for (const id of [...PANC_PART_IDS, ...Object.keys(PANC_GROUPS)]) expect(FOCUS[id], id).toBeDefined();
    for (const id of Object.keys(LABEL_AT)) expect(PANC_PART_IDS, id).toContain(id);
    for (const id of Object.keys(SPREAD)) expect(MACRO_PART_IDS, id).toContain(id);
    for (const id of MACRO_PART_IDS) expect(SPREAD[id], id).toBeDefined();
  });

  it('is ready, loadable and has an explorable model with three cuts and a microscope mode', async () => {
    expect(getSection('podzheludochnaya')?.ready).toBe(true);
    expect(hasSectionContent('podzheludochnaya')).toBe(true);
    const loaded = await loadSectionContent('podzheludochnaya');
    expect(loaded?.slug).toBe('podzheludochnaya');
    const m = MODELS.podzheludochnaya;
    expect(m.hasCutaway).toBe(true);
    expect(m.explorer).toBe(true);
    expect(m.explorerFundusKey).toBe('explorer.fundusPancreas');
    expect(m.explorerCuts?.defaults).toEqual(CUT_DEFAULT_T);
    expect(m.modes?.some((x) => x.id === 'micro')).toBe(true);
  });

  it('links to related sections that exist', () => {
    for (const slug of content.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(content))).toEqual([]);
  });
});
