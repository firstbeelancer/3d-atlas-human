/*
  Поля расстояний (SDF) для всех плотных структур мозга. Единицы — миллиметры.
  Система координат: +x — вправо от человека, +y — вверх, +z — вперёд (к лбу). Начало — середина мозга.
  Из одних и тех же функций строятся и поверхности (Surface Nets), и объёмные срезы,
  поэтому разрез точно совпадает с формой снаружи.
*/

// ---------- шум ----------
const P = new Uint8Array(512);
(() => {
  let s = 1337;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
})();

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function grad(h: number, x: number, y: number, z: number): number {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** Шум Перлина 3D, значения примерно от -1 до 1. */
export function noise3(x: number, y: number, z: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const X = fx & 255;
  const Y = fy & 255;
  const Z = fz & 255;
  x -= fx;
  y -= fy;
  z -= fz;
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = P[X] + Y;
  const AA = P[A] + Z;
  const AB = P[A + 1] + Z;
  const B = P[X + 1] + Y;
  const BA = P[B] + Z;
  const BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(P[AA] & 15, x, y, z), grad(P[BA] & 15, x - 1, y, z), u), lerp(grad(P[AB] & 15, x, y - 1, z), grad(P[BB] & 15, x - 1, y - 1, z), u), v),
    lerp(
      lerp(grad(P[AA + 1] & 15, x, y, z - 1), grad(P[BA + 1] & 15, x - 1, y, z - 1), u),
      lerp(grad(P[AB + 1] & 15, x, y - 1, z - 1), grad(P[BB + 1] & 15, x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
}

// ---------- примитивы ----------
export function ell(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const px = (x - cx) / rx;
  const py = (y - cy) / ry;
  const pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx;
  const qy = py / ry;
  const qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

export const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k);
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Трубка вдоль ломаной с меняющимся радиусом. pts — плоский массив x,y,z; r — радиусы в узлах; ax — растяжение по x (плоские пучки). */
export interface Tube {
  pts: Float64Array;
  r: Float64Array;
  ax: number;
}
export function makeTube(points: number[][], ax = 1): Tube {
  const pts = new Float64Array(points.length * 3);
  const r = new Float64Array(points.length);
  points.forEach((p, i) => {
    pts[i * 3] = p[0] / ax;
    pts[i * 3 + 1] = p[1];
    pts[i * 3 + 2] = p[2];
    r[i] = p[3];
  });
  return { pts, r, ax };
}
export function tubeD(t: Tube, x: number, y: number, z: number): number {
  const { pts, r } = t;
  x /= t.ax;
  let best = 1e9;
  const n = r.length;
  for (let i = 0; i < n - 1; i++) {
    const ax = pts[i * 3];
    const ay = pts[i * 3 + 1];
    const az = pts[i * 3 + 2];
    const bx = pts[i * 3 + 3] - ax;
    const by = pts[i * 3 + 4] - ay;
    const bz = pts[i * 3 + 5] - az;
    const px = x - ax;
    const py = y - ay;
    const pz = z - az;
    const l2 = bx * bx + by * by + bz * bz;
    let h = l2 > 0 ? (px * bx + py * by + pz * bz) / l2 : 0;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = px - bx * h;
    const dy = py - by * h;
    const dz = pz - bz * h;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - (r[i] + (r[i + 1] - r[i]) * h);
    if (d < best) best = d;
  }
  return best;
}

// ---------- большие полушария ----------
/** Центр «направлений» полушария: от него считаются борозды. */
const CH = [36, 4, -6];

/** Гладкая форма полушария без извилин (в координатах lx = сторона * x, внутри lx > 0). */
export function baseHemi(lx: number, y: number, z: number): number {
  // сзади мозг шире и выше, спереди уже
  const s = sstep(-30, 24, z);
  const rx = lerp(75, 63, s);
  const ry = lerp(48, 43, s);
  // сверху мозг уже, чем в средней части: форма купола
  const dome = 1 - 0.24 * sstep(4, 52, y);
  const dM = ell(lx / dome, y, z, 0, 8, -6, rx, ry, z > -6 ? 88 : 80) * dome;
  const dT = ell(lx, y, z, 49, -27, -2, 21, 19, 50);
  let d = smin(dM, dT, 12);
  // нижне-медиальная выемка под ствол мозга и межуточный мозг
  d = smax(d, -ell(lx, y, z, 0, -27, -10, 18, 22, 33), 6);
  // плоская медиальная стенка (продольная щель)
  return smax(d, 0.8 - lx, 1.2);
}

/** Край гладкой формы по лучу из центра: расстояние от CH до поверхности по направлению. */
function rayHemi(dx: number, dy: number, dz: number): number {
  let lo = 4;
  let hi = 170;
  for (let i = 0; i < 28; i++) {
    const m = (lo + hi) / 2;
    if (baseHemi(CH[0] + dx * m, CH[1] + dy * m, CH[2] + dz * m) < 0) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

type CurvePoint = ['L' | 'T' | 'M', number, number];

/** Борозда: ломаная в пространстве направлений от центра полушария. */
interface Curve {
  pts: Float64Array; // единичные векторы
  n: number;
  cx: number;
  cy: number;
  cz: number;
  cosR: number;
  depth: number;
  width: number;
}

function surfacePoint(p: CurvePoint): number[] {
  const [kind, a, b] = p;
  if (kind === 'M') return [0.8, a, b];
  if (kind === 'L') {
    // поверхность сбоку: идём по x с большого значения внутрь
    let hi = 130;
    while (hi > 1 && baseHemi(hi, a, b) > 0) hi -= 2;
    let lo = hi;
    hi += 2;
    for (let i = 0; i < 20; i++) {
      const m = (lo + hi) / 2;
      if (baseHemi(m, a, b) < 0) lo = m;
      else hi = m;
    }
    return [lo, a, b];
  }
  // T: поверхность сверху по (x, z)
  let hi = 130;
  while (hi > -60 && baseHemi(a, hi, b) > 0) hi -= 2;
  let lo = hi;
  hi += 2;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (baseHemi(a, m, b) < 0) lo = m;
    else hi = m;
  }
  return [a, lo, b];
}

function makeCurve(points: CurvePoint[], depth: number, width: number, sub = 4): Curve {
  const raw = points.map(surfacePoint).map((p) => {
    const v = [p[0] - CH[0], p[1] - CH[1], p[2] - CH[2]];
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  const out: number[][] = [];
  for (let i = 0; i < raw.length - 1; i++)
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const v = [lerp(raw[i][0], raw[i + 1][0], t), lerp(raw[i][1], raw[i + 1][1], t), lerp(raw[i][2], raw[i + 1][2], t)];
      const l = Math.hypot(v[0], v[1], v[2]);
      out.push([v[0] / l, v[1] / l, v[2] / l]);
    }
  out.push(raw[raw.length - 1]);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  out.forEach((v) => {
    cx += v[0];
    cy += v[1];
    cz += v[2];
  });
  const l = Math.hypot(cx, cy, cz);
  cx /= l;
  cy /= l;
  cz /= l;
  let minDot = 1;
  out.forEach((v) => (minDot = Math.min(minDot, v[0] * cx + v[1] * cy + v[2] * cz)));
  const ang = Math.acos(Math.max(-1, minDot)) + (width * 4) / 50;
  const pts = new Float64Array(out.length * 3);
  out.forEach((v, i) => pts.set(v, i * 3));
  return { pts, n: out.length, cx, cy, cz, cosR: Math.cos(Math.min(Math.PI, ang)), depth, width };
}

const RREF = 52;
function curveDist(c: Curve, dx: number, dy: number, dz: number): number {
  if (dx * c.cx + dy * c.cy + dz * c.cz < c.cosR) return 1e3;
  const { pts, n } = c;
  let best = 1e9;
  for (let i = 0; i < n - 1; i++) {
    const ax = pts[i * 3];
    const ay = pts[i * 3 + 1];
    const az = pts[i * 3 + 2];
    const bx = pts[i * 3 + 3] - ax;
    const by = pts[i * 3 + 4] - ay;
    const bz = pts[i * 3 + 5] - az;
    const px = dx - ax;
    const py = dy - ay;
    const pz = dz - az;
    const l2 = bx * bx + by * by + bz * bz;
    let h = l2 > 0 ? (px * bx + py * by + pz * bz) / l2 : 0;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const ex = px - bx * h;
    const ey = py - by * h;
    const ez = pz - bz * h;
    const d = ex * ex + ey * ey + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best) * RREF;
}

/** Высота верхней границы мозолистого тела по z — для медиальных ориентиров. */
export const ccY = (z: number) => 29 - 0.0095 * z * z + 3;
/** Сильвиева борозда в боковой проекции: высота линии по z. */
export const sylvY = (z: number) => -3 - 0.5 * z;
/** Центральная борозда: z по высоте. */
export const centralZ = (y: number) => 14.4 - 0.444 * y;

const range = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

const CURVES: Record<string, Curve> = {};
const centralPts: CurvePoint[] = [
  ['T', 3, -15],
  ['T', 12, -11],
  ['T', 24, -5],
  ['L', 44, -1],
  ['L', 32, 2],
  ['L', 21, 5],
  ['L', 13, 8],
];
function buildCurves() {
  if (Object.keys(CURVES).length) return;
  CURVES.central = makeCurve(centralPts, 12, 1.5);
  CURVES.precentral = makeCurve(centralPts.map(([k, a, b]) => [k, a, b + 14] as CurvePoint), 7, 1.3);
  CURVES.postcentral = makeCurve(centralPts.map(([k, a, b]) => [k, a, b - 14] as CurvePoint), 7, 1.3);
  CURVES.sylvian = makeCurve(
    [36, 26, 14, 2, -12, -26, -40, -52].map((z) => ['L', sylvY(z), z] as CurvePoint),
    17,
    3.2,
  );
  CURVES.sts = makeCurve(
    [30, 16, 2, -12, -26, -40, -50].map((z) => ['L', sylvY(z) - 11, z] as CurvePoint),
    6,
    1.4,
  );
  CURVES.sfs = makeCurve([['T', 14, 66], ['T', 13, 50], ['T', 13, 34], ['T', 15, 20]], 6, 1.3);
  CURVES.ifs = makeCurve([['L', 20, 60], ['L', 20, 46], ['L', 21, 32], ['L', 27, 20]], 6, 1.3);
  CURVES.ips = makeCurve([['T', 26, -18], ['T', 25, -32], ['T', 20, -48], ['T', 13, -62]], 6, 1.3);
  CURVES.pos = makeCurve([['M', 46, -49], ['M', 36, -51], ['M', 24, -54], ['M', 10, -58], ['M', 2, -60]], 9, 1.6);
  CURVES.calcarine = makeCurve([['M', 2, -60], ['M', 2, -70], ['M', 4, -82]], 6, 1.5);
  CURVES.cingulate = makeCurve(
    range(46, -46, 12).map((z) => ['M', ccY(z) + 17, z] as CurvePoint),
    6,
    1.6,
  );
}
buildCurves();

/** Расстояние в мм от точки (в координатах полушария) до борозды; для ориентиров зон. */
export function sulcusDist(name: string, lx: number, y: number, z: number): number {
  const dx = lx - CH[0];
  const dy = y - CH[1];
  const dz = z - CH[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  return curveDist(CURVES[name], dx / l, dy / l, dz / l);
}

const CARVE = ['central', 'precentral', 'postcentral', 'sylvian', 'sts', 'sfs', 'ifs', 'ips', 'pos', 'calcarine', 'cingulate'];

/** Углубление поверхности (мм): борозды и извилины. Положительное значение — поверхность уходит внутрь. */
function wrinkle(lx: number, y: number, z: number, side: number, d0: number): number {
  let w = 0;
  if (d0 > -7 && d0 < 5) {
    const ox = side * 7.3;
    const wx = 0.55 * noise3(lx / 31 + 5 + ox, y / 31, z / 31);
    const wy = 0.55 * noise3(lx / 31, y / 31 + 9, z / 31 + 2);
    const wz = 0.55 * noise3(lx / 31 + 3, y / 31, z / 31 + 8 - ox);
    const n1 = noise3(lx / 12 + wx + ox, y / 12 + wy, z / 12 + wz);
    const amp = 4.4 + 1.6 * noise3(lx / 55 + 2, y / 55 + ox, z / 55);
    const g1 = Math.exp(-((n1 / 0.085) * (n1 / 0.085)));
    const n2 = noise3(lx / 6.4 + 17 + wy * 1.5, y / 6.4 + wz * 1.5, z / 6.4 + wx * 1.5 + ox);
    const g2 = Math.exp(-((n2 / 0.075) * (n2 / 0.075)));
    w = amp * g1 + 2.4 * g2 * (1 - 0.7 * g1);
    // на медиальной стенке складок поменьше
    if (lx < 4) w *= 0.45 + 0.1 * lx;
  }
  if (d0 > -28 && d0 < 6) {
    const dx = lx - CH[0];
    const dy = y - CH[1];
    const dz = z - CH[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const uz = dz / l;
    for (const name of CARVE) {
      const c = CURVES[name];
      const dist = curveDist(c, ux, uy, uz);
      if (dist > c.width * 3.4) continue;
      const g = Math.exp(-((dist / c.width) * (dist / c.width)));
      const v = c.depth * g;
      w = w > v ? w + v * 0.18 * (1 - w / (c.depth + 4)) : v + w * 0.2;
    }
  }
  return w;
}

/** Поле полушария. side = +1 — правое, -1 — левое. Координаты — настоящие (x со знаком). */
export function hemiField(x: number, y: number, z: number, side: number): number {
  const lx = side * x;
  const d0 = baseHemi(lx, y, z);
  if (d0 > 6 || d0 < -30) return d0;
  return d0 + wrinkle(lx, y, z, side, d0);
}

// ---------- доли и зоны ----------
export const LOBES = ['frontal-lobe', 'parietal-lobe', 'temporal-lobe', 'occipital-lobe', 'insula'] as const;
export const ZONE_BITS = [
  'motor-cortex',
  'sensory-cortex',
  'prefrontal-cortex',
  'broca-area',
  'wernicke-area',
  'auditory-cortex',
  'visual-cortex',
  'cingulate-gyrus',
  'central-sulcus',
  'lateral-sulcus',
  'longitudinal-fissure',
] as const;

/** Доля по месту на поверхности полушария (lx — расстояние от средней линии). */
export function lobeAt(lx: number, y: number, z: number): number {
  const depth = -baseHemi(lx, y, z);
  const ys = sylvY(z);
  if (depth > 6.5 && Math.abs(y - ys) < 14 && z > -24 && z < 32 && lx > 22) return 4;
  if (z < -48 + 0.15 * y) return 3;
  if (y < ys - 2 && z < 50 && z > -55 && (z < 22 || lx > 34)) return 2;
  return z > centralZ(y) ? 0 : 1;
}

/** Битовая маска функциональных зон для точки полушария. */
export function zonesAt(lx: number, y: number, z: number, side: number): number {
  let m = 0;
  const depth = -baseHemi(lx, y, z);
  const u = z - centralZ(y);
  const aboveSylv = y > sylvY(z) + 5;
  const medialOk = lx >= 5 || y > 42;
  if (aboveSylv && medialOk) {
    if (u > 2 && u < 14) m |= 1;
    if (u < -2 && u > -14) m |= 2;
  }
  if (z > 48 && z > centralZ(y) + 20 && lobeAt(lx, y, z) === 0) m |= 4;
  if (side < 0) {
    const b = ((lx - 64) / 17) ** 2 + ((y - 10) / 11) ** 2 + ((z - 28) / 14) ** 2;
    if (b < 1) m |= 8;
    const w = ((lx - 66) / 17) ** 2 + ((y - 5) / 9) ** 2 + ((z + 32) / 14) ** 2;
    if (w < 1) m |= 16;
  }
  const a = ((lx - 68) / 14) ** 2 + ((y + 6) / 8) ** 2 + ((z + 6) / 12) ** 2;
  if (a < 1) m |= 32;
  if (z < -68 || (lx < 7 && z < -56 && Math.abs(y - 4) < 15)) m |= 64;
  if (lx < 3.5 && Math.abs(z) < 48) {
    const c = ccY(z);
    if (y > c + 5 && y < c + 16.5) m |= 128;
  }
  if (depth > 2 && sulcusDist('central', lx, y, z) < 4.6) m |= 256;
  if (depth > 3 && sulcusDist('sylvian', lx, y, z) < 7.5) m |= 512;
  if (lx < 1.4) m |= 1024;
  return m;
}

// ---------- мозжечок ----------
export function baseCerebellum(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  let d = ell(ax, y, z, 0, -50, -62, 44, 22, 28);
  d = smin(d, ell(ax, y, z, 24, -52, -62, 27, 21, 27), 8);
  d = smax(d, -ell(ax, y, z, 0, -47, -39, 13, 22, 16), 5);
  const slot = Math.max(ax - 1.1, z + 68);
  return smax(d, -slot, 1.2);
}

export function cerebellumField(x: number, y: number, z: number): number {
  const d = baseCerebellum(x, y, z);
  if (d > 5 || d < -6) return d;
  const ax = Math.abs(x);
  const fy = y + 46;
  const fz = z + 40;
  const r = Math.sqrt(ax * ax * 0.12 + fy * fy + fz * fz);
  const nz = noise3(x * 0.045, y * 0.045, z * 0.045);
  const folia = Math.max(0, Math.cos((r * Math.PI * 2) / 3.7 + 1.5 * nz));
  const major = Math.max(0, Math.cos((r * Math.PI * 2) / 17 + 1.1 * nz + 0.4));
  const w = 1.2 * folia * folia * folia + 3.4 * Math.pow(major, 9);
  return d + w;
}

// ---------- ствол мозга ----------
const STEM_TUBES = [
  makeTube([[0, -18, -4, 11], [0, -30, -10, 11], [0, -40, -15, 10.5]], 1.2),
  makeTube([[0, -40, -14, 11.5], [0, -58, -20, 11.5]], 1.0),
  makeTube([[0, -58, -21, 10], [0, -70, -27, 9], [0, -84, -33, 7.6]], 1),
  makeTube([[0, -84, -33, 7.3], [0, -110, -42, 6.2]], 1),
];
const PEDUNCLE = makeTube([[9, -22, -2, 6.3], [11, -38, -11, 6.6]]);
const PYRAMID = makeTube([[2.6, -62, -12, 3.2], [3.2, -84, -26, 3.6]]);

export function stemField(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  let d = tubeD(STEM_TUBES[0], x, y, z);
  d = smin(d, tubeD(STEM_TUBES[1], x, y, z), 5);
  d = smin(d, ell(ax, y, z, 0, -50, -14, 20.5, 13, 17.5), 6);
  d = smin(d, tubeD(STEM_TUBES[2], x, y, z), 6);
  d = smin(d, tubeD(STEM_TUBES[3], x, y, z), 4);
  // ножки мозга (вентральные выпуклости среднего мозга)
  d = smin(d, tubeD(PEDUNCLE, ax, y, z), 3);
  // четверохолмие
  d = smin(d, ell(ax, y, z, 5.4, -15, -23.5, 4.8, 4.4, 4.4), 2.5);
  d = smin(d, ell(ax, y, z, 5, -25.5, -27, 4.4, 4.1, 4.2), 2.5);
  // пирамиды продолговатого
  d = smin(d, tubeD(PYRAMID, ax, y, z), 3);
  // четвёртый желудочек вырезается из задней стенки
  return smax(d, -ell(ax, y, z, 0, -50, -30.5, 8.5, 6.2, 7.2), 1.6);
}

// ---------- глубокие структуры (двусторонние, ax = |x|) ----------
const LV_TUBES = [
  makeTube([[7, 17, 28, 3.8], [9, 19, 17, 4.2], [12, 19, 4, 4.5], [15, 19, -10, 4.8], [19, 15, -24, 6.2], [22, 9, -38, 3.8], [23, 4, -49, 2.4]]),
  makeTube([[20, 15, -24, 4.5], [27, 8, -28, 3.6], [33, -2, -26, 3.4], [37, -8, -14, 3.2], [36, -11, 2, 3.0], [31, -12, 12, 2.4]]),
];
const CAUDATE = makeTube([[15, 15, 25, 8], [16, 22, 12, 6.6], [20, 24, -4, 5.2], [26, 17, -20, 4], [33, 3, -26, 3.4], [39, -10, -20, 2.9], [42, -18, -6, 2.5], [40, -21, 8, 2.2]]);
const HIPPO = makeTube([[24, -19, 14, 5.5], [30, -20, 2, 5.8], [33, -17, -12, 5.5], [31, -10, -26, 5], [25, -2, -37, 4.2], [17, 6, -41, 3.4]]);
const CALLOSUM = makeTube(
  [[0, 6, 36, 4], [0, 14, 41, 5.2], [0, 24, 35, 4.8], [0, 29, 22, 4.5], [0, 31, 5, 4.3], [0, 30, -12, 4.5], [0, 25, -30, 5.6], [0, 14, -42, 7], [0, 8, -38, 5]],
  6.5,
);
const FORNIX = [
  makeTube([[0, 21, -6, 2.3], [0, 21, 6, 2.3]]),
  makeTube([[2.5, 20, 10, 2], [3.8, 10, 12, 1.9], [4.2, -2, 9, 1.8], [4.2, -12, 2, 1.7], [4, -19, -5, 1.6]]),
  makeTube([[0, 21, -6, 2.1], [5, 19, -16, 2.1], [11, 15, -28, 2], [19, 9, -36, 1.9], [24, 1, -38, 1.8], [27, -5, -37, 1.8]]),
];
const AQUEDUCT = makeTube([[0, -6, -14, 1.6], [0, -17, -19, 2.1], [0, -30, -25, 2.2], [0, -42, -28, 2]]);
const CANAL = makeTube([[0, -58, -33, 2.5], [0, -72, -34, 1.6], [0, -84, -35, 1.2]]);
const INFUND = makeTube([[0, -26, 9, 1.8], [0, -36, 12, 1.4], [0, -44, 14, 1.3]]);

export function thalamusField(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  let d = ell(ax, y, z, 11, 2, -10, 9.2, 9.5, 17);
  d = smin(d, ell(ax, y, z, 14, 4, -26, 8, 8, 7), 4);
  d = smin(d, ell(ax, y, z, 11, 6.5, 8, 5.2, 5, 5.5), 3);
  return smin(d, ell(ax, y, z, 0, 3, -1, 3.5, 3, 3.6), 2);
}
export function hypothalamusField(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  const d = ell(ax, y, z, 5.5, -13, 6, 6, 6.4, 9);
  return smin(d, ell(ax, y, z, 0, -22, 8, 4.2, 4.2, 4.4), 3);
}
export const mammillaryField = (x: number, y: number, z: number) => ell(Math.abs(x), y, z, 4, -20, -5.5, 3.3, 3.3, 3.3);
export const pinealField = (x: number, y: number, z: number) => ell(x, y, z, 0, -2, -28, 2.8, 3.4, 4.6);
export function pituitaryField(x: number, y: number, z: number): number {
  let d = ell(x, y, z, 0, -48, 15, 7.2, 4.4, 5.6);
  d = smin(d, ell(x, y, z, 0, -48.5, 11.5, 6, 3.4, 3), 2);
  return smin(d, tubeD(INFUND, x, y, z), 2);
}
export const caudateField = (x: number, y: number, z: number) => tubeD(CAUDATE, Math.abs(x), y, z);
export const putamenField = (x: number, y: number, z: number) => ell(Math.abs(x), y, z, 27, 3, 7, 7, 13, 20);
export const pallidusField = (x: number, y: number, z: number) => ell(Math.abs(x), y, z, 19.5, 1, 5, 4.8, 8, 10.5);
export const amygdalaField = (x: number, y: number, z: number) => ell(Math.abs(x), y, z, 28, -18, 18, 8, 7, 8.5);
export function hippocampusField(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  let d = tubeD(HIPPO, ax, y, z);
  d = smin(d, ell(ax, y, z, 26, -20, 12, 6, 5.2, 7), 2.5);
  // пальцевидные вдавления головки
  const bump = 0.55 * Math.sin(z * 0.75) * Math.exp(-(((z - 8) / 14) ** 2));
  return d - bump;
}
export function fornixField(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  return Math.min(tubeD(FORNIX[0], ax, y, z), tubeD(FORNIX[1], ax, y, z), tubeD(FORNIX[2], ax, y, z));
}
export const callosumField = (x: number, y: number, z: number) => tubeD(CALLOSUM, x, y, z);
export const lateralVentricleField = (x: number, y: number, z: number) => Math.min(tubeD(LV_TUBES[0], Math.abs(x), y, z), tubeD(LV_TUBES[1], Math.abs(x), y, z));
export function thirdVentricleField(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  let d = ell(ax, y, z, 0, 1, -2, 2.7, 10.5, 12.5);
  d = smax(d, -ell(ax, y, z, 0, 3, -1, 3.4, 3.4, 3.8), 1);
  d = smin(d, ell(ax, y, z, 0, -10, 6, 2.2, 5, 4), 2);
  return smin(d, tubeD(AQUEDUCT, x, y, z), 2);
}
export function fourthVentricleField(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  return smin(ell(ax, y, z, 0, -50, -30.5, 9, 6.5, 7.5), tubeD(CANAL, x, y, z), 3);
}

// ---------- метки ствола ----------
export function stemLabel(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  if (y < -86) return 3; // спинной мозг
  if (y < -61) return 2; // продолговатый
  if (y < -37.5) return 1; // мост
  if (z < -20.5 && y > -31 && y < -9.5 && ax < 13) return 4; // крыша (четверохолмие)
  return 0; // средний мозг
}
export const STEM_PARTS = ['midbrain', 'pons', 'medulla', 'spinal-cord', 'tectum'] as const;

// ---------- реестр плотных структур ----------
export type Box = [number, number, number, number, number, number];
export interface Struct {
  id: string;
  sdf: (x: number, y: number, z: number) => number;
  box: Box;
  h: number;
}

export const STRUCTS: Struct[] = [
  { id: 'thalamus', sdf: thalamusField, box: [-27, -11, -40, 27, 17, 14], h: 0.55 },
  { id: 'hypothalamus', sdf: hypothalamusField, box: [-15, -31, -9, 15, -2, 23], h: 0.5 },
  { id: 'mammillary-bodies', sdf: mammillaryField, box: [-10, -27, -12, 10, -13, 1], h: 0.35 },
  { id: 'pineal-gland', sdf: pinealField, box: [-7, -9, -36, 7, 5, -21], h: 0.3 },
  { id: 'pituitary-gland', sdf: pituitaryField, box: [-12, -55, 4, 12, -24, 24], h: 0.4 },
  { id: 'caudate-nucleus', sdf: caudateField, box: [-48, -29, -36, 48, 34, 38], h: 0.55 },
  { id: 'putamen', sdf: putamenField, box: [-38, -14, -16, 38, 22, 32], h: 0.6 },
  { id: 'globus-pallidus', sdf: pallidusField, box: [-28, -10, -8, 28, 12, 20], h: 0.5 },
  { id: 'amygdala', sdf: amygdalaField, box: [-40, -28, 6, 40, -6, 30], h: 0.5 },
  { id: 'hippocampus', sdf: hippocampusField, box: [-42, -30, -50, 42, 14, 24], h: 0.5 },
  { id: 'fornix', sdf: fornixField, box: [-32, -26, -44, 32, 28, 16], h: 0.4 },
  { id: 'corpus-callosum', sdf: callosumField, box: [-40, 0, -54, 40, 40, 50], h: 0.6 },
  { id: 'lateral-ventricles', sdf: lateralVentricleField, box: [-44, -20, -58, 44, 32, 36], h: 0.55 },
  { id: 'third-ventricle', sdf: thirdVentricleField, box: [-8, -46, -32, 8, 16, 16], h: 0.4 },
  { id: 'fourth-ventricle', sdf: fourthVentricleField, box: [-14, -90, -44, 14, -38, -22], h: 0.4 },
];
export const STRUCT_BY_ID = Object.fromEntries(STRUCTS.map((s) => [s.id, s]));

/** Объединённая гладкая форма мозга без извилин: основа для арахноидальной и твёрдой оболочек. */
export function envelopeField(x: number, y: number, z: number): number {
  let d = baseHemi(Math.abs(x), y, z);
  d = smin(d, baseCerebellum(x, y, z), 4);
  let s = 1e9;
  for (const t of STEM_TUBES) s = Math.min(s, tubeD(t, x, y, z));
  return smin(d, s, 5);
}

// ---------- привязка к поверхности (для сосудов, нервов, оболочек) ----------
/** Точка на гладкой поверхности полушария по направлению из центра к гипотетической точке; off — смещение наружу, мм. */
export function snapToCortex(x: number, y: number, z: number, off = 0): [number, number, number] {
  const side = x >= 0 ? 1 : -1;
  const lx = Math.abs(x);
  const dx = lx - CH[0];
  const dy = y - CH[1];
  const dz = z - CH[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const uz = dz / l;
  const r = rayHemi(ux, uy, uz) + off;
  return [side * (CH[0] + ux * r), CH[1] + uy * r, CH[2] + uz * r];
}

/** Верх гладкой формы полушария над точкой (lx, z): координата y. */
export function cortexTopY(lx: number, z: number): number {
  let lo = -60;
  let hi = 120;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (baseHemi(lx, m, z) < 0) lo = m;
    else hi = m;
  }
  return lo;
}

/** Низ гладкой формы полушария под точкой (lx, z) или null, если мозга там нет. */
export function cortexBottomY(lx: number, z: number): number | null {
  let y = 60;
  while (y > -80 && baseHemi(lx, y, z) > 0) y -= 2;
  if (y <= -80) return null;
  while (y > -90 && baseHemi(lx, y, z) < 0) y -= 2;
  let lo = y;
  let hi = y + 2;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (baseHemi(lx, m, z) < 0) hi = m;
    else lo = m;
  }
  return hi;
}

/** Верх мозжечка над (x, z) или null. */
export function cerebellumTopY(x: number, z: number): number | null {
  let y = -10;
  while (y > -90 && baseCerebellum(x, y, z) > 0) y -= 1.5;
  if (y <= -90) return null;
  let lo = y;
  let hi = y + 1.5;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (baseCerebellum(x, m, z) < 0) lo = m;
    else hi = m;
  }
  return lo;
}

/** Переднюю поверхность ствола находим по z при заданных x, y (для базилярной артерии). */
export function stemFrontZ(x: number, y: number): number | null {
  let z = 30;
  while (z > -60 && stemField(x, y, z) > 0) z -= 1;
  if (z <= -60) return null;
  let lo = z;
  let hi = z + 1;
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) / 2;
    if (stemField(x, y, m) < 0) lo = m;
    else hi = m;
  }
  return lo;
}
