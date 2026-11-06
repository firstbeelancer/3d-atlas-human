import { BASE_C, BASE_R, FINE, SURFACES, TAU, offsets, rows, wallPoint, type Row, type V3 } from './shape';

/*
  Поверхности стенки — регулярные сетки по (s, v). Для каждой поверхности вершины считаются один раз,
  а разные виды (целая стенка, окно разреза, ступени препаровки) — это разные индексные буферы
  поверх тех же вершин. Края окон лежат на линиях опорной сетки, поэтому срезы слоёв стыкуются без щелей.
*/

/** Окно на опорной сетке: ряды [r0, r1), столбцы [c0, c1). */
export interface Win {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export const inWin = (w: Win | null | undefined, rb: number, cb: number): boolean =>
  !!w && rb >= w.r0 && rb < w.r1 && cb >= w.c0 && cb < w.c1;

export interface GridData {
  surface: number;
  mult: number;
  rowsN: number;
  colsN: number;
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  /** Длина дуги и угол обхода каждой вершины — для подсветки отделов в шейдере. */
  sv: Float32Array;
  color: Float32Array | null;
}

export interface GridOptions {
  uv: [number, number];
  color?: (h: number, row: Row, v: number) => [number, number, number];
  inward?: boolean;
}

/** mult — число ячеек сетки на одну ячейку опорной сетки (1, 2, 3, 4, 6 или 12). */
export function buildGrid(surface: number, mult: number, opt: GridOptions): GridData {
  const R = rows();
  const I = BASE_R * mult;
  const J = BASE_C * mult;
  const W = J + 1;
  const stride = FINE / mult;
  const nV = (I + 1) * W;
  const position = new Float32Array(nV * 3);
  const normal = new Float32Array(nV * 3);
  const uv = new Float32Array(nV * 2);
  const sv = new Float32Array(nV * 2);
  const color = opt.color ? new Float32Array(nV * 3) : null;
  const off = new Float64Array(SURFACES);
  const p: V3 = [0, 0, 0];
  const withFold = surface >= 5;

  for (let i = 0; i <= I; i++) {
    const row = R[i * stride];
    for (let j = 0; j <= W - 1; j++) {
      const v = (j / J) * TAU;
      const h = offsets(row, v, off, withFold);
      wallPoint(row, v, off[surface], p);
      const n = i * W + j;
      position[n * 3] = p[0];
      position[n * 3 + 1] = p[1];
      position[n * 3 + 2] = p[2];
      uv[n * 2] = row.s * opt.uv[0];
      uv[n * 2 + 1] = (j / J) * opt.uv[1];
      sv[n * 2] = row.s;
      sv[n * 2 + 1] = v;
      if (color && opt.color) {
        const c = opt.color(h, row, v);
        color[n * 3] = c[0];
        color[n * 3 + 1] = c[1];
        color[n * 3 + 2] = c[2];
      }
    }
  }

  // нормали: сумма нормалей треугольников (с учётом площади)
  const acc = (a: number, b: number, c: number) => {
    const ax = position[a * 3];
    const ay = position[a * 3 + 1];
    const az = position[a * 3 + 2];
    const ux = position[b * 3] - ax;
    const uy = position[b * 3 + 1] - ay;
    const uz = position[b * 3 + 2] - az;
    const wx = position[c * 3] - ax;
    const wy = position[c * 3 + 1] - ay;
    const wz = position[c * 3 + 2] - az;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    for (const q of [a, b, c]) {
      normal[q * 3] += nx;
      normal[q * 3 + 1] += ny;
      normal[q * 3 + 2] += nz;
    }
  };
  for (let i = 0; i < I; i++) {
    for (let j = 0; j < J; j++) {
      const a = i * W + j;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      acc(a, b, c);
      acc(b, d, c);
    }
  }
  // шов обхода: первый и последний столбцы совпадают в пространстве — усредняем их нормали
  for (let i = 0; i <= I; i++) {
    const a = (i * W) * 3;
    const b = (i * W + J) * 3;
    for (let q = 0; q < 3; q++) {
      const m = normal[a + q] + normal[b + q];
      normal[a + q] = m;
      normal[b + q] = m;
    }
  }
  const sign = opt.inward ? -1 : 1;
  for (let n = 0; n < nV; n++) {
    const x = normal[n * 3];
    const y = normal[n * 3 + 1];
    const z = normal[n * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    normal[n * 3] = (sign * x) / l;
    normal[n * 3 + 1] = (sign * y) / l;
    normal[n * 3 + 2] = (sign * z) / l;
  }
  return { surface, mult, rowsN: I + 1, colsN: W, position, normal, uv, sv, color };
}

/** Индексный буфер: ячейки, попавшие в removed, пропускаются. inward — обратный обход (просвет). */
export function indexFor(g: GridData, removed: ((rb: number, cb: number) => boolean) | null, inward = false): Uint32Array {
  const I = g.rowsN - 1;
  const J = g.colsN - 1;
  const W = g.colsN;
  const out: number[] = [];
  for (let i = 0; i < I; i++) {
    for (let j = 0; j < J; j++) {
      if (removed && removed((i + 0.5) / g.mult, (j + 0.5) / g.mult)) continue;
      const a = i * W + j;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      if (inward) out.push(a, c, b, b, c, d);
      else out.push(a, b, c, b, d, c);
    }
  }
  return Uint32Array.from(out);
}

/* ------------------------------ срезы стенки ------------------------------ */

export type RGB = [number, number, number];

/** Копит плоские четырёхугольники срезов: у каждого свой цвет слоя и своя нормаль. */
export class StripBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];

