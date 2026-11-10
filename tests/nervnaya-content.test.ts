import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/nervnaya-sistema';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { GROUPS, PART_GROUPS, PART_IDS } from '../src/models/nerves/anatomy';
import { ru } from '../src/i18n/ru';

const slug = 'nervnaya-sistema';

describe('nervnaya-sistema content', () => {
  it('describes every part of the model in its own group', () => {
    expect(content.slug).toBe(slug);
    expect(content.parts.map((p) => p.id).sort()).toEqual([...PART_IDS].sort());
    expect(new Set(content.groups!.map((g) => g.id))).toEqual(new Set(Object.keys(GROUPS)));
    for (const p of content.parts) {
      expect(p.group, p.id).toBe(PART_GROUPS[p.id]);
      expect(p.latin, p.id).toBeTruthy();
      expect(p.text.length, p.id).toBeGreaterThan(80);
    }
  });

  it('names all twelve cranial nerves with their numbers', () => {
    const cranial = content.parts.filter((p) => p.group === 'g-cranial');
    expect(cranial).toHaveLength(12);
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    cranial.forEach((p, i) => expect(p.name.endsWith(`(${numerals[i]})`), p.id).toBe(true));
  });

  it('has the standard blocks', () => {
    expect(content.stats).toHaveLength(4);
    expect(content.does).toHaveLength(3);
    expect(content.kidSay.length).toBeGreaterThanOrEqual(4);
    expect(content.facts.length).toBeGreaterThanOrEqual(6);
    expect(content.care.length).toBeGreaterThanOrEqual(4);
    expect(content.related).toEqual(expect.arrayContaining(['mozg', 'glaz', 'uho', 'myshcy', 'skelet']));
    for (const s of content.related) expect(getSection(s)?.ready, s).toBe(true);
  });

  it('is wired into the registries', async () => {
    const section = getSection(slug)!;
    expect(section.ready).toBe(true);
    expect(section.system).toBe('nervous');
    expect(section.icon).toBe('nerves');
    expect(section.latin).toBe('Systema nervosum');
    expect(hasSectionContent(slug)).toBe(true);
    expect((await loadSectionContent(slug))?.slug).toBe(slug);
    const model = MODELS[slug];
    expect(model.isolate).toBe(true);
    expect(model.description.length).toBeGreaterThan(200);
    for (const mode of model.modes ?? []) expect(ru[`stage.mode.${mode.id}` as keyof typeof ru], mode.id).toBeTruthy();
  });
});
