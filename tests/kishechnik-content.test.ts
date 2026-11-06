import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/kishechnik';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import {
  CUT_Y_OF,
  CUT_Z_OF,
  FOCUS,
  GROUP_OF,
  INTESTINE_GROUPS,
  INTESTINE_PART_IDS,
  LABEL_AT,
  MACRO_PART_IDS,
  MICRO_FOCUS,
  MICRO_LABEL_AT,
  MICRO_ONLY,
  PART_SPREAD,
  SEGMENTS,
  SEG_SPREAD,
} from '../src/models/intestine/parts';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('kishechnik content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(content.slug).toBe('kishechnik');
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
    expect(content.parts.map((p) => p.id).sort()).toEqual([...INTESTINE_PART_IDS].sort());
    for (const p of content.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(40);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('puts every part into the same group in the content and in the model', () => {
    expect(content.groups?.map((g) => g.id).sort()).toEqual(Object.keys(INTESTINE_GROUPS).sort());
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

  it('gives every macro part and group a camera focus, and every micro part its own', () => {
    for (const id of [...MACRO_PART_IDS, ...Object.keys(INTESTINE_GROUPS).filter((g) => g !== 'g-micro')]) expect(FOCUS[id], id).toBeDefined();
    for (const id of MICRO_ONLY) {
      expect(MICRO_FOCUS[id], id).toBeDefined();
      expect(MICRO_LABEL_AT[id], id).toBeDefined();
    }
    for (const id of Object.keys(LABEL_AT)) expect(MACRO_PART_IDS, id).toContain(id);
    for (const id of [...Object.keys(PART_SPREAD), ...Object.keys(CUT_Z_OF), ...Object.keys(CUT_Y_OF)]) expect(INTESTINE_PART_IDS, id).toContain(id);
    expect(Object.keys(SEG_SPREAD).sort()).toEqual([...SEGMENTS].sort());
  });

  it('is ready, loadable and has an explorable model with two cuts and a microscope mode', async () => {
    expect(getSection('kishechnik')?.ready).toBe(true);
    expect(hasSectionContent('kishechnik')).toBe(true);
    expect((await loadSectionContent('kishechnik'))?.slug).toBe('kishechnik');
    const m = MODELS.kishechnik;
    expect(m.hasCutaway).toBe(true);
    expect(m.explorer).toBe(true);
    expect(m.isolate).toBe(true);
    expect(m.explorerFundusKey).toBe('explorer.fundusIntestine');
    expect(m.modes?.map((x) => x.id)).toContain('wall');
  });

  it('links to related sections that exist', () => {
    for (const slug of content.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(content))).toEqual([]);
  });
});
