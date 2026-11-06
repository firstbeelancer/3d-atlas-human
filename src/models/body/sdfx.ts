import { bounded, ellipsoid, type Sdf, type V3 } from '../skeleton/sdf';

/*
  Расширения набора функций расстояния для модели тела на главной:
  эллиптические трубки переменного сечения (конечности, шея, сосуды), поперечный «лофт» торса,
  шум для борозд и извилин, пересечения и сдвиги. Координаты — дециметры, как в skeleton/anatomy.ts.
*/

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Эллипсоид с ускоряющей коробкой. */
export function E(c: V3, r: V3, margin = 0.5): Sdf {
  return bounded(
    ellipsoid(c, r),
    [c[0] - r[0], c[1] - r[1], c[2] - r[2]],
    [c[0] + r[0], c[1] + r[1], c[2] + r[2]],
    margin,
  );
}

/** Эллипсоид, повёрнутый на углы Эйлера (XYZ) вокруг своего центра. */
export function Er(c: V3, r: V3, rot: V3, margin = 0.5): Sdf {
  const [ax, ay, az] = rot;
  const cx = Math.cos(-ax), sx = Math.sin(-ax);
  const cy = Math.cos(-ay), sy = Math.sin(-ay);
  const cz = Math.cos(-az), sz = Math.sin(-az);
  const m = Math.max(r[0], r[1], r[2]);
  const base = ellipsoid([0, 0, 0], r);
  const f: Sdf = (x, y, z) => {
    let px = x - c[0];
    let py = y - c[1];
    let pz = z - c[2];
    // обратный поворот: Z, затем Y, затем X (порядок XYZ у three)
    let t = px * cz - py * sz;
    py = px * sz + py * cz;
    px = t;
    t = px * cy + pz * sy;
    pz = -px * sy + pz * cy;
    px = t;
    t = py * cx - pz * sx;
    pz = py * sx + pz * cx;
    py = t;
    return base(px, py, pz);
  };
  return bounded(f, [c[0] - m, c[1] - m, c[2] - m], [c[0] + m, c[1] + m, c[2] + m], margin);
}

/**
 * Трубка с эллиптическим сечением по ломаной: rx — полуширина по x, rz — по z в каждой точке.
 * Концы скруглены. Подходит для конечностей, шеи, сосудов и протоков.
 */
export function eTube(pts: V3[], rx: number[], rz: number[], margin = 0.5): Sdf {
  const n = pts.length - 1;
  let rmax = 0;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i <= n; i++) {
    rmax = Math.max(rmax, rx[i], rz[i]);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pts[i][k]);
      max[k] = Math.max(max[k], pts[i][k]);
    }
  }
  const lo: V3 = [min[0] - rmax, min[1] - rmax, min[2] - rmax];
  const hi: V3 = [max[0] + rmax, max[1] + rmax, max[2] + rmax];
  const segs = [] as { a: V3; bx: number; by: number; bz: number; l2: number; i: number }[];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const bx = b[0] - a[0];
    const by = b[1] - a[1];
    const bz = b[2] - a[2];
    segs.push({ a, bx, by, bz, l2: bx * bx + by * by + bz * bz || 1e-6, i });
  }
  const f: Sdf = (x, y, z) => {
    let best = Infinity;
    for (const s of segs) {
      const t = clamp(((x - s.a[0]) * s.bx + (y - s.a[1]) * s.by + (z - s.a[2]) * s.bz) / s.l2, 0, 1);
      const px = x - (s.a[0] + s.bx * t);
      const py = y - (s.a[1] + s.by * t);
      const pz = z - (s.a[2] + s.bz * t);
      const sx = rx[s.i] + (rx[s.i + 1] - rx[s.i]) * t;
      const sz = rz[s.i] + (rz[s.i + 1] - rz[s.i]) * t;
      const sy = (sx + sz) * 0.5;
      const qx = px / sx;
      const qy = py / sy;
      const qz = pz / sz;
      const q = Math.sqrt(qx * qx + qy * qy + qz * qz);
      const d = (q - 1) * Math.min(sx, sy, sz);
      if (d < best) best = d;
    }
    return best;
  };
  return bounded(f, lo, hi, margin);
}

/** Круглая трубка по ломаной с радиусом в каждой точке (тонкие сосуды, нервы). */
export function rTube(pts: V3[], r: number[], margin = 0.3): Sdf {
  return eTube(pts, r, r, margin);
}

/** Гладкая кусочная интерполяция (Catmull-Rom по неравномерным узлам). */
export function spline1(xs: number[], vs: number[]): (x: number) => number {
  const n = xs.length;
  const tang = vs.map((_, i) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    return (vs[b] - vs[a]) / (xs[b] - xs[a] || 1);
  });
  return (x) => {
    if (x <= xs[0]) return vs[0];
    if (x >= xs[n - 1]) return vs[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * vs[i] +
      (t3 - 2 * t2 + t) * h * tang[i] +
      (-2 * t3 + 3 * t2) * vs[i + 1] +
      (t3 - t2) * h * tang[i + 1]
    );
  };
}

export interface LoftProfile {
  y: number[];
  /** полуширина */
  w: number[];
  /** передняя граница по z */
  zf: number[];
  /** задняя граница по z (отрицательная) */
  zb: number[];
  /** показатель суперэллипса: 2 — эллипс, больше — «квадратнее» */
  n: number[];
  /** сдвиг центра по x (для несимметричных органов) */
  cx?: number[];
}

