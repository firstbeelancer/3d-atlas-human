// sdf.js — авторское ядро неявного моделирования (signed distance fields).
// Написано с нуля, без заимствований. Поле: (x,y,z) => расстояние со знаком (внутри < 0).

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------- Примитивы ------------------------------- */

export function sphere(c, r) {
  return (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
}

export function ellipsoid(c, r) {
  const m = Math.min(r[0], r[1], r[2]);
  return (x, y, z) => {
    const k = Math.hypot((x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2]);
    return (k - 1) * m;
  };
}

export function roundBox(c, h, rad) {
  return (x, y, z) => {
    const qx = Math.abs(x - c[0]) - h[0] + rad;
    const qy = Math.abs(y - c[1]) - h[1] + rad;
    const qz = Math.abs(z - c[2]) - h[2] + rad;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - rad;
  };
}

export function capsule(a, b, r) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-9;
  return (x, y, z) => {
    const t = clamp(((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / L2, 0, 1);
    return Math.hypot(x - (a[0] + ab[0] * t), y - (a[1] + ab[1] * t), z - (a[2] + ab[2] * t)) - r;
  };
}

/** Трубка вдоль ломаной с радиусом в каждом узле. Расстояние до отрезков, минимум. */
export function tube(pts, radii) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    segs.push({ a, ab, L2: ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9, r0: radii[i], r1: radii[i + 1] });
  }
  return (x, y, z) => {
    let d = 1e9;
    for (const s of segs) {
      const t = clamp(((x - s.a[0]) * s.ab[0] + (y - s.a[1]) * s.ab[1] + (z - s.a[2]) * s.ab[2]) / s.L2, 0, 1);
      const r = s.r0 + (s.r1 - s.r0) * t;
      const dd = Math.hypot(x - (s.a[0] + s.ab[0] * t), y - (s.a[1] + s.ab[1] * t), z - (s.a[2] + s.ab[2] * t)) - r;
      if (dd < d) d = dd;
    }
    return d;
  };
}

/* ------------------------------- Операции ------------------------------- */

export const union = (...fs) => (x, y, z) => {
  let d = 1e9;
  for (const f of fs) { const v = f(x, y, z); if (v < d) d = v; }
  return d;
};
export const intersect = (...fs) => (x, y, z) => {
  let d = -1e9;
  for (const f of fs) { const v = f(x, y, z); if (v > d) d = v; }
  return d;
};
export const subtract = (a, b) => (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));

function smin(k, da, db) {
  const h = clamp(0.5 + 0.5 * (db - da) / k, 0, 1);
  return db + (da - db) * h - k * h * (1 - h);
}
/** Плавное объединение (метаболлы). */
export const sunion = (k, a, b) => (x, y, z) => smin(k, a(x, y, z), b(x, y, z));
/** Плавное вычитание b из a. */
export const ssub = (k, a, b) => (x, y, z) => -smin(k, -a(x, y, z), b(x, y, z));
/** Оболочка: |поле| - толщина. */
export const shell = (f, t) => (x, y, z) => Math.abs(f(x, y, z)) - t;
export const offset = (f, d) => (x, y, z) => f(x, y, z) - d;

export const translate = (f, d) => (x, y, z) => f(x - d[0], y - d[1], z - d[2]);
export function rotateZ(f, ang, c = [0, 0, 0]) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1];
    return f(c[0] + px * cs + py * sn, c[1] - px * sn + py * cs, z);
  };
}

/** Полупространство: поле > 0 выше поверхности y = h(x,z). */
export const above = (h) => (x, y, z) => y - h(x, z);
export const below = (h) => (x, y, z) => h(x, z) - y;

/* --------------------------------- Шум ---------------------------------- */

function hash2(ix, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}
export function vnoise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm2(x, z, oct = 3) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise2(x * f, z * f); norm += amp; amp *= 0.5; f *= 2.03; }
  return s / norm;
}

/** Кэш высотного поля на сетке с билинейной выборкой — ускоряет SDF слоёв. */
export function heightField(fn, x0, x1, z0, z1, nx, nz) {
  const s = nz + 1;
  const arr = new Float32Array((nx + 1) * s);
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++)
      arr[i * s + j] = fn(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz);
  return (x, z) => {
    const u = clamp((x - x0) / (x1 - x0), 0, 1) * nx;
    const v = clamp((z - z0) / (z1 - z0), 0, 1) * nz;
    const i = Math.min(nx - 1, Math.floor(u)), j = Math.min(nz - 1, Math.floor(v));
    const fu = u - i, fv = v - j;
    const a = arr[i * s + j], b = arr[(i + 1) * s + j], c = arr[i * s + j + 1], d = arr[(i + 1) * s + j + 1];
    return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
  };
}

/** Детерминированный ГПСЧ (mulberry32) — своя реализация. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
