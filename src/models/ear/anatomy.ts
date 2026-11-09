/*
  Правое ухо. Система координат «голова»: +x — наружу (от головы), +y — вверх, +z — назад (затылок); лицо — в сторону −z.
  Единицы — миллиметры, начало — центр барабанной перепонки. Среднее и внутреннее ухо заданы в системе перепонки
  (a — вперёд, u — вверх, d — наружу по нормали перепонки) и переводятся функцией T().
  Чистая математика: модуль работает и в фоновом потоке, и в тестах.
*/

export type V3 = [number, number, number];

export const SCALE = 0.1;

export const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const vdot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a: V3): V3 => vmul(a, 1 / (vlen(a) || 1));
export const vlerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ------------------------------------------------------------------ слуховой проход и перепонка */

/** Осевая линия наружного слухового прохода от перепонки наружу (S-образный изгиб). */
export const CANAL_PTS: V3[] = [[0, 0, 0], [6, 0.8, 1.5], [12, 1.8, 2.8], [18, 1.4, 4.0], [23, 0, 5.2], [27, -1.0, 6.2]];
/** Радиус просвета вдоль линии прохода (мм) в тех же точках: перешеек — самое узкое место. */
export const CANAL_R: number[] = [4.0, 3.5, 3.15, 3.5, 3.95, 4.3];
/** Граница костной и хрящевой частей по оси x (мм). */
export const BONY_END_X = 16;

const T0 = vnorm(vsub(CANAL_PTS[1], CANAL_PTS[0]));
/** Нормаль перепонки (наружу): перепонка стоит косо, обращена наружу, вниз и вперёд. */
export const TM_N: V3 = vnorm(vadd(T0, [0, -0.42, -0.52]));
export const TM_UP: V3 = vnorm(vsub([0, 1, 0], vmul(TM_N, TM_N[1])));
export const TM_ANT: V3 = vnorm(vcross(TM_UP, TM_N));

/** Точка (или направление) в системе перепонки → голова. */
export const T = (a: number, u: number, d: number): V3 => [
  a * TM_ANT[0] + u * TM_UP[0] + d * TM_N[0],
  a * TM_ANT[1] + u * TM_UP[1] + d * TM_N[1],
  a * TM_ANT[2] + u * TM_UP[2] + d * TM_N[2],
];
/** Голова → система перепонки. */
export const toTM = (p: V3): V3 => [vdot(p, TM_ANT), vdot(p, TM_UP), vdot(p, TM_N)];

export const TM_RA = 4.4;
export const TM_RU = 4.9;
export const TM_DEPTH = 1.9;
/** Смещение перепонки по нормали (внутрь отрицательно) при нормированном радиусе. */
export const tmDepth = (rho: number): number => -TM_DEPTH * (1 - Math.pow(Math.min(1, rho), 1.6));
/** Точка поверхности перепонки по (a, u) в системе перепонки. */
export function tmPoint(a: number, u: number, off = 0): V3 {
  const rho = Math.hypot(a / TM_RA, u / TM_RU);
  return T(a, u, tmDepth(rho) + off);
}
/** Угловой сектор и радиус рыхлой части перепонки (над латеральным отростком молоточка). */
export const FLACCIDA = { phi0: 1.12, phi1: 1.78, rho0: 0.74 };

/* ------------------------------------------------------------------ ушная раковина: система координат */

