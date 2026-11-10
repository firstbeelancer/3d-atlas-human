import { describe, expect, it } from 'vitest';
import { ALL_SECTION_CONTENT } from '../src/content/allContent';
import { hasSectionContent } from '../src/content/loadSection';
import { SECTIONS } from '../src/content/sections';

describe('prerender content map', () => {
  it('has the same sections as the lazy loaders', () => {
    for (const s of SECTIONS) {
      expect(s.slug in ALL_SECTION_CONTENT, s.slug).toBe(hasSectionContent(s.slug));
    }
  });
});
