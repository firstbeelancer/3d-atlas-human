import { CatmullRomCurve3, Vector3 } from 'three';

/*
  Анатомия кишечника, размеры — в условных единицах сцены (1 единица около 3,7 см).
  Оси: +y — вверх, +z — вперёд (к зрителю), +x — вправо от зрителя, то есть влево пациента.
  Правая половина пациента (слепая кишка, червеобразный отросток, печёночный изгиб) —
  слева на экране; селезёночный изгиб и нисходящая кишка — справа.

  Кишка — это несколько центральных линий (путей): толстая кишка от дна слепой до ануса,
  одна непрерывная линия от привратника до илеоцекального клапана (двенадцатиперстная,
  тощая, подвздошная) и червеобразный отросток. Вокруг каждой линии строятся слои стенки.
  Длина тонкой кишки в модели сжата — в жизни она в несколько раз длиннее.
*/

export type V3 = [number, number, number];

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Детерминированный «шум» 0..1 по целому числу. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ---------- Путь: центральная линия с системой координат вдоль неё ---------- */

export interface GutPath {
  n: number;
  len: number;
  /** Точки центральной линии. */
  P: Float32Array;
  /** Касательные, нормали и бинормали (по три числа на точку). */
  T: Float32Array;
  N: Float32Array;
  B: Float32Array;
  /** Длина вдоль линии от начала. */
  S: Float32Array;
}

/**
 * Равномерно размеченная линия по контрольным точкам. Если задан ref — нормаль кольца
 * смотрит в сторону ref (для толстой кишки: «вперёд», чтобы тении лежали на своих местах);
 * иначе кольца ведутся без закручивания.
 */
export function buildPath(ctrl: V3[], spacing: number, ref?: V3): GutPath {
  const curve = new CatmullRomCurve3(ctrl.map((p) => new Vector3(...p)), false, 'centripetal');
  curve.arcLengthDivisions = Math.max(300, ctrl.length * 50);
  const len = curve.getLength();
  const n = Math.max(3, Math.ceil(len / spacing) + 1);
  const P = new Float32Array(n * 3);
  const T = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const B = new Float32Array(n * 3);
  const S = new Float32Array(n);
  const p = new Vector3();
  const t = new Vector3();
  const nr = new Vector3();
  const bn = new Vector3();
  const r = ref ? new Vector3(...ref) : null;
  const prev = new Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t).normalize();
    if (r) {
      nr.copy(r).addScaledVector(t, -r.dot(t));
      if (nr.lengthSq() < 1e-4) nr.copy(prev);
    } else if (i === 0) {
      const ax = Math.abs(t.x) < 0.8 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
      nr.copy(ax).addScaledVector(t, -ax.dot(t));
    } else {
      nr.copy(prev).addScaledVector(t, -prev.dot(t));
    }
    nr.normalize();
    prev.copy(nr);
    bn.crossVectors(t, nr).normalize();
    P.set([p.x, p.y, p.z], i * 3);
    T.set([t.x, t.y, t.z], i * 3);
    N.set([nr.x, nr.y, nr.z], i * 3);
    B.set([bn.x, bn.y, bn.z], i * 3);
    S[i] = u * len;
  }
  return { n, len, P, T, N, B, S };
}

export function pathPoint(path: GutPath, i: number): V3 {
  return [path.P[i * 3], path.P[i * 3 + 1], path.P[i * 3 + 2]];
}

/** Точка на кольце вокруг оси: угол theta отсчитывается от нормали. */
export function ringPoint(path: GutPath, i: number, theta: number, r: number): V3 {
  const c = Math.cos(theta) * r;
  const s = Math.sin(theta) * r;
  const k = i * 3;
  return [
    path.P[k] + c * path.N[k] + s * path.B[k],
    path.P[k + 1] + c * path.N[k + 1] + s * path.B[k + 1],
    path.P[k + 2] + c * path.N[k + 2] + s * path.B[k + 2],
  ];
}

