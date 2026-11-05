import { describe, expect, it } from 'vitest';
import serdce from '../src/content/ru/serdce';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

const PART_IDS = [
  'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'aorta', 'pulmonary-trunk',
  'superior-vena-cava', 'inferior-vena-cava', 'pulmonary-veins', 'tricuspid-valve', 'mitral-valve',
  'septum', 'coronary-arteries',
];

describe('heart content', () => {
  it('has the agreed amount of text in every block', () => {
    expect(serdce.slug).toBe('serdce');
    expect(serdce.stats.length).toBeGreaterThanOrEqual(3);
    expect(serdce.stats.length).toBeLessThanOrEqual(5);
    expect(serdce.does.length).toBeGreaterThanOrEqual(2);
    expect(serdce.does.length).toBeLessThanOrEqual(3);
    expect(serdce.kidSay.length).toBeGreaterThanOrEqual(1);
    expect(serdce.kidSay.length).toBeLessThanOrEqual(2);
    expect(serdce.facts.length).toBeGreaterThanOrEqual(3);
    expect(serdce.facts.length).toBeLessThanOrEqual(5);
    expect(serdce.care.length).toBeGreaterThanOrEqual(3);
    expect(serdce.care.length).toBeLessThanOrEqual(5);
  });

  it('describes exactly the parts the model has', () => {
    expect(serdce.parts.map((p) => p.id).sort()).toEqual([...PART_IDS].sort());
    for (const p of serdce.parts) expect(p.text.length, p.id).toBeGreaterThan(30);
  });

  it('links to related sections', () => {
    expect(serdce.related).toEqual(expect.arrayContaining(['krovenosnaya-sistema', 'legkie']));
  });

  it('contains no emoji', () => {
    expect(findEmoji(JSON.stringify(serdce))).toEqual([]);
  });
});
