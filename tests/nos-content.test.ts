import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/nos';
import { getSection } from '../src/content/sections';
import { hasSectionContent, loadSectionContent } from '../src/content/loadSection';
import { MODELS } from '../src/models/registry';
import {
  CAVITY_HALF_W,
  CHOANA_Z,
  CUTS,
  CUT_DEFAULT_T,
  FLOOR_Y,
  FOCUS,
  GROUP_OF,
  LABEL_AT,
  NOSE_GROUPS,
  NOSE_PART_IDS,
  PRONASALE,
  ROOF_Y,
  SPREAD,
  airwayPath,
  cutPosition,
  smellPath,
} from '../src/models/nose/anatomy';
import { bbox, buildNose } from '../src/models/nose/build';
import { breath } from '../src/models/nose/NoseModel';

describe('nos content', () => {
  it('has a text for every model part and a known group', () => {
    expect(content.slug).toBe('nos');
    expect(content.parts.map((p) => p.id).sort()).toEqual([...NOSE_PART_IDS].sort());
    const groups = new Set(content.groups!.map((g) => g.id));
    expect(groups).toEqual(new Set(Object.keys(NOSE_GROUPS)));
    for (const p of content.parts) {
      expect(groups.has(p.group!), p.id).toBe(true);
      expect(GROUP_OF[p.id]).toBe(p.group);
      expect(p.text.length, p.id).toBeGreaterThan(60);
      expect(p.latin, p.id).toBeTruthy();
    }
  });

  it('has focus and label anchors for every part and group', () => {
    for (const id of [...NOSE_PART_IDS, ...Object.keys(NOSE_GROUPS)]) {
      expect(FOCUS[id], id).toBeTruthy();
      expect(FOCUS[id].dist).toBeGreaterThan(0);
    }
    for (const id of NOSE_PART_IDS) {
      expect(LABEL_AT[id], id).toBeTruthy();
      expect(LABEL_AT[id].every(Number.isFinite), id).toBe(true);
    }
    for (const id of Object.keys(SPREAD)) expect(NOSE_PART_IDS).toContain(id);
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
    expect(getSection('nos')?.ready).toBe(true);
    expect(getSection('nos')?.icon).toBe('nose');
    expect(hasSectionContent('nos')).toBe(true);
    expect((await loadSectionContent('nos'))?.slug).toBe('nos');
    const m = MODELS.nos;
    expect(m.explorer).toBe(true);
    expect(m.hasCutaway).toBe(true);
    expect(m.explorerCuts).toBeTruthy();
    expect(m.modes?.map((x) => x.id)).toEqual(['airflow', 'smell', 'xray']);
    expect(m.description.length).toBeGreaterThan(100);
  });
});

describe('nose anatomy', () => {
  it('keeps the cut sliders inside the model and the defaults in range', () => {
    for (const k of ['side', 'fundus', 'coronal'] as const) {
      expect(CUTS[k].min).toBeLessThan(CUTS[k].def);
      expect(CUTS[k].def).toBeLessThan(CUTS[k].max);
      expect(CUT_DEFAULT_T[k]).toBeGreaterThan(0);
      expect(CUT_DEFAULT_T[k]).toBeLessThan(1);
      expect(cutPosition(k, CUT_DEFAULT_T[k])).toBeCloseTo(CUTS[k].def, 6);
      expect(cutPosition(k, 0)).toBe(CUTS[k].min);
      expect(cutPosition(k, 1)).toBe(CUTS[k].max);
    }
  });

  it('runs the airway from the nostril through the cavity to the pharynx', () => {
    for (const s of [1, -1] as const) {
      const path = airwayPath(s);
      expect(path[0][1]).toBeLessThan(FLOOR_Y + 2);
      expect(path[0][2]).toBeGreaterThan(25);
      expect(Math.sign(path[0][0])).toBe(s);
      const choana = path.find((p) => Math.abs(p[2] - CHOANA_Z) < 1);
      expect(choana).toBeTruthy();
      const inside = path.filter((p) => p[2] < 20 && p[2] > CHOANA_Z);
      for (const q of inside) {
        expect(Math.abs(q[0])).toBeLessThan(CAVITY_HALF_W);
        expect(q[1]).toBeGreaterThan(FLOOR_Y);
        expect(q[1]).toBeLessThan(ROOF_Y);
      }
      expect(path[path.length - 1][1]).toBeLessThan(-40);
    }
    for (let k = 0; k < 4; k++) {
      const sp = smellPath(1, k);
      expect(sp[0][1]).toBeLessThan(ROOF_Y);
      expect(sp[sp.length - 1][1]).toBeGreaterThan(ROOF_Y);
    }
  });

  it('breathes with a longer exhale than inhale', () => {
    let inhale = 0;
    let exhale = 0;
    for (let i = 0; i < 400; i++) {
      const b = breath(i / 100);
      if (b > 0) inhale++;
      else if (b < 0) exhale++;
    }
    expect(exhale).toBeGreaterThan(inhale);
    expect(Math.max(...Array.from({ length: 400 }, (_, i) => breath(i / 100)))).toBeCloseTo(1, 1);
  });
});

