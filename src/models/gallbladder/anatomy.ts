import { CatmullRomCurve3, Vector3 } from 'three';

/*
  Анатомия желчного пузыря и внепечёночных желчных путей, размеры — в условных сантиметрах сцены.
  Оси: +y — вверх, +z — к зрителю (вперёд), +x — вправо на экране (к средней линии тела пациента).
  Пациент смотрит на нас: его правая сторона — слева на экране. Поэтому пузырь лежит слева,
  а протоки уходят вправо и вниз, к двенадцатиперстной кишке.

  Пузырь — трубка вокруг изогнутой центральной линии с профилем радиуса R(s):
  дно (округлый слепой конец) -> тело (самое широкое) -> воронка с карманом Хартмана -> шейка (S-изгиб)
  -> пузырный проток. Поперечное сечение — слегка приплюснутый овал. Слои стенки — вложенные
  поверхности на разной глубине; их толщина намеренно увеличена для наглядности.
*/

export type V3 = [number, number, number];

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ---------- Центральные линии ---------- */

/** От вершины дна (слепой конец) до начала пузырного протока. */
export const GB_PTS: V3[] = [
  [-3.05, -3.6, 1.6],
  [-2.72, -2.65, 1.32],
  [-2.2, -1.2, 0.9],
  [-1.6, 0.1, 0.42],
  [-0.95, 1.2, 0.0],
  [-0.35, 1.95, -0.3],
  [0.15, 2.42, -0.48],
  [0.58, 2.4, -0.62],
];

/** Пузырный проток: от шейки к слиянию с общим печёночным протоком. */
export const CYSTIC_PTS: V3[] = [
  [0.58, 2.4, -0.62],
  [0.98, 2.16, -0.92],
  [1.45, 1.96, -1.2],
  [1.95, 1.74, -1.5],
  [2.5, 1.52, -1.74],
];

export const gbCurve = new CatmullRomCurve3(GB_PTS.map((p) => new Vector3(...p)), false, 'centripetal');
export const cysticCurve = new CatmullRomCurve3(CYSTIC_PTS.map((p) => new Vector3(...p)), false, 'centripetal');

export const GB_LENGTH = gbCurve.getLength();
export const CYSTIC_LENGTH = cysticCurve.getLength();

/* ---------- Рамки вдоль линии (параллельный перенос) ---------- */

export interface Frames {
  n: number;
  P: Float32Array;
  T: Float32Array;
  N: Float32Array;
  B: Float32Array;
}

export function makeFrames(curve: CatmullRomCurve3, n: number, ref: Vector3): Frames {
  const P = new Float32Array((n + 1) * 3);
  const T = new Float32Array((n + 1) * 3);
  const N = new Float32Array((n + 1) * 3);
  const B = new Float32Array((n + 1) * 3);
  const p = new Vector3();
  const t = new Vector3();
  const nn = new Vector3();
  const b = new Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, p);
    curve.getTangentAt(i / n, t).normalize();
    if (i === 0) {
      nn.copy(ref).addScaledVector(t, -ref.dot(t)).normalize();
    } else {
      nn.addScaledVector(t, -nn.dot(t)).normalize();
    }
    b.crossVectors(t, nn);
    P.set([p.x, p.y, p.z], i * 3);
    T.set([t.x, t.y, t.z], i * 3);
    N.set([nn.x, nn.y, nn.z], i * 3);
    B.set([b.x, b.y, b.z], i * 3);
  }
  return { n, P, T, N, B };
}

interface FrameOut {
  p: V3;
  t: V3;
  n: V3;
  b: V3;
}

/** Рамка в точке s (0..1 по длине линии) с линейной интерполяцией. */
export function frameAt(fr: Frames, s: number, out: FrameOut) {
  const x = Math.min(fr.n - 1e-6, Math.max(0, s * fr.n));
  const i = Math.floor(x);
  const f = x - i;
  for (let k = 0; k < 3; k++) {
    out.p[k] = lerp(fr.P[i * 3 + k], fr.P[(i + 1) * 3 + k], f);
    out.t[k] = lerp(fr.T[i * 3 + k], fr.T[(i + 1) * 3 + k], f);
    out.n[k] = lerp(fr.N[i * 3 + k], fr.N[(i + 1) * 3 + k], f);
    out.b[k] = lerp(fr.B[i * 3 + k], fr.B[(i + 1) * 3 + k], f);
  }
}

