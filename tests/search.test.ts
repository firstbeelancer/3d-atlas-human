import { describe, expect, it } from 'vitest';
import { search } from '../src/lib/search';
import serdce from '../src/content/ru/serdce';

describe('search', () => {
  it('finds a section by its title first', () => {
    expect(search('сердце')[0].slug).toBe('serdce');
  });

  it('ignores case', () => {
    expect(search('ЖЕЛУДОК').map((r) => r.slug)).toContain('zheludok');
  });

  it('ignores surrounding spaces', () => {
    expect(search('печень ')).toEqual(search('печень'));
  });

  it('treats ё and е as the same letter', () => {
    expect(search('легкие').map((r) => r.slug)).toContain('legkie');
  });

  it('returns nothing for an empty query', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });

  it('finds a section through the name of its part', () => {
    const res = search('аорта', { serdce: serdce.parts });
    expect(res[0]).toEqual({ slug: 'serdce', title: 'Сердце', match: 'Аорта' });
  });

  it('finds by latin name', () => {
    expect(search('hepar').map((r) => r.slug)).toContain('pechen');
  });

  it('lists each section once', () => {
    const res = search('с', { serdce: serdce.parts });
    expect(new Set(res.map((r) => r.slug)).size).toBe(res.length);
  });
});
