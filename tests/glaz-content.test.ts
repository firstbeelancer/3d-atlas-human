import { describe, expect, it } from 'vitest';
import glaz from '../src/content/ru/glaz';
import { getSection } from '../src/content/sections';
import { MODELS } from '../src/models/registry';
import { EYE_GROUPS, EYE_PART_IDS, FOCUS, GROUP_OF, LABEL_AT, SPREAD } from '../src/models/eye/parts';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

describe('eye content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(glaz.slug).toBe('glaz');
    expect(glaz.stats.length).toBeGreaterThanOrEqual(3);
    expect(glaz.stats.length).toBeLessThanOrEqual(5);
    expect(glaz.does.length).toBeGreaterThanOrEqual(2);
    expect(glaz.does.length).toBeLessThanOrEqual(3);
    expect(glaz.kidSay.length).toBeGreaterThanOrEqual(1);
    expect(glaz.kidSay.length).toBeLessThanOrEqual(2);
    expect(glaz.facts.length).toBeGreaterThanOrEqual(3);
    expect(glaz.facts.length).toBeLessThanOrEqual(5);
    expect(glaz.care.length).toBeGreaterThanOrEqual(3);
    expect(glaz.care.length).toBeLessThanOrEqual(5);
  });

  it('describes exactly the parts the model has', () => {
    expect(glaz.parts.map((p) => p.id).sort()).toEqual([...EYE_PART_IDS].sort());
    for (const p of glaz.parts) {
      expect(p.text.length, p.id).toBeGreaterThan(30);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('puts every part into the same group in the content and in the model', () => {
    expect(glaz.groups?.map((g) => g.id).sort()).toEqual(Object.keys(EYE_GROUPS).sort());
    for (const p of glaz.parts) expect(p.group, p.id).toBe(GROUP_OF[p.id]);
  });

  it('keeps the parts of a group next to each other (the list prints one heading per run)', () => {
    const seen = new Set<string>();
    let prev: string | undefined;
    for (const p of glaz.parts) {
      if (p.group !== prev) {
        expect(seen.has(p.group!), `${p.group} is split`).toBe(false);
        seen.add(p.group!);
      }
      prev = p.group;
    }
  });

  it('gives every part a camera focus, and groups too', () => {
    for (const id of [...EYE_PART_IDS, ...Object.keys(EYE_GROUPS)]) expect(FOCUS[id], id).toBeDefined();
    for (const id of Object.keys(LABEL_AT)) expect(EYE_PART_IDS, id).toContain(id);
    for (const id of Object.keys(SPREAD)) expect(EYE_PART_IDS, id).toContain(id);
  });

  it('is ready and has an explorable model with a cutaway', () => {
    expect(getSection('glaz')?.ready).toBe(true);
    expect(MODELS.glaz.hasCutaway).toBe(true);
    expect(MODELS.glaz.explorer).toBe(true);
  });

  it('links to related sections that exist', () => {
    for (const slug of glaz.related) expect(getSection(slug), slug).toBeDefined();
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(glaz))).toEqual([]);
  });
});