/** Опорное направление: тета = 0 смотрит на зрителя (свободная, брюшинная поверхность), тета = pi — на печень. */
export const gbFrames = makeFrames(gbCurve, 640, new Vector3(0, 0, 1));
export const cysticFrames = makeFrames(cysticCurve, 160, new Vector3(0, 0, 1));

/* ---------- Профиль радиуса ---------- */

/** Контрольные точки профиля: [s, радиус]. Дальше по s от 0.12 идёт гладкая кривая Кэтмулла — Рома. */
const PROFILE: [number, number][] = [
  [0.12, 0.84],
  [0.2, 1.02],
  [0.3, 1.17],
  [0.42, 1.2],
  [0.54, 1.12],
  [0.64, 1.0],
  [0.72, 0.93],
  [0.8, 0.74],
  [0.87, 0.52],
  [0.94, 0.38],
  [1.0, 0.34],
];

function catmull(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  let i = 0;
  while (i < pts.length - 2 && x > pts[i + 1][0]) i++;
  const p0 = pts[Math.max(0, i - 1)][1];
  const p1 = pts[i][1];
  const p2 = pts[i + 1][1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)][1];
  const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Радиус наружной поверхности пузыря на расстоянии s по линии: слепое дно закруглено, шейка сужается. */
export function radiusAt(s: number): number {
  const cap = 0.12;
  if (s < cap) {
    const u = (cap - Math.max(0, s)) / cap;
    return PROFILE[0][1] * Math.sqrt(Math.max(0, 1 - u * u));
  }
  return catmull(PROFILE, s);
}

/** Сечение чуть приплюснуто: вдоль нормали (спереди-назад) короче, чем вбок. */
export const ASPECT_N = 0.9;
export const ASPECT_B = 1.0;

/** Карман Хартмана: выпячивание на нижней медиальной стенке воронки. */
export function pouchBulge(s: number, theta: number): number {
  const g = Math.exp(-(((s - 0.745) / 0.065) ** 2));
  const side = 0.5 + 0.5 * Math.cos(theta - Math.PI * 0.42);
  return 0.3 * g * Math.pow(side, 1.4);
}

/** Слои тоньше в шейке: смещение вглубь уменьшается там, где пузырь узкий. */
export function offsetScale(s: number): number {
  return 0.46 + 0.54 * smoothstep(0.3, 1.0, radiusAt(s));
}

const tmp: FrameOut = { p: [0, 0, 0], t: [0, 0, 0], n: [0, 0, 0], b: [0, 0, 0] };

/**
 * Точка на поверхности пузыря: s — вдоль, theta — вокруг (0 — вперёд, pi/2 — к средней линии, pi — к печени),
 * off — смещение вдоль радиуса: наружу (+) и вглубь (-) для слоёв стенки.
 */
export function gbPoint(s: number, theta: number, off = 0, extra = 0): V3 {
  frameAt(gbFrames, s, tmp);
  const base = radiusAt(s) + pouchBulge(s, theta) * (off >= 0 ? 1 : 0.9);
  const r = Math.max(0.025, base + off * offsetScale(s) + extra);
  const c = Math.cos(theta) * ASPECT_N * r;
  const sn = Math.sin(theta) * ASPECT_B * r;
  return [
    tmp.p[0] + c * tmp.n[0] + sn * tmp.b[0],
    tmp.p[1] + c * tmp.n[1] + sn * tmp.b[1],
    tmp.p[2] + c * tmp.n[2] + sn * tmp.b[2],
  ];
}

/** Точка на оси пузыря. */
export function gbAxis(s: number): V3 {
  frameAt(gbFrames, s, tmp);
  return [tmp.p[0], tmp.p[1], tmp.p[2]];
}

export function gbTangent(s: number): V3 {
  frameAt(gbFrames, s, tmp);
  return [tmp.t[0], tmp.t[1], tmp.t[2]];
}

