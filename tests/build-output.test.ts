import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script without type declarations
import { findEmoji } from '../scripts/check-no-emoji.mjs';

const DIST = join(__dirname, '..', 'dist');
const built = existsSync(join(DIST, 'index.html'));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// Запускается после `npm run build`; без dist/ пропускается.
describe.skipIf(!built)('build output', () => {
  it('writes a page with its own title for every section', () => {
    const html = readFileSync(join(DIST, 'razdel', 'serdce', 'index.html'), 'utf8');
    expect(html).toContain('<title>Сердце — 3D-атлас человека</title>');
    expect(html).toContain('Мышечный насос размером с кулак');
    expect(existsSync(join(DIST, 'razdel', 'gormony', 'index.html'))).toBe(true);
  });

  it('writes the about page and a 404 page', () => {
    expect(readFileSync(join(DIST, 'o-proekte', 'index.html'), 'utf8')).toContain('<title>О проекте — 3D-атлас человека</title>');
    expect(readFileSync(join(DIST, '404.html'), 'utf8')).toContain('<title>Страница не найдена — 3D-атлас человека</title>');
  });

  it('lists home, about and 23 sections in the sitemap', () => {
    const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    expect(xml.match(/<loc>/g)).toHaveLength(25);
    expect(readFileSync(join(DIST, 'robots.txt'), 'utf8')).toContain('Sitemap:');
  });

  it('keeps 18+ content out of the main bundle', () => {
    const assets = join(DIST, 'assets');
    const entry = readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f));
    expect(entry.length).toBeGreaterThan(0);
    for (const f of entry) expect(readFileSync(join(assets, f), 'utf8')).not.toContain('ADULT_CONTENT_MARKER');
    const all = readdirSync(assets).map((f) => readFileSync(join(assets, f), 'utf8'));
    expect(all.some((src) => src.includes('ADULT_CONTENT_MARKER'))).toBe(true);
  });

  it('has no emoji in any page', () => {
    for (const f of walk(DIST).filter((p) => p.endsWith('.html'))) {
      expect(findEmoji(readFileSync(f, 'utf8')), f).toEqual([]);
    }
  });
});
