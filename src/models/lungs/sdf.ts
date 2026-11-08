/* Небольшая математика для полей расстояний и деревьев: без three.js, чтобы считать в фоновом потоке. */

export type V3 = [number, number, number];

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Гладкий минимум (объединение тел со скруглением шва). */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Гладкий максимум (пересечение тел со скруглением ребра). */
export function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** Расстояние до эллипсоида (приближённое, с верным знаком). */
export function sdEllipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number): number {
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

/** Расстояние до отрезка минус радиус (капсула). */
export function sdSegment(px: number, py: number, pz: number, a: V3, b: V3, r: number): number {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const l2 = bax * bax + bay * bay + baz * baz || 1e-9;
  const h = clamp((pax * bax + pay * bay + paz * baz) / l2, 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

/** Ломаная-капсула: минимум по звеньям. */
export function sdPath(px: number, py: number, pz: number, pts: V3[], r: number): number {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const v = sdSegment(px, py, pz, pts[i], pts[i + 1], r);
    if (v < d) d = v;
  }
  return d;
}

/** Детерминированный генератор: модель одинакова при каждой загрузке. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function norm(a: V3): V3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Любой вектор, перпендикулярный данному. */
export function anyPerp(d: V3): V3 {
  const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm(cross(d, ref));
}

/** Кривая Катмулла — Рома через точки, равномерная выборка. */
export function catmull(pts: V3[], samples: number): V3[] {
  if (pts.length < 3) {
    const out: V3[] = [];
    for (let i = 0; i <= samples; i++) out.push(lerp3(pts[0], pts[pts.length - 1], i / samples));
    return out;
  }
  const out: V3[] = [];
  const n = pts.length - 1;
  for (let i = 0; i <= samples; i++) {
    const f = (i / samples) * n;
    const s = Math.min(Math.floor(f), n - 1);
    const t = f - s;
    const p0 = pts[Math.max(s - 1, 0)], p1 = pts[s], p2 = pts[s + 1], p3 = pts[Math.min(s + 2, n)];
    const t2 = t * t, t3 = t2 * t;
    const c = (k: 0 | 1 | 2) =>
      0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    out.push([c(0), c(1), c(2)]);
  }
  return out;
}

/** Ближайшая точка ломаной и её доля длины. */
export function nearestOnPath(pts: V3[], p: V3): { point: V3; t: number } {
  let best = 1e9;
  let bp: V3 = pts[0];
  let bt = 0;
  const total = pts.slice(1).reduce((s, q, i) => s + dist(q, pts[i]), 0) || 1;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ab = sub(b, a);
    const l2 = dot(ab, ab) || 1e-9;
    const h = clamp(dot(sub(p, a), ab) / l2, 0, 1);
    const q = add(a, scale(ab, h));
    const d = dist(q, p);
    if (d < best) {
      best = d;
      bp = q;
      bt = (acc + Math.sqrt(l2) * h) / total;
    }
    acc += Math.sqrt(l2);
  }
  return { point: bp, t: bt };
}
