import { describe, expect, it } from 'vitest';
import { SECTIONS, getSection } from '../src/content/sections';
import { SYSTEMS } from '../src/content/systems';

const SLUGS = [
  'kletki-i-belki', 'skelet', 'myshcy', 'vnutrennie-organy', 'nervnaya-sistema', 'mozg', 'glaz', 'uho', 'zub', 'nos', 'yazyk', 'legkie',
  'serdce', 'selezenka', 'zheludok', 'pechen', 'podzheludochnaya', 'zhelchnyj-puzyr', 'pochki', 'mochevoj-puzyr',
  'kishechnik', 'zhenskaya-reproduktivnaya', 'muzhskaya-reproduktivnaya', 'krovenosnaya-sistema',
  'volosy-i-nogti', 'beremennost', 'gormony',
];

describe('section registry', () => {
  it('lists the sections in atlas order', () => {
    expect(SECTIONS.map((s) => s.slug)).toEqual(SLUGS);
  });

  it('has unique slugs', () => {
    expect(new Set(SECTIONS.map((s) => s.slug)).size).toBe(SECTIONS.length);
  });

  it('assigns every section to a known system', () => {
    const ids = new Set(SYSTEMS.map((s) => s.id));
    for (const s of SECTIONS) expect(ids.has(s.system), s.slug).toBe(true);
  });

  it('has non-empty title, latin and tagline everywhere', () => {
    for (const s of SECTIONS) {
      expect(s.title.trim(), s.slug).not.toBe('');
      expect(s.latin.trim(), s.slug).not.toBe('');
      expect(s.tagline.trim(), s.slug).not.toBe('');
    }
  });

  it('marks exactly the reproductive and pregnancy sections as having adult parts', () => {
    expect(SECTIONS.filter((s) => s.adultParts).map((s) => s.slug).sort()).toEqual(
      ['beremennost', 'muzhskaya-reproduktivnaya', 'zhenskaya-reproduktivnaya'],
    );
  });

  it('uses every system in the catalog', () => {
    for (const sys of SYSTEMS) expect(SECTIONS.some((s) => s.system === sys.id), sys.id).toBe(true);
  });

  it('finds a section by slug', () => {
    expect(getSection('serdce')?.title).toBe('Сердце');
    expect(getSection('nope')).toBeUndefined();
  });
});
