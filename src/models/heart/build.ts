/*
  Сборка всех частей сердца. Считается в фоновом потоке (geometry.worker.ts).
  heartMain — целое сердце со всеми внутренними структурами; heartCut — стенка с вырезом (две плоскости).
*/

import { isoMesh, MeshBuilder, type RawMesh } from '../lungs/mesh';
import { norm, rng, type V3 } from '../lungs/sdf';
import {
  AORTIC_SINUS_C, AORTIC_SINUS_DIRS, MOD_A, MOD_B, curvePoints, cutPlane, hw, projectCavity, projectOuter, sdOuter, vnoise, wh,
  type CutKey,
} from './field';
import { makeGrid, sampleBand, wallMeshes } from './mesher';
import type { HeartEntity } from './types';
import { valveEntities } from './valves';

const WALL_H = 0.026;
const FAT_H = 0.03;

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/* ---------- ориентиры на поверхности ---------- */

/** Высота поверхности (по ant) в точке (s, lat) — луч вперёд-назад методом деления пополам. */
function surfaceAnt(s: number, lat: number): number {
  let lo = -0.3;
  let hi = 1.9;
  if (sdOuter(...hw(s, lat, lo)) > 0) return NaN;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (sdOuter(...hw(s, lat, m)) < 0) lo = m;
    else hi = m;
  }
  return lo;
}

/** Передняя межжелудочковая борозда: место наибольшего вогнутого изгиба профиля между желудочками. */
function creaseLat(s: number): number {
  const guess = 0.06 - 0.1 * (s / 2.2);
  let best = guess;
  let bv = -1e9;
  const step = 0.03;
  for (let lat = guess - 0.3; lat <= guess + 0.3; lat += step) {
    const a = surfaceAnt(s, lat - step);
    const b = surfaceAnt(s, lat);
    const c = surfaceAnt(s, lat + step);
    if (Number.isNaN(a + b + c)) continue;
    const curv = a + c - 2 * b - 0.6 * Math.abs(lat - guess) * step;
    if (curv > bv) {
      bv = curv;
      best = lat;
    }
  }
  return best;
}

/** Путь по поверхности: точки в системе H проецируются на наружную стенку. */
function surfacePath(hs: V3[], lift: number, samples = 40): V3[] {
  const world = hs.map((h) => hw(h[0], h[1], h[2]));
  return curvePoints(world, samples).map((p) => projectOuter(p, lift, 10));
}

interface Path {
  pts: V3[];
  r0: number;
  r1: number;
}

/* ---------- коронарные артерии и вены ---------- */

