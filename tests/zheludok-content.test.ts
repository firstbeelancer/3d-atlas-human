import { describe, expect, it } from 'vitest';
import { getSection } from '../src/content/sections';
import { loadSectionContent, hasSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { GROUPS, PART_IDS } from '../src/models/stomach/anatomy';
import type { SectionContent } from '../src/content/types';
import zheludok from '../src/content/ru/zheludok';

describe('zheludok content', () => {
  let content: SectionContent;

  it('is ready and has content and a model with a cutaway', async () => {
    expect(getSection('zheludok')?.ready).toBe(true);
    expect(hasSectionContent('zheludok')).toBe(true);
    content = (await loadSectionContent('zheludok'))!;
    expect(content.slug).toBe('zheludok');
    expect(MODELS.zheludok?.hasCutaway).toBe(true);
    expect(MODELS.zheludok?.isolate).toBe(true);
    expect(MODELS.zheludok?.modes?.map((m) => m.id)).toEqual(['explode', 'layers', 'gland']);
  });

  it('describes every part of the 3D model exactly once', async () => {
    content = (await loadSectionContent('zheludok'))!;
    const ids = content.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...PART_IDS].sort());
  });

  it('puts every part into a known group that matches the model groups', async () => {
    content = (await loadSectionContent('zheludok'))!;
    const groupIds = content.groups!.map((g) => g.id);
    expect(groupIds.sort()).toEqual(Object.keys(GROUPS).sort());
    for (const p of content.parts) {
      expect(p.group, p.id).toBeDefined();
      expect((GROUPS[p.group as keyof typeof GROUPS] as readonly string[]).includes(p.id), p.id).toBe(true);
      expect(p.name.trim(), p.id).not.toBe('');
      expect(p.text.length, p.id).toBeGreaterThan(40);
    }
  });

  it('has the standard blocks filled in', async () => {
    content = (await loadSectionContent('zheludok'))!;
    expect(content.stats).toHaveLength(4);
    expect(content.does.length).toBeGreaterThanOrEqual(3);
    expect(content.kidSay.length).toBeGreaterThanOrEqual(2);
    expect(content.facts.length).toBeGreaterThanOrEqual(5);
    expect(content.care.length).toBeGreaterThanOrEqual(5);
    for (const slug of content.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('does not teach that food falls down the oesophagus', () => {
    expect(zheludok.kidSay.join(' ')).not.toMatch(/падает/);
  });

  it('gets the history right: Alexis St. Martin was a Canadian voyageur', () => {
    const fact = zheludok.facts.find((f) => f.includes('Сен-Мартен'))!;
    expect(fact).toMatch(/канадск/);
    expect(fact).not.toMatch(/американск/);
  });

  it('does not claim that soup leaves the stomach over hours', () => {
    expect(zheludok.does.join(' ')).not.toMatch(/супа/);
  });
});
