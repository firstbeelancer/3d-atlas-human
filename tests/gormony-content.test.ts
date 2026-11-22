import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/gormony';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { GROUPS, PART_GROUPS, PART_IDS } from '../src/models/endocrine/anatomy';
import { ru } from '../src/i18n/ru';

const slug = 'gormony';

describe('gormony content', () => {
  it('describes every part of the endocrine model in its own group', () => {
    expect(content.slug).toBe(slug);
    expect(content.parts.map((p) => p.id).sort()).toEqual([...PART_IDS].sort());
    expect(new Set(content.groups!.map((g) => g.id))).toEqual(new Set(Object.keys(GROUPS)));
    for (const p of content.parts) {
      expect(p.group, p.id).toBe(PART_GROUPS[p.id]);
      expect(p.latin, p.id).toBeTruthy();
      expect(p.text.length, p.id).toBeGreaterThan(80);
    }
  });

  it('has all standard atlas editorial blocks and valid ready related links', () => {
    expect(content.stats).toHaveLength(4);
    expect(content.does).toHaveLength(3);
    expect(content.kidSay.length).toBeGreaterThanOrEqual(4);
    expect(content.facts.length).toBeGreaterThanOrEqual(6);
    expect(content.care.length).toBeGreaterThanOrEqual(4);
    expect(content.related).toEqual(
      expect.arrayContaining(['mozg', 'nervnaya-sistema', 'krovenosnaya-sistema', 'podzheludochnaya', 'pochki']),
    );
    for (const s of content.related) expect(getSection(s)?.ready, s).toBe(true);
  });

  it('is wired into registries, i18n, and prerender loaders', async () => {
    const section = getSection(slug)!;
    expect(section.ready).toBe(true);
    expect(section.system).toBe('endocrine');
    expect(section.icon).toBe('hormones');
    expect(section.latin).toBe('Systema endocrinum');
    expect(hasSectionContent(slug)).toBe(true);
    expect((await loadSectionContent(slug))?.slug).toBe(slug);
    const model = MODELS[slug];
    expect(model.explorer).toBe(true);
    expect(model.hasCutaway).toBe(true);
    expect(model.isolate).toBe(true);
    expect(model.description.length).toBeGreaterThan(250);
    for (const mode of model.modes ?? []) {
      expect(ru[`stage.mode.${mode.id}` as keyof typeof ru], mode.id).toBeTruthy();
    }
    for (const item of model.legend ?? []) {
      expect(ru[item.label], item.label).toBeTruthy();
    }
  });
});
