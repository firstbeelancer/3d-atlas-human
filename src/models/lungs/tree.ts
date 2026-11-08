/*
  Бронхиальное дерево и сосуды лёгких.

  Крупные бронхи (трахея, главные, долевые) заданы вручную по анатомии. Каждая долевая ветвь отдаёт сегментарные
  бронхи; для каждого сегмента в его объёме (доля, разрезанная между ближайшими сегментарными центрами) сажаются
  точки, и дерево делит это облако пополам по главной оси снова и снова до одиночных точек — получается
  равномерная «крона», заполняющая сегмент. Радиусы идут по закону Мюррея: r ~ (число концов)^0.385.
  Артерии идут рядом с бронхами, вены — по другую сторону и собираются в четыре лёгочные вены.
*/

import { lobeAt, LOBE_CODES, LUNG_BOX, LEFT, RIGHT, type LobeCode } from './field';
import { add, anyPerp, cross, dist, lerp3, nearestOnPath, norm, rng, scale, sub, type V3 } from './sdf';

export type Where = LobeCode | 'R' | 'L' | 'C';
export type BronchPart = 'trachea' | 'main-bronchi' | 'lobar-bronchi' | 'segmental-bronchi' | 'bronchioles';

export interface Branch {
  pts: V3[];
  r0: number;
  r1: number;
  where: Where;
  part: BronchPart;
  leaves: number;
  terminal: boolean;
  parent: number;
  seg: string;
}

export interface VBranch {
  pts: V3[];
  r0: number;
  r1: number;
  where: Where;
}

export const CARINA: V3 = [0, 1.0, -0.22];
export const TRACHEA_TOP: V3 = [0, 2.85, -0.2];
const R_TERM = 0.0085;
const EXP = 0.385;

/** Радиус по числу концов под веткой (закон Мюррея). */
const radiusOf = (leaves: number) => R_TERM * Math.pow(leaves, EXP);

interface SegSeed {
  name: string;
  lobe: LobeCode;
  seed: V3;
  /** Откуда берёт начало: номер долевой ветви и доля её длины. */
  from: string;
  at: number;
}

interface Skel {
  name: string;
  parent: string | null;
  pts: V3[];
  where: Where;
  part: BronchPart;
}

const SKELETON: Skel[] = [
  { name: 'trachea', parent: null, pts: [TRACHEA_TOP, [0, 1.9, -0.2], CARINA], where: 'C', part: 'trachea' },
  { name: 'rmain', parent: 'trachea', pts: [CARINA, [-0.3, 0.82, -0.28], [-0.6, 0.66, -0.3]], where: 'R', part: 'main-bronchi' },
  { name: 'lmain', parent: 'trachea', pts: [CARINA, [0.45, 0.76, -0.3], [0.85, 0.5, -0.34]], where: 'L', part: 'main-bronchi' },
  { name: 'rul', parent: 'rmain', pts: [[-0.6, 0.66, -0.3], [-0.82, 0.88, -0.3], [-1.02, 1.1, -0.28]], where: 'ru', part: 'lobar-bronchi' },
  { name: 'rint', parent: 'rmain', pts: [[-0.6, 0.66, -0.3], [-0.7, 0.3, -0.3], [-0.8, -0.1, -0.28]], where: 'rl', part: 'lobar-bronchi' },
  { name: 'rml', parent: 'rint', pts: [[-0.8, -0.1, -0.28], [-0.98, -0.28, 0.0], [-1.2, -0.45, 0.28]], where: 'rm', part: 'lobar-bronchi' },
  { name: 'rll', parent: 'rint', pts: [[-0.8, -0.1, -0.28], [-0.84, -0.28, -0.36], [-0.9, -0.6, -0.42], [-0.95, -0.9, -0.45]], where: 'rl', part: 'lobar-bronchi' },
  { name: 'lul', parent: 'lmain', pts: [[0.85, 0.5, -0.34], [1.02, 0.7, -0.25], [1.16, 0.86, -0.1]], where: 'lu', part: 'lobar-bronchi' },
  { name: 'ling', parent: 'lul', pts: [[1.16, 0.86, -0.1], [1.22, 0.5, 0.3], [1.3, 0.2, 0.5]], where: 'lu', part: 'lobar-bronchi' },
  { name: 'lll', parent: 'lmain', pts: [[0.85, 0.5, -0.34], [1.0, 0.05, -0.3], [1.12, -0.45, -0.4]], where: 'll', part: 'lobar-bronchi' },
];

