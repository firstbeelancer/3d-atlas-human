/*
  Сетка стенки сердца: поле считается только в узкой полосе у поверхности (блоками), затем Surface Nets.
  Каждая вершина получает часть атласа и тип поверхности (снаружи, внутри, срез); треугольники
  раскладываются по частям, поэтому швы между частями совпадают точно.
*/

import { smoothMesh, surfaceNets, type Grid } from '../teeth/surfaceNets';
import { BOUNDS, classify, solidField, type CutPlane, type Surf } from './field';
import { paletteColor } from './palette';

export interface PartMesh {
  part: string;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** 0 — снаружи, 1 — внутри (эндокард), 2 — срез. */
  surf: Float32Array;
  indices: Uint32Array;
}

export function makeGrid(h: number): Grid {
  const [x0, y0, z0] = BOUNDS.min;
  return {
    x0, y0, z0, h,
    nx: Math.ceil((BOUNDS.max[0] - x0) / h) + 1,
    ny: Math.ceil((BOUNDS.max[1] - y0) / h) + 1,
    nz: Math.ceil((BOUNDS.max[2] - z0) / h) + 1,
  };
}

const BLOCK = 8;

/** Поле на сетке: блоки, далёкие от поверхности, заполняются знаком без вычисления. */
export function sampleBand(g: Grid, f: (x: number, y: number, z: number) => number): Float32Array {
  const { nx, ny, nz, h, x0, y0, z0 } = g;
  const out = new Float32Array(nx * ny * nz);
  const half = BLOCK * h * 0.5;
  const reach = half * Math.sqrt(3) * 2.6 + 0.06;
  for (let bk = 0; bk < nz; bk += BLOCK)
    for (let bj = 0; bj < ny; bj += BLOCK)
      for (let bi = 0; bi < nx; bi += BLOCK) {
        const ie = Math.min(bi + BLOCK, nx), je = Math.min(bj + BLOCK, ny), ke = Math.min(bk + BLOCK, nz);
        const cx = x0 + (bi + (ie - bi - 1) / 2) * h;
        const cy = y0 + (bj + (je - bj - 1) / 2) * h;
        const cz = z0 + (bk + (ke - bk - 1) / 2) * h;
        const c = f(cx, cy, cz);
        if (Math.abs(c) > reach) {
          const v = c > 0 ? 1 : -1;
          for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) for (let i = bi; i < ie; i++) out[i + nx * (j + ny * k)] = v;
          continue;
        }
        for (let k = bk; k < ke; k++)
          for (let j = bj; j < je; j++)
            for (let i = bi; i < ie; i++) out[i + nx * (j + ny * k)] = f(x0 + i * h, y0 + j * h, z0 + k * h);
      }
  return out;
}

/** Стенка сердца (с разрезом или без): сетки по частям. */
export function wallMeshes(plane: CutPlane | null, h = 0.02, smooth = 1): PartMesh[] {
  const g = makeGrid(h);
  const field = sampleBand(g, solidField(plane));
  let m = surfaceNets(g, field, 0);
  if (smooth > 0) m = smoothMesh(m, smooth);
  const nv = m.positions.length / 3;
  const part: string[] = new Array(nv);
  const surf = new Uint8Array(nv);
  for (let v = 0; v < nv; v++) {
    const c = classify(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2], plane);
    part[v] = c.part;
    surf[v] = c.surf as Surf;
  }
  // треугольники по частям: по большинству вершин, иначе по первой
  const groups = new Map<string, number[]>();
  const idx = m.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    let owner = part[a];
    if (part[b] === part[c]) owner = part[b];
    let arr = groups.get(owner);
    if (!arr) groups.set(owner, (arr = []));
    arr.push(a, b, c);
  }
  const result: PartMesh[] = [];
  for (const [name, tri] of groups) {
    const remap = new Map<number, number>();
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    const sf: number[] = [];
    const ind: number[] = [];
    for (let i = 0; i < tri.length; i++) {
      const v = tri[i];
      let n = remap.get(v);
      if (n === undefined) {
        n = pos.length / 3;
        remap.set(v, n);
        pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
        nrm.push(m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]);
        const rgb = paletteColor(name, surf[v] as Surf, m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2], part[v]);
        col.push(rgb[0], rgb[1], rgb[2]);
        sf.push(surf[v]);
      }
      ind.push(n);
    }
    result.push({
      part: name,
      positions: new Float32Array(pos),
      normals: new Float32Array(nrm),
      colors: new Float32Array(col),
      surf: new Float32Array(sf),
      indices: new Uint32Array(ind),
    });
  }
  return result;
}
