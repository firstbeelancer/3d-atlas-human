import { CatmullRomCurve3, Vector3 } from 'three';

/*
  Форма желудка и соседних отделов — одна параметрическая «труба» вдоль средней линии:
  купол дна, тело, изгиб, привратниковая часть, привратник, луковица и нисходящая часть двенадцатиперстной кишки.
  Сечение — эллипс, смещённый к большой кривизне. Стенка состоит из шести слоёв, у каждого своя толщина вдоль органа:

    поверхность 0  серозная оболочка (наружная)
    поверхность 1  продольный слой мышц
    поверхность 2  круговой слой мышц
    поверхность 3  косые волокна
    поверхность 4  подслизистая основа (гладкая внешняя граница)
    поверхность 5  слизистая снаружи — повторяет складки
    поверхность 6  просвет — складки слизистой

  Складки (рельеф просвета) считаются функцией (s, v): продольные «ругэ» тела с «Магенштрассе» вдоль малой кривизны,
  низкие складки антрального отдела, гладкий привратник и поперечные круговые складки двенадцатиперстной кишки.
*/

export type V3 = [number, number, number];
export const TAU = Math.PI * 2;

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------ шум ------------------------------ */

function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Гладкий шум 0..1 по трём координатам. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/* ------------------------------ средняя линия ------------------------------ */

/** Опорные точки: 0 — центр купола дна, 8 — привратник, 13 — конец нисходящей части двенадцатиперстной кишки. */
export const PATH: V3[] = [
  [1.2, 2.25, -0.12],
  [1.08, 1.3, -0.08],
  [0.9, 0.3, 0.0],
  [0.58, -0.62, 0.05],
  [0.08, -1.22, 0.08],
  [-0.5, -1.36, 0.08],
  [-1.0, -1.15, 0.05],
  [-1.4, -0.85, 0.0],
  [-1.76, -0.66, -0.02],
  [-2.1, -0.56, -0.12],
  [-2.4, -0.5, -0.3],
  [-2.6, -0.76, -0.46],
  [-2.65, -1.3, -0.5],
  [-2.65, -1.95, -0.5],
];

/** Радиус купола дна (полусфера). */
export const DOME = 1.05;

/** Шаги сетки: опорная сетка 120 x 72, главная таблица рядов в 12 раз подробнее. */
export const BASE_R = 120;
export const BASE_C = 72;
export const FINE = 12;
export const TABLE_N = BASE_R * FINE;

type Keys = [number, number][];

/** Кусочно-гладкая интерполяция по номеру опорной точки. */
function key(keys: Keys, k: number): number {
  if (k <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (k <= keys[i][0]) {
      const [k0, v0] = keys[i - 1];
      const [k1, v1] = keys[i];
      const t = (k - k0) / (k1 - k0);
      const e = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * e;
    }
  }
  return keys[keys.length - 1][1];
}

/* Профили вдоль органа по номеру опорной точки k */
const A_KEYS: Keys = [
  [1, 1.05],
  [2, 1.1],
  [3, 1.04],
  [4, 0.9],
  [4.8, 0.76],
  [5.5, 0.64],
  [6.3, 0.54],
  [7, 0.46],
  [7.6, 0.38],
  [8, 0.4],
  [8.35, 0.4],
  [9, 0.4],
  [9.7, 0.38],
  [10.3, 0.33],
  [11, 0.33],
  [13, 0.33],
];
const BR_KEYS: Keys = [
  [0, 0.9],
  [7.5, 0.9],
  [8.6, 1.0],
  [13, 1.0],
];
const OFF_KEYS: Keys = [
  [1.0, 0],
  [1.8, 0.14],
  [4.2, 0.14],
  [5.2, 0.06],
  [6, 0],
  [13, 0],
];
const T_LONG: Keys = [
  [1, 0.035],
  [7.5, 0.032],
  [8.4, 0.03],
  [9.4, 0.022],
  [13, 0.022],
];
const T_CIRC: Keys = [
  [1, 0.045],
  [4.8, 0.05],
  [6.2, 0.07],
  [7.0, 0.085],
  [7.55, 0.115],
  [8.0, 0.125],
  [8.45, 0.1],
  [8.9, 0.05],
  [9.4, 0.036],
  [13, 0.036],
];
const T_OBL: Keys = [
  [0, 0.035],
  [4.4, 0.035],
  [6.0, 0],
  [13, 0],
];
const T_SM: Keys = [
  [1, 0.04],
  [7.5, 0.036],
  [8.2, 0.02],
  [9, 0.026],
  [13, 0.026],
];
const T_MUC: Keys = [
  [1, 0.032],
  [8.3, 0.032],
  [9.2, 0.036],
  [13, 0.036],
];
/** Амплитуда складок слизистой (высота над основанием, в единицах модели). */
const AMP: Keys = [
  [0, 0],
  [0.6, 0.05],
  [1.3, 0.1],
  [2, 0.14],
  [3.4, 0.15],
  [4.4, 0.12],
  [5.2, 0.075],
  [6.2, 0.05],
  [7.0, 0.022],
  [7.6, 0.0],
  [8.9, 0.0],
  [9.6, 0.045],
  [10.4, 0.05],
  [13, 0.05],
];
/** Вес двенадцатиперстной кишки: 0 — желудок, 1 — круговые складки. */
const DUO_KEYS: Keys = [
  [0, 0],
  [8.6, 0],
  [9.6, 1],
  [13, 1],
];