/* ---------- Стенка ---------- */

/** Глубина слоёв от наружной поверхности пузыря внутрь. */
export const WALL = {
  serosa: 0.035,
  /** Наружная поверхность — отделы пузыря; подсерозная основа лежит сразу под ней. */
  surface: 0,
  subserosa: -0.04,
  muscularis: -0.09,
  propria: -0.16,
  mucosa: -0.2,
  rugae: -0.215,
  lumen: -0.3,
} as const;

/** Границы отделов по s. */
export const SEGMENTS = {
  fundus: [0, 0.3],
  body: [0.3, 0.62],
  infundibulum: [0.62, 0.84],
  neck: [0.84, 1],
} as const;

/** Брюшина закрывает свободную поверхность: от theta = -SEROSA_HALF до +SEROSA_HALF; к печени пузырь прикреплён без неё. */
export const SEROSA_HALF = 2.25;

/* ---------- Складки слизистой: «соты» ---------- */

/** Шестиугольная решётка: максимумы — ячейки, минимумы — перегородки. */
export function honeycomb(x: number, y: number, k: number): number {
  const a = Math.cos(k * x);
  const b = Math.cos(k * (-0.5 * x + 0.8660254 * y));
  const c = Math.cos(k * (-0.5 * x - 0.8660254 * y));
  return a + b + c;
}

/** Число ячеек сот вокруг пузыря (чётное, чтобы решётка замыкалась по окружности). */
export const HONEY_K = 16;

/** Высота перегородки сот на слизистой (0 — дно ячейки, 1 — гребень). */
export function rugaeHeight(s: number, theta: number): number {
  const f = honeycomb(theta, s * GB_LENGTH * 0.83, HONEY_K);
  const ridge = smoothstep(0.35, -1.15, f);
  const fade = smoothstep(0.9, 0.7, s) * smoothstep(0.02, 0.14, s);
  return ridge * fade;
}

/* ---------- Печень и положение пузыря в ней ---------- */

/** Центр нижней (висцеральной) поверхности печени в плоскости x-y. */
export const LIVER_C: [number, number] = [-1.2, 3.4];

/** Радиус контура печени в направлении phi: эллипс с вырезом справа внизу, где идут ворота и протоки. */
export function liverRadius(phi: number): number {
  const a = 7.6;
  const b = 4.7;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  let r = (a * b) / Math.sqrt((b * c) ** 2 + (a * s) ** 2);
  const d = Math.atan2(Math.sin(phi + 0.62), Math.cos(phi + 0.62));
  r -= 3.4 * Math.exp(-((d / 0.5) ** 2));
  // правая доля свисает ниже, под пузырём
  const e = Math.atan2(Math.sin(phi + 1.9), Math.cos(phi + 1.9));
  r += 0.5 * Math.exp(-((e / 0.7) ** 2));
  return r;
}

/** Ложе пузыря — вдавление на поверхности печени вдоль линии пузыря. */
export function fossaCarve(x: number, y: number): number {
  let best = 1e9;
  for (let i = 0; i <= 24; i++) {
    const s = 0.22 + (0.78 * i) / 24;
    const p = gbAxis(s);
    const d = Math.hypot(x - p[0], y - p[1]);
    if (d < best) best = d;
  }
  return -0.5 * Math.exp(-((best / 1.35) ** 2));
}

/** Ворота печени — поперечная борозда, в которую входят сосуды и выходят протоки. */
export function hilumCarve(x: number, y: number): number {
  const ax = smoothstep(-1.2, 0.4, x) * smoothstep(6.2, 4.6, x);
  const ay = Math.exp(-(((y - 4.25) / 0.85) ** 2));
  return -1.55 * ax * ay;
}

/** Передняя поверхность печени (обращена к зрителю): наклон вперёд к нижнему краю, ямка пузыря и ворота. */
export function liverFront(x: number, y: number): number {
  const z = 0.35 - 0.2 * (y + 1.8) - 0.005 * (x + 1.2) ** 2;
  return z + fossaCarve(x, y) + hilumCarve(x, y);
}