export function nearestIndex(path: GutPath, q: V3): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < path.n; i++) {
    const dx = path.P[i * 3] - q[0];
    const dy = path.P[i * 3 + 1] - q[1];
    const dz = path.P[i * 3 + 2] - q[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export const angDiff = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

/* ---------- Толстая кишка ---------- */

/**
 * Контрольные точки толстой кишки от дна слепой до заднего прохода.
 * Имя у точки — ориентир для границ отделов и для радиуса.
 */
export const COLON_CTRL: { p: V3; name?: string; r: number }[] = [
  { p: [-3.55, -4.0, -0.2], name: 'cecumTip', r: 0.76 },
  { p: [-3.55, -3.2, -0.22], r: 0.93 },
  { p: [-3.58, -2.45, -0.24], name: 'icLevel', r: 0.92 },
  { p: [-3.66, -1.2, -0.3], r: 0.84 },
  { p: [-3.74, 0.2, -0.36], r: 0.82 },
  { p: [-3.78, 1.6, -0.38], name: 'ascEnd', r: 0.8 },
  { p: [-3.6, 2.55, -0.3], r: 0.78 },
  { p: [-3.1, 3.1, -0.08], r: 0.76 },
  { p: [-2.4, 3.0, 0.1], name: 'hepEnd', r: 0.75 },
  { p: [-1.4, 2.5, 0.2], r: 0.74 },
  { p: [-0.4, 1.9, 0.26], r: 0.75 },
  { p: [0.6, 1.65, 0.28], r: 0.76 },
  { p: [1.7, 2.1, 0.24], r: 0.74 },
  { p: [2.8, 3.0, 0.1], name: 'transEnd', r: 0.7 },
  { p: [3.7, 4.0, -0.2], r: 0.66 },
  { p: [4.2, 3.5, -0.38], r: 0.63 },
  { p: [4.28, 2.5, -0.46], name: 'splEnd', r: 0.62 },
  { p: [4.25, 1.0, -0.5], r: 0.62 },
  { p: [4.15, -0.8, -0.52], r: 0.61 },
  { p: [3.95, -2.4, -0.46], r: 0.6 },
  { p: [3.55, -3.5, -0.34], name: 'sigStart', r: 0.58 },
  { p: [3.1, -4.3, -0.1], r: 0.56 },
  { p: [2.2, -4.7, 0.18], r: 0.55 },
  { p: [1.4, -4.2, 0.36], r: 0.55 },
  { p: [0.8, -4.6, 0.2], r: 0.54 },
  { p: [0.35, -5.3, -0.3], r: 0.54 },
  { p: [0.1, -5.9, -0.85], name: 'rectoSigmoid', r: 0.54 },
  { p: [0, -6.5, -1.15], r: 0.62 },
  { p: [0, -7.5, -1.38], r: 0.78 },
  { p: [0, -8.4, -1.1], r: 0.74 },
  { p: [0, -9.0, -0.62], name: 'anorectal', r: 0.58 },
  { p: [0, -9.55, -0.4], r: 0.46 },
  { p: [0, -10.3, -0.3], name: 'anus', r: 0.36 },
];

export const colonPath = buildPath(COLON_CTRL.map((c) => c.p), 0.075, [0, 0, 1]);

const colonMark = (name: string): number => {
  const k = COLON_CTRL.findIndex((c) => c.name === name);
  return nearestIndex(colonPath, COLON_CTRL[k].p);
};

export const COLON_MARKS = {
  start: 0,
  icLevel: colonMark('icLevel'),
  ascEnd: colonMark('ascEnd'),
  hepEnd: colonMark('hepEnd'),
  transEnd: colonMark('transEnd'),
  splEnd: colonMark('splEnd'),
  sigStart: colonMark('sigStart'),
  rectoSigmoid: colonMark('rectoSigmoid'),
  anorectal: colonMark('anorectal'),
  anus: colonPath.n - 1,
};

/** Базовый радиус толстой кишки в каждой точке: плавная интерполяция по ориентирам. */
const colonRadii: Float32Array = (() => {
  const idx = COLON_CTRL.map((c) => nearestIndex(colonPath, c.p));
  const out = new Float32Array(colonPath.n);
  for (let i = 0; i < colonPath.n; i++) {
    let k = 0;
    while (k < idx.length - 2 && i > idx[k + 1]) k++;
    const a = idx[k];
    const b = idx[k + 1];
    const t = b > a ? smoothstep(0, 1, (i - a) / (b - a)) : 0;
    out[i] = lerp(COLON_CTRL[k].r, COLON_CTRL[k + 1].r, t);
  }
  return out;
})();

export const colonBaseR = (i: number): number => colonRadii[i];

/** Углы трёх тений вокруг оси (0 — спереди, свободная тения). */
export const TAENIA_THETA = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
const HAUSTRA_LEN = 0.8;

/** Насколько выражены гаустры в точке: нет у начала слепой, анального канала и прямой кишки. */
export function haustraAmount(i: number): number {
  const m = COLON_MARKS;
  return smoothstep(m.start + 14, m.start + 30, i) * (1 - smoothstep(m.rectoSigmoid - 36, m.rectoSigmoid + 22, i));
}

function haustraPhase(s: number, theta: number): number {
  return s / HAUSTRA_LEN + 0.42 * Math.sin(s * 0.62) + 0.24 * Math.sin(s * 1.47 + 0.6)
    + 0.16 * Math.sin(s * 0.53 + theta * 2) + 0.10 * Math.sin(theta * 3);
}

/** Перетяжки между гаустрами идут дугами между тениями. */
export function haustraFold(s: number, theta = 0): number {
  const phase = haustraPhase(s, theta);
  const width = 0.16 + 0.045 * Math.sin(s * 0.83 + theta);
  return Math.exp(-Math.pow((phase - Math.floor(phase) - 0.5) / width, 2));
}

/** Номер гаустры, чтобы ставить складки по перетяжкам. */
export function haustraPositions(i0: number, i1: number, theta: number): number[] {
  const res: number[] = [];
  for (let i = Math.max(1, i0); i <= i1; i++) {
    const before = haustraPhase(colonPath.S[i - 1], theta) + 0.5;
    const after = haustraPhase(colonPath.S[i], theta) + 0.5;
    if (Math.floor(after) > Math.floor(before)) res.push(after % 1 < 1 - (before % 1) ? i : Math.max(i0, i - 1));
  }
  return res;
}

/** Внешний радиус стенки толстой кишки: гаустры, перетяжки у тений, закрытое дно слепой. */
export function colonOuterR(i: number, theta: number): number {
  const r0 = colonBaseR(i);
  const A = haustraAmount(i);
  const s = colonPath.S[i];
  const fold = haustraFold(s, theta);
  const pouch = (0.5 - 0.5 * Math.cos(theta * 3));
  const fullness = 0.108 + 0.035 * Math.sin(s * 1.24 - theta * 2);
  const asymmetry = 0.032 * Math.cos(theta * 2 + 0.22 * s) + 0.016 * Math.sin(theta + s * 1.45);
  let r = r0 * (1 + asymmetry + A * (pouch * fullness - fold * (0.065 + 0.17 * pouch)));
  // слепая кишка закрыта снизу полусферой
  const cap = 0.95;
  if (s < cap) r = Math.min(r, r0 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / cap, 2))) + 0.0001);
  return Math.max(0.02, r);
}

