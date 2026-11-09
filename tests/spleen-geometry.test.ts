import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { REGIONS, buildSpleenMesh, spleenSdf } from '../src/models/spleen/field';
import { buildStatic, spleenParts } from '../src/models/spleen/build';
import { MACRO_PART_IDS } from '../src/models/spleen/parts';
import {
  BRANCHES,
  HILAR_ENTRIES,
  SPLENIC_ARTERY_PTS,
  STOMACH,
  cutCoord,
  cutPlane,
  fromLocal,
  squeeze,
  toLocal,
  AX_D,
  AX_L,
  AX_W,
  LOAD_PERIOD,
  VEIN_BRANCHES,
  twigs,
} from '../src/models/spleen/anatomy';
import { buildMicroData } from '../src/models/spleen/micro';

describe('spleen geometry', () => {
  const mesh = buildSpleenMesh(0.14);

  it('local frame is orthonormal and round-trips', () => {
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(AX_L, AX_W)).toBeCloseTo(0, 5);
    expect(dot(AX_L, AX_D)).toBeCloseTo(0, 5);
    expect(dot(AX_W, AX_D)).toBeCloseTo(0, 5);
    const p = fromLocal(1.2, -2.3, 0.7);
    const q = toLocal(p);
    expect(q[0]).toBeCloseTo(1.2, 5);
    expect(q[1]).toBeCloseTo(-2.3, 5);
    expect(q[2]).toBeCloseTo(0.7, 5);
  });

  it('builds a closed organ with every surface part present and unit normals', () => {
    expect(mesh.positions.length / 3).toBeGreaterThan(5000);
    for (const r of REGIONS) expect(mesh.indices[r].length, r).toBeGreaterThan(30);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const l = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
      expect(Math.abs(l - 1)).toBeLessThan(0.01);
    }
  });

  it('is about 11-13 cm long, 6-8 cm wide and 3-5 cm thick', () => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = toLocal([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[k]);
        hi[k] = Math.max(hi[k], p[k]);
      }
    }
    expect(hi[0] - lo[0]).toBeGreaterThan(11);
    expect(hi[0] - lo[0]).toBeLessThan(13.5);
    expect(hi[1] - lo[1]).toBeGreaterThan(6);
    expect(hi[1] - lo[1]).toBeLessThan(8.2);
    expect(hi[2] - lo[2]).toBeGreaterThan(3);
    expect(hi[2] - lo[2]).toBeLessThan(5.2);
  });

  it('keeps the outer faces pointing outwards in world coordinates', () => {
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const normal = new Vector3();
    let outward = 0;
    let faces = 0;
    for (const region of REGIONS) {
      const indices = mesh.indices[region];
      for (let i = 0; i < indices.length; i += 3) {
        a.fromArray(mesh.positions, indices[i] * 3);
        b.fromArray(mesh.positions, indices[i + 1] * 3);
        c.fromArray(mesh.positions, indices[i + 2] * 3);
        normal.fromArray(mesh.normals, indices[i] * 3);
        if (b.sub(a).cross(c.sub(a)).dot(normal) > 0) outward += 1;
        faces += 1;
      }
    }
    expect(outward / faces).toBeGreaterThan(0.99);
  });

  it('keeps the hilar entries on the surface and the stomach off the organ', () => {
    for (const p of HILAR_ENTRIES) expect(Math.abs(spleenSdf(...p)), JSON.stringify(p)).toBeLessThan(0.7);
    // поверхность желудка не врезается в селезёнку
    for (let a = 0; a < 40; a++)
      for (let b = 0; b < 20; b++) {
        const th = (a / 40) * Math.PI * 2;
        const ph = (b / 20) * Math.PI;
        const u = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)];
        if (u[2] < -0.12) continue;
        const p = fromLocal(STOMACH.c[0] + STOMACH.r[0] * u[0], STOMACH.c[1] + STOMACH.r[1] * u[1], STOMACH.c[2] + STOMACH.r[2] * u[2]);
        expect(spleenSdf(...p)).toBeGreaterThan(-0.05);
      }
  });

  it('lets the splenic artery reach the hilum through branches', () => {
    expect(SPLENIC_ARTERY_PTS.length).toBeGreaterThan(5);
    expect(BRANCHES.flatMap((b) => b.entries).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('joins hilar veins to venous branches', () => {
    const junctions = BRANCHES.flatMap((branch, i) => branch.entries.map(() => VEIN_BRANCHES[i].at(-1)));
    expect(twigs('vein').map(([start]) => start)).toEqual(junctions);
  });

  it('has meshes for every macro part once the organ is attached', () => {
    const all = { ...buildStatic(), ...spleenParts(mesh) };
    for (const id of MACRO_PART_IDS) expect(all[id]?.length, id).toBeGreaterThan(0);
  });

  it('cut planes sweep the model and the load cycle is periodic', () => {
    for (const k of ['side', 'fundus', 'coronal'] as const) {
      expect(cutCoord(k, 0)).not.toBe(cutCoord(k, 1));
      expect(cutPlane(k, 0.5).n.some((v) => v !== 0)).toBe(true);
    }
    expect(squeeze(0)).toBe(0);
    expect(squeeze(14)).toBeGreaterThan(0.99);
    expect(squeeze(LOAD_PERIOD + 14)).toBeCloseTo(squeeze(14));
  });

  it('micro scene has white pulp cells, a germinal centre and a sinus wall', () => {
    const d = buildMicroData();
    expect(d.tCells.length).toBeGreaterThan(100);
    expect(d.bMantle.length).toBeGreaterThan(100);
    expect(d.germ.length).toBeGreaterThan(20);
    expect(d.macros.length).toBeGreaterThan(5);
    expect(d.staves.length).toBeGreaterThan(300);
    expect(d.hoops.length).toBeGreaterThan(10);
    expect(d.oldRbc.length).toBeGreaterThan(5);
  });
});
