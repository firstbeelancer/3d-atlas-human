/**
 * Неявные поверхности (SDF) наружного носа: единая органическая форма вместо набора отдельных оболочек.
 * Отрицательное значение — внутри тела, положительное — снаружи, ноль — поверхность кожи.
 * Модуль нарочно без зависимостей: те же функции считаются в тестах и при отладке формы.
 * Координаты в мм: +x — влево от пациента, +y — вверх, +z — вперёд (к зрителю).
 */

export type V3 = [number, number, number];

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Гладкое объединение (полиномиальный smooth-min): мягкие органические переходы между формами. */
export function smin(a: number, b: number, k: number): number {
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}
/** Гладкое пересечение / вычитание (smooth-max). */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** Приближённое расстояние до эллипсоида: ноль на поверхности, знак верный. */
export function sdEllipsoid(px: number, py: number, pz: number, c: V3, r: V3): number {
  const x = (px - c[0]) / r[0];
  const y = (py - c[1]) / r[1];
  const z = (pz - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  if (k1 < 1e-9) return -Math.min(r[0], r[1], r[2]);
  return (k0 * (k0 - 1)) / k1;
}

/** Расстояние до отрезка AB и параметр ближайшей точки. */
export function segDist(px: number, py: number, pz: number, a: V3, b: V3): { d: number; t: number } {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const apx = px - a[0];
  const apy = py - a[1];
  const apz = pz - a[2];
  const t = clamp01((apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz || 1));
  return { d: Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t), t };
}

