/*
  Анатомия глаза в миллиметрах. Чистая математика без three.js — её можно проверять тестами.

  Система координат: начало — центр глазного яблока, оптическая ось — +z (вперёд, к зрителю),
  +y — вверх, +x — к носу (модель правого глаза, вид спереди: нос справа от глаза).
  Почти всё в глазе — тела вращения вокруг оси z, поэтому форма описывается профилем [r, z].
*/

export type P2 = [number, number];
export type V3 = [number, number, number];

export const DEG = Math.PI / 180;

/** Радиус заднего отдела склеры, радиус кривизны роговицы, радиус лимба (граница склеры и роговицы). */
export const R_SCLERA = 11.5;
export const R_CORNEA = 7.8;
export const R_LIMBUS = 5.9;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth01 = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Кусочно-линейная интерполяция по таблице [x, значение]. */
export function interp(stops: readonly (readonly [number, number])[], x: number): number {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, y0] = stops[i - 1];
      const [x1, y1] = stops[i];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return stops[stops.length - 1][1];
}

/** Сглаживание ломаной (алгоритм Чайкина); концы остаются на месте. */
export function chaikin(pts: P2[], iterations = 1): P2[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: P2[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const [ar, az] = cur[i];
      const [br, bz] = cur[i + 1];
      next.push([0.75 * ar + 0.25 * br, 0.75 * az + 0.25 * bz], [0.25 * ar + 0.75 * br, 0.25 * az + 0.75 * bz]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/** Единичные внешние нормали профиля, идущего от заднего полюса вперёд: n = (dz, -dr). */
export function profileNormals(pts: P2[]): P2[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dr = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dr, dz) || 1;
    return [dz / len, -dr / len];
  });
}

/** Смещение профиля вдоль его нормалей: dist > 0 — наружу. */
export function offsetProfile(pts: P2[], normals: P2[], dist: (i: number) => number): P2[] {
  return pts.map((p, i) => {
    const d = dist(i);
    // точки на оси остаются на оси
    return [p[0] === 0 ? 0 : p[0] + normals[i][0] * d, p[1] + normals[i][1] * d];
  });
}

/* ---------- Стенка глазного яблока: склера + роговица ---------- */

export interface Wall {
  outer: P2[];
  inner: P2[];
  /** Внешние нормали наружной поверхности. */
  normal: P2[];
  /** Для точек склеры — угол от заднего полюса в градусах, для роговицы NaN. */
  phi: number[];
  iLimbus: number;
  /** Зубчатая линия (ora serrata): граница сетчатки и ресничного тела. */
  iOra: number;
  count: number;
}

export const PHI_ORA = 117;

function buildWall(): Wall {
  const nS = 144;
  const nC = 56;
  const phiL = Math.PI - Math.asin(R_LIMBUS / R_SCLERA);
  const raw: P2[] = [];
  const phi: number[] = [];
  for (let i = 0; i <= nS; i++) {
    const a = (phiL * i) / nS;
    raw.push([R_SCLERA * Math.sin(a), -R_SCLERA * Math.cos(a)]);
    phi.push(a / DEG);
  }
  const zLimbus = raw[nS][1];
  const psiL = Math.asin(R_LIMBUS / R_CORNEA);
  const zc = zLimbus - R_CORNEA * Math.cos(psiL);
  for (let j = 1; j <= nC; j++) {
    const a = psiL * (1 - j / nC);
    raw.push([R_CORNEA * Math.sin(a), zc + R_CORNEA * Math.cos(a)]);
    phi.push(NaN);
  }
  // мягкий переход на лимбе: склера и роговица — сферы разной кривизны
  for (let it = 0; it < 4; it++) {
    for (let i = nS - 9; i <= nS + 9; i++) {
      raw[i] = [0.25 * raw[i - 1][0] + 0.5 * raw[i][0] + 0.25 * raw[i + 1][0], 0.25 * raw[i - 1][1] + 0.5 * raw[i][1] + 0.25 * raw[i + 1][1]];
    }
  }
  const normal = profileNormals(raw);
  const thick = raw.map((p, i) => {
    if (i <= nS) return interp([[0, 1.0], [45, 0.92], [80, 0.6], [110, 0.52], [149, 0.68]], phi[i]);
    return 0.55 + 0.13 * Math.pow(p[0] / R_LIMBUS, 2);
  });
  const inner = offsetProfile(raw, normal, (i) => -thick[i]);
  const iOra = Math.round((PHI_ORA / phi[nS]) * nS);
  return { outer: raw, inner, normal, phi, iLimbus: nS, iOra, count: raw.length };
}