const N0 = vnorm(vsub(CANAL_PTS[5], CANAL_PTS[4]));
const Q0 = vnorm(vmul(vcross([0, 1, 0], N0), -1));
const P0 = vcross(Q0, N0);
const TILT = (14 * Math.PI) / 180;
const STAND = (19 * Math.PI) / 180;
const P1 = vadd(vmul(P0, Math.cos(TILT)), vmul(Q0, Math.sin(TILT)));
const Q1 = vsub(vmul(Q0, Math.cos(TILT)), vmul(P0, Math.sin(TILT)));
export const EAR_N: V3 = vsub(vmul(N0, Math.cos(STAND)), vmul(Q1, Math.sin(STAND)));
export const EAR_P: V3 = P1;
export const EAR_Q: V3 = vadd(vmul(Q1, Math.cos(STAND)), vmul(N0, Math.sin(STAND)));
/** Центр дна раковины (на оси прохода у наружного конца). */
export const EAR_O: V3 = vadd(CANAL_PTS[5], vmul(N0, 0.5));
/** Рисунок раковины задан в «ушных» координатах p (вверх) и q (назад), сдвинутых относительно центра раковины. */
export const EAR_P0 = -3.5;
export const EAR_Q0 = -1;

/** Ушные координаты (x — по нормали наружу, p, q в миллиметрах рисунка) → голова. */
export function ear(x: number, p: number, q: number): V3 {
  const lp = p - EAR_P0;
  const lq = q - EAR_Q0;
  return [
    EAR_O[0] + x * EAR_N[0] + lp * EAR_P[0] + lq * EAR_Q[0],
    EAR_O[1] + x * EAR_N[1] + lp * EAR_P[1] + lq * EAR_Q[1],
    EAR_O[2] + x * EAR_N[2] + lp * EAR_P[2] + lq * EAR_Q[2],
  ];
}
/** Голова → ушные координаты (x, p, q). */
export function toEar(w: V3): V3 {
  const d = vsub(w, EAR_O);
  return [vdot(d, EAR_N), vdot(d, EAR_P) + EAR_P0, vdot(d, EAR_Q) + EAR_Q0];
}

/* ------------------------------------------------------------------ улитка и лабиринт */

export const VEST_C: V3 = T(-3.6, 1.4, -8.9);
export const VEST_R: V3 = [2.1, 2.4, 1.9]; // полуоси в системе перепонки (a, u, d)

const cAxis = vnorm(T(0.8069, 0.1018, 0.5819));
const latRaw = T(0, 0, 1);
const e1 = vnorm(vsub(latRaw, vmul(cAxis, vdot(latRaw, cAxis))));
const e2 = vnorm(vcross(e1, cAxis));

export const COCH = {
  c0: T(-0.354, -2.391, -8.726),
  axis: cAxis,
  e1,
  e2,
  R0: 3.7,
  k: 0.0575,
  turns: 2.75,
  height: 4.4,
  r0: 1.1,
  r1: 0.52,
  theta0: 1.544,
};
export const COCH_TH = COCH.turns * 2 * Math.PI;
/** Радиус витка (до оси трубки) на угле θ. */
export const cochR = (th: number): number => COCH.R0 * Math.exp(-COCH.k * th);
/** Радиус трубки улитки на угле θ. */
export const cochTube = (th: number): number => COCH.r0 + (COCH.r1 - COCH.r0) * Math.pow(th / COCH_TH, 0.85);
/** Единичное радиальное направление витка. */
export function cochRad(th: number): V3 {
  const a = th + COCH.theta0;
  return vadd(vmul(COCH.e1, Math.cos(a)), vmul(COCH.e2, Math.sin(a)));
}
/** Центр просвета улитки на угле θ. */
export function cochCenter(th: number): V3 {
  return vadd(vadd(COCH.c0, vmul(cochRad(th), cochR(th))), vmul(COCH.axis, (COCH.height * th) / COCH_TH));
}
/** Точка в сечении улитки: s — по радиусу, z — вдоль оси улитки (мм). */
export function cochAt(th: number, s: number, z: number): V3 {
  return vadd(vadd(cochCenter(th), vmul(cochRad(th), s)), vmul(COCH.axis, z));
}

