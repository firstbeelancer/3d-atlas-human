/**
 * Маленькая библиотека неявных поверхностей (SDF) для процедурных зубов.
 * Отрицательное значение — внутри тела, положительное — снаружи, ноль — поверхность.
 */

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Плавная ступенька Эрмита от 0 (v <= a) до 1 (v >= b). */
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Гладкое объединение двух тел (полиномиальный smooth-min) с радиусом сглаживания k. */
export function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}

/** Гладкое пересечение (smooth-max). */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** Гладкий максимум набора значений (log-sum-exp): даёт мягкие борозды между буграми. */
export function softMax(values: ArrayLike<number>, n: number, k: number): number {
  let m = -Infinity;
  for (let i = 0; i < n; i++) if (values[i] > m) m = values[i];
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.exp((values[i] - m) / k);
  return m + k * Math.log(s);
}

/** Детерминированный псевдослучайный шум значений 3D (для губчатой кости и неровностей). */
function hash(ix: number, iy: number, iz: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 0xffff;
}

export function valueNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const c000 = hash(ix, iy, iz);
  const c100 = hash(ix + 1, iy, iz);
  const c010 = hash(ix, iy + 1, iz);
  const c110 = hash(ix + 1, iy + 1, iz);
  const c001 = hash(ix, iy, iz + 1);
  const c101 = hash(ix + 1, iy, iz + 1);
  const c011 = hash(ix, iy + 1, iz + 1);
  const c111 = hash(ix + 1, iy + 1, iz + 1);
  const x00 = c000 + (c100 - c000) * ux;
  const x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux;
  const x11 = c011 + (c111 - c011) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

/** Гироид — трижды периодическая минимальная поверхность; похож на сеть трабекул губчатой кости. */
export function gyroid(x: number, y: number, z: number): number {
  return Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);
}

/** Расстояние от точки до отрезка AB (в 3D). */
export function segDist(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): { d: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const t = clamp01((apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz || 1));
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return { d: Math.sqrt(dx * dx + dy * dy + dz * dz), t };
}