export const WALL = buildWall();

/* ---------- Слои заднего отдела: хориоидея, пигментный эпителий, сетчатка ---------- */

export interface Layer {
  /** Поверхность, обращённая к склере. */
  outer: P2[];
  /** Поверхность, обращённая к стекловидному телу. */
  inner: P2[];
}

function posterior() {
  const n = WALL.iOra + 1;
  const sclInner = WALL.inner.slice(0, n);
  const nrm = WALL.normal.slice(0, n);
  const f = (i: number) => i / (n - 1);
  const choroidT = (i: number) => 0.34 - 0.22 * f(i) * f(i);
  const rpeT = 0.08;
  const retinaT = (i: number) => 0.38 - 0.2 * f(i);
  const c1 = offsetProfile(sclInner, nrm, (i) => -choroidT(i));
  const r1 = offsetProfile(sclInner, nrm, (i) => -(choroidT(i) + rpeT));
  const t1 = offsetProfile(sclInner, nrm, (i) => -(choroidT(i) + rpeT + retinaT(i)));
  return {
    choroid: { outer: sclInner, inner: c1 } as Layer,
    rpe: { outer: c1, inner: r1 } as Layer,
    retina: { outer: r1, inner: t1 } as Layer,
  };
}

export const POSTERIOR = posterior();