/** Круглое окно: на латеральной нижней стенке базального витка (центр и наружная нормаль). */
export const RW = (() => {
  let best: { c: V3; n: V3; score: number } | null = null;
  for (let th = 3.6; th <= 6.0; th += 0.05) {
    const rad = cochRad(th);
    const r = cochTube(th);
    const c = vadd(vadd(cochCenter(th), vmul(rad, r + 0.1)), vmul(COCH.axis, -0.35 * r));
    const tm = toTM(c);
    const score = tm[2] * 1.0 - tm[1] * 0.5 - Math.abs(tm[0] + 1.8) * 0.3;
    if (!best || score > best.score) best = { c, n: vnorm(vadd(rad, vmul(TM_N, 0.6))), score };
  }
  return best!;
})();

const nLat = vnorm([0, Math.cos(0.52), Math.sin(0.52)]);
const pAx: V3 = vnorm([-0.7, -0.05, -0.7]);
const nSup = vnorm(vsub(pAx, vmul(nLat, vdot(pAx, nLat))));
const nPost = vnorm(vcross(nLat, nSup));

export const GAP = 0.55;
export interface Canal {
  id: 'sc-anterior' | 'sc-posterior' | 'sc-lateral';
  n: V3;
  m: V3;
  c: V3;
  R: number;
  w: V3;
  /** Какой конец дуги расширен в ампулу: 0 — начало, 1 — конец. */
  ampEnd: 0 | 1;
}
/** Точка дуги канала; α = 0 — ближайшая к преддверию, дуга идёт от GAP до 2π − GAP. */
export function canalPoint(c: Canal, a: number): V3 {
  return vadd(c.c, vadd(vmul(c.m, -Math.cos(a) * c.R), vmul(c.w, Math.sin(a) * c.R)));
}
const projPlane = (v: V3, n: V3): V3 => vnorm(vsub(v, vmul(n, vdot(v, n))));
function makeCanal(id: Canal['id'], n: V3, dirHint: V3, R: number, anterior: boolean): Canal {
  const m = projPlane(dirHint, n);
  const c = vadd(VEST_C, vmul(m, R * 0.92));
  const w = vcross(n, m);
  const k: Canal = { id, n, m, c, R, w, ampEnd: 0 };
  const p0 = canalPoint(k, GAP);
  const p1 = canalPoint(k, 2 * Math.PI - GAP);
  // передние каналы расширяются ампулой на переднем конце, задний — на нижнем
  k.ampEnd = anterior ? (p0[2] < p1[2] ? 0 : 1) : p0[1] < p1[1] ? 0 : 1;
  return k;
}
export const CANALS: Canal[] = [
  makeCanal('sc-anterior', nSup, [0, 1, -0.2], 3.4, true),
  makeCanal('sc-posterior', nPost, [0.1, -0.55, 1], 3.2, false),
  makeCanal('sc-lateral', nLat, [0.7, 0, 0.7], 2.4, true),
];
export const canalPts = (c: Canal, n = 48): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => canalPoint(c, GAP + ((2 * Math.PI - 2 * GAP) * i) / n));
export const canalAmpulla = (c: Canal): V3 => canalPoint(c, c.ampEnd === 0 ? GAP + 0.12 : 2 * Math.PI - GAP - 0.12);

/* ------------------------------------------------------------------ нервы, сосуды, трубы: осевые линии */