/** Сегменты по Бойдену: 10 справа, 9 слева (верхушечно-задний слит). */
const SEGMENTS: SegSeed[] = [
  { name: 'ru-apical', lobe: 'ru', seed: [-0.85, 1.95, -0.1], from: 'rul', at: 1 },
  { name: 'ru-posterior', lobe: 'ru', seed: [-1.6, 1.05, -0.8], from: 'rul', at: 1 },
  { name: 'ru-anterior', lobe: 'ru', seed: [-1.25, 0.9, 0.7], from: 'rul', at: 1 },
  { name: 'rm-lateral', lobe: 'rm', seed: [-1.55, -0.45, 0.65], from: 'rml', at: 1 },
  { name: 'rm-medial', lobe: 'rm', seed: [-0.85, -0.65, 0.75], from: 'rml', at: 1 },
  { name: 'rl-superior', lobe: 'rl', seed: [-1.25, 0.2, -1.0], from: 'rll', at: 0.34 },
  { name: 'rl-medial', lobe: 'rl', seed: [-0.6, -1.25, -0.3], from: 'rll', at: 1 },
  { name: 'rl-anterior', lobe: 'rl', seed: [-1.5, -1.1, 0.35], from: 'rll', at: 1 },
  { name: 'rl-lateral', lobe: 'rl', seed: [-1.95, -1.05, -0.3], from: 'rll', at: 1 },
  { name: 'rl-posterior', lobe: 'rl', seed: [-1.2, -1.4, -0.95], from: 'rll', at: 1 },
  { name: 'lu-apicoposterior', lobe: 'lu', seed: [1.0, 1.85, -0.5], from: 'lul', at: 1 },
  { name: 'lu-anterior', lobe: 'lu', seed: [1.35, 0.85, 0.7], from: 'lul', at: 1 },
  { name: 'lu-sup-lingular', lobe: 'lu', seed: [1.4, -0.3, 0.75], from: 'ling', at: 1 },
  { name: 'lu-inf-lingular', lobe: 'lu', seed: [1.05, -0.95, 0.6], from: 'ling', at: 1 },
  { name: 'll-superior', lobe: 'll', seed: [1.35, 0.1, -1.0], from: 'lll', at: 0.45 },
  { name: 'll-anteromedial', lobe: 'll', seed: [0.85, -1.25, 0.0], from: 'lll', at: 1 },
  { name: 'll-lateral', lobe: 'll', seed: [1.8, -1.1, -0.15], from: 'lll', at: 1 },
  { name: 'll-posterior', lobe: 'll', seed: [1.35, -1.45, -0.85], from: 'lll', at: 1 },
];

/** Точки на ломаной по доле длины. */
function along(pts: V3[], t: number): V3 {
  if (t >= 1) return pts[pts.length - 1];
  const n = pts.length - 1;
  const f = t * n;
  const i = Math.min(Math.floor(f), n - 1);
  return lerp3(pts[i], pts[i + 1], f - i);
}

/** Точки внутри каждой доли: решётка со смещением, чтобы «крона» была равномерной. */
function sampleLobes(step: number): Record<LobeCode, V3[]> {
  const rnd = rng(7311);
  const out: Record<LobeCode, V3[]> = { ru: [], rm: [], rl: [], lu: [], ll: [] };
  for (const s of [RIGHT, LEFT] as const) {
    const b = LUNG_BOX[s];
    for (let x = b.min[0]; x < b.max[0]; x += step)
      for (let y = b.min[1]; y < b.max[1]; y += step)
        for (let z = b.min[2]; z < b.max[2]; z += step) {
          const p: V3 = [x + (rnd() - 0.5) * step, y + (rnd() - 0.5) * step, z + (rnd() - 0.5) * step];
          const r = lobeAt(p[0], p[1], p[2]);
          if (r.lobe && r.d < -0.1) out[r.lobe].push(p);
        }
  }
  return out;
}

