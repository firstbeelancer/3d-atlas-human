import { chain, ellipsoid, flatCapsule, capsule, smooth, smoothSubtract, sphere, type Sdf, type V3 } from '../skeleton/sdf';
import { LOBE_OF, SEGMENT_IDS, type LobeId, type SegmentId, type Vec } from './anatomy';

/*
  Форма печени — поле расстояний: плавное объединение эллипсоидов, плоские срезы (задняя и нижняя поверхности),
  борозды (нижняя полая вена, круглая и венозная связки), ямка желчного пузыря, ворота печени и вдавления
  от соседних органов. Деление на сегменты Куино — набор плоскостей: у каждой плоскости своя анатомия
  (средняя печёночная вена идёт по плоскости Кантли, правая и левая — по своим междолевым плоскостям).
*/

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Плоскость: расстояние со знаком, положительное со стороны нормали. */
export function plane(n: V3, p0: V3): Sdf {
  const [nx, ny, nz] = norm(n);
  return (x, y, z) => nx * (x - p0[0]) + ny * (y - p0[1]) + nz * (z - p0[2]);
}

/** Плавное пересечение (сглаженный максимум). */
function smax(k: number, a: Sdf, b: Sdf): Sdf {
  return (x, y, z) => {
    const A = a(x, y, z);
    const B = b(x, y, z);
    const h = Math.max(k - Math.abs(A - B), 0) / k;
    return Math.max(A, B) + h * h * k * 0.25;
  };
}

const neg =
  (f: Sdf): Sdf =>
  (x, y, z) =>
    -f(x, y, z);

const maxOf =
  (...fs: Sdf[]): Sdf =>
  (x, y, z) => {
    let d = -Infinity;
    for (const f of fs) {
      const v = f(x, y, z);
      if (v > d) d = v;
    }
    return d;
  };

const minOf =
  (...fs: Sdf[]): Sdf =>
  (x, y, z) => {
    let d = Infinity;
    for (const f of fs) {
      const v = f(x, y, z);
      if (v < d) d = v;
    }
    return d;
  };

/** Нижняя (висцеральная) поверхность — наклонная плоскость, поднимающаяся к левому краю. */
export const N_INF: V3 = norm([0.2, -0.9, -0.38]);
const A_INF: V3 = [0, -1.2, 1.0];

/** Точка на висцеральной поверхности под заданными x и z. */
export function onVisceral(x: number, z: number, outward = 0): V3 {
  const y = A_INF[1] - (N_INF[0] * (x - A_INF[0]) + N_INF[2] * (z - A_INF[2])) / N_INF[1];
  return [x + N_INF[0] * outward, y + N_INF[1] * outward, z + N_INF[2] * outward];
}

/** Ось желчного пузыря: от шейки у ворот печени к дну на нижнем крае. */
export const GB_PATH: V3[] = [
  onVisceral(-0.46, 0.0, -0.02),
  onVisceral(-0.56, 0.28, 0.06),
  onVisceral(-0.68, 0.58, 0.1),
  onVisceral(-0.8, 0.9, 0.12),
  onVisceral(-0.88, 1.2, 0.1),
];
export const GB_RADII = [0.07, 0.15, 0.23, 0.26, 0.21];

export function gallbladderField(grow = 0): Sdf {
  return chain(
    GB_PATH,
    GB_RADII.map((r) => r + grow),
  );
}

/** Точка на поверхности по лучу вдоль z (спереди или сзади) — для якорей подписей. */
export function surfaceZ(f: Sdf, x: number, y: number, from: 'front' | 'back'): Vec {
  const dir = from === 'front' ? -1 : 1;
  let z = from === 'front' ? 2.4 : -2.4;
  for (let i = 0; i < 480; i++) {
    if (f(x, y, z) < 0) return [x, y, z - dir * 0.01];
    z += dir * 0.01;
  }
  return [x, y, 0];
}

/** Нижняя поверхность: луч вдоль нормали снизу. */
export function surfaceUnder(f: Sdf, x: number, z: number): Vec {
  for (let o = 1.2; o > -1.2; o -= 0.01) {
    const p = onVisceral(x, z, o);
    if (f(p[0], p[1], p[2]) < 0) return p;
  }
  return onVisceral(x, z);
}

function dent(x: number, z: number, r: number, depth: number): Sdf {
  const c = onVisceral(x, z, r - depth);
  return sphere(c, r);
}