export const FACIAL_PTS: V3[] = [
  T(-2.5, 3.2, -14.5), T(-1.2, 3.3, -11), T(1.0, 3.5, -8.2), T(2.8, 3.6, -6.9), // лабиринтный отдел до коленца
  T(1.6, 3.2, -5.5), T(-1.0, 3.1, -5.4), T(-3.6, 3.0, -5.4), T(-5.8, 2.7, -5.3), // барабанный отдел
  T(-6.8, 0.8, -4.9), T(-7.6, -3.0, -4.5), T(-8.4, -7.5, -4.2), T(-9.1, -12, -4.0), T(-9.6, -16, -3.9), // сосцевидный отдел
];
export const GENICULATE: V3 = T(2.8, 3.6, -6.9);
export const CHORDA_PTS: V3[] = [T(-7.0, -2.8, -4.4), T(-5.2, -0.5, -3.4), T(-3.4, 2.5, -2.6), T(-1.6, 5.2, -1.6), T(0.4, 4.8, -1.2), T(2.8, 2.2, -1.2), T(5.2, -2.2, -2.4), T(7.0, -5.4, -4.0), T(9.0, -8.2, -5.4)];
export const IAM_PTS: V3[] = [T(1.0, 2.0, -12.6), T(-0.8, 1.8, -16), T(-2.6, 1.5, -20.5), T(-3.6, 1.2, -23.5)];
export const VIII_PTS: V3[] = [T(-3.6, 1.2, -23.5), T(-4.4, 0.6, -28), T(-5.2, -0.6, -33), T(-6.0, -1.6, -38)];
export const BRAINSTEM_C: V3 = T(-7.6, -2.2, -45);
export const ICA_PTS: V3[] = [T(8.2, -14, -3.6), T(8.4, -11, -4.8), T(8.8, -7.2, -6.6), T(9.4, -4.4, -8.8), T(13.5, -3.6, -13), T(20, -3, -17.5), T(26, -2.2, -21)];
export const ICA_R = 2.6;
export const SIGMOID_PTS: V3[] = [T(-15.5, 17, -3), T(-18.5, 10, -2.6), T(-19, 2, -4.2), T(-16.4, -6, -6), T(-13, -11.5, -7.2)];
export const SIGMOID_R = 3.3;
export const JUGULAR_C: V3 = T(-10.5, -14.4, -7.6);
export const JUGULAR_R = 4.4;

export const EU_DIR: V3 = vnorm(T(0.78, -0.3, -0.55));
export const EU_S0: V3 = T(5.2, -2.3, -3.0);
export const EU_S1: V3 = vadd(EU_S0, vmul(EU_DIR, 12));
export const EU_S2: V3 = vadd(EU_S1, vmul(EU_DIR, 22));

/** Слуховой проход: центр просвета и радиус на расстоянии x по оси (интерполяция по опорным точкам). */
export function canalAt(x: number): { c: V3; r: number } {
  const n = CANAL_PTS.length - 1;
  const f = Math.max(0, Math.min(n - 1e-6, (x / CANAL_PTS[n][0]) * n));
  const i = Math.floor(f);
  const t = f - i;
  return { c: vlerp(CANAL_PTS[i], CANAL_PTS[i + 1], t), r: CANAL_R[i] + (CANAL_R[i + 1] - CANAL_R[i]) * t };
}

/* ------------------------------------------------------------------ разрезы */

export type CutId = 'side' | 'fundus' | 'coronal';
export interface CutDef {
  /** Ось, вдоль которой сдвигается плоскость. */
  ax: V3;
  /** Какую часть оставляем: +1 — где ax·p ≥ v, −1 — где ax·p ≤ v. */
  sign: 1 | -1;
  min: number;
  max: number;
  def: number;
}
const nCor = vnorm(vcross(vnorm(CANAL_PTS[5]), [0, 1, 0]));
/** Три среза: фронтальный вдоль прохода, горизонтальный и сагиттальный. */
export const CUTS: Record<CutId, CutDef> = {
  side: { ax: nCor, sign: 1, min: -24, max: 26, def: 0.6 },
  fundus: { ax: [0, 1, 0], sign: -1, min: -34, max: 26, def: 1.8 },
  coronal: { ax: [1, 0, 0], sign: -1, min: -32, max: 26, def: -9 },
};
export const cutValue = (kind: CutId, t: number): number => CUTS[kind].min + (CUTS[kind].max - CUTS[kind].min) * t;
export const CUT_DEFAULT_T: Record<CutId, number> = {
  side: (CUTS.side.def - CUTS.side.min) / (CUTS.side.max - CUTS.side.min),
  fundus: (CUTS.fundus.def - CUTS.fundus.min) / (CUTS.fundus.max - CUTS.fundus.min),
  coronal: (CUTS.coronal.def - CUTS.coronal.min) / (CUTS.coronal.max - CUTS.coronal.min),
};

