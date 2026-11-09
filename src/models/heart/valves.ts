/*
  Клапаны сердца: створки задаются формулой в двух положениях — закрытом и открытом.
  Основная сетка хранит закрытое положение, открытое — цель морфинга, поэтому створки плавно распахиваются.
  Хорды сухожильные тянутся от сосочковых мышц к краю створок и провисают, когда клапан открыт.
*/

import { MeshBuilder } from '../lungs/mesh';
import { cross, dot, lerp3, norm, rng, sub, type V3 } from '../lungs/sdf';
import {
  AORTIC_CENTER, AORTIC_DIR, AORTIC_SINUS_DIRS, LAT, MV_A, MV_B, PAPILLARY, PULM_CENTER, PULM_DIR, PULM_SINUS_DIRS, TV_A, TV_B, curvePoints,
} from './field';
import type { Anim, HeartEntity } from './types';

interface ValveDef {
  anim: Anim;
  part: string;
  type: 'av' | 'sl';
  center: V3;
  n: V3;
  R: number;
  hint: V3;
  /** Сектора створок в градусах. */
  sectors: [number, number][];
}

const mid = (a: V3, b: V3, t: number): V3 => lerp3(a, b, t);

export const VALVES: ValveDef[] = [
  {
    anim: 'tricuspid', part: 'tricuspid-valve', type: 'av', center: mid(TV_A, TV_B, 0.5), n: norm(sub(TV_B, TV_A)), R: 0.25, hint: LAT,
    sectors: [[4, 116], [124, 236], [244, 356]],
  },
  {
    anim: 'mitral', part: 'mitral-valve', type: 'av', center: mid(MV_A, MV_B, 0.45), n: norm(sub(MV_B, MV_A)), R: 0.29,
    hint: sub(AORTIC_CENTER, mid(MV_A, MV_B, 0.45)),
    sectors: [[3, 177], [183, 357]],
  },
  {
    anim: 'aortic', part: 'aortic-valve', type: 'sl', center: AORTIC_CENTER, n: AORTIC_DIR, R: 0.25, hint: AORTIC_SINUS_DIRS[0],
    sectors: [[-58, 58], [62, 178], [182, 298]],
  },
  {
    anim: 'pulmonary', part: 'pulmonary-valve', type: 'sl', center: PULM_CENTER, n: PULM_DIR, R: 0.22, hint: PULM_SINUS_DIRS[0],
    sectors: [[-58, 58], [62, 178], [182, 298]],
  },
];

interface Frame {
  e1: V3;
  e2: V3;
}

function frameOf(v: ValveDef): Frame {
  const d = dot(v.hint, v.n);
  const e1 = norm([v.hint[0] - v.n[0] * d, v.hint[1] - v.n[1] * d, v.hint[2] - v.n[2] * d]);
  return { e1, e2: cross(v.n, e1) };
}

const rad = (d: number) => (d * Math.PI) / 180;

function place(v: ValveDef, f: Frame, phi: number, rho: number, z: number): V3 {
  const c = Math.cos(phi), s = Math.sin(phi);
  return [
    v.center[0] + (f.e1[0] * c + f.e2[0] * s) * rho + v.n[0] * z,
    v.center[1] + (f.e1[1] * c + f.e2[1] * s) * rho + v.n[1] * z,
    v.center[2] + (f.e1[2] * c + f.e2[2] * s) * rho + v.n[2] * z,
  ];
}

/** Точка створки: сектор, u вдоль окружности (0..1), w от кольца к свободному краю (0..1). */
export function leafletPoint(v: ValveDef, f: Frame, sector: number, u: number, w: number, open: boolean): V3 {
  const [a, b] = v.sectors[sector];
  const phi = rad(a + (b - a) * u);
  const R = v.R;
  if (v.type === 'av') {
    const two = v.sectors.length === 2;
    const scallop = 0.94 + 0.06 * Math.sin(Math.PI * u * 3);
    const ww = w * scallop;
    if (!open) {
      const z = R * (0.14 * ww - 0.13 * Math.sin(Math.PI * ww));
      if (two) {
        // две створки смыкаются по линии: поперечная координата сходится к нулю
        const c = Math.cos(phi), s = Math.sin(phi);
        const x = R * c * (1 - 0.14 * ww), y = R * s * (1 - 0.94 * ww);
        return [
          v.center[0] + f.e1[0] * x + f.e2[0] * y + v.n[0] * z,
          v.center[1] + f.e1[1] * x + f.e2[1] * y + v.n[1] * z,
          v.center[2] + f.e1[2] * x + f.e2[2] * y + v.n[2] * z,
        ];
      }
      return place(v, f, phi, R * (1 - 0.93 * ww), z);
    }
    const z = R * (1.15 * ww + 0.06 * Math.sin(Math.PI * ww));
    return place(v, f, phi, R * (1 - 0.1 * ww), z);
  }
  // полулунные клапаны: корона прикрепления — комиссуры выше, дно створки на кольце
  const crown = 0.55 * R * (1 - Math.pow(Math.sin(Math.PI * u), 0.85));
  if (!open) {
    const phi0 = rad(a), phi1 = rad(b);
    const c0 = place(v, f, phi0, R, 0.55 * R), c1 = place(v, f, phi1, R, 0.55 * R);
    const sag = Math.sin(Math.PI * u);
    const edgeBase = lerp3(c0, c1, u);
    const toAxis: V3 = [v.center[0] + v.n[0] * 0.42 * R, v.center[1] + v.n[1] * 0.42 * R, v.center[2] + v.n[2] * 0.42 * R];
    const edge = lerp3(edgeBase, toAxis, 0.92 * sag);
    const attach = place(v, f, phi, R, crown);
    const p = lerp3(attach, edge, w);
    const belly = 0.2 * R * Math.sin(Math.PI * w) * Math.pow(sag, 0.6);
    return [p[0] - v.n[0] * belly, p[1] - v.n[1] * belly, p[2] - v.n[2] * belly];
  }
  return place(v, f, phi, R * (1 + 0.1 * Math.sin(Math.PI * w * 0.5)), crown + w * (1.0 * R - crown));
}

