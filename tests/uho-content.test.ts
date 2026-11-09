import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/uho';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import {
  CANALS, CANAL_PTS, COCH, COCH_TH, CUTS, CUT_DEFAULT_T, EAR_GROUPS, EAR_PART_IDS, FOCUS, GROUP_OF, LABEL_AT, PART_SPREAD, RW, T, TM_ANT, TM_N, TM_UP, VEST_C,
  cochCenter, cochTube, toTM, vdot, vlen, vsub,
} from '../src/models/ear/anatomy';
import { STAPES, airField, boneField, incusField, malleusField, mastoidSegs, stapesField } from '../src/models/ear/field';
import { runJob } from '../src/models/ear/jobs';

describe('uho content', () => {
  it('has a text for every model part and a known group', () => {
    expect(content.slug).toBe('uho');
    expect(content.parts.map((p) => p.id).sort()).toEqual([...EAR_PART_IDS].sort());
    const groups = new Set(content.groups!.map((g) => g.id));
    expect(groups).toEqual(new Set(Object.keys(EAR_GROUPS)));
    for (const p of content.parts) {
      expect(groups.has(p.group!), p.id).toBe(true);
      expect(GROUP_OF[p.id]).toBe(p.group);
      expect(p.text.length, p.id).toBeGreaterThan(60);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('has focus and label anchors for every part', () => {
    for (const id of EAR_PART_IDS) {
      expect(FOCUS[id], id).toBeTruthy();
      expect(LABEL_AT[id], id).toBeTruthy();
      expect(LABEL_AT[id].every(Number.isFinite), id).toBe(true);
    }
    for (const id of Object.keys(PART_SPREAD)) expect(EAR_PART_IDS).toContain(id);
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
    expect(getSection('uho')?.ready).toBe(true);
    expect(hasSectionContent('uho')).toBe(true);
    expect((await loadSectionContent('uho'))?.slug).toBe('uho');
    const m = MODELS.uho;
    expect(m.explorer).toBe(true);
    expect(m.hasCutaway).toBe(true);
    expect(m.explorerCuts).toBeTruthy();
    expect(m.description.length).toBeGreaterThan(100);
  });
});

describe('ear anatomy', () => {
  it('has an orthonormal tympanic frame and a canal about 2.5 cm long', () => {
    expect(vdot(TM_N, TM_UP)).toBeCloseTo(0, 6);
    expect(vdot(TM_N, TM_ANT)).toBeCloseTo(0, 6);
    expect(vdot(TM_UP, TM_ANT)).toBeCloseTo(0, 6);
    const len = vlen(vsub(CANAL_PTS[CANAL_PTS.length - 1], CANAL_PTS[0]));
    expect(len).toBeGreaterThan(24);
    expect(len).toBeLessThan(32);
    // перепонка смотрит наружу, вниз и вперёд
    expect(TM_N[0]).toBeGreaterThan(0.7);
    expect(TM_N[1]).toBeLessThan(0);
  });

  it('keeps the semicircular canals roughly perpendicular and attached to the vestibule', () => {
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.abs(vdot(CANALS[i].n, CANALS[j].n))).toBeLessThan(0.35);
    for (const c of CANALS) expect(vlen(vsub(c.c, VEST_C))).toBeLessThan(c.R * 1.2);
  });

  it('has a tapering cochlea of two and three quarter turns', () => {
    expect(COCH.turns).toBe(2.75);
    expect(cochTube(0)).toBeGreaterThan(cochTube(COCH_TH));
    expect(toTM(cochCenter(0)).every(Number.isFinite)).toBe(true);
    expect(vdot(vsub(cochCenter(COCH_TH), cochCenter(0)), COCH.axis)).toBeGreaterThan(3);
    expect(RW.c.every(Number.isFinite)).toBe(true);
  });

  it('has valid cut ranges', () => {
    for (const k of Object.keys(CUTS) as (keyof typeof CUTS)[]) {
      expect(CUT_DEFAULT_T[k]).toBeGreaterThan(0);
      expect(CUT_DEFAULT_T[k]).toBeLessThan(1);
    }
  });
});

describe('ear fields', () => {
  it('keeps the ossicles inside the cavity, the footplate at the oval window and the canal side outside the air', () => {
    const air = airField();
    expect(air(...T(0.3, 0, -3.0))).toBeLessThan(0);
    expect(air(...T(0, 0, 1.5))).toBeGreaterThan(0);
    expect(malleusField()(...T(0.4, 7.2, -3.0))).toBeLessThan(0);
    expect(incusField()(...T(-2.6, 7.0, -3.4))).toBeLessThan(0);
    expect(stapesField()(...STAPES.head)).toBeLessThan(0);
    expect(stapesField()(...STAPES.W)).toBeLessThan(0.2);
  });

  it('has a hollow canal and a hollow cochlea inside bone', () => {
    const bone = boneField();
    expect(bone(...CANAL_PTS[2])).toBeGreaterThan(0);
    expect(bone(...cochCenter(COCH_TH * 0.5))).toBeGreaterThan(0);
  });

  it('grows a connected foam of mastoid cells', () => {
    expect(mastoidSegs().length).toBeGreaterThan(40);
  });

  it(
    'meshes every dense part on a coarse grid',
    () => {
      for (const type of ['auricle', 'cartilage', 'bone', 'air', 'malleus', 'incus', 'stapes'] as const) {
        const m = runJob({ type, q: 3.2 });
        expect(m.positions.length, type).toBeGreaterThan(300);
        expect(m.indices.length % 3).toBe(0);
      }
    },
    120000,
  );
});
