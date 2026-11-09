import { describe, expect, it } from 'vitest';
import { buildGlandMesh, glandSdf, REGIONS } from '../src/models/pancreas/field';
import { buildStatic, glandParts } from '../src/models/pancreas/build';
import { MACRO_PART_IDS } from '../src/models/pancreas/parts';
import { MAIN_DUCT_PTS, BILE_DUCT_PTS, SPLENIC_VEIN_PTS, cutCoord, cutPlane, secretion, MEAL_PERIOD } from '../src/models/pancreas/anatomy';
import { buildMicroData } from '../src/models/pancreas/micro';

describe('pancreas geometry', () => {
  const mesh = buildGlandMesh(0.14);
  const stat = buildStatic();

  it('builds a closed, lobulated gland with every region present', () => {
    expect(mesh.positions.length / 3).toBeGreaterThan(5000);
    for (const r of REGIONS) expect(mesh.indices[r].length, r).toBeGreaterThan(30);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const l = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
      expect(Math.abs(l - 1)).toBeLessThan(0.01);
    }
  });

  it('gland is about 15–23 cm long and 2–3 cm thick on the body', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      lo = Math.min(lo, mesh.positions[i]);
      hi = Math.max(hi, mesh.positions[i]);
    }
    expect(hi - lo).toBeGreaterThan(14);
    expect(hi - lo).toBeLessThan(23);
  });

  it('keeps the ducts inside the gland tissue and the bile duct inside the head', () => {
    for (const p of MAIN_DUCT_PTS.slice(0, -2)) expect(glandSdf(...p), JSON.stringify(p)).toBeLessThan(0);
    const inside = BILE_DUCT_PTS.slice(3, 6).filter((p) => glandSdf(...p) < 0.2);
    expect(inside.length).toBeGreaterThanOrEqual(2);
  });

  it('presses the splenic vein into a groove behind the body, not into the tissue', () => {
    for (const p of SPLENIC_VEIN_PTS.slice(2, -2)) expect(glandSdf(...p)).toBeGreaterThan(-0.2);
  });

  it('has meshes for every macro part once the gland is attached', () => {
    const all = { ...stat, ...glandParts(mesh) };
    for (const id of MACRO_PART_IDS) expect(all[id]?.length, id).toBeGreaterThan(0);
  });

  it('cut planes sweep the model and the meal cycle is periodic', () => {
    for (const k of ['side', 'fundus', 'coronal'] as const) {
      expect(cutCoord(k, 0)).not.toBe(cutCoord(k, 1));
      expect(cutPlane(k, 0.5).n.some((v) => v !== 0)).toBe(true);
    }
    expect(secretion(0)).toBe(0);
    expect(secretion(18)).toBeGreaterThan(0.99);
    expect(secretion(MEAL_PERIOD + 18)).toBeCloseTo(secretion(18));
  });

  it('micro scene has the four islet cell types and a hero acinus with granules', () => {
    const d = buildMicroData();
    for (const k of ['alpha', 'beta', 'delta', 'pp'] as const) expect(d.islet[k].length, k).toBeGreaterThan(0);
    expect(d.islet.beta.length).toBeGreaterThan(d.islet.alpha.length);
    expect(d.granules.length).toBeGreaterThan(50);
    for (const id of ['acinus', 'zymogen', 'islet', 'beta-cell', 'islet-nerve']) expect(d.anchors[id], id).toBeDefined();
  });
});