function centroid(S: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (const p of S) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  return [x / S.length, y / S.length, z / S.length];
}

/** Главная ось облака точек (степенной метод по ковариации). */
function principalAxis(S: V3[], c: V3): V3 {
  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
  for (const p of S) {
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
    cxx += x * x; cxy += x * y; cxz += x * z; cyy += y * y; cyz += y * z; czz += z * z;
  }
  let v: V3 = [1, 0.7, 0.4];
  for (let i = 0; i < 6; i++) {
    v = norm([cxx * v[0] + cxy * v[1] + cxz * v[2], cxy * v[0] + cyy * v[1] + cyz * v[2], cxz * v[0] + cyz * v[1] + czz * v[2]]);
  }
  return v;
}

export interface Tree {
  branches: Branch[];
  arteries: VBranch[];
  veins: VBranch[];
  /** Концы бронхиол: сюда садятся ацинусы. */
  tips: { p: V3; dir: V3; where: LobeCode }[];
  /** Опорные линии: лёгочные артерии, вены, главные бронхи. */
  paths: { rpa: V3[]; lpa: V3[]; trunk: V3[]; veinTrunks: Record<string, V3[]> };
  segmentCounts: Record<string, number>;
}

export const TRUNK_PATH: V3[] = [[0.3, -0.5, 0.58], [0.3, 0.0, 0.52], [0.24, 0.4, 0.3], [0.15, 0.6, 0.06]];
export const RPA_PATH: V3[] = [[0.15, 0.6, 0.06], [-0.3, 0.66, -0.04], [-0.72, 0.62, -0.1], [-0.96, 0.3, -0.2], [-1.0, -0.2, -0.3], [-1.02, -0.7, -0.42]];
export const LPA_PATH: V3[] = [[0.15, 0.6, 0.06], [0.4, 0.82, -0.1], [0.76, 0.86, -0.22], [1.0, 0.55, -0.36], [1.12, 0.05, -0.42], [1.18, -0.5, -0.5]];
export const VEIN_TRUNKS: Record<string, V3[]> = {
  ru: [[-1.15, 0.6, 0.3], [-0.8, 0.35, 0.28], [-0.55, 0.05, 0.12], [-0.3, -0.15, -0.2]],
  rl: [[-1.1, -0.7, -0.2], [-0.8, -0.55, -0.3], [-0.5, -0.4, -0.36], [-0.25, -0.28, -0.33]],
  lu: [[1.1, 0.55, 0.3], [0.85, 0.3, 0.2], [0.6, 0.05, 0.0], [0.4, -0.14, -0.22]],
  ll: [[1.1, -0.7, -0.25], [0.9, -0.5, -0.32], [0.65, -0.35, -0.36], [0.4, -0.25, -0.32]],
};
const VEIN_TRUNK_OF: Record<LobeCode, string> = { ru: 'ru', rm: 'ru', rl: 'rl', lu: 'lu', ll: 'll' };