/* ------------------------------------------------------------------ части: группы, якоря камеры, подписи */

export const EAR_GROUPS = {
  'g-outer': [
    'helix', 'helix-crus', 'antihelix', 'scapha', 'triangular-fossa', 'cymba', 'concha', 'tragus', 'antitragus',
    'intertragic-notch', 'lobule', 'auricle-back', 'auricular-cartilage', 'auricularis-superior', 'auricularis-anterior', 'auricularis-posterior',
  ],
  'g-meatus': ['meatus-cartilaginous', 'meatus-bony', 'ear-hairs', 'ceruminous-glands'],
  'g-tm': ['tympanic-membrane', 'pars-flaccida', 'tympanic-annulus'],
  'g-middle': ['tympanic-cavity', 'epitympanic-recess', 'hypotympanum', 'promontory', 'mastoid-antrum', 'mastoid-cells', 'oval-window', 'round-window'],
  'g-ossicles': ['malleus', 'incus', 'stapes', 'incudomalleolar-joint', 'incudostapedial-joint', 'annular-ligament', 'ossicular-ligaments', 'tensor-tympani', 'stapedius'],
  'g-tube': ['eustachian-bony', 'eustachian-cartilaginous', 'pharyngeal-opening'],
  'g-cochlea': [
    'cochlea-bony', 'modiolus', 'spiral-lamina', 'scala-vestibuli', 'scala-tympani', 'cochlear-duct', 'reissner', 'basilar-membrane',
    'organ-of-corti', 'tectorial-membrane', 'spiral-ganglion', 'helicotrema', 'cochlear-nerve',
  ],
  'g-vestibular': [
    'vestibule', 'bony-canals', 'sc-anterior', 'sc-posterior', 'sc-lateral', 'ampullae', 'cupulae', 'utricle', 'saccule', 'maculae',
    'endolymphatic-sac', 'vestibular-nerve', 'vestibular-ganglion',
  ],
  'g-nerves': ['facial-nerve', 'geniculate-ganglion', 'chorda-tympani', 'vestibulocochlear-nerve', 'internal-acoustic-meatus', 'brainstem', 'internal-carotid', 'jugular-bulb', 'sigmoid-sinus'],
  'g-bone': ['petrous-part', 'mastoid-process', 'squamous-part', 'tympanic-part', 'styloid-process'],
} as const;

