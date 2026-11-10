import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { SECTIONS } from '../src/content/sections';
import { ru } from '../src/i18n/ru';
import { ALL_SECTION_CONTENT } from '../src/content/allContent';
import { aboutLicense, aboutParagraphs } from '../src/content/ru/about';

interface Page {
  path: string;
  title: string | null;
  description: string;
  /** Текст страницы для поисковиков: кладётся внутрь #root, React при запуске заменяет его. */
  body?: string;
  /** Раздел ещё не готов — не индексировать и не класть в sitemap. */
  noindex?: boolean;
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
    .replace(
      '</head>',
      `    <link rel="canonical" href="${siteUrl}${page.path}" />\n${page.noindex ? '    <meta name="robots" content="noindex" />\n' : ''}  </head>`,
    )
    .replace('<div id="root"></div>', `<div id="root">${page.body ?? ''}</div>`);
}

const p = (text: string) => `<p>${escape(text)}</p>`;
const wrap = (inner: string) => `<main class="mx-auto max-w-[1320px] px-4 py-12">${inner}</main>`;

function homeBody(): string {
  const items = SECTIONS.filter((s) => s.ready)
    .map((s) => `<li><a href="/razdel/${s.slug}">${escape(s.title)}</a> — ${escape(s.tagline)}</li>`)
    .join('');
  return wrap(
    `<h1>${escape(ru['home.title'])}</h1>${p(ru['site.description'])}${p(ru['home.lead'])}` +
      `<h2>${escape(ru['home.indexLabel'])}</h2><ul>${items}</ul><p><a href="/o-proekte">${escape(ru['nav.about'])}</a></p>`,
  );
}

function aboutBody(): string {
  return wrap(`<h1>${escape(ru['nav.about'])}</h1>${aboutParagraphs.map(p).join('')}${p(aboutLicense)}`);
}

function sectionBody(slug: string, title: string, latin: string, tagline: string): string {
  const c = ALL_SECTION_CONTENT[slug];
  let html = `<h1>${escape(title)}</h1><p>${escape(latin)}</p>${p(tagline)}`;
  if (!c) return wrap(html + p(ru['section.soonText']));
  html += `<ul>${c.stats.map((st) => `<li>${escape(st.value)} — ${escape(st.label)}</li>`).join('')}</ul>`;
  html += `<h2>${escape(ru['section.does'])}</h2>${c.does.map(p).join('')}`;
  // Части 18+ в статический HTML не попадают.
  const parts = c.parts.filter((pt) => !pt.adult);
  html += `<h2>${escape(ru['section.parts'])}</h2><ul>${parts
    .map((pt) => `<li><strong>${escape(pt.name)}</strong>${pt.latin ? ` (${escape(pt.latin)})` : ''}. ${escape(pt.text)}</li>`)
    .join('')}</ul>`;
  if (c.facts.length) html += `<h2>${escape(ru['section.facts'])}</h2><ul>${c.facts.map((f) => `<li>${escape(f)}</li>`).join('')}</ul>`;
  const related = c.related
    .map((r) => SECTIONS.find((s) => s.slug === r))
    .filter((s) => s !== undefined)
    .map((s) => `<li><a href="/razdel/${s.slug}">${escape(s.title)}</a></li>`)
    .join('');
  if (related) html += `<h2>${escape(ru['section.related'])}</h2><ul>${related}</ul>`;
  return wrap(html);
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
        { path: '/', title: null, description: ru['site.description'], body: homeBody() },
        { path: '/o-proekte', title: ru['nav.about'], description: ru['site.description'], body: aboutBody() },
        ...SECTIONS.map((s) => ({
          path: `/razdel/${s.slug}`,
          title: s.title,
          description: s.tagline,
          body: sectionBody(s.slug, s.title, s.latin, s.tagline),
          noindex: !s.ready,
        })),
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
      const urls = pages.filter((pg) => !pg.noindex).map((p) => `  <url><loc>${siteUrl}${p.path}</loc></url>`).join('\n');
      writeFileSync(
        join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      );
      writeFileSync(join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
    },
  };
}
