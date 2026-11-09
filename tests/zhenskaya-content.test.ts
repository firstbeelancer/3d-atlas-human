import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/zhenskaya-reproduktivnaya';
import { adultGroups, adultParts } from '../src/content/ru/adult/zhenskaya-vulva';
import { FEMALE_GROUPS, FEMALE_PART_IDS, VULVA_IDS } from '../src/models/female/parts';
import { getSection } from '../src/content/sections';

describe('раздел «Женская репродуктивная система»: тексты', () => {
  it('раздел опубликован и помечен как 18+', () => {
    const s = getSection('zhenskaya-reproduktivnaya')!;
    expect(s.ready).toBe(true);
    expect(s.adultParts).toBe(true);
  });

  it('каждая часть модели описана, описаний без модели нет', () => {
    expect(content.parts.map((p) => p.id).sort()).toEqual([...FEMALE_PART_IDS].sort());
  });

  it('части сгруппированы теми же группами, что и модель', () => {
    const groups = new Set(content.groups!.map((g) => g.id));
    expect([...groups].sort()).toEqual(Object.keys(FEMALE_GROUPS).sort());
    for (const p of content.parts) expect(groups.has(p.group!), p.id).toBe(true);
  });

  it('у частей есть название, латынь и достаточно длинное пояснение', () => {
    for (const p of content.parts) {
      expect(p.name.length, p.id).toBeGreaterThan(3);
      expect(p.latin, p.id).toBeTruthy();
      expect(p.text.length, p.id).toBeGreaterThan(120);
    }
  });

  it('части 18+ лежат в отдельном модуле и не попали в основной текст', () => {
    expect(adultParts.map((p) => p.id).sort()).toEqual([...VULVA_IDS].sort());
    expect(adultGroups[0].id).toBe('g-vulva');
    for (const p of adultParts) expect(p.adult).toBe(true);
    expect(content.parts.some((p) => (VULVA_IDS as readonly string[]).includes(p.id))).toBe(false);
  });

  it('цифры и факты на месте', () => {
    expect(content.stats).toHaveLength(4);
    expect(content.facts.length).toBeGreaterThanOrEqual(6);
    expect(content.kidSay.length).toBeGreaterThanOrEqual(3);
  });
});