function coronaryPaths() {
  const lad: V3[] = [];
  for (let s = 0.12; s <= 2.1; s += 0.2) lad.push([s, creaseLat(s), 0]);
  // ощупываем поверхность в найденной борозде
  const ladH: V3[] = lad.map(([s, lat]) => [s, lat, surfaceAnt(s, lat)]);
  const ladPts = surfacePath(ladH, 0.03, 60);
  const leftOst = add(AORTIC_SINUS_C[1], AORTIC_SINUS_DIRS[1], 0.19);
  const rightOst = add(AORTIC_SINUS_C[0], AORTIC_SINUS_DIRS[0], 0.19);
  const lmca = curvePoints([leftOst, add(projectOuter(add(leftOst, [0.18, 0.08, 0.05]), 0.03), [0, 0, 0]), ladPts[0]], 14);

  const diag: Path[] = [0.5, 1.0, 1.5].map((s0, i) => {
    const c = creaseLat(s0);
    const hs: V3[] = [];
    for (let k = 0; k <= 4; k++) hs.push([s0 + k * 0.17, c + 0.05 + k * 0.17, surfaceAnt(s0 + k * 0.17, c + 0.05 + k * 0.17) || 0.5]);
    void i;
    return { pts: surfacePath(hs, 0.025, 30), r0: 0.02, r1: 0.011 };
  });

  const lcx = surfacePath(
    [[0.02, 0.5, 0.42], [0.1, 0.9, 0.15], [0.15, 1.05, -0.2], [0.15, 0.95, -0.55], [0.15, 0.6, -0.82], [0.12, 0.25, -0.88]],
    0.03, 60,
  );
  const om: Path[] = [0.35, 0.8].map((k, i) => {
    const hs: V3[] = [];
    for (let q = 0; q <= 4; q++) hs.push([0.2 + k * 0.4 + q * 0.28 + i * 0.1, 1.0 - q * 0.05, -0.15 - q * 0.03]);
    return { pts: surfacePath(hs, 0.025, 30), r0: 0.018, r1: 0.01 };
  });

  const rca = surfacePath(
    [[-0.12, -0.28, 0.9], [0.08, -0.68, 0.88], [0.14, -1.1, 0.55], [0.15, -1.25, 0.1], [0.15, -1.15, -0.4], [0.12, -0.7, -0.8], [0.12, -0.15, -0.88]],
    0.03, 70,
  );
  const rcaFull = [...curvePoints([rightOst, add(projectOuter(add(rightOst, [-0.12, 0.05, 0.14]), 0.03), [0, 0, 0]), rca[0]], 10), ...rca];
  const pdaH: V3[] = [];
  for (let s = 0.2; s <= 2.1; s += 0.3) pdaH.push([s, 0.1 - 0.12 * (s / 2.1), surfaceAnt(s, 0.1 - 0.12 * (s / 2.1)) || -0.8]);
  const pda = surfacePath([[0.12, -0.15, -0.88], ...pdaH.slice(1)], 0.03, 40);
  const margin: Path = {
    pts: surfacePath([[0.15, -1.25, 0.1], [0.6, -1.25, 0.2], [1.1, -1.12, 0.3], [1.55, -0.85, 0.35]], 0.03, 30),
    r0: 0.02, r1: 0.011,
  };

  const arteries: Path[] = [
    { pts: lmca, r0: 0.042, r1: 0.038 },
    { pts: ladPts, r0: 0.036, r1: 0.014 },
    ...diag,
    { pts: lcx, r0: 0.032, r1: 0.014 },
    ...om,
    { pts: rcaFull, r0: 0.036, r1: 0.02 },
    { pts: pda, r0: 0.022, r1: 0.01 },
    margin,
  ];

  // вены: большая вена сердца идёт рядом с ПМЖВ, затем вдоль огибающей к венечному синусу
  const gcvH: V3[] = [];
  for (let s = 1.9; s >= 0.15; s -= 0.25) gcvH.push([s, creaseLat(s) + 0.12, 0]);
  const gcvPts: V3[] = [...gcvH.map(([s, lat]) => [s, lat, surfaceAnt(s, lat)] as V3), [-0.04, 0.75, 0.3], [-0.04, 1.0, -0.2], [-0.04, 0.85, -0.6], [-0.05, 0.4, -0.88], [-0.1, -0.2, -0.8], [-0.12, -0.5, -0.55]];
  const gcv = surfacePath(gcvPts, 0.035, 80);
  const mcvH: V3[] = [[1.95, 0.0, -0.7], [1.2, 0.04, -0.86], [0.6, 0.06, -0.9], [0.1, -0.05, -0.88]];
  const mcv = surfacePath(mcvH, 0.035, 40);
  const scv = surfacePath([[1.2, -1.15, 0.25], [0.6, -1.25, 0.05], [0.15, -1.2, -0.3], [0.1, -0.8, -0.8]], 0.035, 30);
  const veins: Path[] = [
    { pts: gcv, r0: 0.024, r1: 0.05 },
    { pts: mcv, r0: 0.02, r1: 0.032 },
    { pts: scv, r0: 0.016, r1: 0.026 },
  ];
  return { arteries, veins, groove: [arteries[0], arteries[1], lcx, rcaFull, pda, gcv, mcv].map((p) => (Array.isArray(p) ? { pts: p, r0: 0, r1: 0 } : p)) };
}

function pathEntity(paths: Path[], part: string, kind: 'coronaryA' | 'coronaryV', sides = 8): HeartEntity {
  const b = new MeshBuilder();
  for (const p of paths) b.tube(p.pts, (t) => p.r0 + (p.r1 - p.r0) * t, sides, 'both');
  return { part, kind, variant: 'all', mesh: b.build() };
}

/* ---------- эпикардиальный жир ---------- */

function fatEntity(paths: Path[]): HeartEntity {
  const pts: number[] = [];
  for (const p of paths) for (let i = 0; i < p.pts.length; i += 2) pts.push(...p.pts[i]);
  const n = pts.length / 3;
  const field = (x: number, y: number, z: number): number => {
    const dOut = sdOuter(x, y, z);
    if (dOut > 0.25) return dOut - 0.1;
    if (dOut < -0.15) return 0.1;
    let d2 = 1e9;
    for (let i = 0; i < n; i++) {
      const dx = x - pts[i * 3], dy = y - pts[i * 3 + 1], dz = z - pts[i * 3 + 2];
      const q = dx * dx + dy * dy + dz * dz;
      if (q < d2) d2 = q;
    }
    const w = Math.exp(-d2 / 0.022);
    const bump = 0.5 + 0.9 * vnoise(x * 7.3, y * 7.3, z * 7.3) + 0.35 * vnoise(x * 19, y * 19, z * 19);
    const thick = -0.06 + 0.17 * w * bump;
    return Math.max(dOut - thick, -(dOut + 0.022));
  };
  const g = makeGrid(FAT_H);
  const f = sampleBand(g, field);
  const mesh = isoMesh(g, f, 0, 1);
  return { part: 'epicardial-fat', kind: 'fat', variant: 'all', mesh };
}

/* ---------- проводящая система ---------- */