function faceNormals(pos: number[], idx: number[]): Float32Array {
  const acc = new Float64Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      acc[k] += nx;
      acc[k + 1] += ny;
      acc[k + 2] += nz;
    }
  }
  const out = new Float32Array(pos.length);
  for (let k = 0; k < pos.length; k += 3) {
    const l = Math.hypot(acc[k], acc[k + 1], acc[k + 2]) || 1;
    out[k] = acc[k] / l;
    out[k + 1] = acc[k + 1] / l;
    out[k + 2] = acc[k + 2] / l;
  }
  return out;
}

function leafletEntity(v: ValveDef): HeartEntity {
  const f = frameOf(v);
  const NU = v.type === 'av' ? 28 : 22;
  const NV = 14;
  const closed: number[] = [];
  const open: number[] = [];
  const idx: number[] = [];
  v.sectors.forEach((_, s) => {
    const base = closed.length / 3;
    for (let j = 0; j <= NV; j++)
      for (let i = 0; i <= NU; i++) {
        closed.push(...leafletPoint(v, f, s, i / NU, j / NV, false));
        open.push(...leafletPoint(v, f, s, i / NU, j / NV, true));
      }
    for (let j = 0; j < NV; j++)
      for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i;
        idx.push(a, a + NU + 1, a + 1, a + 1, a + NU + 1, a + NU + 2);
      }
  });
  return {
    part: v.part, kind: 'leaflet', variant: 'all', anim: v.anim,
    mesh: { positions: new Float32Array(closed), normals: faceNormals(closed, idx), indices: new Uint32Array(idx) },
    morph: { positions: new Float32Array(open), normals: faceNormals(open, idx) },
  };
}

/** Фиброзное кольцо клапана: тор по линии прикрепления створок. */
function ringEntity(v: ValveDef): HeartEntity {
  const f = frameOf(v);
  const b = new MeshBuilder();
  const N = 72;
  if (v.type === 'av') {
    const pts: V3[] = [];
    for (let i = 0; i <= N; i++) pts.push(place(v, f, (i / N) * Math.PI * 2, v.R * 1.0, 0));
    b.tube(pts, 0.03, 8, 'none');
  } else {
    v.sectors.forEach((_, s) => {
      const pts: V3[] = [];
      for (let i = 0; i <= 24; i++) pts.push(leafletPoint(v, f, s, i / 24, 0, false));
      b.tube(pts, 0.022, 7, 'both');
    });
  }
  return { part: v.part, kind: 'ring', variant: 'all', mesh: b.build() };
}

/** Хорды: из вершин сосочковых мышц к краю створок; провисают при открытом клапане. */
function chordaeEntity(v: ValveDef, side: 'L' | 'R'): HeartEntity {
  const f = frameOf(v);
  const pms = PAPILLARY.filter((p) => p.side === side);
  const targets: { s: number; u: number; w: number }[] = [];
  v.sectors.forEach((_, s) => {
    for (let k = 0; k < 7; k++) targets.push({ s, u: 0.07 + (k / 6) * 0.86, w: 1 });
    for (let k = 0; k < 3; k++) targets.push({ s, u: 0.25 + k * 0.25, w: 0.7 });
  });
  const mk = (open: boolean) => {
    const r = rng(open ? 11 : 11);
    const b = new MeshBuilder();
    for (const t of targets) {
      const closedEnd = leafletPoint(v, f, t.s, t.u, t.w, false);
      let best = pms[0];
      let bd = 1e9;
      for (const p of pms) {
        const d = Math.hypot(p.tip[0] - closedEnd[0], p.tip[1] - closedEnd[1], p.tip[2] - closedEnd[2]);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      const end = leafletPoint(v, f, t.s, t.u, t.w, open);
      const tip = best.tip;
      const dir = sub(end, tip);
      const side1 = norm(cross(dir, [0.3, 1, 0.2]));
      const jit = (r() - 0.5) * 0.05;
      const slack = open ? 0.07 + r() * 0.04 : 0.006;
      const a: V3 = [tip[0] + dir[0] * 0.33 + side1[0] * (slack + jit), tip[1] + dir[1] * 0.33 + side1[1] * (slack + jit), tip[2] + dir[2] * 0.33 + side1[2] * (slack + jit)];
      const c: V3 = [tip[0] + dir[0] * 0.68 - side1[0] * slack * 0.7, tip[1] + dir[1] * 0.68 - side1[1] * slack * 0.7, tip[2] + dir[2] * 0.68 - side1[2] * slack * 0.7];
      b.tube(curvePoints([tip, a, c, end], 7), (q) => 0.011 - 0.005 * q, 5, 'none');
    }
    return b.build();
  };
  const closed = mk(false);
  const open = mk(true);
  return {
    part: 'chordae-tendineae', kind: 'chorda', variant: 'all', anim: v.anim,
    mesh: closed, morph: { positions: open.positions, normals: open.normals },
  };
}

export function valveEntities(): HeartEntity[] {
  const out: HeartEntity[] = [];
  for (const v of VALVES) {
    out.push(leafletEntity(v), ringEntity(v));
    if (v.type === 'av') out.push(chordaeEntity(v, v.anim === 'mitral' ? 'L' : 'R'));
  }
  return out;
}