/** Выступ полулунных складок внутрь просвета (для слизистой), в долях радиуса. */
export function colonFoldInward(i: number, theta: number): number {
  const pouch = 0.5 - 0.5 * Math.cos(theta * 3);
  return haustraAmount(i) * haustraFold(colonPath.S[i], theta) * (0.08 + 0.15 * pouch);
}

/** Анальные столбы: продольные складки слизистой верхней половины анального канала. */
export function analColumnDepth(i: number, theta: number): number {
  const a = smoothstep(COLON_MARKS.anorectal, COLON_MARKS.anorectal + 12, i) * (1 - smoothstep(COLON_MARKS.anorectal + 14, COLON_MARKS.anus - 2, i));
  const w = 0.5 + 0.5 * Math.cos(theta * 8);
  return 0.065 * a * Math.pow(w, 1.6);
}

/* ---------- Тонкая кишка ---------- */

export const PYLORUS: V3 = [-0.85, 3.35, -0.8];
export const DJ_FLEXURE: V3 = [0.9, 0.95, -1.1];
/** Устье подвздошной кишки на медиальной стенке слепой. */
export const ILEOCECAL: V3 = [-2.62, -2.76, -0.1];
const JEJUNOILEAL_TRANSITION: V3 = [1.08, -0.74, 0.52];

