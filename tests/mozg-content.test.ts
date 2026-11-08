import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/mozg';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import { BRAIN_GROUPS, BRAIN_PART_IDS, FOCUS, GROUP_OF, LABEL_AT, SPREAD, CUTS } from '../src/models/brain/anatomy';
import { STRUCTS, ZONE_BITS, LOBES, baseHemi, hemiField, lobeAt, stemField, cerebellumField } from '../src/models/brain/field';

describe('mozg content', () => {
  it('has a part for every model id and a known group', () => {
    expect(content.slug).toBe('mozg');
    expect(content.parts.map((p) => p.id).sort()).toEqual([...BRAIN_PART_IDS].sort());
    const groups = new Set(content.groups!.map((g) => g.id));
    expect(groups).toEqual(new Set(Object.keys(BRAIN_GROUPS)));
    for (const p of content.parts) {
      expect(groups.has(p.group!), p.id).toBe(true);
      expect(GROUP_OF[p.id]).toBe(p.group);
      expect(p.text.length, p.id).toBeGreaterThan(60);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('has focus and label anchors for every part', () => {
    for (const id of BRAIN_PART_IDS) {
      expect(FOCUS[id], id).toBeTruthy();
      expect(LABEL_AT[id], id).toBeTruthy();
    }
    for (const id of Object.keys(SPREAD)) expect(BRAIN_PART_IDS).toContain(id);
  });

  it('has the standard blocks', () => {
    expect(content.stats).toHaveLength(4);
    expect(content.does.length).toBeGreaterThanOrEqual(3);
    expect(content.kidSay.length).toBeGreaterThanOrEqual(4);
    expect(content.facts.length).toBeGreaterThanOrEqual(6);
    expect(content.care.length).toBeGreaterThanOrEqual(4);
    for (const slug of content.related) expect(getSection(slug), slug).toBeTruthy();
  });

  it('is wired into the registry', async () => {
    expect(getSection('mozg')?.ready).toBe(true);
    expect(hasSectionContent('mozg')).toBe(true);
    expect((await loadSectionContent('mozg'))?.slug).toBe('mozg');
    const m = MODELS.mozg;
    expect(m.explorer).toBe(true);
    expect(m.hasCutaway).toBe(true);
    expect(m.explorerCuts).toBeTruthy();
    expect(m.description.length).toBeGreaterThan(100);
  });
});

describe('brain fields', () => {
  it('keeps the hemisphere inside, the midline gap outside and every structure non-empty', () => {
    expect(hemiField(36, 10, 0, 1)).toBeLessThan(0);
    expect(hemiField(-36, 10, 0, -1)).toBeLessThan(0);
    expect(baseHemi(0, 10, 0)).toBeGreaterThan(0);
    expect(stemField(0, -50, -14)).toBeLessThan(0);
    expect(cerebellumField(0, -52, -62)).toBeLessThan(0.5);
    for (const s of STRUCTS) {
      const [x0, y0, z0, x1, y1, z1] = s.box;
      let inside = false;
      for (let i = 0; i < 24 && !inside; i++)
        for (let j = 0; j < 24 && !inside; j++)
          for (let k = 0; k < 24 && !inside; k++) inside = s.sdf(x0 + ((x1 - x0) * i) / 23, y0 + ((y1 - y0) * j) / 23, z0 + ((z1 - z0) * k) / 23) < 0;
      expect(inside, s.id).toBe(true);
    }
  });

  it('classifies the four lobes', () => {
    expect(lobeAt(30, 20, 60)).toBe(0);
    expect(lobeAt(30, 40, -30)).toBe(1);
    expect(lobeAt(68, -27, -2)).toBe(2);
    expect(lobeAt(30, 10, -80)).toBe(3);
    expect(LOBES).toHaveLength(5);
    expect(ZONE_BITS.length).toBeLessThanOrEqual(16);
  });

  it('has valid cut ranges', () => {
    for (const c of Object.values(CUTS)) expect(c.def).toBeGreaterThan(c.min), expect(c.def).toBeLessThan(c.max);
  });
});