/* ---------- Протоки ---------- */

/** Развилка печёночных протоков в воротах. */
export const HEPATIC_JUNCTION: V3 = [2.4, 3.95, -1.85];

export const RIGHT_HEPATIC_PTS: V3[] = [
  [-1.6, 4.65, -1.95],
  [-0.5, 4.5, -1.9],
  [0.8, 4.3, -1.88],
  [1.7, 4.08, -1.86],
  HEPATIC_JUNCTION,
];
export const LEFT_HEPATIC_PTS: V3[] = [
  [6.1, 4.95, -2.15],
  [5.0, 4.5, -2.0],
  [3.9, 4.18, -1.92],
  [3.1, 4.02, -1.88],
  HEPATIC_JUNCTION,
];
/** Общий печёночный проток: от развилки до слияния с пузырным. */
export const CHD_PTS: V3[] = [
  HEPATIC_JUNCTION,
  [2.46, 3.4, -1.84],
  [2.52, 2.5, -1.8],
  [2.5, 1.52, -1.74],
];
/** Общий желчный проток: позади двенадцатиперстной кишки, в борозде головки поджелудочной, к фатерову соску. */
export const CBD_PTS: V3[] = [
  [2.5, 1.52, -1.74],
  [2.56, 0.5, -1.82],
  [2.72, -0.7, -1.95],
  [2.92, -1.9, -2.08],
  [3.0, -3.0, -2.1],
  [2.88, -3.9, -1.98],
  [2.72, -4.42, -1.82],
];
/** Ампула (фатерова) — место слияния протока поджелудочной с общим желчным. */
export const AMPULLA: V3 = [2.66, -4.5, -1.78];
/** Большой сосочек двенадцатиперстной кишки на медиальной стенке нисходящей части. */
export const PAPILLA: V3 = [2.46, -4.55, -1.74];

export const PANCREATIC_DUCT_PTS: V3[] = [
  [7.4, -3.1, -2.4],
  [6.2, -3.5, -2.3],
  [5.0, -3.9, -2.15],
  [3.9, -4.25, -1.98],
  [3.2, -4.45, -1.84],
  AMPULLA,
];

/* ---------- Двенадцатиперстная кишка и поджелудочная железа ---------- */

export const DUODENUM_R = 1.02;
export const DUODENUM_PTS: V3[] = [
  [6.2, -0.55, -0.6],
  [4.5, -0.45, -0.7],
  [2.9, -0.7, -1.0],
  [1.8, -1.45, -1.3],
  [1.45, -2.8, -1.5],
  [1.42, -4.5, -1.56],
  [1.5, -6.1, -1.58],
  [2.15, -7.2, -1.55],
  [3.7, -7.62, -1.5],
  [5.6, -7.3, -1.45],
];

export const PANCREAS_HEAD: { c: V3; r: V3 } = { c: [4.75, -4.15, -2.2], r: [2.2, 2.55, 1.05] };
export const PANCREAS_BODY: { c: V3; r: V3 } = { c: [8.0, -3.1, -2.45], r: [2.2, 0.95, 0.85] };
/** Крючковидный отросток — «язык» головки под воротной веной. */
export const PANCREAS_UNCINATE: { c: V3; r: V3 } = { c: [3.6, -6.0, -2.2], r: [1.3, 1.2, 0.8] };

/* ---------- Сосуды, нервы, лимфа ---------- */

export const PORTAL_PTS: V3[] = [
  [4.0, -1.2, -2.7],
  [3.65, 0.4, -2.55],
  [3.35, 1.9, -2.5],
  [3.15, 3.2, -2.5],
  [3.05, 4.1, -2.5],
];
export const PORTAL_RIGHT_PTS: V3[] = [
  [3.05, 4.1, -2.5],
  [1.8, 4.5, -2.6],
  [0.2, 4.75, -2.7],
  [-1.3, 4.9, -2.9],
];
export const PORTAL_LEFT_PTS: V3[] = [
  [3.05, 4.1, -2.5],
  [4.3, 4.45, -2.6],
  [5.6, 4.9, -2.8],
  [6.7, 5.3, -3.0],
];