const SMALL_CTRL: V3[] = [
  PYLORUS,
  [-1.3, 3.4, -0.95], [-1.75, 2.85, -1.05], [-1.95, 1.8, -1.1], [-1.95, 0.7, -1.15],
  [-1.75, -0.15, -1.2], [-1.1, -0.5, -1.25], [-0.2, -0.5, -1.3], [0.6, -0.3, -1.25],
  [0.95, 0.35, -1.2], DJ_FLEXURE,
  // Тощая кишка: петли начинаются в верхней левой половине живота пациента.
  [1.28, 1.42, -1.01], [2.38, 1.45, -0.69], [3.1, 0.94, -0.29], [3.12, 0.02, -0.31],
  [2.55, -0.72, -0.62], [1.86, -1.22, -0.72], [1.11, -0.96, -0.61], [0.73, -0.34, -0.38],
  [0.39, 0.21, 0.02], [-0.25, 0.51, 0.54], [-0.93, 0.79, 0.98], [-1.59, 1.08, 1.08],
  [-1.38, 1.04, 1.63], [-0.66, 0.81, 1.76], [0.25, 0.57, 1.54], [0.86, 0.71, 1.27],
  [1.57, 0.86, 1.41], [2.28, 0.37, 1.45], [2.35, -0.45, 1.33], [1.98, -1.38, 1.22],
  [2.08, -2.17, 0.83], [2.66, -2.42, 0.49], [3.19, -1.87, 0.43], [3.04, -1.12, 0.46],
  [2.71, -0.54, 0.34], [2.26, -0.15, 0.39], [1.61, -0.23, 0.42], JEJUNOILEAL_TRANSITION,
  // Подвздошная кишка: петли идут вправо и опускаются в малый таз.
  [0.77, -1.48, 0.83], [0.53, -2.12, 1.17], [-0.01, -2.5, 1.34], [-0.66, -2.22, 1.37],
  [-0.87, -1.51, 1.25], [-0.96, -0.57, 1.22], [-1.46, 0.04, 1.15], [-2.26, -0.04, 1.03],
  [-2.69, -0.72, 0.72], [-2.4, -1.44, 0.23], [-1.81, -1.54, -0.17], [-1.18, -1.24, -0.19],
  [-0.56, -1.1, -0.25], [0.1, -1.56, -0.28], [-0.05, -2.38, -0.47], [-0.68, -3.05, -0.55],
  [-0.72, -3.83, -0.88], [-0.1, -4.48, -1.05], [0.65, -4.41, -1.18], [1.25, -3.82, -1.05],
  [1.33, -3.08, -0.8], [1.12, -2.53, -0.52], [0.7, -2.47, 0.16], [0.37, -3.02, 0.67],
  [0.49, -3.68, 1.13], [0.17, -4.37, 1.26], [-0.52, -4.74, 1.03], [-1.28, -4.45, 0.82],
  [-1.62, -3.72, 0.85], [-1.53, -3.02, 0.52], [-1.81, -2.66, 0.12], [-2.18, -2.58, -0.08], ILEOCECAL,
];

export const smallPath = buildPath(SMALL_CTRL, 0.055);

export const SMALL_MARKS = (() => {
  const dj = nearestIndex(smallPath, DJ_FLEXURE);
  const end = smallPath.n - 1;
  // верхняя часть нисходящего отдела: здесь сосочек
  const papilla = nearestIndex(smallPath, [-1.95, 1.85, -1.1]);
  const bulb = nearestIndex(smallPath, [-1.3, 3.4, -0.95]);
  const jejEnd = nearestIndex(smallPath, JEJUNOILEAL_TRANSITION);
  return { dj, end, papilla, bulb, jejEnd, start: 0 };
})();

