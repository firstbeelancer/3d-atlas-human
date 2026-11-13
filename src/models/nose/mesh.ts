/**
 * Превращает поле расстояний в гладкую сетку и делит её на части.
 * Нормали берутся из градиента поля, поэтому поверхность выглядит шелковистой даже на умеренной сетке;
 * сглаживание Таубина убирает «лесенку» вокселей без усадки формы.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { smoothMesh, surfaceNets, type Grid } from '../teeth/surfaceNets';
import type { V3 } from './field';

export interface FieldBox {
  min: V3;
  max: V3;
}

export function makeGrid(box: FieldBox, h: number): Grid {
  return {
    x0: box.min[0],
    y0: box.min[1],
    z0: box.min[2],
    h,
    nx: Math.ceil((box.max[0] - box.min[0]) / h) + 1,
    ny: Math.ceil((box.max[1] - box.min[1]) / h) + 1,
    nz: Math.ceil((box.max[2] - box.min[2]) / h) + 1,
  };
}

export function sampleField(g: Grid, f: (x: number, y: number, z: number) => number): Float32Array {
  const out = new Float32Array(g.nx * g.ny * g.nz);
  let idx = 0;
  for (let k = 0; k < g.nz; k++) {
    const z = g.z0 + k * g.h;
    for (let j = 0; j < g.ny; j++) {
      const y = g.y0 + j * g.h;
      for (let i = 0; i < g.nx; i++) {
        out[idx++] = f(g.x0 + i * g.h, y, z);
      }
    }
  }
  return out;
}

export interface MeshOpts {
  /** Шаги сглаживания Таубина (по умолчанию 2). */
  smooth?: number;
  /** Масштаб планарной развёртки текстуры (повтор на мм). */
  uvScale?: number;
  /** Цвет вершин (множитель к текстуре), например лёгкий румянец. */
  color?: (x: number, y: number, z: number) => V3;
  /** Пересчитать нормали из градиента поля (по умолчанию true). */
  gradientNormals?: boolean;
}

/** Планарная развёртка по доминирующей оси нормали: швы незаметны на шумовой текстуре. */
function planarUV(nx: number, ny: number, nz: number, x: number, y: number, z: number, s: number): [number, number] {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= ay && ax >= az) return [0.5 + z * s, 0.5 + y * s];
  if (ay >= ax && ay >= az) return [0.5 + x * s, 0.5 + z * s];
  return [0.5 + x * s, 0.5 + y * s];
}

export function meshField(f: (x: number, y: number, z: number) => number, box: FieldBox, h: number, opts: MeshOpts = {}): BufferGeometry {
  const g = makeGrid(box, h);
  const field = sampleField(g, f);
  let m = surfaceNets(g, field, 0);
  m = smoothMesh(m, opts.smooth ?? 2);
  const n = m.positions.length / 3;
  const uvScale = opts.uvScale ?? 1 / 30;
  const uv = new Float32Array(n * 2);
  const colors = opts.color ? new Float32Array(n * 3) : null;
  const eps = h * 0.6;
  const useGrad = opts.gradientNormals !== false;
  for (let v = 0; v < n; v++) {
    const x = m.positions[v * 3];
    const y = m.positions[v * 3 + 1];
    const z = m.positions[v * 3 + 2];
    if (useGrad) {
      let gx = f(x + eps, y, z) - f(x - eps, y, z);
      let gy = f(x, y + eps, z) - f(x, y - eps, z);
      let gz = f(x, y, z + eps) - f(x, y, z - eps);
      const l = Math.hypot(gx, gy, gz);
      if (l > 1e-6) {
        gx /= l; gy /= l; gz /= l;
        m.normals[v * 3] = gx;
        m.normals[v * 3 + 1] = gy;
        m.normals[v * 3 + 2] = gz;
      }
    }
    const [u, vv] = planarUV(m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2], x, y, z, uvScale);
    uv[v * 2] = u;
    uv[v * 2 + 1] = vv;
    if (colors && opts.color) {
      const c = opts.color(x, y, z);
      colors[v * 3] = c[0];
      colors[v * 3 + 1] = c[1];
      colors[v * 3 + 2] = c[2];
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(m.positions, 3));
  geo.setAttribute('normal', new BufferAttribute(m.normals, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  if (colors) geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setIndex(new BufferAttribute(m.indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Делит сетку на части по классификатору центра треугольника, уплотняя вершины каждой части. */
export function splitMesh(geo: BufferGeometry, classify: (x: number, y: number, z: number) => string): Record<string, BufferGeometry> {
  const pos = geo.getAttribute('position') as BufferAttribute;
  const nor = geo.getAttribute('normal') as BufferAttribute;
  const uv = geo.getAttribute('uv') as BufferAttribute | undefined;
  const col = geo.getAttribute('color') as BufferAttribute | undefined;
  const idx = geo.getIndex()!;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const key = classify(cx, cy, cz);
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(a, b, c);
  }
  const out: Record<string, BufferGeometry> = {};
  for (const [key, tris] of buckets) {
    const remap = new Map<number, number>();
    const P: number[] = [];
    const N: number[] = [];
    const U: number[] = [];
    const C: number[] = [];
    const push = (old: number): number => {
      let ni = remap.get(old);
      if (ni === undefined) {
        ni = P.length / 3;
        remap.set(old, ni);
        P.push(pos.getX(old), pos.getY(old), pos.getZ(old));
        N.push(nor.getX(old), nor.getY(old), nor.getZ(old));
        if (uv) U.push(uv.getX(old), uv.getY(old));
        if (col) C.push(col.getX(old), col.getY(old), col.getZ(old));
      }
      return ni;
    };
    const I: number[] = [];
    for (const old of tris) I.push(push(old));
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(N), 3));
    if (uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(U), 2));
    if (col) g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
    g.setIndex(I);
    g.computeBoundingSphere();
    out[key] = g;
  }
  return out;
}