describe('nose geometry', () => {
  const G = buildNose();

  it('builds a finite mesh for every part', () => {
    for (const id of NOSE_PART_IDS) {
      expect(G[id], id).toBeTruthy();
      for (const d of G[id]) {
        const pos = d.g.getAttribute('position');
        expect(pos.count, id).toBeGreaterThan(3);
        expect(d.g.getIndex()!.count % 3, id).toBe(0);
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)), id).toBe(true);
        }
      }
    }
  });

  it('places the main landmarks where they belong (mm)', () => {
    const tip = bbox(G['nasal-tip'][0].g);
    expect(tip.max[2]).toBeGreaterThan(PRONASALE[2] - 2);
    expect(tip.max[2]).toBeLessThan(PRONASALE[2] + 6);
    const septum = bbox(G['septum-mucosa'][0].g);
    expect(Math.abs(septum.min[0])).toBeLessThan(3);
    expect(septum.max[0]).toBeLessThan(3);
    expect(septum.min[1]).toBeLessThan(FLOOR_Y + 2);
    expect(septum.max[1]).toBeGreaterThan(ROOF_Y - 2);
    const palate = bbox(G['hard-palate'][0].g);
    expect(palate.max[1]).toBeLessThan(FLOOR_Y + 1);
    expect(palate.min[2]).toBeLessThan(-38);
    expect(palate.max[2]).toBeGreaterThan(20);
    const crib = bbox(G['cribriform-plate'][0].g);
    expect(crib.min[1]).toBeGreaterThan(ROOF_Y - 3);
    expect(crib.max[2]).toBeLessThan(2);
    const inf = bbox(G['inferior-concha'][0].g);
    const mid = bbox(G['middle-concha'][0].g);
    const sup = bbox(G['superior-concha'][0].g);
    expect(inf.max[1]).toBeLessThan(mid.min[1] + 4);
    expect(mid.max[1]).toBeLessThan(sup.min[1] + 4);
    expect(inf.max[2] - inf.min[2]).toBeGreaterThan(40);
    const bulb = bbox(G['olfactory-bulb'][0].g);
    expect(bulb.min[1]).toBeGreaterThan(ROOF_Y);
    const choanae = bbox(G.choanae[0].g);
    expect((choanae.min[2] + choanae.max[2]) / 2).toBeCloseTo(CHOANA_Z, 0);
  });

  it('mirrors paired parts across the midline', () => {
    for (const id of ['maxillary-sinus', 'frontal-sinus', 'inferior-concha', 'olfactory-bulb', 'nasolacrimal-duct', 'orbit']) {
      const b = bbox(G[id][0].g);
      expect(b.min[0], id).toBeCloseTo(-b.max[0], 0);
    }
    const left = bbox(G['ala-left'][0].g);
    const right = bbox(G['ala-right'][0].g);
    expect(left.max[0]).toBeCloseTo(-right.min[0], 0);
  });
});
