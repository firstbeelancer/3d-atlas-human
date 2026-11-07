/*
  Тела лёгких: доли, плевральные мешки и щели. Поле лёгкого считается один раз на сетке,
  а доли получаются из него разрезанием по щелям — без повторных вычислений.
*/

import type { Grid } from '../teeth/surfaceNets';
import { fissureH, fissureO, lobeField, lungField, LEFT, LUNG_BOX, LUNG_OPTS, RIGHT, SAC_OPTS, type LobeCode, type Side } from './field';
import { isoMesh, MeshBuilder, type RawMesh } from './mesh';
import type { V3 } from './sdf';

export interface Bodies {
  lobes: Record<LobeCode, RawMesh>;
  pleura: Record<'R' | 'L', RawMesh>;
  cavity: Record<'R' | 'L', RawMesh>;
  fissures: RawMesh;
}

function gridFor(s: Side, h: number): Grid {
  const b = LUNG_BOX[s];
  const pad = h * 3;
  return {
    x0: b.min[0] - pad,
    y0: b.min[1] - pad,
    z0: b.min[2] - pad,
    h,
    nx: Math.ceil((b.max[0] - b.min[0] + pad * 2) / h) + 1,
    ny: Math.ceil((b.max[1] - b.min[1] + pad * 2) / h) + 1,
    nz: Math.ceil((b.max[2] - b.min[2] + pad * 2) / h) + 1,
  };
}

/** Шаг сетки долей: чем меньше, тем тоньше борозды, но дольше сборка. */
export const LUNG_STEP = 0.04;

function sample(g: Grid, f: (x: number, y: number, z: number) => number): Float32Array {
  const out = new Float32Array(g.nx * g.ny * g.nz);
  let q = 0;
  for (let k = 0; k < g.nz; k++) {
    const z = g.z0 + k * g.h;
    for (let j = 0; j < g.ny; j++) {
      const y = g.y0 + j * g.h;
      for (let i = 0; i < g.nx; i++) out[q++] = f(g.x0 + i * g.h, y, z);
    }
  }
  return out;
}

/** Лист щели: полярная сетка вокруг центра, край — ровно по границе лёгкого. */
function fissureSheet(
  b: MeshBuilder,
  place: (a: number, c: number) => V3,
  center: [number, number],
  inside: (p: V3) => number,
  rays = 112,
  rings = 22,
) {
  const R: number[] = [];
  for (let i = 0; i <= rays; i++) {
    const th = (i / rays) * Math.PI * 2;
    const ca = Math.cos(th), sa = Math.sin(th);
    let lo = 0, hi = 3.5;
    for (let it = 0; it < 26; it++) {
      const mid = (lo + hi) / 2;
      if (inside(place(center[0] + ca * mid, center[1] + sa * mid)) < -0.004) lo = mid;
      else hi = mid;
    }
    R.push(lo);
  }
  const base = b.count;
  b.grid(rays, rings, (u, v) => {
    const i = Math.round(u * rays);
    const th = u * Math.PI * 2;
    const r = R[i] * v;
    return place(center[0] + Math.cos(th) * r, center[1] + Math.sin(th) * r);
  });
  b.recomputeNormals(base);
}

export function buildBodies(): Bodies {
  const lobes = {} as Record<LobeCode, RawMesh>;
  const pleura = {} as Bodies['pleura'];
  const cavity = {} as Bodies['cavity'];
  const fissure = new MeshBuilder();

  for (const s of [RIGHT, LEFT] as const) {
    const key = s === RIGHT ? 'R' : 'L';
    const g = gridFor(s, LUNG_STEP);
    const F = sample(g, (x, y, z) => lungField(s, x, y, z, LUNG_OPTS));
    const FO = sample(g, (x, y, z) => fissureO(s, x, y, z));
    const FH = s === RIGHT ? sample(g, (x, y, z) => fissureH(x, y, z)) : FO;
    const ids: LobeCode[] = s === RIGHT ? ['ru', 'rm', 'rl'] : ['lu', 'll'];
    for (const id of ids) {
      const f = new Float32Array(F.length);
      for (let i = 0; i < f.length; i++) f[i] = lobeField(id, F[i], FO[i], FH[i]);
      lobes[id] = isoMesh(g, f, 0, 2);
    }

    // плевральные мешки на более грубой сетке: пристеночный листок и плевральная полость вокруг доли
    const gs = gridFor(s, 0.07);
    const S = sample(gs, (x, y, z) => lungField(s, x, y, z, SAC_OPTS));
    pleura[key] = isoMesh(gs, S, 0.075, 1);
    cavity[key] = isoMesh(gs, S, 0.04, 1);

    // щели
    const ins = (p: V3) => lungField(s, p[0], p[1], p[2], LUNG_OPTS);
    const y0 = (u: number) => (s === RIGHT ? 0.2 : 0.14) - 0.1 * (u - 1.0);
    fissureSheet(
      fissure,
      (u, c) => [s * u, y0(u) + 0.8 * c, -0.05 - 0.6 * c],
      [1.3, 0.1],
      ins,
    );
    if (s === RIGHT) {
      fissureSheet(
        fissure,
        (u, z) => [s * u, 0.4 - 0.4 * (u - 0.4) / 1.7, z],
        [1.5, 0.75],
        (p) => Math.max(ins(p), -fissureO(RIGHT, p[0], p[1], p[2]) + 0.01),
        96,
        14,
      );
    }
  }
  return { lobes, pleura, cavity, fissures: fissure.build() };
}
