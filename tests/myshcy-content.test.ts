import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/myshcy';
import { GROUP_IDS, MUSCLE_IDS, GROUP_OF } from '../src/models/muscles/anatomy';
import { getSection } from '../src/content/sections';
import { MODELS } from '../src/models/registry';

describe('раздел «Мышцы»', () => {
  it('раздел готов и у него есть модель', () => {
    expect(getSection('myshcy')?.ready).toBe(true);
    expect(MODELS.myshcy).toBeDefined();
  });
  it('каждая мышца модели описана в «Из чего состоит», и наоборот', () => {
    expect(content.parts.map((p) => p.id).sort()).toEqual([...MUSCLE_IDS].sort());
  });
  it('группы совпадают с моделью, части идут по группам подряд', () => {
    expect(content.groups!.map((g) => g.id)).toEqual([...GROUP_IDS]);
    const seen: string[] = [];
    for (const p of content.parts) {
      expect(p.group, p.id).toBe(GROUP_OF[p.id]);
      if (seen[seen.length - 1] !== p.group) {
        expect(seen.includes(p.group!), `группа ${p.group} разорвана`).toBe(false);
        seen.push(p.group!);
      }
    }
  });
  it('у каждой части есть название, латынь и текст', () => {
    for (const p of content.parts) {
      expect(p.name.length, p.id).toBeGreaterThan(3);
      expect(p.latin, p.id).toBeTruthy();
      expect(p.text.length, p.id).toBeGreaterThan(40);
    }
  });
  it('связанные разделы существуют', () => {
    for (const s of content.related) expect(getSection(s), s).toBeDefined();
  });
});