/** Тело печени без деления на части. */
export function liverBody(): Sdf {
  const rightMain = ellipsoid([-1.2, 0.1, 0.0], [1.75, 1.5, 1.35]);
  const rightLow = ellipsoid([-1.4, -0.6, 0.15], [1.5, 1.05, 1.15]);
  const medial = ellipsoid([-0.1, 0.1, 0.15], [1.2, 1.35, 1.05]);
  const left = smooth(
    0.4,
    ellipsoid([1.2, 0.2, 0.0], [1.5, 0.82, 0.5]),
    flatCapsule([1.6, 0.12, -0.02], [2.7, -0.1, -0.1], 0.62, 0.2, [1, 1, 0.62]),
  );
  let f: Sdf = smooth(0.55, rightMain, rightLow, medial, left);
  f = smax(0.3, f, plane([0, 0.1, -1], [0, 0, -0.95]));
  f = smax(0.25, f, plane(N_INF, A_INF));
  // хвостатая доля выступает назад и вниз («сосочковый отросток»)
  f = smooth(0.22, f, ellipsoid([-0.12, 0.15, -0.72], [0.52, 0.78, 0.42]));

  const cuts: Sdf[] = [
    // борозда нижней полой вены на задней поверхности
    capsule([-0.58, -2.0, -1.02], [-0.5, 2.2, -1.0], 0.29),
    // вдавление от позвоночника и аорты
    capsule([0.78, -3, -1.98], [0.78, 3, -1.98], 1.12),
    // ворота печени: поперечная щель на нижней поверхности
    capsule(onVisceral(-0.62, -0.18, -0.05), onVisceral(0.42, -0.12, -0.05), 0.17),
    // щель круглой связки (пупочная вырезка на нижнем крае)
    capsule(onVisceral(0.3, 1.25, -0.03), onVisceral(0.3, 0.05, -0.03), 0.075),
    // щель венозной связки между хвостатой и левой долей
    chain(
      [
        [0.42, onVisceral(0.42, -0.35)[1] + 0.05, -0.35],
        [0.5, 0.4, -0.86],
        [0.28, 1.0, -0.99],
        [-0.18, 1.5, -0.97],
      ],
      0.06,
    ),
  ];
  let g = smoothSubtract(0.18, f, ...cuts);
  // ямка желчного пузыря
  g = smoothSubtract(0.05, g, gallbladderField(0.02));
  // вдавления от соседних органов
  g = smoothSubtract(0.3, g, dent(-1.85, -0.35, 0.55, 0.09), dent(-1.0, 0.7, 0.4, 0.07), dent(1.45, 0.3, 0.7, 0.09), dent(-0.2, 0.55, 0.35, 0.06));
  return g;
}

/* ------------------------------ Деление на части ------------------------------ */

const P = {
  /** Плоскость Кантли (средняя печёночная вена): > 0 — левее неё. */
  cantlie: plane([1, -0.1, 0], [-0.62, 0, 0]),
  /** Пупочная щель: > 0 — левый латеральный отдел (II и III). */
  umb: plane([1, 0.05, 0], [0.3, 0, 0]),
  /** Правая печёночная вена: > 0 — передний сектор (V и VIII). */
  rhv: plane([0.54, 0, 0.84], [-0.5, 0, -0.55]),
  /** Плоскость воротной вены (поперечная): > 0 — верхние сегменты (VII и VIII). */
  port: plane([0.04, 1, 0], [0, -0.12, 0]),
  /** Левая печёночная вена: > 0 — сегмент II. */
  lhv: plane([0.35, 0.9, 0.3], [0.5, 0.65, 0]),
  /** Горизонтальное деление сегмента IV: > 0 — IVa. */
  iv: plane([0, 1, 0.12], [0, -0.1, 0]),
};

const CAUDATE = ellipsoid([-0.12, 0.3, -0.55], [0.72, 0.95, 0.55]);
const notCaudate = neg(CAUDATE);

/** Клетки-области сегментов (без тела печени): отрицательные внутри. */
export const SEGMENT_CELLS: Record<SegmentId, Sdf> = {
  'segment-1': CAUDATE,
  'segment-2': maxOf(neg(P.umb), neg(P.lhv), notCaudate),
  'segment-3': maxOf(neg(P.umb), P.lhv, notCaudate),
  'segment-4a': maxOf(P.umb, neg(P.cantlie), neg(P.iv), notCaudate),
  'segment-4b': maxOf(P.umb, neg(P.cantlie), P.iv, notCaudate),
  'segment-5': maxOf(P.cantlie, neg(P.rhv), P.port, notCaudate),
  'segment-6': maxOf(P.cantlie, P.rhv, P.port, notCaudate),
  'segment-7': maxOf(P.cantlie, P.rhv, neg(P.port), notCaudate),
  'segment-8': maxOf(P.cantlie, neg(P.rhv), neg(P.port), notCaudate),
};

export const LOBE_CELLS: Record<LobeId, Sdf> = (() => {
  const by: Record<LobeId, Sdf[]> = { 'right-lobe': [], 'left-lobe': [], 'caudate-lobe': [], 'quadrate-lobe': [] };
  for (const s of SEGMENT_IDS) by[LOBE_OF[s]].push(SEGMENT_CELLS[s]);
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length === 1 ? v[0] : minOf(...v)])) as Record<LobeId, Sdf>;
})();

/** Соседние области чуть перекрываются: между частями не остаётся щелей. */
const OVERLAP = 0.012;

export function partField(body: Sdf, cell: Sdf): Sdf {
  return (x, y, z) => Math.max(body(x, y, z), cell(x, y, z) - OVERLAP);
}

export { maxOf, minOf };