export const HEPATIC_ARTERY_PTS: V3[] = [
  [4.3, -1.9, -2.5],
  [4.05, -0.4, -2.35],
  [3.8, 1.2, -2.28],
  [3.55, 2.5, -2.2],
  [3.4, 3.3, -2.15],
];
export const HEPATIC_ARTERY_LEFT_PTS: V3[] = [
  [3.4, 3.3, -2.15],
  [4.1, 3.75, -2.1],
  [5.0, 4.25, -2.2],
  [6.0, 4.7, -2.4],
];
export const HEPATIC_ARTERY_RIGHT_PTS: V3[] = [
  [3.4, 3.3, -2.15],
  [2.9, 3.1, -2.28],
  [2.2, 3.0, -2.3],
  [1.6, 2.92, -2.1],
  [1.2, 2.74, -1.7],
  [0.9, 2.66, -1.38],
];

/** Пузырная артерия: от правой печёночной к шейке, дальше две ветви — по свободной и по печёночной поверхности. */
export const CYSTIC_ARTERY_PTS: V3[] = [
  [0.9, 2.66, -1.38],
  [0.72, 2.5, -1.02],
  [0.52, 2.28, -0.72],
];

export function cysticArteryBranch(side: 'free' | 'liver'): V3[] {
  const th = side === 'free' ? 0.3 : Math.PI * 0.92;
  const pts: V3[] = [];
  const ss = [0.9, 0.78, 0.64, 0.5, 0.36, 0.22, 0.1];
  ss.forEach((s, i) => pts.push(gbPoint(s, th + 0.08 * Math.sin(i * 1.7), 0.05)));
  return pts;
}

export const CYSTIC_VEIN_PTS: V3[] = [
  [0.46, 2.04, -0.52],
  [0.9, 2.1, -1.2],
  [1.7, 1.7, -2.0],
  [2.6, 1.2, -2.42],
  [3.25, 1.0, -2.52],
];

export const NERVE_PTS: V3[] = [
  [4.6, -2.3, -2.9],
  [4.1, -0.2, -2.75],
  [3.8, 1.6, -2.6],
  [3.2, 2.5, -2.1],
  [2.0, 2.45, -1.7],
  [1.0, 2.3, -1.15],
  [0.4, 2.05, -0.6],
];

export const LYMPH_NODES: { at: V3; r: number }[] = [
  { at: [1.15, 2.28, -1.1], r: 0.2 },
  { at: [3.05, 0.55, -2.35], r: 0.23 },
  { at: [3.35, 2.8, -2.28], r: 0.17 },
  { at: [3.2, -2.0, -2.65], r: 0.2 },
];

/* ---------- Разрезы ---------- */

/** Центр масштаба при разносе: точка на плоскости бокового разреза посередине пузыря. */
export const GB_CENTER: V3 = [-1.6, 0.0, 0.434];

/** Фронтальный разрез: срезается всё, что впереди плоскости z + 0.34 y = 0.434, вдоль оси пузыря. */
export const SIDE_CUT = { nx: 0, ny: -0.34, nz: -1, c: 0.434 };

/** Разрез поперёк тела пузыря: срезается всё выше плоскости, нормаль смотрит вперёд-вверх (чтобы камера не оказалась в печени). */
export const AXIAL_S = 0.34;
export const AXIAL_NORMAL: V3 = [0.34, 0.84, 0.28];

export function axialNormalUnit(): V3 {
  const [x, y, z] = AXIAL_NORMAL;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

/* ---------- Цикл: пища -> холецистокинин -> сокращение пузыря ---------- */

/** Сокращение пузыря 0..1 по времени (с): покой — приём жирной пищи — сокращение — расслабление. */
export function contraction(time: number): number {
  const period = 34;
  const p = (((time % period) + period) % period) / period;
  if (p < 0.34) return 0;
  if (p < 0.5) return smoothstep(0, 1, (p - 0.34) / 0.16);
  if (p < 0.72) return 1;
  if (p < 0.92) return 1 - smoothstep(0, 1, (p - 0.72) / 0.2);
  return 0;
}