/** Единичный вектор направления на сетчатку: азимут к носу (+x) и возвышение вверх (+y), градусы. */
export function dirAt(azDeg: number, elDeg: number): V3 {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

export const FOVEA_AZ = -5;
export const DISC_AZ = 10;
export const FOVEA_DIR = dirAt(FOVEA_AZ, 0);
export const DISC_DIR = dirAt(DISC_AZ, 0);

const angleBetween = (a: V3, b: V3) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

/** Радиус внутренней поверхности сетчатки в направлении, заданном углом от заднего полюса (рад). */
export function retinaRadius(angle: number): number {
  const pts = POSTERIOR.retina.inner;
  const ang = pts.map((p) => Math.atan2(p[0], -p[1]));
  for (let i = 1; i < pts.length; i++) {
    if (ang[i] >= angle) {
      const t = (angle - ang[i - 1]) / (ang[i] - ang[i - 1] || 1);
      const r0 = Math.hypot(pts[i - 1][0], pts[i - 1][1]);
      const r1 = Math.hypot(pts[i][0], pts[i][1]);
      return lerp(r0, r1, t);
    }
  }
  return Math.hypot(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}

/** Центральная ямка: небольшое углубление во внутренней поверхности сетчатки (положительное число — вглубь). */
export function foveaPit(dir: V3): number {
  const a = angleBetween(dir, FOVEA_DIR) * retinaRadius(0.1);
  return 0.17 * Math.exp(-Math.pow(a / 0.85, 2));
}

/* ---------- Ресничное тело ---------- */

const CB_FROM = WALL.iOra;
const CB_TO = WALL.iLimbus;

export const CILIARY = (() => {
  const idx: number[] = [];
  for (let i = CB_FROM; i <= CB_TO; i++) idx.push(i);
  const outer = idx.map((i) => WALL.inner[i]);
  const nrm = idx.map((i) => WALL.normal[i]);
  const f = (k: number) => k / (idx.length - 1);
  const muscleT = (k: number) => 0.06 + 0.62 * smooth01((f(k) - 0.25) / 0.7);
  const tipT = (k: number) => 0.1 + 0.85 * smooth01((f(k) - 0.2) / 0.8);
  const muscleInner = offsetProfile(outer, nrm, (k) => -muscleT(k));
  const tips = offsetProfile(outer, nrm, (k) => -tipT(k));
  /** С какой точки начинаются реснитчатые отростки (pars plicata). */
  const plicataFrom = Math.round((idx.length - 1) * 0.5);
  return { outer, muscleInner, tips, plicataFrom, count: idx.length };
})();

/** Число реснитчатых отростков. */
export const CILIARY_PROCESSES = 72;

/* ---------- Хрусталик ---------- */

export const LENS_FRONT = 8.75;
export const LENS_BACK = 4.75;
const LENS_RA = 10;
const LENS_RP = 6;
const LENS_RF = 3.7;

function lensFront(r: number) {
  return LENS_FRONT - LENS_RA + Math.sqrt(LENS_RA * LENS_RA - r * r);
}
function lensBack(r: number) {
  return LENS_BACK + LENS_RP - Math.sqrt(LENS_RP * LENS_RP - r * r);
}

export const LENS = (() => {
  const pts: P2[] = [];
  for (let k = 0; k <= 10; k++) {
    const r = (LENS_RF * k) / 10;
    pts.push([r, lensFront(r)]);
  }
  const zf = lensFront(LENS_RF);
  const zb = lensBack(LENS_RF);
  const cz = (zf + zb) / 2;
  const hb = (zf - zb) / 2;
  for (let k = 1; k < 8; k++) {
    const t = (k / 8) * Math.PI; // от верха до низа экваториальной дуги
    pts.push([LENS_RF + 0.85 * Math.sin(t), cz + hb * Math.cos(t)]);
  }
  for (let k = 10; k >= 0; k--) {
    const r = (LENS_RF * k) / 10;
    pts.push([r, lensBack(r)]);
  }
  const profile = chaikin(pts, 3);
  let rEq = 0;
  let zEq = 0;
  for (const [r, z] of profile) {
    if (r > rEq) {
      rEq = r;
      zEq = z;
    }
  }
  return { profile, rEq, zEq };
})();

/** Ядро хрусталика — уменьшенная копия профиля относительно центра. */
export function lensNucleus(): P2[] {
  const zMid = (LENS_FRONT + LENS_BACK) / 2;
  return LENS.profile.map(([r, z]) => [r * 0.62, zMid + (z - zMid) * 0.58]);
}

export function lensFrontZ(r: number): number {
  return lensFront(Math.min(r, LENS_RF));
}

/* ---------- Радужка ---------- */

export const IRIS = {
  /** Радиус зрачка в покое, мм, и пределы движения. */
  pupil: 1.6,
  pupilMin: 1.15,
  pupilMax: 2.45,
  root: 5.05,
  /** Передняя поверхность радужки при заданном радиусе. */
  front(r: number): number {
    return 8.95 - 0.1 * (r - 1.5);
  },
  thickness(r: number): number {
    return 0.3 + 0.17 * Math.exp(-Math.pow((r - 2.9) / 1.0, 2)) - 0.1 * smooth01((r - 4.6) / 0.6);
  },
};

/* ---------- Прозрачные объёмы ---------- */

/** Передняя камера: от задней поверхности роговицы до радужки и передней поверхности хрусталика. */
export function aqueousProfile(): P2[] {
  const pts: P2[] = [];
  const last = WALL.count - 1;
  pts.push(WALL.inner[last]);
  for (let i = last - 1; i >= WALL.iLimbus; i--) pts.push(WALL.inner[i]);
  const g = CILIARY.tips[CILIARY.count - 1];
  pts.push(g);
  const rp = IRIS.pupilMin;
  pts.push([IRIS.root, IRIS.front(IRIS.root) - 0.02]);
  pts.push([rp, IRIS.front(rp) - 0.02]);
  for (let k = 5; k >= 0; k--) {
    const r = (rp * k) / 5;
    pts.push([r, lensFront(r) + (k === 0 ? 0.02 : 0)]);
  }
  return pts;
}

/** Стекловидное тело: от полюса вдоль сетчатки, ресничного тела и задней поверхности хрусталика. */
export function vitreousProfile(): P2[] {
  const pts: P2[] = [];
  POSTERIOR.retina.inner.forEach((p) => pts.push(p));
  const upTo = Math.round((CILIARY.count - 1) * 0.62);
  for (let k = 0; k <= upTo; k++) pts.push(CILIARY.tips[k]);
  // задняя поверхность хрусталика от экватора к оси
  const prof = LENS.profile;
  const eq = prof.findIndex(([r]) => r === LENS.rEq);
  pts.push([LENS.rEq + 0.18, LENS.zEq - 0.1]);
  for (let i = eq + 1; i < prof.length; i++) pts.push([prof[i][0] + 0.02, prof[i][1] - 0.03]);
  pts[pts.length - 1] = [0, pts[pts.length - 1][1]];
  return pts;
}

/* ---------- Зрительный нерв и глазодвигательные мышцы ---------- */

/** Ось зрительного нерва лежит в плоскости y = 0 и уходит назад и к носу. */
export const NERVE_PATH: V3[] = [
  [1.8, 0, -9.7],
  [2.2, 0, -12.5],
  [3.6, 0, -18],
  [5.6, 0, -25],
  [6.4, 0, -32],
  [7.4, 0, -39],
];
export const NERVE_CANAL_R = 0.95;
export const NERVE_CANAL_X = 1.8;

/** Расстояние по дуге склеры от лимба до места прикрепления, мм. */
export const MUSCLE_INSERT = { medial: 5.5, lateral: 6.9, superior: 7.7, inferior: 6.5 } as const;