/** Радиус тонкой кишки по длине: луковица, тощая — самая широкая, подвздошная сужается. */
export function smallBaseR(i: number): number {
  const m = SMALL_MARKS;
  if (i <= m.dj) return lerp(0.43, 0.385, smoothstep(m.bulb, m.dj, i));
  const t = (i - m.dj) / (m.end - m.dj);
  return lerp(0.385, 0.31, smoothstep(0, 1, t));
}

/** Тонус и наполненность меняются вдоль кишки, а сечение слегка сплющено и скручено. */
export function smallOuterR(i: number, theta: number): number {
  const s = smallPath.S[i];
  const free = smoothstep(SMALL_MARKS.bulb, SMALL_MARKS.dj + 12, i)
    * (1 - smoothstep(SMALL_MARKS.end - 16, SMALL_MARKS.end, i));
  const pinch = Math.pow(0.5 + 0.5 * Math.sin(s * 2.8 + 0.8 * Math.sin(s * 0.46)), 5);
  const fullness = 0.075 * Math.sin(s * 1.06) + 0.038 * Math.sin(s * 0.51 + 0.3);
  const profile = 0.075 * Math.cos(2 * theta + 0.48 * s + Math.sin(s * 0.7)) + 0.027 * Math.sin(3 * theta - s * 1.4);
  return smallBaseR(i) * (1 + free * (fullness - 0.11 * pinch + profile));
}

/** Глубина круговых складок (Керкринга): густые в тощей кишке, редкие и низкие в подвздошной. */
export function plicaDepth(i: number, theta: number): number {
  const m = SMALL_MARKS;
  const s = smallPath.S[i];
  const L = smallPath.len;
  const rho0 = 1 / 0.2;
  const rho1 = 1 / 0.5;
  const phase = rho0 * s + ((rho1 - rho0) * s * s) / (2 * L);
  const k = Math.round(phase);
  const u = phase - k;
  const bump = Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI * 2), 4);
  const th0 = hash(k) * Math.PI * 2;
  const span = (0.55 + 0.4 * hash(k + 91)) * Math.PI;
  const d = angDiff(theta, th0);
  const cover = 1 - smoothstep(span - 0.5, span, d);
  const start = smoothstep(m.papilla - 6, m.papilla + 8, i);
  const taper = 1 - 0.85 * smoothstep(m.dj, m.end, i);
  return 0.082 * bump * cover * start * taper;
}

/* ---------- Червеобразный отросток ---------- */

export const APPENDIX_CTRL: V3[] = [
  [-3.18, -3.62, -0.5],
  [-3.02, -4.15, -0.5],
  [-2.65, -4.62, -0.38],
  [-2.1, -4.88, -0.15],
  [-1.62, -4.55, 0.05],
];
export const appendixPath = buildPath(APPENDIX_CTRL, 0.07);

export function appendixR(i: number): number {
  const t = i / (appendixPath.n - 1);
  let r = lerp(0.19, 0.145, t);
  const cap = 0.2;
  const s = appendixPath.S[i];
  const rest = appendixPath.len - s;
  if (rest < cap) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - rest / cap, 2))) + 0.001;
  return r;
}

/* ---------- Толщина слоёв стенки (сверху вниз) ---------- */

/** Толщина: продольная мышца и серозная оболочка, круговая мышца, подслизистая, слизистая. */
export const WALL_SMALL = [0.026, 0.05, 0.036, 0.045] as const;
export const WALL_COLON = [0.034, 0.07, 0.05, 0.07] as const;
export const WALL_THIN = [0.02, 0.03, 0.02, 0.03] as const;

export const cum = (w: readonly number[], layer: number): number => w.slice(0, layer).reduce((a, b) => a + b, 0);

/* ---------- Рельсы сосудов и брыжейка ---------- */

/** Корень брыжейки тонкой кишки: от двенадцатиперстно-тощего изгиба к илеоцекальному углу. */
export const MESENTERY_ROOT: V3[] = [
  DJ_FLEXURE,
  [0.55, -0.1, -1.3],
  [-0.5, -1.4, -1.35],
  [-1.7, -2.4, -1.0],
  [-2.5, -2.8, -0.35],
];