/** Расстояние до ломаной (для борозд и валиков вдоль кривой). */
export function polylineDist(px: number, py: number, pz: number, pts: V3[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const { d } = segDist(px, py, pz, pts[i], pts[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

/** Капсула с эллиптическим сечением: пространство сжимается так, чтобы эллипс стал кругом. */
export function sdEllipticCapsule(px: number, py: number, pz: number, a: V3, b: V3, side: V3, ra: number, rb: number): { d: number; w: number } {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  let dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  const sd = side[0] * dx + side[1] * dy + side[2] * dz;
  let sx = side[0] - dx * sd;
  let sy = side[1] - dy * sd;
  let sz = side[2] - dz * sd;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;
  const fx = dy * sz - dz * sy;
  const fy = dz * sx - dx * sz;
  const fz = dx * sy - dy * sx;
  const apx = px - a[0];
  const apy = py - a[1];
  const apz = pz - a[2];
  const w = apx * dx + apy * dy + apz * dz;
  const r = Math.min(ra, rb);
  const u = (apx * sx + apy * sy + apz * sz) * (r / ra);
  const v = (apx * fx + apy * fy + apz * fz) * (r / rb);
  const wc = clamp01(w / len) * len;
  return { d: Math.hypot(u, v, w - wc) - r, w };
}

/* ---------- Лицо-ориентир: та же поверхность, что и у призрачной маски ---------- */

const bump = (x: number, c: number, w: number) => {
  const t = Math.abs(x - c) / w;
  return t >= 1 ? 0 : (1 - t * t) * (1 - t * t);
};

/** Аппроксимация поверхности лица (мм): надбровья, глазницы, скулы, верхняя губа. */
export function faceZ(x: number, y: number): number {
  const ax = Math.abs(x);
  let z = 17 - 0.0085 * x * x - (y > 18 ? 0.0026 : 0.0009) * (y - 18) * (y - 18);
  z += 3.2 * bump(y, 40, 12) * bump(ax, 26, 30);
  z -= 7.5 * bump(ax, 30, 16) * bump(y, 28, 13);
  z += 3.0 * bump(ax, 44, 16) * bump(y, 6, 18);
  z += 10 * bump(ax, 0, 24) * bump(y, -28, 20);
  z += 2.2 * bump(ax, 0, 14) * bump(y, -47, 9);
  z -= 0.9 * bump(ax, 0, 3.5) * bump(y, -33, 8);
  return z;
}

/* ---------- Наружный нос ---------- */

/** Станции спинки: эллипсоиды от корня к кончику, сливаются в единую спинку. */
const BRIDGE: { c: V3; r: V3 }[] = [
  { c: [0, 38, 11.5], r: [4.8, 7.0, 4.5] },
  { c: [0, 31, 13.5], r: [5.4, 8.0, 5.5] },
  { c: [0, 24, 18.5], r: [6.0, 8.0, 7.5] },
  { c: [0, 17, 22.5], r: [6.6, 8.0, 8.5] },
  { c: [0, 10, 26.0], r: [7.4, 8.0, 9.5] },
  { c: [0, 3, 29.0], r: [8.4, 8.0, 10.0] },
  { c: [0, -3, 33.5], r: [9.4, 7.5, 10.5] },
];

const TIP: { c: V3; r: V3 } = { c: [0, -7.5, 38.5], r: [8.0, 6.6, 7.6] };
const DOMES: { c: V3; r: V3 }[] = [
  { c: [3.2, -6.8, 40.0], r: [4.5, 4.1, 4.6] },
  { c: [-3.2, -6.8, 40.0], r: [4.5, 4.1, 4.6] },
];
const INFRATIP: { c: V3; r: V3 } = { c: [0, -11.5, 36.5], r: [5.4, 3.8, 4.6] };

/** Крылья носа: цепочка долек от кончика к основанию крыла (для одной стороны). */
const ALA: { c: V3; r: V3 }[] = [
  { c: [7.6, -10.5, 37.5], r: [4.3, 4.6, 4.6] },
  { c: [11.6, -12.5, 33.5], r: [4.7, 5.1, 5.1] },
  { c: [14.6, -15.0, 28.5], r: [4.3, 5.2, 5.0] },
  { c: [15.4, -18.0, 24.5], r: [3.6, 4.4, 4.4] },
];

const COLUMELLA_A: V3 = [0, -10.5, 38.5];
const COLUMELLA_B: V3 = [0, -19.5, 29.0];

/** Ноздря: ось преддверия и полуоси овального отверстия (для стороны s). */
export function nostrilFrame(s: 1 | -1): { a: V3; b: V3; side: V3; ra: number; rb: number } {
  return { a: [s * 6.9, -23.5, 33.0], b: [s * 5.7, -8.5, 26.0], side: [1, 0, 0], ra: 3.1, rb: 4.8 };
}

/** Расстояние до канала ноздри и положение вдоль оси (мм от основания). */
export function nostrilDist(px: number, py: number, pz: number, s: 1 | -1): { d: number; w: number } {
  const f = nostrilFrame(s);
  return sdEllipticCapsule(px, py, pz, f.a, f.b, f.side, f.ra, f.rb);
}

/** Точка на стенке канала ноздри: w — вдоль оси от основания (мм), theta — угол по овалу. */
export function nostrilWallPoint(s: 1 | -1, w: number, theta: number): V3 {
  const f = nostrilFrame(s);
  let dx = f.b[0] - f.a[0];
  let dy = f.b[1] - f.a[1];
  let dz = f.b[2] - f.a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  const sd = f.side[0] * dx + f.side[1] * dy + f.side[2] * dz;
  let sx = f.side[0] - dx * sd;
  let sy = f.side[1] - dy * sd;
  let sz = f.side[2] - dz * sd;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;
  const fx = dy * sz - dz * sy;
  const fy = dz * sx - dx * sz;
  const fz = dx * sy - dy * sx;
  const c = Math.cos(theta) * f.ra;
  const sn = Math.sin(theta) * f.rb;
  return [f.a[0] + dx * w + sx * c + fx * sn, f.a[1] + dy * w + sy * c + fy * sn, f.a[2] + dz * w + sz * c + fz * sn];
}

/** Крыльная борозда: линия между крылом, кончиком и щекой (для стороны s). */
export function alarGroove(s: 1 | -1): V3[] {
  return [
    [s * 8.6, -6.0, 40.0],
    [s * 12.6, -8.0, 36.0],
    [s * 15.6, -11.5, 30.5],
    [s * 16.9, -16.0, 25.5],
    [s * 15.6, -20.5, 21.5],
  ];
}

/** Единая поверхность наружного носа: спинка, кончик с дольками, крылья, колумелла, ноздри. */
export function externalField(px: number, py: number, pz: number): number {
  let d = Infinity;
  for (const b of BRIDGE) d = smin(d, sdEllipsoid(px, py, pz, b.c, b.r), 4.5);
  d = smin(d, sdEllipsoid(px, py, pz, TIP.c, TIP.r), 3.5);
  for (const dome of DOMES) d = smin(d, sdEllipsoid(px, py, pz, dome.c, dome.r), 3.0);
  d = smin(d, sdEllipsoid(px, py, pz, INFRATIP.c, INFRATIP.r), 3.0);
  for (const s of [1, -1] as const) {
    let ala = Infinity;
    for (const a of ALA) ala = smin(ala, sdEllipsoid(px, py, pz, [s * a.c[0], a.c[1], a.c[2]], a.r), 2.8);
    d = smin(d, ala, 2.4);
  }
  const col = sdEllipticCapsule(px, py, pz, COLUMELLA_A, COLUMELLA_B, [1, 0, 0], 2.4, 2.9);
  d = smin(d, col.d, 2.2);
  // ноздри: настоящие отверстия с глубиной (преддверие), а не тёмные пятна
  for (const s of [1, -1] as const) {
    const n = nostrilDist(px, py, pz, s);
    d = smax(d, -n.d, 1.1);
  }
  // крыльная борозда отделяет крыло от кончика и щеки
  for (const s of [1, -1] as const) {
    const g = polylineDist(px, py, pz, alarGroove(s)) - 1.35;
    d = smax(d, -g, 0.9);
  }
  // междольковая бороздка кончика и лёгкая супратипальная выемка
  const cleft = segDist(px, py, pz, [0, -12.5, 45.5], [0, -5.5, 46.5]).d - 1.0;
  d = smax(d, -cleft, 0.7);
  const supratip = sdEllipsoid(px, py, pz, [0, -0.5, 42.9], [6.0, 1.2, 2.2]);
  d = smax(d, -supratip, 1.4);
  // стык с лицом: нос заканчивается точно на поверхности маски
  d = smax(d, faceZ(px, py) - 2.2 - pz, 1.6);
  return d;
}

/** Область наружного носа для разделения единой сетки на части (по положению точки). */
export function externalPart(px: number, py: number, pz: number): string {
  for (const s of [1, -1] as const) {
    const n = nostrilDist(px, py, pz, s);
    if (n.d < 0.5 && n.w > 5.0) return 'vestibule';
    if (n.d < 2.2 && n.w <= 5.0 && py < -15) return 'nostrils';
  }
  if (Math.abs(px) <= 4.9 && py <= -10 && pz <= 39.5) return 'columella';
  if (Math.abs(px) >= 8.3 && py <= -3.5) return px > 0 ? 'ala-left' : 'ala-right';
  if (py <= -2.5) return 'nasal-tip';
  if (py <= 20) return 'nasal-dorsum';
  return 'nasal-root';
}

/** Лёгкий румянец кончика и крыльев, запечённый в цвет вершин (множитель к текстуре кожи). */
export function skinTint(px: number, py: number, pz: number): V3 {
  const tip = bump(py, -9, 12) * bump(pz, 40, 14);
  const ala = bump(Math.abs(px), 13, 8) * bump(py, -14, 10);
  const k = clamp01(0.55 * tip + 0.5 * ala);
  return [1 + 0.05 * k, 1 - 0.055 * k, 1 - 0.075 * k];
}

/** Габарит сетки наружного носа (мм) с запасом под сглаживание. */
export const EXTERNAL_BOX = { min: [-23, -27, 8] as V3, max: [23, 47, 50] as V3 };