/** Тело вращения-подобная форма: сечение — суперэллипс, меняющийся по высоте y. */
export function loft(p: LoftProfile): Sdf {
  const w = spline1(p.y, p.w);
  const zf = spline1(p.y, p.zf);
  const zb = spline1(p.y, p.zb);
  const nn = spline1(p.y, p.n);
  const cxf = p.cx ? spline1(p.y, p.cx) : () => 0;
  const y0 = p.y[0];
  const y1 = p.y[p.y.length - 1];
  const wmax = Math.max(...p.w);
  const zmin = Math.min(...p.zb);
  const zmax = Math.max(...p.zf);
  const f: Sdf = (x, y, z) => {
    const yy = clamp(y, y0, y1);
    const ww = w(yy);
    const f1 = zf(yy);
    const b1 = zb(yy);
    const zc = (f1 + b1) * 0.5;
    const dz = z - zc;
    const hh = dz >= 0 ? f1 - zc : zc - b1;
    const n = nn(yy);
    const ax = Math.abs(x - cxf(yy)) / ww;
    const az = Math.abs(dz) / hh;
    const q = Math.pow(Math.pow(ax, n) + Math.pow(az, n), 1 / n);
    const dr = (q - 1) * Math.min(ww, hh) * 0.95;
    const dv = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
    return dv > 0 ? Math.sqrt(Math.max(dr, 0) ** 2 + dv * dv) : dr;
  };
  return bounded(f, [-wmax - 0.5, y0 - 0.5, zmin - 0.5], [wmax + 0.5, y1 + 0.5, zmax + 0.5], 0.6);
}

/** Пересечение с полупространством y > y0 (плоская подошва, срез снизу). */
export function above(f: Sdf, y0: number): Sdf {
  return (x, y, z) => Math.max(f(x, y, z), y0 - y);
}

/** Пересечение с полупространством, заданным нормалью n и точкой p: остаётся сторона n·(x−p) < 0. */
export function cutPlane(f: Sdf, p: V3, n: V3): Sdf {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const nx = n[0] / l;
  const ny = n[1] / l;
  const nz = n[2] / l;
  return (x, y, z) => Math.max(f(x, y, z), (x - p[0]) * nx + (y - p[1]) * ny + (z - p[2]) * nz);
}

/** Тонкая плоская щель (толщина 2t) с мягким краем: вычитается из органа для борозд и щелей. */
export function slab(p: V3, n: V3, t: number, reach: V3, rr: number): Sdf {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const nx = n[0] / l;
  const ny = n[1] / l;
  const nz = n[2] / l;
  const e = ellipsoid(reach, [rr, rr, rr]);
  return (x, y, z) => {
    const d = Math.abs((x - p[0]) * nx + (y - p[1]) * ny + (z - p[2]) * nz) - t;
    return Math.max(d, e(x, y, z));
  };
}

/** Сдвиг поля. */
export function shift(f: Sdf, d: V3): Sdf {
  return (x, y, z) => f(x - d[0], y - d[1], z - d[2]);
}

/** Масштаб поля относительно точки. */
export function scaleAbout(f: Sdf, c: V3, s: V3): Sdf {
  const k = Math.min(s[0], s[1], s[2]);
  return (x, y, z) => f(c[0] + (x - c[0]) / s[0], c[1] + (y - c[1]) / s[1], c[2] + (z - c[2]) / s[2]) * k;
}

/** Искривление: центр сечения сдвигается вдоль x по параболе от y (для изогнутых органов). */
export function bendX(f: Sdf, y0: number, k: number): Sdf {
  return (x, y, z) => f(x - k * (y - y0) * (y - y0), y, z);
}

/** Зеркальная пара относительно плоскости x = 0. */
export function mirrored(f: Sdf): Sdf {
  return (x, y, z) => f(Math.abs(x), y, z);
}

/* ---------------- Шум ---------------- */

function hash(ix: number, iy: number, iz: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 0xffff;
}

/** Значимый шум (value noise) 0..1 с плавной интерполяцией. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v),
    w,
  );
}

/** Гребни шума: 0 в «ложбинах» и 1 на вершинах; из них растут извилины. */
export function ridge(x: number, y: number, z: number, freq: number): number {
  const a = 1 - Math.abs(noise3(x * freq, y * freq, z * freq) * 2 - 1);
  const b = 1 - Math.abs(noise3(x * freq * 2.1 + 17.3, y * freq * 2.1 + 3.1, z * freq * 2.1 + 9.7) * 2 - 1);
  return a * 0.75 + b * 0.25;
}

/** Добавляет мелкий рельеф к полю (складки, дольки): поверхность смещается на amp·(гребни − 1/2). */
export function textured(f: Sdf, freq: number, amp: number, margin = 0.2): Sdf {
  return (x, y, z) => {
    const d = f(x, y, z);
    if (d > margin || d < -margin * 2) return d;
    return d - amp * (ridge(x, y, z, freq) - 0.5) * 2;
  };
}

/** Борозды: узкие канавки вдоль линий шума, между ними — широкие гладкие валики (мозг). */
export function grooved(f: Sdf, freq: number, depth: number, sharp = 6, margin = 0.2): Sdf {
  return (x, y, z) => {
    const d = f(x, y, z);
    if (d > margin || d < -margin * 3) return d;
    return d + depth * Math.pow(ridge(x, y, z, freq), sharp);
  };
}

/** Низкочастотное «дрожание» поверхности, чтобы органы не выглядели вылепленными из эллипсоидов. */
export function wobble(f: Sdf, freq: number, amp: number, margin = 0.3): Sdf {
  return (x, y, z) => {
    const d = f(x, y, z);
    if (d > margin || d < -margin * 2) return d;
    return d + amp * (noise3(x * freq, y * freq, z * freq) - 0.5) * 2;
  };
}