export type EarGroupId = keyof typeof EAR_GROUPS;
export const EAR_GROUP_IDS = Object.keys(EAR_GROUPS) as EarGroupId[];
export const EAR_PART_IDS: string[] = Object.values(EAR_GROUPS).flat();
export const GROUP_OF: Record<string, EarGroupId> = Object.fromEntries(
  (Object.entries(EAR_GROUPS) as [EarGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Фокус камеры: точка, направление на камеру и расстояние (мм). */
export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}
const DIR_FRONT: V3 = vnorm([0.62, 0.26, -0.74]);
const DIR_LAT: V3 = vnorm([0.95, 0.2, -0.25]);
const DIR_MED: V3 = vnorm([0.5, 0.35, -0.8]);
const foc = (at: V3, dist: number, dir: V3 = DIR_MED): Focus => ({ at, dist, dir });

const cochMid = cochCenter(COCH_TH * 0.5);
const cochApex = cochCenter(COCH_TH);
const cochBase = cochCenter(0.4);
const ampA = canalAmpulla(CANALS[0]);
const ampL = canalAmpulla(CANALS[2]);

export const OVERVIEW: Focus = foc([6, 0, 1], 215, DIR_FRONT);
export const CUT_VIEWS: Record<CutId, Focus> = {
  side: foc([8, 0, 2], 128, vmul(nCor, -1)),
  fundus: foc([2, 0, -3], 92, vnorm([0.12, 1, -0.1])),
  coronal: foc([-6, 0, -5], 96, vnorm([1, 0.1, -0.1])),
};
export const SPREAD_VIEW: Focus = foc([4, 2, 0], 230, vnorm([0.55, 0.3, -0.78]));
export const INNER_VIEW: Focus = foc(vlerp(VEST_C, cochMid, 0.5), 52, vnorm([0.7, 0.35, -0.6]));

const TMf = T;
/** Якорь части: точка (подпись и центр взгляда), расстояние до камеры (мм) и направление на камеру. */
const A: Record<string, [V3, number, V3?]> = {
  // раковина (ушные координаты: x наружу, p вверх, q назад)
  helix: [ear(10, 28, 12), 46, DIR_LAT],
  'helix-crus': [ear(8, 5, -9), 22, DIR_LAT],
  antihelix: [ear(11, 10, 11), 40, DIR_LAT],
  scapha: [ear(8, 20, 17), 36, DIR_LAT],
  'triangular-fossa': [ear(8, 18, 4), 26, DIR_LAT],
  cymba: [ear(5, 7, -2), 24, DIR_LAT],
  concha: [ear(1, -5, 0), 32, DIR_LAT],
  tragus: [ear(5, -2, -8), 20, vnorm([0.5, 0.2, -0.9])],
  antitragus: [ear(5, -13, 3), 20, DIR_LAT],
  'intertragic-notch': [ear(3, -8.5, -6.5), 16, vnorm([0.6, 0.1, -0.8])],
  lobule: [ear(3, -26, -2), 32, DIR_LAT],
  'auricle-back': [ear(6, 6, 12), 60, vnorm([0.1, 0.2, 1])],
  'auricular-cartilage': [ear(8, 8, 8), 52, DIR_LAT],
  'auricularis-superior': [ear(6, 30, 0), 36, DIR_LAT],
  'auricularis-anterior': [ear(4, 15, -16), 30, vnorm([0.6, 0.1, -0.8])],
  'auricularis-posterior': [ear(4, 6, 20), 36, vnorm([0.2, 0.2, 1])],
  'meatus-cartilaginous': [canalAt(21).c, 26, DIR_FRONT],
  'meatus-bony': [canalAt(10).c, 24, DIR_FRONT],
  'ear-hairs': [canalAt(24).c, 16, DIR_LAT],
  'ceruminous-glands': [canalAt(21).c, 16, DIR_LAT],
  'tympanic-membrane': [TMf(0, 0, -0.9), 20, vnorm(vadd(TM_N, [0, 0.1, 0]))],
  'pars-flaccida': [tmPoint(0.9, 4.4), 14, vnorm(vadd(TM_N, [0, 0.2, 0]))],
  'tympanic-annulus': [tmPoint(-3.0, -3.1), 16, TM_N],
  'tympanic-cavity': [TMf(0.3, -1, -3.4), 26],
  'epitympanic-recess': [TMf(0.3, 7.4, -2.8), 22],
  hypotympanum: [TMf(0.3, -6.2, -2.6), 22],
  promontory: [TMf(1.2, -1.3, -4.3), 14],
  'mastoid-antrum': [TMf(-9.5, 8.5, -1), 24],
  'mastoid-cells': [TMf(-14, 2, 1), 34],
  'oval-window': [TMf(-3.56, 1.26, -6.9), 12],
  'round-window': [RW.c, 12],
  malleus: [TMf(0.5, 3.4, -1.8), 18],
  incus: [TMf(-3.2, 5.8, -3.4), 18],
  stapes: [TMf(-3.1, 1.6, -5.4), 11],
  'incudomalleolar-joint': [TMf(-1.1, 7, -3.2), 11],
  'incudostapedial-joint': [TMf(-2.6, 2.2, -3.8), 10],
  'annular-ligament': [TMf(-3.56, 1.26, -6.9), 10],
  'ossicular-ligaments': [TMf(0.4, 8.6, -2.7), 14],
  'tensor-tympani': [TMf(4.2, 3.2, -6.6), 20],
  stapedius: [TMf(-6.6, -0.5, -5.2), 18],
  'eustachian-bony': [vadd(EU_S0, vmul(EU_DIR, 6)), 26],
  'eustachian-cartilaginous': [vadd(EU_S1, vmul(EU_DIR, 11)), 40],
  'pharyngeal-opening': [EU_S2, 22],
  'cochlea-bony': [cochMid, 24],
  modiolus: [vadd(COCH.c0, vmul(COCH.axis, 2.2)), 18],
  'spiral-lamina': [cochAt(1.5, -0.5, 0), 10],
  'scala-vestibuli': [cochAt(2.2, 0, 0.5), 11],
  'scala-tympani': [cochAt(2.2, 0, -0.5), 11],
  'cochlear-duct': [cochAt(2.2, 0.3, 0.1), 10],
  reissner: [cochAt(2.6, 0.2, 0.3), 9],
  'basilar-membrane': [cochAt(2.0, 0.2, 0), 9],
  'organ-of-corti': [cochAt(2.0, -0.2, 0.05), 8],
  'tectorial-membrane': [cochAt(2.4, -0.2, 0.2), 8],
  'spiral-ganglion': [cochAt(COCH_TH * 0.15, -1.9, 0), 11],
  helicotrema: [cochApex, 10],
  'cochlear-nerve': [vlerp(cochBase, IAM_PTS[0], 0.55), 18],
  vestibule: [VEST_C, 16],
  'bony-canals': [vlerp(VEST_C, ampA, 0.5), 22],
  'sc-anterior': [canalPoint(CANALS[0], Math.PI), 18],
  'sc-posterior': [canalPoint(CANALS[1], Math.PI), 18],
  'sc-lateral': [canalPoint(CANALS[2], Math.PI), 16],
  ampullae: [vlerp(ampA, ampL, 0.5), 16],
  cupulae: [ampL, 8],
  utricle: [vadd(VEST_C, T(-0.4, 0.9, 0.2)), 11],
  saccule: [vadd(VEST_C, T(1.0, -1.0, -0.4)), 11],
  maculae: [vadd(VEST_C, T(-0.4, 0.2, 0.4)), 9],
  'endolymphatic-sac': [vadd(VEST_C, T(-6.5, 0.2, -6.8)), 16],
  'vestibular-nerve': [vlerp(VEST_C, IAM_PTS[0], 0.55), 16],
  'vestibular-ganglion': [vlerp(VEST_C, IAM_PTS[0], 0.8), 12],
  'facial-nerve': [FACIAL_PTS[6], 26],
  'geniculate-ganglion': [GENICULATE, 12],
  'chorda-tympani': [CHORDA_PTS[3], 16],
  'vestibulocochlear-nerve': [VIII_PTS[1], 30],
  'internal-acoustic-meatus': [IAM_PTS[1], 22],
  brainstem: [BRAINSTEM_C, 50],
  'internal-carotid': [ICA_PTS[3], 40],
  'jugular-bulb': [JUGULAR_C, 28],
  'sigmoid-sinus': [SIGMOID_PTS[2], 38],
  'petrous-part': [T(8, 0, -14), 70],
  'mastoid-process': [T(-12, -6, 3), 50],
  'squamous-part': [T(-6, 17, 3), 56],
  'tympanic-part': [canalAt(8).c, 28],
  'styloid-process': [T(1, -26, -5), 34],
};

export const LABEL_AT: Record<string, V3> = Object.fromEntries(EAR_PART_IDS.map((id) => [id, A[id]?.[0] ?? [0, 0, 0]]));

export const FOCUS: Record<string, Focus> = {
  ...Object.fromEntries(EAR_PART_IDS.map((id) => [id, foc(A[id]?.[0] ?? [0, 0, 0], A[id]?.[1] ?? 30, A[id]?.[2] ?? DIR_MED)])),
  'g-outer': foc([22, 0, 2], 110, DIR_LAT),
  'g-meatus': foc(canalAt(14).c, 52, DIR_FRONT),
  'g-tm': foc(T(0, 0, -1), 36, vnorm(vadd(TM_N, [0, 0.1, 0]))),
  'g-middle': foc(T(-2, 0, -3), 56, DIR_MED),
  'g-ossicles': foc(T(-1.6, 4, -3.4), 26, DIR_MED),
  'g-tube': foc(vadd(EU_S0, vmul(EU_DIR, 18)), 70, DIR_MED),
  'g-cochlea': foc(cochMid, 30, DIR_MED),
  'g-vestibular': foc(vlerp(VEST_C, ampA, 0.4), 30, DIR_MED),
  'g-nerves': foc(T(-4, 0, -22), 90, DIR_MED),
  'g-bone': foc(T(-4, 0, -4), 120, DIR_FRONT),
};

/** Подписи, которые показываются по умолчанию (остальные — только у выбранной части). */
export const MAIN_LABELS = new Set<string>(['helix', 'antihelix', 'tragus', 'lobule', 'concha', 'meatus-cartilaginous', 'tympanic-membrane', 'cochlea-bony', 'eustachian-cartilaginous']);
/** Подписи внутренних частей: видны сквозь стенки, не прячутся при повороте. */
export const INNER_LABELS = new Set<string>(EAR_PART_IDS.filter((id) => GROUP_OF[id] !== 'g-outer' && GROUP_OF[id] !== 'g-meatus'));

/** Разнос при «Разобрать»: сдвиг группы (мм) и добавки для отдельных частей. */
export const GROUP_SPREAD: Record<EarGroupId, V3> = {
  'g-outer': [34, 8, 6],
  'g-meatus': [20, 3, 2],
  'g-tm': [9, 4, -2],
  'g-middle': [0, 0, 0],
  'g-ossicles': [3, 14, -2],
  'g-tube': [-4, -10, -22],
  'g-cochlea': [-12, -10, -12],
  'g-vestibular': [-10, 12, 8],
  'g-nerves': [-20, 0, -4],
  'g-bone': [-8, -4, 22],
};
export const PART_SPREAD: Record<string, V3> = {
  malleus: [4, 6, -4],
  incus: [-2, 10, 6],
  stapes: [-8, 0, 4],
  'tensor-tympani': [0, 0, -14],
  stapedius: [0, -10, 6],
  brainstem: [-10, 0, 0],
  'internal-carotid': [0, -12, -8],
  'jugular-bulb': [0, -14, 6],
  'sigmoid-sinus': [0, 0, 14],
  'facial-nerve': [0, 6, 8],
  'ear-hairs': [4, 0, 0],
  'ceruminous-glands': [4, 0, 0],
};

/** Части, которые не режутся плоскостью среза. */
export const NO_CLIP = new Set<string>([]);
/** Части, которые становятся плотными на разрезе (в целом виде — матовое стекло). */
export const SOLID_ON_CUT = new Set<string>(['petrous-part', 'mastoid-process', 'squamous-part', 'tympanic-part', 'styloid-process']);

/** Режим «Только лабиринт»: эти части остаются, всё остальное скрывается. */
export const INNER_ONLY_KEEP = new Set<string>([
  ...EAR_GROUPS['g-cochlea'], ...EAR_GROUPS['g-vestibular'],
  'stapes', 'incus', 'incudostapedial-joint', 'annular-ligament',
  'vestibulocochlear-nerve', 'facial-nerve', 'geniculate-ganglion', 'internal-acoustic-meatus', 'brainstem', 'round-window', 'oval-window',
]);

/** Ось качания цепи косточек (от переднего отростка молоточка до короткой ножки наковальни). */
export const OSSICLE_AXIS: [V3, V3] = [T(3.4, 5.2, -2.0), T(-6.3, 7.6, -3.0)];

/** Путь звуковой волны в проходе: от наружного конца к перепонке. */
export const SOUND_PATH: V3[] = [...CANAL_PTS].reverse().map((p, i) => (i === 0 ? vadd(p, vmul(EAR_N, 14)) : p));