export function buildTree(): Tree {
  const rnd = rng(20261107);
  const branches: Branch[] = [];
  const index = new Map<string, number>();

  for (const s of SKELETON) {
    index.set(s.name, branches.length);
    branches.push({ pts: s.pts, r0: 0, r1: 0, where: s.where, part: s.part, leaves: 0, terminal: false, parent: s.parent ? index.get(s.parent)! : -1, seg: s.name });
  }

  const samples = sampleLobes(0.185);
  const buckets = new Map<string, V3[]>();
  for (const sg of SEGMENTS) buckets.set(sg.name, []);
  for (const lobe of LOBE_CODES) {
    const seeds = SEGMENTS.filter((s) => s.lobe === lobe);
    for (const p of samples[lobe]) {
      let best = 1e9;
      let bn = seeds[0].name;
      for (const s of seeds) {
        // ось «верх — низ» чуть дешевле: сегменты вытянуты по вертикали
        const d = Math.hypot(p[0] - s.seed[0], (p[1] - s.seed[1]) * 0.85, p[2] - s.seed[2]);
        if (d < best) {
          best = d;
          bn = s.name;
        }
      }
      buckets.get(bn)!.push(p);
    }
  }

  const tips: Tree['tips'] = [];
  const segmentCounts: Record<string, number> = {};

  const grow = (P: V3, S: V3[], parent: number, lobe: LobeCode, seg: string, t: number, pd: V3) => {
    if (S.length === 1) {
      const q = S[0];
      const len = dist(P, q);
      const side = anyPerp(norm(sub(q, P)));
      const dq = norm(sub(q, P));
      const mid = add(add(P, scale(norm(add(scale(pd, 0.6), scale(dq, 0.4))), len * 0.5)), scale(side, len * 0.04 * (rnd() - 0.5)));
      branches.push({ pts: [P, mid, q], r0: 0, r1: 0, where: lobe, part: 'bronchioles', leaves: 1, terminal: true, parent, seg });
      tips.push({ p: q, dir: norm(sub(q, P)), where: lobe });
      return;
    }
    const c = centroid(S);
    const Q = lerp3(P, c, t);
    const dir = norm(sub(Q, P));
    const len = dist(P, Q);
    const side = norm(cross(dir, anyPerp(dir)));
    const bend = scale(side, len * 0.08 * (rnd() - 0.5));
    const id = branches.length;
    const mid = add(add(P, scale(norm(add(scale(pd, 0.6), scale(dir, 0.4))), len * 0.5)), bend);
    branches.push({ pts: [P, mid, Q], r0: 0, r1: 0, where: lobe, part: 'segmental-bronchi', leaves: 0, terminal: false, parent, seg });
    const axis = principalAxis(S, c);
    const proj = S.map((p) => (p[0] - c[0]) * axis[0] + (p[1] - c[1]) * axis[1] + (p[2] - c[2]) * axis[2]);
    const order = proj.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const half = Math.floor(S.length / 2);
    const A = order.slice(0, half).map((o) => S[o[1]]);
    const B = order.slice(half).map((o) => S[o[1]]);
    const nd = norm(sub(Q, mid));
    grow(Q, A, id, lobe, seg, 0.62, nd);
    grow(Q, B, id, lobe, seg, 0.62, nd);
  };

  for (const sg of SEGMENTS) {
    const S = buckets.get(sg.name)!;
    segmentCounts[sg.name] = S.length;
    if (S.length < 2) continue;
    const parentIdx = index.get(sg.from)!;
    const start = along(branches[parentIdx].pts, sg.at);
    const pp = branches[parentIdx].pts;
    grow(start, S, parentIdx, sg.lobe, sg.name, 0.5, norm(sub(pp[pp.length - 1], pp[Math.max(pp.length - 2, 0)])));
  }

  // число концов под каждой веткой — от листьев к корню (дети всегда позже родителей)
  for (let i = branches.length - 1; i >= 0; i--) {
    const b = branches[i];
    if (b.terminal) b.leaves = 1;
    if (b.parent >= 0) branches[b.parent].leaves += b.leaves;
  }
  const kids = new Map<number, number[]>();
  branches.forEach((b, i) => {
    if (b.parent >= 0) kids.set(b.parent, [...(kids.get(b.parent) ?? []), i]);
  });
  branches.forEach((b, i) => {
    b.r0 = radiusOf(Math.max(b.leaves, 1));
    const ch = kids.get(i) ?? [];
    b.r1 = ch.length ? Math.max(...ch.map((k) => radiusOf(Math.max(branches[k].leaves, 1)))) * 1.02 : R_TERM * 0.9;
    if (b.part === 'segmental-bronchi' && b.r0 < 0.024) b.part = 'bronchioles';
    if (b.part === 'trachea') {
      b.r0 = 0.165;
      b.r1 = 0.165;
    }
  });

  /* ---------- сосуды вдоль бронхов ---------- */
  const arteries: VBranch[] = [];
  const veins: VBranch[] = [];
  const sideOf = (d: V3, sign: number): V3 => {
    const ref: V3 = [0, 0, 1];
    let s = cross(d, ref);
    if (Math.hypot(...s) < 0.15) s = anyPerp(d);
    return scale(norm(s), sign);
  };
  const aOff = new Map<number, V3>(); // смещение артерии на конце ветки
  const vOff = new Map<number, V3>();
  const aStart = new Map<number, V3>();
  const vStart = new Map<number, V3>();

  branches.forEach((b, i) => {
    if (b.part === 'trachea' || b.part === 'main-bronchi') return;
    const P = b.pts[0];
    const Q = b.pts[b.pts.length - 1];
    const d = norm(sub(Q, P));
    const rA = 0.78 * b.r0 + 0.003;
    const rA1 = 0.78 * b.r1 + 0.003;
    const m0 = b.r0 + rA + 0.008;
    const m1 = b.r1 + rA1 + 0.008;
    const sd = sideOf(d, 1);
    const isLobar = b.part === 'lobar-bronchi';
    const parentEnd = b.parent >= 0 ? aOff.get(b.parent) : undefined;
    const oS = isLobar || !parentEnd ? scale(sd, m0) : parentEnd;
    const oE = scale(sd, m1);
    aOff.set(i, oE);
    aStart.set(i, add(P, oS));
    if (b.leaves >= 3) {
      const mid = add(b.pts[1], scale(add(oS, oE), 0.5));
      arteries.push({ pts: [add(P, oS), mid, add(Q, oE)], r0: rA, r1: rA1, where: b.where });
    }
    // вены — только от сегментов и глубже, на противоположной стороне и ближе к периферии
    if (b.part !== 'lobar-bronchi' && b.leaves >= 3) {
      const rV = 0.84 * b.r0 + 0.003;
      const rV1 = 0.84 * b.r1 + 0.003;
      const sv = sideOf(d, -1);
      const first = b.parent >= 0 && branches[b.parent].part === 'lobar-bronchi';
      const pv = b.parent >= 0 ? vOff.get(b.parent) : undefined;
      const vS = first || !pv ? scale(sv, b.r0 + rV + 0.01) : pv;
      const vE = scale(sv, b.r1 + rV1 + 0.01);
      vOff.set(i, vE);
      vStart.set(i, add(P, vS));
      const mid = add(b.pts[1], scale(add(vS, vE), 0.5));
      const vb: VBranch = { pts: [add(P, vS), mid, add(Q, vE)], r0: rV, r1: rV1, where: b.where };
      veins.push(vb);
      if (first) {
        // корень сегментарной вены впадает в ствол своей доли
        const trunk = VEIN_TRUNKS[VEIN_TRUNK_OF[b.where as LobeCode]];
        const near = nearestOnPath(trunk, vb.pts[0]);
        const via = lerp3(vb.pts[0], near.point, 0.5);
        const bend = scale(anyPerp(norm(sub(near.point, vb.pts[0]))), 0.05);
        veins.push({ pts: [near.point, add(via, bend), vb.pts[0]], r0: rV * 1.05, r1: rV, where: b.where });
      }
    }
    if (isLobar) {
      // корень долевой артерии отходит от ствола соответствующей лёгочной артерии
      const trunkPath = b.where === 'ru' || b.where === 'rm' || b.where === 'rl' ? RPA_PATH : LPA_PATH;
      const start = add(P, oS);
      const near = nearestOnPath(trunkPath, start);
      const via = lerp3(near.point, start, 0.5);
      arteries.push({ pts: [near.point, via, start], r0: rA * 1.05, r1: rA, where: b.where });
    }
  });

  return { branches, arteries, veins, tips, paths: { rpa: RPA_PATH, lpa: LPA_PATH, trunk: TRUNK_PATH, veinTrunks: VEIN_TRUNKS }, segmentCounts };
}
