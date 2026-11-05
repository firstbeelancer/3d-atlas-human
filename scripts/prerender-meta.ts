import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { SECTIONS } from '../src/content/sections';
import { ru } from '../src/i18n/ru';

interface Page {
  path: string;
  title: string | null;
  description: string;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function withMeta(template: string, page: Page, siteUrl: string): string {
  const full = page.title ? `${page.title} — ${ru['site.name']}` : ru['site.name'];
  const t = escape(full);
  const d = escape(page.description);
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${d}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${t}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${d}" />`)
    .replace('</head>', `    <link rel="canonical" href="${siteUrl}${page.path}" />\n  </head>`);
}

/**
 * После сборки пишет dist/<маршрут>/index.html с заголовком и описанием каждой страницы,
 * а также 404.html, sitemap.xml и robots.txt. Так поисковики и соцсети видят правильные подписи.
 */
export function prerenderMeta(): Plugin {
  let outDir = 'dist';
  return {
    name: 'atlas-prerender-meta',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    closeBundle() {
      const siteUrl = (process.env.SITE_URL ?? 'http://localhost').replace(/\/$/, '');
      const template = readFileSync(join(outDir, 'index.html'), 'utf8');
      const pages: Page[] = [
        { path: '/', title: null, description: ru['site.description'] },
        { path: '/o-proekte', title: ru['nav.about'], description: ru['site.description'] },
        ...SECTIONS.map((s) => ({ path: `/razdel/${s.slug}`, title: s.title, description: s.tagline })),
      ];
      for (const page of pages) {
        const dir = join(outDir, page.path);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), withMeta(template, page, siteUrl));
      }
      writeFileSync(
        join(outDir, '404.html'),
        withMeta(template, { path: '/404', title: ru['notFound.title'], description: ru['notFound.text'] }, siteUrl),
      );
      const urls = pages.map((p) => `  <url><loc>${siteUrl}${p.path}</loc></url>`).join('\n');
      writeFileSync(
        join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      );
      writeFileSync(join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
    },
  };
}