function conductionEntities(): HeartEntity[] {
  const out: HeartEntity[] = [];
  const r = rng(77);
  const tubes = new MeshBuilder();
  const nodes = new MeshBuilder();

  const sa = projectOuter([-1.17, 1.0, -0.02], -0.045, 10);
  nodes.ellipsoid(sa, [0.05, 0.13, 0.04], [norm([0.1, 1, 0.1]), norm([1, -0.1, 0]), norm([0, 0.1, 1])], 14, 10);
  const avn = hw(0.0, -0.3, -0.3);
  nodes.ellipsoid(avn, [0.07, 0.05, 0.05], undefined, 14, 10);

  // межузловые пути по стенке правого предсердия
  const inter = (hs: V3[]) =>
    curvePoints(hs.map((h) => projectCavity(hw(h[0], h[1], h[2]), 0.035, 8)), 24);
  tubes.tube(inter([[-0.35, -1.05, 0.2], [-0.5, -0.95, 0.1], [-0.4, -0.65, -0.1], [0.0, -0.3, -0.3]]), 0.011, 6, 'none');
  tubes.tube(curvePoints([sa, hw(-0.45, -1.2, 0.2), hw(-0.45, -1.05, 0.1)], 12), 0.011, 6, 'none');
  tubes.tube(inter([[-0.5, -0.7, -0.4], [-0.3, -0.5, -0.3], [0.0, -0.3, -0.3]]), 0.011, 6, 'none');

  // пучок Гиса и ножки
  const his = curvePoints([avn, hw(0.2, -0.2, -0.22), hw(0.42, -0.08, -0.12)], 12);
  tubes.tube(his, 0.02, 8, 'both');
  const split = hw(0.45, -0.06, -0.1);
  const lbb = (hs: V3[]) => curvePoints([split, ...hs.map((h) => projectCavity(hw(h[0], h[1], h[2]), 0.0, 10))], 30);
  const branches: V3[][] = [
    lbb([[0.7, 0.04, 0.0], [1.15, 0.06, 0.12], [1.6, 0.1, 0.1]]),
    lbb([[0.75, 0.05, -0.2], [1.2, 0.08, -0.35], [1.65, 0.12, -0.35]]),
    lbb([[0.7, 0.04, -0.1], [1.1, 0.1, -0.05], [1.45, 0.2, -0.1]]),
  ];
  for (const b of branches) tubes.tube(b, (t) => 0.016 - 0.006 * t, 7, 'both');
  const rbb = curvePoints([split, ...[[0.8, -0.15, 0.2], [1.25, -0.22, 0.4], [1.6, -0.2, 0.45]].map((h) => projectCavity(hw(h[0], h[1], h[2]), 0.0, 10)), MOD_A], 30);
  tubes.tube(rbb, (t) => 0.016 - 0.006 * t, 7, 'both');
  tubes.tube(curvePoints([MOD_A, MOD_B], 8), 0.012, 6, 'both');

  // волокна Пуркинье: ветвление по эндокарду
  const purkinje = (base: V3[], count: number, spread: number) => {
    for (let k = 0; k < count; k++) {
      const p0 = base[Math.floor(r() * base.length)];
      const h0 = wh(p0);
      const pts: V3[] = [p0];
      let s = h0[0], lat = h0[1], ant = h0[2];
      for (let q = 0; q < 4; q++) {
        s += 0.1 + r() * 0.18;
        lat += (r() - 0.5) * spread;
        ant += (r() - 0.5) * spread;
        pts.push(projectCavity(hw(s, lat, ant), 0.0, 8));
      }
      tubes.tube(curvePoints(pts, 12), (t) => 0.008 - 0.003 * t, 5, 'both');
    }
  };
  purkinje(branches.flatMap((b) => b.filter((_, i) => i % 6 === 3)), 22, 0.4);
  purkinje(rbb.filter((_, i) => i % 6 === 3), 10, 0.35);

  out.push({ part: 'conduction-system', kind: 'node', variant: 'all', mesh: nodes.build() });
  out.push({ part: 'conduction-system', kind: 'conduction', variant: 'all', mesh: tubes.build() });
  return out;
}

/* ---------- сборка ---------- */

function wallEntities(kind: CutKey | null): HeartEntity[] {
  const plane = kind ? cutPlane(kind) : null;
  return wallMeshes(plane, WALL_H, 1).map((m) => {
    const mesh: RawMesh & { surf: Float32Array } = { positions: m.positions, normals: m.normals, colors: m.colors, indices: m.indices, surf: m.surf };
    return { part: m.part, kind: 'wall', variant: kind ?? 'whole', mesh } as HeartEntity;
  });
}

/** Целое сердце и внутренние структуры. */
export function heartMain(): HeartEntity[] {
  const { arteries, veins, groove } = coronaryPaths();
  return [
    ...wallEntities(null),
    ...valveEntities(),
    pathEntity(arteries, 'coronary-arteries', 'coronaryA'),
    pathEntity(veins, 'cardiac-veins', 'coronaryV', 9),
    fatEntity(groove),
    ...conductionEntities(),
  ];
}

/** Стенка с вырезом. */
export function heartCut(kind: CutKey): HeartEntity[] {
  return wallEntities(kind);
}

