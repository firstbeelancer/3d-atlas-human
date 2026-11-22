import { describe, expect, it } from 'vitest';
import { getHormone, HORMONE_CATEGORIES, HORMONES } from '../src/content/hormones';
import { loadHormoneContent } from '../src/content/hormones/loadHormone';
import { ALL_HORMONE_CONTENT } from '../src/content/hormones/allHormones';
import { getSection } from '../src/content/sections';
import { search } from '../src/lib/search';
import { CPK_COLORS, getHormoneLegend, getMoleculeSpec, MOLECULE_SLUGS } from '../src/models/hormone/chemistry';
import { HORMONE_PATHWAYS, ORGAN_NODES } from '../src/models/hormone/pathwayData';

describe('hormones sub-pages catalog & 3D chemistry', () => {
  it('registers all 18 hormones cleanly across 5 categories with valid links', () => {
    expect(HORMONES).toHaveLength(18);
    expect(HORMONE_CATEGORIES).toHaveLength(5);
    expect(new Set(HORMONES.map((h) => h.slug)).size).toBe(HORMONES.length);
    expect(MOLECULE_SLUGS.sort()).toEqual(HORMONES.map((h) => h.slug).sort());

    const catIds = new Set(HORMONE_CATEGORIES.map((c) => c.id));
    for (const h of HORMONES) {
      expect(catIds.has(h.category), h.slug).toBe(true);
      expect(h.title.trim(), h.slug).not.toBe('');
      expect(h.latin.trim(), h.slug).not.toBe('');
      expect(h.formula.trim(), h.slug).not.toBe('');
      expect(h.tagline.length, h.slug).toBeGreaterThan(20);
      for (const rel of h.relatedHormones) expect(getHormone(rel), `${h.slug}->${rel}`).toBeDefined();
      for (const sec of h.relatedSections) expect(getSection(sec)?.ready, `${h.slug}->${sec}`).toBe(true);
    }
  });

  it('builds finite, connected 3D molecular structures and body pathways for every hormone', () => {
    for (const h of HORMONES) {
      const mol = getMoleculeSpec(h.slug);
      if (mol.kind === 'atomic') {
        expect(mol.atoms.length, h.slug).toBeGreaterThanOrEqual(15);
        expect(mol.bonds.length, h.slug).toBeGreaterThanOrEqual(15);
        for (const a of mol.atoms) {
          for (const c of a.pos) expect(Number.isFinite(c), `${h.slug}:atom${a.id}`).toBe(true);
        }
        for (const b of mol.bonds) {
          expect(b.a, h.slug).toBeGreaterThanOrEqual(0);
          expect(b.a, h.slug).toBeLessThan(mol.atoms.length);
          expect(b.b, h.slug).toBeGreaterThanOrEqual(0);
          expect(b.b, h.slug).toBeLessThan(mol.atoms.length);
          expect(b.a, h.slug).not.toBe(b.b);
        }
      } else {
        expect(mol.ribbons.length, h.slug).toBeGreaterThanOrEqual(3);
        for (const r of mol.ribbons) {
          expect(r.points.length, h.slug).toBeGreaterThanOrEqual(2);
          for (const pt of r.points) for (const c of pt) expect(Number.isFinite(c)).toBe(true);
        }
      }
      expect(Object.keys(mol.labelAt).sort(), h.slug).toEqual(['mol-active', 'mol-core', 'mol-tail']);

      const pw = HORMONE_PATHWAYS[h.slug];
      expect(pw, h.slug).toBeDefined();
      expect(pw.sources.length, h.slug).toBeGreaterThan(0);
      expect(pw.targets.length, h.slug).toBeGreaterThan(0);
      expect(pw.brakes.length, h.slug).toBeGreaterThan(0);
      for (const id of [...pw.sources, ...pw.targets, ...pw.brakes]) {
        expect(ORGAN_NODES[id], `${h.slug}:${id}`).toBeDefined();
      }
    }
  });

  it('loads complete Russian articles with production, neutralization, and 6 synced 3D parts', async () => {
    for (const h of HORMONES) {
      const loaded = await loadHormoneContent(h.slug);
      expect(loaded, h.slug).toBeDefined();
      expect(loaded).toEqual(ALL_HORMONE_CONTENT[h.slug]);
      expect(loaded!.stats).toHaveLength(4);
      expect(loaded!.does.length).toBeGreaterThanOrEqual(2);
      expect(loaded!.production.length).toBeGreaterThanOrEqual(2);
      expect(loaded!.neutralized.length).toBeGreaterThanOrEqual(2);
      expect(loaded!.balance.excess.length).toBeGreaterThan(40);
      expect(loaded!.balance.deficit.length).toBeGreaterThan(40);
      expect(loaded!.kidSay.length).toBeGreaterThanOrEqual(2);
      expect(loaded!.facts.length).toBeGreaterThanOrEqual(3);
      expect(loaded!.parts.map((p) => p.id).sort()).toEqual([
        'body-brake',
        'body-source',
        'body-targets',
        'mol-active',
        'mol-core',
        'mol-tail',
      ]);
    }
  });

  it('finds individual hormones in global search', () => {
    expect(search('адреналин')[0].slug).toBe('gormony/adrenalin');
    expect(search('серотонин')[0].slug).toBe('gormony/serotonin');
    expect(search('эндорфин')[0].slug).toBe('gormony/endorfin');
    expect(search('мелатонин')[0].slug).toBe('gormony/melatonin');
  });

  it('documents every visible element (including hydrogen) and pathway role in the legend for all 18 hormones', () => {
    for (const h of HORMONES) {
      const mol = getMoleculeSpec(h.slug);
      const molLegend = getHormoneLegend(h.slug, h.accent, false);
      const pathLegend = getHormoneLegend(h.slug, h.accent, true);

      expect(pathLegend.map((x) => x.label)).toEqual([
        'hormone.legend.source',
        'hormone.legend.targets',
        'hormone.legend.brake',
      ]);

      if (mol.kind === 'atomic') {
        const presentElements = new Set(mol.atoms.map((a) => a.el));
        expect(presentElements.has('H'), `${h.slug} must have H atoms`).toBe(true);
        const legendColors = new Set(molLegend.map((item) => item.color));
        for (const el of presentElements) {
          expect(legendColors.has(CPK_COLORS[el]), `${h.slug} legend missing ${el}`).toBe(true);
        }
        expect(molLegend, `${h.slug} legend should have exact count of present elements`).toHaveLength(presentElements.size);
        expect(molLegend.some((item) => item.label === 'hormone.legend.hydrogen'), h.slug).toBe(true);
      } else {
        expect(molLegend.length, h.slug).toBe(3);
      }
    }

    // Проверка точной стехиометрии (включая все атомы водорода H) для 6 аминов и тироксина
    const expectedCounts: Record<string, Partial<Record<string, number>>> = {
      adrenalin: { C: 9, H: 13, N: 1, O: 3 },
      noradrenalin: { C: 8, H: 11, N: 1, O: 3 },
      dofamin: { C: 8, H: 11, N: 1, O: 2 },
      serotonin: { C: 10, H: 12, N: 2, O: 1 },
      melatonin: { C: 13, H: 16, N: 2, O: 2 },
      tiroksin: { C: 15, H: 11, I: 4, N: 1, O: 4 },
    };
    for (const [slug, expected] of Object.entries(expectedCounts)) {
      const counts: Record<string, number> = {};
      for (const a of getMoleculeSpec(slug).atoms) counts[a.el] = (counts[a.el] ?? 0) + 1;
      expect(counts, slug).toEqual(expected);
    }
  });
});