export interface Row {
  i: number;
  s: number;
  /** Дробный номер опорной точки. */
  k: number;
  C: V3;
  T: V3;
  N: V3;
  B: V3;
  a: number;
  bR: number;
  off: number;
  amp: number;
  duo: number;
  tSer: number;
  tLong: number;
  tCirc: number;
  tObl: number;
  tSm: number;
  tMuc: number;
}

const curve = new CatmullRomCurve3(PATH.map((p) => new Vector3(...p)), false, 'centripetal');
curve.arcLengthDivisions = 4000;
export const LENGTH = curve.getLength();

let ROWS: Row[] | null = null;
let LM: number[] | null = null;

/** Таблица рядов вдоль органа: кадры средней линии и профили. */
export function rows(): Row[] {
  if (ROWS) return ROWS;
  const out: Row[] = [];
  const pts: Vector3[] = [];
  for (let i = 0; i <= TABLE_N; i++) pts.push(curve.getPointAt(i / TABLE_N));
  // номер опорной точки для каждого ряда — по ближайшей точке кривой
  const near = PATH.map((p) => {
    let best = 0;
    let bd = Infinity;
    const pv = new Vector3(...p);
    pts.forEach((q, i) => {
      const d = q.distanceToSquared(pv);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  });
  LM = near.map((i) => (i / TABLE_N) * LENGTH);
  const kOf = (i: number) => {
    if (i <= near[0]) return 0;
    for (let n = 1; n < near.length; n++) {
      if (i <= near[n]) return n - 1 + (i - near[n - 1]) / (near[n] - near[n - 1]);
    }
    return near.length - 1 + (i - near[near.length - 1]) / TABLE_N;
  };
  const Z = new Vector3(0, 0, 1);
  for (let i = 0; i <= TABLE_N; i++) {
    const t = i / TABLE_N;
    const s = t * LENGTH;
    const k = kOf(i);
    const T = curve.getTangentAt(t).normalize();
    const N = new Vector3().crossVectors(Z, T).normalize();
    const B = new Vector3().crossVectors(T, N).normalize();
    const c = pts[i];
    const fade = smooth(0.12, 0.62, s);
    out.push({
      i,
      s,
      k,
      C: [c.x, c.y, c.z],
      T: [T.x, T.y, T.z],
      N: [N.x, N.y, N.z],
      B: [B.x, B.y, B.z],
      a: key(A_KEYS, k),
      bR: key(BR_KEYS, k),
      off: key(OFF_KEYS, k),
      amp: key(AMP, k) * fade,
      duo: key(DUO_KEYS, k),
      tSer: 0.015,
      tLong: key(T_LONG, k),
      tCirc: key(T_CIRC, k),
      tObl: key(T_OBL, k),
      tSm: key(T_SM, k),
      tMuc: key(T_MUC, k),
    });
  }
  ROWS = out;
  return out;
}

/** Длина дуги в опорной точке k (допускаются дробные значения). */
export function sAt(k: number): number {
  rows();
  const lm = LM!;
  if (k <= 0) return 0;
  if (k >= lm.length - 1) return lm[lm.length - 1];
  const i = Math.floor(k);
  return lm[i] + (lm[i + 1] - lm[i]) * (k - i);
}

/** Номер ряда главной таблицы по длине дуги. */
export function rowIndexAt(s: number): number {
  return clamp(Math.round((s / LENGTH) * TABLE_N), 0, TABLE_N);
}

/* ------------------------------ складки ------------------------------ */

const curvBump = (cv: number) => Math.exp(-((cv - 1) ** 2) / 0.09) + Math.exp(-((cv + 1) ** 2) / 0.09);

/** Высота складки, 0..1. Тело желудка — продольные складки; двенадцатиперстная кишка — круговые. */
export function foldH(row: Row, v: number): number {
  if (row.amp <= 0.0005) return 0;
  const cv = Math.cos(v);
  const sv = Math.sin(v);
  const s = row.s;

  // складки желудка
  const wL = smooth(-0.3, -0.85, cv); // малая кривизна: ровные, почти параллельные складки (Магенштрассе)
  const warp = (noise3(s * 1.1, cv * 1.7 + 3, sv * 1.7) * 2 - 1) * 2.9 * (1 - 0.75 * wL);
  const phi = 15 * v + warp + 0.55 * Math.sin(s * 2.3 + v * 3) * (1 - wL);
  const q = 0.5 + 0.5 * Math.sin(phi);
  let h = 1 - (1 - q) ** 3;
  const vary = 0.5 + 0.5 * noise3(s * 2.1 + 9, cv * 2.1, sv * 2.1);
  const cross = smooth(0.55, 0.85, noise3(s * 4.2 + 31, cv * 1.5, sv * 1.5 + 5));
  h *= vary * (1 - 0.4 * cross * (1 - 0.6 * wL)) * (1 + 0.25 * wL);
  const stomach = clamp(h, 0, 1);

  if (row.duo <= 0) return stomach;

  // круговые складки двенадцатиперстной кишки: неполные кольца, местами раздвоенные
  const ph = (TAU * s) / 0.19 + (noise3(s * 2, cv * 1.4, sv * 1.4) * 2 - 1) * 2.4 + 0.9 * Math.sin(v * 2 + s * 3);
  const qd = 0.5 + 0.5 * Math.sin(ph);
  const hd = (1 - (1 - qd) ** 3) * smooth(0.3, 0.55, noise3(s * 0.8 + 7, cv * 1.1, sv * 1.1));
  return stomach * (1 - row.duo) + hd * row.duo;
}

/* ------------------------------ слои стенки ------------------------------ */

/** Номера поверхностей: 0 серозная оболочка … 6 просвет. */
export const SURFACES = 7;

/**
 * Накопленные глубины поверхностей слоёв под наружной стенкой в направлении v.
 * Записывает 7 значений в out; возвращает высоту складки (0..1).
 */
export function offsets(row: Row, v: number, out: Float64Array | number[], withFold = true): number {
  const cv = Math.cos(v);
  const stomachW = 1 - row.duo;
  const long = row.tLong * (1 + 0.9 * curvBump(cv) * stomachW);
  out[0] = 0;
  out[1] = row.tSer;
  out[2] = out[1] + long;
  out[3] = out[2] + row.tCirc;
  out[4] = out[3] + row.tObl;
  const h = withFold ? foldH(row, v) : 0;
  out[5] = out[4] + row.tSm + row.amp * h;
  out[6] = out[5] + row.tMuc;
  return h;
}

const gauss = (x: number) => Math.exp(-x * x);

/** Точка на поверхности, расположенной на глубине d под наружной. */
export function wallPoint(row: Row, v: number, d: number, out: V3 = [0, 0, 0]): V3 {
  let A: number;
  if (row.s < DOME) {
    const q = (DOME - d) ** 2 - (DOME - row.s) ** 2;
    A = q > 0 ? Math.sqrt(q) : 0;
  } else {
    A = Math.max(row.a - d, 0);
  }
  const cv = Math.cos(v);
  const sv = Math.sin(v);
  // угловая вырезка: малая кривизна втянута
  let nCos = cv;
  if (cv < 0.2) {
    const w = smooth(0.2, -0.4, cv);
    nCos = cv * (1 - 0.3 * gauss((row.k - 4.65) / 0.5) * w);
  }
  const n = A * (nCos + row.off);
  const b = A * row.bR * sv;
  out[0] = row.C[0] + row.N[0] * n + row.B[0] * b;
  out[1] = row.C[1] + row.N[1] * n + row.B[1] * b;
  out[2] = row.C[2] + row.N[2] * n + row.B[2] * b;
  return out;
}

/** Точка на наружной стороне стенки с отступом lift (для сосудов, нервов, брыжейки). */
export function outerPoint(s: number, v: number, lift = 0): V3 {
  const row = rows()[rowIndexAt(s)];
  return wallPoint(row, v, -lift);
}
