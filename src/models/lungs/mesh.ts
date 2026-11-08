/* Сборщик сеток: трубки, эллипсоиды, пластины. Накапливает вершины в массивах, без three.js (работает в фоновом потоке). */

import { surfaceNets, smoothMesh, type Grid } from '../teeth/surfaceNets';
import { anyPerp, catmull, cross, norm, sub, type V3 } from './sdf';

export interface RawMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Необязательные цвета вершин (rgb 0..1). */
  colors?: Float32Array;
}

export class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] | null;
  idx: number[] = [];

  constructor(withColors = false) {
    this.col = withColors ? [] : null;
  }

  get count() {
    return this.pos.length / 3;
  }

  private vert(p: V3, n: V3, c?: V3) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    if (this.col) this.col.push(...(c ?? [1, 1, 1]));
  }

  /** Трубка по ломаной с плавно меняющимся радиусом; кадры переносятся параллельно, поэтому трубка не «скручивается». */
  tube(path: V3[], radius: number | ((t: number) => number), sides = 8, caps: 'none' | 'start' | 'end' | 'both' = 'both', color?: V3 | ((t: number) => V3), squash = 1) {
    const n = path.length;
    if (n < 2) return;
    const rf = typeof radius === 'number' ? () => radius : radius;
    const base = this.count;
    let tan = norm(sub(path[1], path[0]));
    let nrm0 = anyPerp(tan);
    const frames: { t: V3; a: V3; b: V3 }[] = [];
    for (let i = 0; i < n; i++) {
      const next = path[Math.min(i + 1, n - 1)];
      const prev = path[Math.max(i - 1, 0)];
      const t = norm(sub(next, prev));
      // параллельный перенос: убираем из прежней нормали составляющую вдоль новой касательной
      const d = nrm0[0] * t[0] + nrm0[1] * t[1] + nrm0[2] * t[2];
      let a: V3 = [nrm0[0] - d * t[0], nrm0[1] - d * t[1], nrm0[2] - d * t[2]];
      a = norm(a);
      nrm0 = a;
      tan = t;
      frames.push({ t, a, b: cross(t, a) });
    }
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      const tt = n > 1 ? i / (n - 1) : 0;
      const r = rf(tt);
      const c = typeof color === 'function' ? color(tt) : color;
      for (let j = 0; j < sides; j++) {
        const ang = (j / sides) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang) * squash;
        const nx = f.a[0] * ca + f.b[0] * sa;
        const ny = f.a[1] * ca + f.b[1] * sa;
        const nz = f.a[2] * ca + f.b[2] * sa;
        this.vert([path[i][0] + nx * r, path[i][1] + ny * r, path[i][2] + nz * r], norm([nx, ny, nz]), c);
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < sides; j++) {
        const a = base + i * sides + j;
        const b = base + i * sides + ((j + 1) % sides);
        const c = a + sides;
        const d = b + sides;
        this.idx.push(a, c, b, b, c, d);
      }
    const cap = (i: number, dir: number) => {
      const f = frames[i];
      const r = rf(n > 1 ? i / (n - 1) : 0);
      const c = typeof color === 'function' ? color(i / (n - 1)) : color;
      const ring = this.count;
      const tipDir: V3 = [f.t[0] * dir, f.t[1] * dir, f.t[2] * dir];
      // закругление: кольцо поменьше и полюс
      for (let j = 0; j < sides; j++) {
        const ang = (j / sides) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang) * squash;
        const ox = f.a[0] * ca + f.b[0] * sa, oy = f.a[1] * ca + f.b[1] * sa, oz = f.a[2] * ca + f.b[2] * sa;
        const k = Math.SQRT1_2;
        this.vert(
          [path[i][0] + ox * r * k + tipDir[0] * r * k, path[i][1] + oy * r * k + tipDir[1] * r * k, path[i][2] + oz * r * k + tipDir[2] * r * k],
          norm([ox * k + tipDir[0] * k, oy * k + tipDir[1] * k, oz * k + tipDir[2] * k]),
          c,
        );
      }
      const pole = this.count;
      this.vert([path[i][0] + tipDir[0] * r, path[i][1] + tipDir[1] * r, path[i][2] + tipDir[2] * r], tipDir, c);
      const edge = base + i * sides;
      for (let j = 0; j < sides; j++) {
        const j2 = (j + 1) % sides;
        if (dir > 0) this.idx.push(edge + j, ring + j, edge + j2, edge + j2, ring + j, ring + j2);
        else this.idx.push(edge + j, edge + j2, ring + j, edge + j2, ring + j2, ring + j);
        if (dir > 0) this.idx.push(ring + j, pole, ring + j2);
        else this.idx.push(ring + j, ring + j2, pole);
      }
    };
    if (caps === 'start' || caps === 'both') cap(0, -1);
    if (caps === 'end' || caps === 'both') cap(n - 1, 1);
  }

  /** Эллипсоид с произвольными осями. */
  ellipsoid(c: V3, radii: V3, axes: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], seg = 14, rings = 10, color?: V3) {
    const base = this.count;
    const [ax, ay, az] = axes;
    for (let i = 0; i <= rings; i++) {
      const th = (i / rings) * Math.PI;
      const st = Math.sin(th), ct = Math.cos(th);
      for (let j = 0; j <= seg; j++) {
        const ph = (j / seg) * Math.PI * 2;
        const x = st * Math.cos(ph), y = ct, z = st * Math.sin(ph);
        const px = x * radii[0], py = y * radii[1], pz = z * radii[2];
        const p: V3 = [c[0] + ax[0] * px + ay[0] * py + az[0] * pz, c[1] + ax[1] * px + ay[1] * py + az[1] * pz, c[2] + ax[2] * px + ay[2] * py + az[2] * pz];
        const nx = x / radii[0], ny = y / radii[1], nz = z / radii[2];
        const n: V3 = norm([ax[0] * nx + ay[0] * ny + az[0] * nz, ax[1] * nx + ay[1] * ny + az[1] * nz, ax[2] * nx + ay[2] * ny + az[2] * nz]);
        this.vert(p, n, color);
      }
    }
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j;
        const b = a + 1;
        const c2 = a + seg + 1;
        const d = c2 + 1;
        this.idx.push(a, b, c2, b, d, c2);
      }
  }

  sphere(c: V3, r: number, seg = 8, rings = 6, color?: V3) {
    this.ellipsoid(c, [r, r, r], undefined, seg, rings, color);
  }

  /** Лента между двумя ломаными (двусторонняя), нормали считаются по граням. */
  ribbon(a: V3[], b: V3[], color?: V3) {
    const n = Math.min(a.length, b.length);
    const base = this.count;
    for (let i = 0; i < n; i++) {
      const t = norm(sub(a[Math.min(i + 1, n - 1)], a[Math.max(i - 1, 0)]));
      const w = sub(b[i], a[i]);
      const nn = norm(cross(t, w));
      this.vert(a[i], nn, color);
      this.vert(b[i], nn, color);
    }
    for (let i = 0; i < n - 1; i++) {
      const p = base + i * 2;
      this.idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }

  /** Плоская сетка с заданной функцией позиции; нормали усредняются позже. */
  grid(nu: number, nv: number, f: (u: number, v: number) => V3, color?: (u: number, v: number) => V3) {
    const base = this.count;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv;
        this.vert(f(u, v), [0, 1, 0], color?.(u, v));
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1;
        const c = a + nu + 1;
        const d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
  }

  /** Пересчитать нормали по граням (для сеток, где формулы нормалей нет). */
  recomputeNormals(from = 0) {
    const n = this.count;
    const acc = new Float64Array(n * 3);
    for (let i = 0; i < this.idx.length; i += 3) {
      const ia = this.idx[i], ib = this.idx[i + 1], ic = this.idx[i + 2];
      if (ia < from || ib < from || ic < from) continue;
      const ax = this.pos[ia * 3], ay = this.pos[ia * 3 + 1], az = this.pos[ia * 3 + 2];
      const ux = this.pos[ib * 3] - ax, uy = this.pos[ib * 3 + 1] - ay, uz = this.pos[ib * 3 + 2] - az;
      const vx = this.pos[ic * 3] - ax, vy = this.pos[ic * 3 + 1] - ay, vz = this.pos[ic * 3 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [ia, ib, ic]) {
        acc[k * 3] += nx;
        acc[k * 3 + 1] += ny;
        acc[k * 3 + 2] += nz;
      }
    }
    for (let k = from; k < n; k++) {
      const l = Math.hypot(acc[k * 3], acc[k * 3 + 1], acc[k * 3 + 2]) || 1;
      this.nrm[k * 3] = acc[k * 3] / l;
      this.nrm[k * 3 + 1] = acc[k * 3 + 1] / l;
      this.nrm[k * 3 + 2] = acc[k * 3 + 2] / l;
    }
  }

  build(): RawMesh {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nrm),
      indices: new Uint32Array(this.idx),
      colors: this.col ? new Float32Array(this.col) : undefined,
    };
  }
}

/** Сетка поверхности уровня поля: Surface Nets и сглаживание Таубина. */
export function isoMesh(g: Grid, field: Float32Array, iso: number, smooth = 2): RawMesh {
  const m = smoothMesh(surfaceNets(g, field, iso), smooth);
  return { positions: m.positions, normals: m.normals, indices: m.indices };
}

export function smoothPath(pts: V3[], samples: number): V3[] {
  return catmull(pts, samples);
}