  quad(p0: V3, p1: V3, p2: V3, p3: V3, hint: V3, c: RGB): void {
    const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const w = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    let n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      [p1, p3] = [p3, p1];
      n = [-n[0], -n[1], -n[2]];
    }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    for (const p of [p0, p1, p2, p0, p2, p3]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(c[0], c[1], c[2]);
    }
  }
}

const STEPS = 6;

/**
 * Срезы всех слоёв вдоль краёв окон. masks[k] — окно, в котором удалён слой k (между поверхностями k и k+1).
 * endRing — кольцо среза на открытом конце двенадцатиперстной кишки.
 */
export function cutStrips(sb: StripBuilder, masks: (Win | null)[], colors: RGB[], endRing: boolean): void {
  const R = rows();
  const offA = new Float64Array(SURFACES);
  const pA0: V3 = [0, 0, 0];
  const pA1: V3 = [0, 0, 0];
  const offB = new Float64Array(SURFACES);
  const pB0: V3 = [0, 0, 0];
  const pB1: V3 = [0, 0, 0];

  const edge = (k: number, rowA: number, vA: number, rowB: number, vB: number, hint: V3) => {
    const ra = R[rowA];
    const rb = R[rowB];
    offsets(ra, vA, offA, true);
    offsets(rb, vB, offB, true);
    wallPoint(ra, vA, offA[k], pA0);
    wallPoint(ra, vA, offA[k + 1], pA1);
    wallPoint(rb, vB, offB[k], pB0);
    wallPoint(rb, vB, offB[k + 1], pB1);
    sb.quad([...pA0] as V3, [...pB0] as V3, [...pB1] as V3, [...pA1] as V3, hint, colors[k]);
  };

  for (let k = 0; k < SURFACES - 1; k++) {
    const w = masks[k];
    const gone = (rb: number, cb: number) => inWin(w, rb, cb);
    for (let rb = 0; rb < BASE_R; rb++) {
      for (let cb = 0; cb < BASE_C; cb++) {
        if (gone(rb, cb)) continue;
        // граница по s (линия постоянного ряда), идёт вдоль v
        const alongV = (boundary: number, sgn: number) => {
          const row = boundary * FINE;
          for (let t = 0; t < STEPS; t++) {
            const v0 = ((cb + t / STEPS) / BASE_C) * TAU;
            const v1 = ((cb + (t + 1) / STEPS) / BASE_C) * TAU;
            const T = R[row].T;
            edge(k, row, v0, row, v1, [T[0] * sgn, T[1] * sgn, T[2] * sgn]);
          }
        };
        // граница по v (линия постоянного угла), идёт вдоль s
        const alongS = (boundary: number, sgn: number) => {
          const v = (boundary / BASE_C) * TAU;
          for (let t = 0; t < STEPS; t++) {
            const r0 = rb * FINE + (t * FINE) / STEPS;
            const r1 = rb * FINE + ((t + 1) * FINE) / STEPS;
            const row = R[Math.round((r0 + r1) / 2)];
            const tv: V3 = [
              -row.N[0] * Math.sin(v) + row.B[0] * Math.cos(v),
              -row.N[1] * Math.sin(v) + row.B[1] * Math.cos(v),
              -row.N[2] * Math.sin(v) + row.B[2] * Math.cos(v),
            ];
            edge(k, r0, v, r1, v, [tv[0] * sgn, tv[1] * sgn, tv[2] * sgn]);
          }
        };
        if (rb + 1 >= BASE_R) {
          if (endRing) alongV(rb + 1, 1);
        } else if (gone(rb + 1, cb)) alongV(rb + 1, 1);
        if (rb > 0 && gone(rb - 1, cb)) alongV(rb, -1);
        if (gone(rb, (cb + 1) % BASE_C)) alongS(cb + 1, 1);
        if (gone(rb, (cb + BASE_C - 1) % BASE_C)) alongS(cb, -1);
      }
    }
  }
}
