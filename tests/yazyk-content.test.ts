import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/yazyk';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { FOCUS, GROUP_OF, LABEL_AT, SPREAD, TONGUE_GROUPS, TONGUE_PART_IDS } from '../src/models/tongue/parts';
import { CUT_DEFAULT_T } from '../src/models/tongue/anatomy';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('yazyk content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(content.slug).toBe('yazyk');
    expect(content.stats.length).toBe(4);
    expect(content.does.length).toBe(3);
    expect(content.kidSay.length).toBeGreaterThanOrEqual(1);
    expect(content.kidSay.length).toBeLessThanOrEqual(2);
    expect(content.facts.length).toBeGreaterThanOrEqual(4);
    expect(content.facts.length).toBeLessThanOrEqual(6);
    expect(content.care.length).toBeGreaterThanOrEqual(4);
    expect(content.care.length).toBeLessThanOrEqual(6);
  });

  it('describes exactly the parts the model has', () => {
    expect(content.parts.map((p) => p.id).sort()).toEqual([...TONGUE_PART_IDS].sort());
    expect(new Set(content.parts.map((p) => p.id)).size).toBe(content.parts.length);
    for (const p of content.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(40);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('puts every part into the same group in the content and in the model, groups kept together', () => {
    expect(content.groups?.map((g) => g.id).sort()).toEqual(Object.keys(TONGUE_GROUPS).sort());
    for (const p of content.parts) expect(p.group, p.id).toBe(GROUP_OF[p.id]);
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
    for (const id of [...TONGUE_PART_IDS, ...Object.keys(TONGUE_GROUPS)]) expect(FOCUS[id], id).toBeDefined();
    for (const id of TONGUE_PART_IDS) {
      expect(LABEL_AT[id], id).toBeDefined();
      expect(SPREAD[id], id).toBeDefined();
      for (const v of [...LABEL_AT[id], ...FOCUS[id].at, ...SPREAD[id]]) expect(Number.isFinite(v), id).toBe(true);
    }
  });

  it('names every part the task asks for', () => {
    const must = [
      'apex', 'body', 'root', 'dorsum', 'median-sulcus', 'terminal-sulcus', 'foramen-cecum',
      'filiform', 'fungiform', 'foliate', 'vallate', 'lingual-tonsil', 'frenulum', 'ventral-surface', 'deep-lingual-vein',
      'sup-longitudinal', 'inf-longitudinal', 'transverse', 'vertical',
      'genioglossus', 'hyoglossus', 'styloglossus', 'palatoglossus', 'hyoid', 'mandible',
      'lingual-artery', 'lingual-vein', 'hypoglossal', 'lingual-nerve', 'chorda-tympani', 'glossopharyngeal', 'vagus',
      'submandibular-duct', 'sublingual-ducts', 'taste-bud', 'taste-pore', 'b-fibers',
    ];
    for (const id of must) expect(TONGUE_PART_IDS, id).toContain(id);
  });

  it('debunks the tongue map instead of repeating it', () => {
    const all = JSON.stringify(content).toLowerCase();
    expect(all).toContain('миф');
    expect(all).not.toMatch(/кончик[а-я]* (языка )?(чувствует|отвечает за) сладк/);
    expect(all).not.toMatch(/горьк[а-я]* (чувствует|ощущает)[а-я ]* корн/);
  });

  it('is ready, loadable and has an explorable model with three cuts and its modes', async () => {
    const s = getSection('yazyk');
    expect(s?.ready).toBe(true);
    expect(s?.system).toBe('digestive');
    expect(s?.icon).toBe('tongue');
    expect(s?.latin).toBe('Lingua');
    expect(hasSectionContent('yazyk')).toBe(true);
    expect((await loadSectionContent('yazyk'))?.slug).toBe('yazyk');
    const m = MODELS.yazyk;
    expect(m.hasCutaway).toBe(true);
    expect(m.explorer).toBe(true);
    expect(m.isolate).toBe(true);
    expect(m.explorerCuts?.defaults).toEqual(CUT_DEFAULT_T);
    expect(m.modes?.map((x) => x.id).sort()).toEqual(['bud', 'move', 'tongueUnderside', 'xray']);
    expect(m.description.length).toBeGreaterThan(200);
  });

  it('links to related sections that exist', () => {
    for (const slug of ['zub', 'zheludok', 'mozg']) expect(content.related).toContain(slug);
    for (const slug of content.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(content))).toEqual([]);
  });
});
