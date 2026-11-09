import { Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { JOINTS } from '../skeleton/anatomy';
import { fusiform, lerp, merge, poly2, sheet, type FusiformSpec, type SheetSpec, type V3 } from './geometry';

/*
  Мышцы взрослого человека ростом 175 см, в той же системе координат, что и скелет (дециметры, +x — левая сторона,
  +y — вверх, +z — вперёд). Строится левая половина и пара «в зеркале»; средние мышцы тоже собраны по половинам.
  Скелет здесь — опора: суставы взяты из skeleton/anatomy.ts, поэтому начала и прикрепления лежат на костях.
*/

export const SCALE = 5 / 17.5;
export const FLOOR = -2.2;

const D = Math.PI / 180;

/* ---------- оболочка туловища: срез — суперэллипс, меняющийся с высотой ---------- */

// y, полуширина, перед (z), зад (z)
const ENV: [number, number, number, number][] = [
  [7.5, 1.5, 0.7, -1.1],
  [8.6, 1.62, 0.95, -1.18],
  [9.4, 1.5, 1.05, -1.0],
  [10.2, 1.3, 1.08, -0.85],
  [11.0, 1.3, 1.1, -0.85],
  [11.8, 1.36, 1.1, -0.98],
  [12.6, 1.4, 1.36, -1.08],
  [13.4, 1.42, 1.46, -1.1],
  [14.0, 1.5, 1.3, -0.95],
  [14.4, 1.5, 1.0, -0.85],
  [14.9, 0.95, 0.72, -0.72],
  [15.4, 0.58, 0.5, -0.58],
  [16.2, 0.55, 0.5, -0.55],
];

function env(y: number): [number, number, number] {
  if (y <= ENV[0][0]) return [ENV[0][1], ENV[0][2], ENV[0][3]];
  for (let i = 0; i < ENV.length - 1; i++) {
    const A = ENV[i];
    const B = ENV[i + 1];
    if (y <= B[0]) {
      const t = (y - A[0]) / (B[0] - A[0]);
      const s = t * t * (3 - 2 * t);
      return [lerp(A[1], B[1], s), lerp(A[2], B[2], s), lerp(A[3], B[3], s)];
    }
  }
  const L = ENV[ENV.length - 1];
  return [L[1], L[2], L[3]];
}

const EXP = 2 / 2.6;

/** Точка на оболочке туловища: φ — угол вокруг (0 — спереди, 90° — слева, 180° — сзади), y — высота. */
export function torsoPoint(phiDeg: number, y: number, off = 0): V3 {
  const [a, zf, zb] = env(y);
  const zc = (zf + zb) / 2;
  const bd = (zf - zb) / 2;
  const phi = phiDeg * D;
  const sx = Math.sin(phi);
  const cz = Math.cos(phi);
  const x = a * Math.sign(sx) * Math.pow(Math.abs(sx), EXP);
  const z = zc + bd * Math.sign(cz) * Math.pow(Math.abs(cz), EXP);
  if (off === 0) return [x, y, z];
  const l = Math.hypot(x, z - zc) || 1;
  return [x + (x / l) * off, y, z + ((z - zc) / l) * off];
}

/* ---------- голова: эллипсоид вокруг черепа ---------- */

const HEAD_C: V3 = [0, 16.45, -0.02];
const HEAD_R: V3 = [0.78, 0.95, 0.97];

function headPoint(lonDeg: number, latDeg: number, off = 0): V3 {
  const lon = lonDeg * D;
  const lat = latDeg * D;
  const ex = Math.cos(lat) * Math.sin(lon);
  const ey = Math.sin(lat);
  const ez = Math.cos(lat) * Math.cos(lon);
  return [HEAD_C[0] + (HEAD_R[0] + off) * ex, HEAD_C[1] + (HEAD_R[1] + off) * ey, HEAD_C[2] + (HEAD_R[2] + off) * ez];
}

/* ---------- плоские мышцы: оболочка над поверхностью ---------- */

const v3 = (a: V3) => new Vector3(...a);

/** Строит плоскую мышцу по функции опорной поверхности; нормали считаются численно и направляются «наружу». */
function surfaceSheet(
  surface: (u: number, v: number) => V3,
  outward: (p: V3) => V3,
  o: Omit<SheetSpec, 'point' | 'normal' | 'lift'> & { depth?: number },
): BufferGeometry {
  const e = 0.004;
  const depth = o.depth ?? 0;
  const normal = (u: number, v: number): V3 => {
    // у границы разность берём назад, иначе нормаль вырождается и край «выпадает» из слоя
    const u0 = Math.min(u, 1 - e);
    const v0 = Math.min(v, 1 - e);
    const p = surface(u0, v0);
    const pu = surface(u0 + e, v0);
    const pv = surface(u0, v0 + e);
    const du = v3(pu).sub(v3(p));
    const dv = v3(pv).sub(v3(p));
    const n = du.cross(dv).normalize();
    const out = outward(surface(u, v));
    if (n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) n.negate();
    return [n.x, n.y, n.z];
  };
  return sheet({ ...o, point: surface, normal, lift: -(depth + o.thick) });
}

/** Плоская мышца на туловище: края A и B заданы ломаными в (φ°, y); волокна идут от A к B. */
function torsoSheet(A: [number, number][], B: [number, number][], o: Omit<SheetSpec, 'point' | 'normal' | 'lift'> & { depth?: number }): BufferGeometry {
  const a = poly2(A);
  const b = poly2(B);
  const surface = (u: number, v: number): V3 => {
    const [pa, ya] = a(u);
    const [pb, yb] = b(u);
    return torsoPoint(lerp(pa, pb, v), lerp(ya, yb, v));
  };
  return surfaceSheet(surface, (p) => {
    const zc = (env(p[1])[1] + env(p[1])[2]) / 2;
    return [p[0], 0.0, p[2] - zc];
  }, o);
}

function headSheet(A: [number, number][], B: [number, number][], o: Omit<SheetSpec, 'point' | 'normal' | 'lift'> & { depth?: number }): BufferGeometry {
  const a = poly2(A);
  const b = poly2(B);
  const surface = (u: number, v: number): V3 => {
    const [la, ta] = a(u);
    const [lb, tb] = b(u);
    return headPoint(lerp(la, lb, v), lerp(ta, tb, v));
  };
  return surfaceSheet(surface, (p) => [p[0] - HEAD_C[0], p[1] - HEAD_C[1], p[2] - HEAD_C[2]], o);
}

/* ---------- конечности: рамки вдоль кости ---------- */

type Frame = (t: number, f: number, s: number) => V3;

function frameOf(from: V3, to: V3): { d: Vector3; f: Vector3; s: Vector3; len: number; from: Vector3 } {
  const A = v3(from);
  const d = v3(to).sub(A);
  const len = d.length();
  d.normalize();
  const f = new Vector3(0, 0, 1).addScaledVector(d, -d.z).normalize();
  const s = f.clone().cross(d).normalize();
  return { d, f, s, len, from: A };
}

function chainFrame(joints: V3[]): Frame {
  const fr = joints.slice(0, -1).map((p, i) => frameOf(p, joints[i + 1]));
  return (t, f, s) => {
    const i = Math.min(fr.length - 1, Math.max(0, Math.floor(t)));
    const u = t - i;
    const F = fr[i];
    const p = F.from.clone().addScaledVector(F.d, F.len * u).addScaledVector(F.f, f).addScaledVector(F.s, s);
    return [p.x, p.y, p.z];
  };
}

const J = JOINTS;
/** Рука: t от 0 до 1 — плечо, от 1 до 2 — предплечье, дальше — кисть. f — вперёд, s — наружу. */
const arm = chainFrame([J.shoulder, J.elbow, J.wrist]);
/** Нога: t от 0 до 1 — бедро, от 1 до 2 — голень. */
const leg = chainFrame([J.hip, J.knee, J.ankle]);

/* ---------- каталог ---------- */

export type Layer = 1 | 2 | 3;
export type Placement = 'f' | 'b' | 'l';

export interface MuscleDef {
  id: string;
  group: string;
  /** Слой: 1 — поверхностные, 2 — средние, 3 — глубокие. */
  layer: Layer;
  /** Фаза в режиме «Работа мышц»: 0 и 1 — антагонисты, undefined — стоит спокойно. */
  phase?: 0 | 1;
  /** С какой стороны ставить подпись. */
  label?: Placement;
  build: () => BufferGeometry;
}

const F = (s: FusiformSpec) => fusiform(s);
const many = (...p: BufferGeometry[]) => merge(p);

/** Тела начинаются там, где кончается сухожилие; общие настройки для ленточных мышц. */
const FLAT = { flatTendon: true } as const;

const defs: MuscleDef[] = [];
const add = (id: string, group: string, layer: Layer, build: () => BufferGeometry, extra: Partial<MuscleDef> = {}) => {
  defs.push({ id, group, layer, build, ...extra });
};

/* --- Голова и шея --- */
add('frontalis', 'g-head', 1, () =>
  headSheet([[2, 6], [28, 5], [52, 0]], [[2, 44], [28, 43], [52, 34]], { nu: 18, nv: 18, thick: 0.05, tendonEnds: [0, 0.35], fascicles: 8, rim: 0.18, tone: 0.95 }), { label: 'f' });
add('temporalis', 'g-head', 1, () =>
  headSheet([[58, 42], [88, 50], [118, 40], [132, 8]], [[86, -22], [86, -20], [86, -20], [86, -18]], { nu: 24, nv: 22, thick: 0.1, tendonEnds: [0, 0.22], fascicles: 10, rim: 0.2 }), { label: 'l' });
add('masseter', 'g-head', 1, () =>
  many(
    F({ path: [[0.62, 16.17, 0.5], [0.67, 15.9, 0.25], [0.6, 15.5, -0.02]], out: [1, 0, 0.1], w: 0.2, h: 0.07, a: 0.05, b: 0.95, ...FLAT, rt: 0.06 }),
    F({ path: [[0.56, 16.1, 0.2], [0.62, 15.85, 0.05], [0.56, 15.55, -0.12]], out: [1, 0, -0.1], w: 0.16, h: 0.06, a: 0.05, b: 0.95, ...FLAT, rt: 0.05, tone: 0.9 }),
  ), { label: 'l', phase: 0 });
add('orbicularis-oculi', 'g-head', 1, () => {
  const ring: V3[] = [];
  const c = headPoint(21, -6);
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2 * 0.97 + 0.1;
    const p = headPoint(21 + Math.cos(a) * 11.5, -6 + Math.sin(a) * 9.5, 0.02);
    ring.push(p);
  }
  void c;
  return F({ path: ring, out: [0.2, 0, 1], w: 0.075, h: 0.035, a: 0, b: 1, peak: 0.5, rings: 56, bundles: 5, tone: 0.9, blunt: 1 });
}, { label: 'f' });
add('orbicularis-oris', 'g-head', 1, () => {
  const ring: V3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2 * 0.97 + 0.05;
    ring.push([Math.cos(a) * 0.3, 15.72 + Math.sin(a) * 0.12, 0.62 + 0.14 * Math.cos(a) * Math.cos(a) * -1 + 0.14 - 0.0 * Math.sin(a)]);
  }
  return F({ path: ring, out: [0, 0, 1], w: 0.08, h: 0.045, a: 0, b: 1, rings: 64, bundles: 5, tone: 1.05, blunt: 1 });
}, { label: 'f' });
add('zygomaticus', 'g-head', 1, () =>
  many(
    F({ path: [[0.6, 16.1, 0.45], [0.46, 15.95, 0.68], [0.3, 15.75, 0.72]], out: [0.3, 0.3, 1], w: 0.06, h: 0.04, a: 0.02, b: 0.98, bundles: 5 }),
    F({ path: [[0.6, 16.0, 0.4], [0.48, 15.85, 0.63], [0.34, 15.72, 0.7]], out: [0.3, 0.3, 1], w: 0.045, h: 0.03, a: 0.02, b: 0.98, bundles: 5, tone: 0.9 }),
  ), { label: 'f' });
add('buccinator', 'g-head', 2, () =>
  F({ path: [[0.55, 15.7, 0.2], [0.5, 15.68, 0.42], [0.33, 15.66, 0.68]], out: [1, 0, 0.2], w: 0.13, h: 0.04, a: 0.05, b: 0.95, ...FLAT, rt: 0.05 }), { label: 'l' });
add('platysma', 'g-head', 1, () =>
  torsoSheet([[18, 14.0], [48, 14.15], [80, 14.3]], [[5, 15.25], [28, 15.3], [60, 15.2]], { nu: 16, nv: 12, thick: 0.03, fascicles: 10, tone: 0.9, rim: 0.2 }), { label: 'f' });
add('sternocleidomastoid', 'g-head', 1, () =>
  many(
    F({ path: [[0.1, 14.22, 0.92], [0.3, 14.9, 0.55], [0.55, 15.55, 0.1], [0.64, 16.0, -0.4]], out: [1, 0, 0.5], w: 0.15, h: 0.09, a: 0.06, b: 0.92, peak: 0.45, ...FLAT, rt: 0.05 }),
    F({ path: [[0.45, 14.3, 0.86], [0.46, 14.95, 0.5], [0.56, 15.6, 0.08], [0.64, 16.0, -0.4]], out: [1, 0, 0.5], w: 0.11, h: 0.07, a: 0.06, b: 0.92, peak: 0.45, rt: 0.04, tone: 0.92 }),
  ), { label: 'l', phase: 1 });
add('splenius-capitis', 'g-head', 2, () =>
  F({ path: [[0.03, 14.55, -0.72], [0.3, 15.3, -0.6], [0.56, 16.02, -0.42]], out: [0.2, 0, -1], w: 0.22, h: 0.07, a: 0.08, b: 0.9, ...FLAT, rt: 0.05 }), { label: 'b', phase: 1 });
add('scalenes', 'g-head', 3, () =>
  many(
    F({ path: [[0.22, 15.3, -0.02], [0.35, 14.7, 0.22], [0.52, 14.05, 0.42]], out: [1, 0, 1], w: 0.08, h: 0.06, a: 0.1, b: 0.9 }),
    F({ path: [[0.25, 15.25, -0.1], [0.42, 14.7, 0.1], [0.62, 14.0, 0.2]], out: [1, 0, 1], w: 0.075, h: 0.05, a: 0.1, b: 0.9, tone: 0.92 }),
    F({ path: [[0.28, 15.2, -0.18], [0.5, 14.65, -0.05], [0.72, 14.0, 0.05]], out: [1, 0, 1], w: 0.065, h: 0.045, a: 0.1, b: 0.9, tone: 0.88 }),
  ), { label: 'l' });
add('infrahyoid', 'g-head', 2, () =>
  many(
    F({ path: [[0.1, 14.28, 0.88], [0.1, 14.8, 0.64], [0.1, 15.4, 0.46]], out: [0, 0, 1], w: 0.07, h: 0.035, a: 0.1, b: 0.9 }),
    F({ path: [[0.18, 14.6, 0.46], [0.2, 15.0, 0.52], [0.14, 15.4, 0.44]], out: [0, 0, 1], w: 0.05, h: 0.03, a: 0.2, b: 0.8, tone: 0.9 }),
  ), { label: 'f' });

/* --- Спина --- */
add('trapezius', 'g-back', 1, () =>
  torsoSheet(
    [[177, 16.05], [179, 15.2], [180, 14.2], [180, 13.0], [180, 11.8]],
    [[78, 14.55], [102, 14.35], [128, 13.75], [150, 13.35], [162, 13.3]],
    { nu: 40, nv: 34, thick: 0.1, tendonEnds: [0.12, 0.18], fascicles: 12, rim: 0.14 }), { label: 'b', phase: 1 });
add('latissimus-dorsi', 'g-back', 1, () =>
  torsoSheet(
    [[176, 13.1], [178, 12.2], [178, 11.0], [172, 9.8], [140, 9.4]],
    [[100, 13.55], [97, 13.25], [96, 13.0], [98, 12.55], [102, 12.2]],
    { nu: 40, nv: 34, thick: 0.1, tendonEnds: [0.22, 0.12], fascicles: 14, rim: 0.15, tone: 1.02 }), { label: 'b', phase: 1 });
add('rhomboids', 'g-back', 2, () =>
  torsoSheet([[178, 14.5], [179, 13.0]], [[151, 14.05], [152, 12.5]], { nu: 16, nv: 14, thick: 0.07, depth: 0.14, fascicles: 8, tone: 0.95 }), { label: 'b' });
add('levator-scapulae', 'g-back', 2, () =>
  F({ path: [[0.34, 15.6, -0.38], [0.62, 14.9, -0.62], [1.0, 14.15, -0.78]], out: [0.3, 0.3, -1], w: 0.1, h: 0.06, a: 0.08, b: 0.92 }), { label: 'b' });
add('erector-spinae', 'g-back', 2, () =>
  many(
    torsoSheet([[163, 14.4], [150, 14.2]], [[163, 9.4], [150, 9.4]], { nu: 14, nv: 36, thick: 0.17, depth: 0.12, fascicles: 5, rim: 0.12, tone: 0.97 }),
    torsoSheet([[173, 15.3], [163, 15.2]], [[173, 9.4], [163, 9.4]], { nu: 10, nv: 36, thick: 0.19, depth: 0.12, fascicles: 4, rim: 0.12 }),
    torsoSheet([[179.5, 15.0], [173, 15.0]], [[179.5, 9.4], [173, 9.4]], { nu: 8, nv: 36, thick: 0.13, depth: 0.12, fascicles: 3, rim: 0.14, tone: 1.04 }),
  ), { label: 'b', phase: 1 });
add('quadratus-lumborum', 'g-back', 3, () =>
  F({ path: [[1.05, 9.5, -0.5], [0.85, 10.7, -0.5], [0.62, 11.9, -0.5]], out: [0, 0, -1], w: 0.19, h: 0.06, a: 0.05, b: 0.95, ...FLAT, rt: 0.05 }), { label: 'b' });

/* --- Грудь --- */
add('pectoralis-major', 'g-chest', 1, () =>
  torsoSheet(
    [[56, 14.3], [20, 14.05], [6, 13.5], [5, 12.9], [13, 12.35], [30, 12.0]],
    [[80, 13.75], [81, 13.6], [82, 13.45], [82, 13.35], [81, 13.25], [79, 13.15]],
    { nu: 40, nv: 32, thick: 0.2, tendonEnds: [0, 0.14], fascicles: 13, rim: 0.12, tone: 1.02 }), { label: 'f', phase: 0 });
add('pectoralis-minor', 'g-chest', 2, () =>
  F({ path: [torsoPoint(30, 12.75, -0.28), torsoPoint(52, 13.45, -0.28), [1.4, 14.02, 0.52]], out: [0.3, 0, 1], w: 0.21, h: 0.06, a: 0.05, b: 0.88, ...FLAT, rt: 0.04, tone: 0.95 }), { label: 'f' });
add('serratus-anterior', 'g-chest', 2, () =>
  torsoSheet([[60, 13.7], [62, 12.9], [68, 12.2], [80, 11.6]], [[146, 13.95], [147, 13.3], [150, 12.7], [150, 12.0]], { nu: 40, nv: 28, thick: 0.09, depth: 0.1, fascicles: 9, rim: 0.12 }), { label: 'l', phase: 0 });
add('intercostals', 'g-chest', 3, () => {
  const bands: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const yb = 14.28 - i * 0.27;
    const yf = 13.83 - i * 0.255 - (i > 5 ? 0.0 : 0);
    const ym = (yb + yf) / 2 + 0.02;
    bands.push(torsoSheet([[170, yb + 0.07], [90, ym + 0.07], [13, yf + 0.07]], [[170, yb - 0.1], [90, ym - 0.1], [13, yf - 0.1]], { nu: 36, nv: 3, thick: 0.05, depth: 0.28, fascicles: 20, rim: 0.2, tone: 0.9 }));
  }
  return merge(bands);
}, { label: 'l', phase: 0 });
add('diaphragm', 'g-chest', 3, () => {
  const rimY = (phi: number) => lerp(11.55, 10.65, Math.pow(Math.sin(phi * D * 0.5 + 0.0), 1.2)) + 0.0;
  const dome = 12.55;
  const surface = (u: number, v: number): V3 => {
    const phi = lerp(2, 178, u);
    const y0 = rimY(phi);
    const rim = torsoPoint(phi, y0, -0.34);
    const zc = (env(y0)[1] + env(y0)[2]) / 2 + 0.05;
    const k = Math.pow(v, 0.9);
    const x = lerp(rim[0], 0.0, k);
    const z = lerp(rim[2], zc, k);
    const y = lerp(y0, dome, Math.pow(Math.sin((v * Math.PI) / 2), 0.85));
    return [x, y, z];
  };
  return surfaceSheet(surface, () => [0, 1, 0], { nu: 40, nv: 24, thick: 0.07, tendonEnds: [0, 0.38], fascicles: 20, rim: 0.05, tone: 0.96 });
}, { label: 'f', phase: 1 });
add('crura-of-diaphragm', 'g-chest', 3, () =>
  many(
    F({ path: [[0.14, 10.75, -0.25], [0.22, 11.5, -0.12], [0.3, 12.2, 0.15]], out: [0, 0, 1], w: 0.1, h: 0.07, a: 0.08, b: 0.9 }),
    F({ path: [[0.26, 10.9, -0.3], [0.45, 11.4, -0.1], [0.5, 12.0, 0.1]], out: [0, 0, 1], w: 0.07, h: 0.05, a: 0.08, b: 0.9, tone: 0.9 }),
  ), { label: 'f' });

/* --- Живот --- */
add('rectus-abdominis', 'g-abdomen', 1, () => {
  const segs = [0, 0.17, 0.37, 0.57, 0.8, 1];
  return torsoSheet(
    [[4, 12.95], [20, 12.95], [38, 12.7]],
    [[3, 8.95], [11, 8.95], [19, 9.0]],
    {
      nu: 22, nv: 52, thick: 0.17, bands: segs.slice(1, -1), tendonEnds: [0.03, 0.05], fascicles: 3, rim: 0.1,
      profile: (_u, v) => {
        let k = 0;
        while (k < segs.length - 2 && v > segs[k + 1]) k++;
        const w = (v - segs[k]) / (segs[k + 1] - segs[k]);
        return 0.72 + 0.28 * Math.pow(Math.sin(Math.PI * w), 0.5);
      },
    });
}, { label: 'f', phase: 0 });
add('external-oblique', 'g-abdomen', 1, () =>
  torsoSheet(
    [[50, 12.7], [74, 12.25], [97, 11.45], [108, 10.2]],
    [[32, 11.65], [30, 10.65], [34, 9.65], [62, 9.3]],
    { nu: 36, nv: 30, thick: 0.1, tendonEnds: [0, 0.38], fascicles: 11, rim: 0.12, tone: 0.97 }), { label: 'l', phase: 0 });
add('internal-oblique', 'g-abdomen', 2, () =>
  torsoSheet(
    [[108, 10.15], [82, 9.55], [57, 9.3], [40, 9.12]],
    [[97, 11.4], [72, 12.0], [48, 12.3], [32, 12.0]],
    { nu: 34, nv: 28, thick: 0.09, depth: 0.12, tendonEnds: [0, 0.3], fascicles: 10, rim: 0.12, tone: 0.93 }), { label: 'l', phase: 0 });
add('transversus-abdominis', 'g-abdomen', 3, () =>
  torsoSheet(
    [[116, 12.0], [113, 11.0], [111, 10.0], [106, 9.5]],
    [[32, 12.0], [30, 11.0], [32, 10.0], [38, 9.3]],
    { nu: 30, nv: 28, thick: 0.07, depth: 0.27, tendonEnds: [0.1, 0.3], fascicles: 9, rim: 0.12, tone: 0.9 }), { label: 'l' });

/* --- Плечевой пояс --- */
add('deltoid', 'g-shoulder', 1, () =>
  many(
    F({ path: [[1.22, 14.4, 0.42], arm(0.07, 0.4, 0.2), arm(0.2, 0.34, 0.34), arm(0.44, 0.08, 0.42)], out: [0.4, 0.4, 0.8], w: 0.4, h: 0.17, a: 0.02, b: 0.97, peak: 0.34, rt: 0.05, rings: 36 }),
    F({ path: [[1.7, 14.5, -0.15], arm(0.05, 0.02, 0.56), arm(0.2, 0.0, 0.56), arm(0.44, 0.0, 0.43)], out: [1, 0.4, 0], w: 0.43, h: 0.2, a: 0.02, b: 0.97, peak: 0.33, rt: 0.05, rings: 36, tone: 1.03 }),
    F({ path: [[1.0, 14.1, -0.95], arm(0.07, -0.4, 0.22), arm(0.2, -0.34, 0.35), arm(0.44, -0.08, 0.42)], out: [0.4, 0.4, -0.8], w: 0.4, h: 0.17, a: 0.02, b: 0.97, peak: 0.34, rt: 0.05, rings: 36, tone: 0.96 }),
  ), { label: 'l', phase: 0 });
add('supraspinatus', 'g-shoulder', 2, () =>
  F({ path: [[0.95, 13.98, -0.88], [1.3, 14.28, -0.62], [1.62, 14.2, -0.28]], out: [0.2, 1, -0.2], w: 0.14, h: 0.09, a: 0.05, b: 0.88, ...FLAT, rt: 0.045 }), { label: 'b' });
add('infraspinatus', 'g-shoulder', 2, () =>
  F({ path: [[0.95, 13.25, -0.92], [1.3, 13.75, -0.7], [1.62, 14.05, -0.3]], out: [0.1, 0, -1], w: 0.3, h: 0.07, a: 0.05, b: 0.88, ...FLAT, rt: 0.05, tone: 0.98 }), { label: 'b', phase: 1 });
add('teres-minor', 'g-shoulder', 2, () =>
  F({ path: [[1.35, 13.45, -0.78], [1.52, 13.8, -0.55], [1.66, 14.0, -0.32]], out: [0.2, 0, -1], w: 0.085, h: 0.05, a: 0.06, b: 0.9 }), { label: 'b' });
add('teres-major', 'g-shoulder', 2, () =>
  F({ path: [[1.2, 12.92, -0.84], [1.45, 13.2, -0.62], [1.7, 13.42, -0.08]], out: [0.2, 0, -1], w: 0.16, h: 0.1, a: 0.06, b: 0.9, ...FLAT, rt: 0.045 }), { label: 'b', phase: 1 });
add('subscapularis', 'g-shoulder', 3, () =>
  F({ path: [[1.05, 13.0, -0.62], [1.3, 13.6, -0.42], [1.55, 14.0, -0.06]], out: [0.2, 0, 1], w: 0.3, h: 0.07, a: 0.04, b: 0.9, ...FLAT, rt: 0.05, tone: 0.95 }), { label: 'f' });

/* --- Плечо --- */
add('biceps-brachii', 'g-arm', 1, () =>
  many(
    F({ path: [[1.5, 13.98, -0.02], arm(0.1, 0.3, 0.05), arm(0.45, 0.34, 0.06), arm(0.85, 0.3, 0.06), arm(1.12, 0.1, 0.2)], out: [0.2, 0, 1], w: 0.27, h: 0.24, a: 0.12, b: 0.9, peak: 0.45, rt: 0.045, bundles: 8 }),
    F({ path: [[1.38, 14.06, 0.45], arm(0.18, 0.32, -0.04), arm(0.5, 0.34, -0.08), arm(0.85, 0.3, 0.0), arm(1.12, 0.1, 0.2)], out: [-0.2, 0, 1], w: 0.25, h: 0.23, a: 0.12, b: 0.9, peak: 0.45, rt: 0.045, bundles: 8, tone: 1.04 }),
  ), { label: 'f', phase: 0 });
add('brachialis', 'g-arm', 2, () =>
  F({ path: [arm(0.38, 0.1, 0.05), arm(0.65, 0.2, 0.12), arm(1.02, 0.1, -0.02)], out: [0.5, 0, 1], w: 0.26, h: 0.12, a: 0.06, b: 0.9, ...FLAT, rt: 0.05 }), { label: 'f', phase: 0 });
add('coracobrachialis', 'g-arm', 2, () =>
  F({ path: [[1.38, 14.0, 0.4], arm(0.2, 0.12, -0.3), arm(0.55, 0.1, -0.27)], out: [-1, 0, 0.3], w: 0.1, h: 0.08, a: 0.1, b: 0.88 }), { label: 'f' });
add('triceps-brachii', 'g-arm', 1, () =>
  many(
    F({ path: [[1.48, 13.7, -0.34], arm(0.2, -0.32, 0.02), arm(0.55, -0.36, 0.02), arm(0.9, -0.28, 0.0), arm(1.04, -0.12, 0.0)], out: [0, 0, -1], w: 0.3, h: 0.22, a: 0.06, b: 0.9, peak: 0.45, ...FLAT, rt: 0.06, bundles: 8 }),
    F({ path: [arm(0.2, -0.16, 0.34), arm(0.5, -0.3, 0.3), arm(0.85, -0.26, 0.12), arm(1.04, -0.12, 0.0)], out: [0.6, 0, -1], w: 0.25, h: 0.2, a: 0.04, b: 0.9, peak: 0.45, rt: 0.05, bundles: 8, tone: 1.03 }),
    F({ path: [arm(0.34, -0.18, -0.12), arm(0.6, -0.26, -0.1), arm(0.9, -0.2, -0.02), arm(1.04, -0.12, 0.0)], out: [-0.4, 0, -1], w: 0.2, h: 0.17, a: 0.04, b: 0.9, peak: 0.5, rt: 0.05, tone: 0.92 }),
  ), { label: 'b', phase: 1 });

/* --- Предплечье --- */
add('brachioradialis', 'g-forearm', 1, () =>
  F({ path: [arm(0.8, 0.0, 0.4), arm(1.14, 0.12, 0.36), arm(1.5, 0.12, 0.3), arm(1.97, 0.04, 0.18)], out: [1, 0, 0.5], w: 0.17, h: 0.13, a: 0.03, b: 0.55, peak: 0.4, rt: 0.04 }), { label: 'l', phase: 0 });
add('pronator-teres', 'g-forearm', 1, () =>
  F({ path: [arm(0.98, 0.06, -0.36), arm(1.2, 0.14, -0.12), arm(1.5, 0.08, 0.2)], out: [0, 0, 1], w: 0.13, h: 0.09, a: 0.05, b: 0.92, rt: 0.04 }), { label: 'f' });
add('flexor-carpi-radialis', 'g-forearm', 1, () =>
  F({ path: [arm(1.0, 0.08, -0.34), arm(1.25, 0.16, -0.04), arm(1.5, 0.15, 0.04), arm(2.0, 0.1, 0.06)], out: [0, 0, 1], w: 0.11, h: 0.08, a: 0.04, b: 0.5, peak: 0.45, rt: 0.032 }), { label: 'f', phase: 0 });
add('palmaris-longus', 'g-forearm', 1, () =>
  F({ path: [arm(1.0, 0.1, -0.32), arm(1.25, 0.18, -0.12), arm(1.6, 0.14, -0.02), arm(2.05, 0.1, -0.02), arm(2.3, 0.08, -0.03)], out: [0, 0, 1], w: 0.075, h: 0.055, a: 0.04, b: 0.4, peak: 0.5, rt: 0.025 }), { label: 'f', phase: 0 });
add('flexor-carpi-ulnaris', 'g-forearm', 1, () =>
  F({ path: [arm(0.98, 0.02, -0.4), arm(1.25, 0.05, -0.34), arm(1.6, 0.0, -0.3), arm(1.98, 0.0, -0.22)], out: [-0.7, 0, 0.7], w: 0.13, h: 0.095, a: 0.04, b: 0.55, peak: 0.4, rt: 0.035 }), { label: 'f', phase: 0 });
add('flexor-digitorum-superficialis', 'g-forearm', 2, () =>
  many(
    F({ path: [arm(1.0, 0.1, -0.28), arm(1.3, 0.18, -0.05), arm(1.65, 0.12, -0.02), arm(2.0, 0.08, -0.04)], out: [0, 0, 1], w: 0.17, h: 0.1, a: 0.04, b: 0.6, peak: 0.4, rt: 0.04 }),
  ), { label: 'f', phase: 0 });
add('extensor-digitorum', 'g-forearm', 1, () =>
  F({ path: [arm(0.98, -0.12, 0.38), arm(1.25, -0.22, 0.2), arm(1.65, -0.17, 0.04), arm(2.0, -0.12, 0.0)], out: [0.3, 0, -1], w: 0.15, h: 0.09, a: 0.04, b: 0.58, peak: 0.4, rt: 0.035 }), { label: 'b', phase: 1 });
add('extensor-carpi-radialis', 'g-forearm', 1, () =>
  F({ path: [arm(0.88, -0.04, 0.42), arm(1.2, -0.04, 0.38), arm(1.55, -0.1, 0.3), arm(2.0, -0.1, 0.16), arm(2.25, -0.08, 0.1)], out: [1, 0, -0.3], w: 0.13, h: 0.09, a: 0.04, b: 0.5, peak: 0.4, rt: 0.032 }), { label: 'l', phase: 1 });
add('extensor-carpi-ulnaris', 'g-forearm', 1, () =>
  F({ path: [arm(1.0, -0.14, 0.34), arm(1.35, -0.26, -0.04), arm(1.7, -0.2, -0.16), arm(2.0, -0.15, -0.2), arm(2.3, -0.1, -0.25)], out: [-0.3, 0, -1], w: 0.12, h: 0.085, a: 0.04, b: 0.55, peak: 0.42, rt: 0.032 }), { label: 'b', phase: 1 });
add('abductor-pollicis-longus', 'g-forearm', 2, () =>
  F({ path: [arm(1.3, -0.18, 0.12), arm(1.62, -0.2, 0.22), arm(2.0, -0.06, 0.32), arm(2.2, 0.0, 0.42)], out: [1, 0, -0.4], w: 0.09, h: 0.06, a: 0.04, b: 0.6, peak: 0.4, rt: 0.03 }), { label: 'l' });

/* --- Кисть --- */
add('thenar', 'g-hand', 2, () =>
  many(
    F({ path: [arm(2.02, 0.13, 0.22), arm(2.18, 0.17, 0.3), arm(2.36, 0.12, 0.42)], out: [0.5, 0, 1], w: 0.14, h: 0.11, a: 0.05, b: 0.9, rt: 0.04 }),
    F({ path: [arm(2.04, 0.1, 0.18), arm(2.2, 0.12, 0.22), arm(2.34, 0.1, 0.34)], out: [0.5, 0, 1], w: 0.1, h: 0.08, a: 0.05, b: 0.9, rt: 0.035, tone: 0.92 }),
  ), { label: 'f' });
add('hypothenar', 'g-hand', 2, () =>
  F({ path: [arm(2.03, 0.1, -0.24), arm(2.22, 0.12, -0.28), arm(2.42, 0.08, -0.3)], out: [-0.7, 0, 1], w: 0.095, h: 0.075, a: 0.05, b: 0.9, rt: 0.03 }), { label: 'f' });
add('hand-tendons', 'g-hand', 2, () => {
  const fingers: [number, number, number][] = [[2.52, 0.1, 0.46], [2.62, 0.1, 0.12], [2.65, 0.1, -0.06], [2.55, 0.1, -0.2], [2.4, 0.1, -0.3]];
  return merge(
    fingers.flatMap(([tEnd, f, s], i) => [
      F({ path: [arm(2.0, f, i * -0.0 + (i === 0 ? 0.2 : 0.0)), arm(2.2, f + 0.02, s * 0.8), arm(tEnd, f, s)], out: [0, 0, 1], w: 0.02, h: 0.02, tendon: true, rt: 0.026, rings: 24 }),
      F({ path: [arm(2.0, -0.12, i * -0.0 + (i === 0 ? 0.2 : 0.0)), arm(2.2, -0.12, s * 0.8), arm(tEnd, -0.1, s)], out: [0, 0, -1], w: 0.02, h: 0.02, tendon: true, rt: 0.022, rings: 24 }),
    ]),
  );
}, { label: 'f' });

/* --- Таз и ягодицы --- */
add('gluteus-maximus', 'g-hip', 1, () =>
  torsoSheet(
    [[179, 9.65], [174, 9.0], [170, 8.35]],
    [[122, 8.35], [118, 8.0], [124, 7.6]],
    { nu: 30, nv: 28, thick: 0.34, tendonEnds: [0, 0.14], fascicles: 9, rim: 0.2, tone: 1.03,
      profile: (_u, v) => 0.85 + 0.15 * Math.sin(Math.PI * v) }), { label: 'b', phase: 1 });
add('gluteus-medius', 'g-hip', 2, () =>
  torsoSheet([[155, 9.2], [135, 9.65], [112, 9.5]], [[96, 8.8], [100, 8.55], [104, 8.3]], { nu: 26, nv: 22, thick: 0.2, depth: 0.2, tendonEnds: [0, 0.2], fascicles: 9, rim: 0.2, tone: 0.97 }), { label: 'l', phase: 1 });
add('gluteus-minimus', 'g-hip', 3, () =>
  torsoSheet([[145, 9.0], [125, 9.25], [108, 9.1]], [[95, 8.9], [98, 8.65], [101, 8.45]], { nu: 20, nv: 18, thick: 0.12, depth: 0.4, tendonEnds: [0, 0.25], fascicles: 7, rim: 0.2, tone: 0.9 }), { label: 'l' });
add('piriformis', 'g-hip', 3, () =>
  F({ path: [[0.14, 9.3, -0.8], [0.8, 8.85, -0.92], [1.45, 8.62, -0.52]], out: [0, 0.3, -1], w: 0.16, h: 0.1, a: 0.1, b: 0.9, ...FLAT, rt: 0.045 }), { label: 'b' });
add('tensor-fasciae-latae', 'g-hip', 1, () =>
  F({ path: [[1.32, 9.4, 0.62], leg(0.12, 0.28, 0.55), leg(0.3, 0.12, 0.62), leg(0.7, 0.02, 0.58), leg(1.06, 0.0, 0.46)], out: [1, 0, 0.5], w: 0.2, h: 0.14, a: 0.02, b: 0.3, peak: 0.5, ...FLAT, rt: 0.075, rings: 56 }), { label: 'l', phase: 0 });
add('iliopsoas', 'g-hip', 3, () =>
  many(
    F({ path: [[0.28, 11.1, -0.1], [0.5, 10.2, 0.08], [0.8, 9.25, 0.38], leg(0.1, 0.18, -0.2), leg(0.14, -0.02, -0.22)], out: [0.2, 0, 1], w: 0.22, h: 0.18, a: 0.03, b: 0.62, peak: 0.45, rt: 0.06 }),
    F({ path: [[1.28, 9.85, 0.1], [1.1, 9.35, 0.36], [0.85, 9.1, 0.4], leg(0.1, 0.18, -0.2), leg(0.14, -0.02, -0.22)], out: [0.3, 0, 1], w: 0.22, h: 0.1, a: 0.03, b: 0.55, peak: 0.4, rt: 0.06, tone: 0.95 }),
  ), { label: 'f', phase: 0 });

/* --- Бедро --- */
add('rectus-femoris', 'g-thigh', 1, () =>
  F({ path: [[1.02, 9.32, 0.56], leg(0.12, 0.6, 0.14), leg(0.5, 0.66, 0.04), leg(0.88, 0.38, 0.0), leg(1.02, 0.28, 0.0)], out: [0.1, 0, 1], w: 0.34, h: 0.3, a: 0.06, b: 0.84, peak: 0.45, rt: 0.06, bundles: 10, rings: 56 }), { label: 'f', phase: 0 });
add('vastus-lateralis', 'g-thigh', 1, () =>
  F({ path: [leg(0.08, 0.1, 0.62), leg(0.4, 0.24, 0.7), leg(0.72, 0.32, 0.44), leg(0.94, 0.3, 0.2), leg(1.02, 0.26, 0.12)], out: [1, 0, 0.3], w: 0.4, h: 0.28, a: 0.03, b: 0.9, peak: 0.45, rt: 0.06, bundles: 10, rings: 56, tone: 1.03 }), { label: 'l', phase: 0 });
add('vastus-medialis', 'g-thigh', 1, () =>
  F({ path: [leg(0.3, 0.12, -0.32), leg(0.58, 0.3, -0.44), leg(0.85, 0.34, -0.24), leg(1.0, 0.28, -0.1)], out: [-1, 0, 0.5], w: 0.3, h: 0.24, a: 0.03, b: 0.95, peak: 0.66, rt: 0.06, bundles: 10, rings: 56, tone: 0.98 }), { label: 'f', phase: 0 });
add('vastus-intermedius', 'g-thigh', 3, () =>
  F({ path: [leg(0.14, 0.34, 0.12), leg(0.5, 0.42, 0.04), leg(0.88, 0.32, 0.0), leg(1.0, 0.27, 0.0)], out: [0, 0, 1], w: 0.3, h: 0.2, a: 0.03, b: 0.9, peak: 0.45, rt: 0.06, tone: 0.93 }), { label: 'f', phase: 0 });
add('patellar-tendon', 'g-thigh', 1, () =>
  many(
    F({ path: [leg(0.98, 0.3, 0.0), leg(1.04, 0.34, 0.0), leg(1.2, 0.36, 0.0)], out: [0, 0, 1], w: 0.1, h: 0.04, tendon: true, rt: 0.075, flatTendon: true, rings: 24 }),
    F({ path: [leg(1.0, 0.28, 0.1), leg(1.1, 0.3, 0.2), leg(1.2, 0.3, 0.26)], out: [0, 0, 1], w: 0.04, h: 0.03, tendon: true, rt: 0.035, rings: 16 }),
  ), { label: 'f' });
add('sartorius', 'g-thigh', 1, () =>
  F({ path: [[1.32, 9.38, 0.62], leg(0.3, 0.62, 0.1), leg(0.58, 0.2, -0.5), leg(0.86, 0.0, -0.58), leg(1.1, 0.05, -0.42), leg(1.22, 0.02, -0.18)], out: [-0.5, 0, 1], w: 0.1, h: 0.06, a: 0.03, b: 0.86, ...FLAT, rt: 0.045, rings: 64, tone: 1.06 }), { label: 'f', phase: 0 });
add('gracilis', 'g-thigh', 1, () =>
  F({ path: [[0.14, 8.78, 0.15], leg(0.3, -0.05, -0.6), leg(0.7, -0.04, -0.62), leg(1.0, 0.0, -0.46), leg(1.18, 0.0, -0.34)], out: [-1, 0, 0.1], w: 0.1, h: 0.055, a: 0.04, b: 0.7, ...FLAT, rt: 0.04, rings: 56 }), { label: 'l', phase: 0 });
add('adductor-longus', 'g-thigh', 2, () =>
  F({ path: [[0.28, 8.85, 0.38], leg(0.18, 0.12, -0.28), leg(0.4, 0.1, -0.42), leg(0.6, -0.12, -0.2)], out: [-0.6, 0, 1], w: 0.2, h: 0.1, a: 0.04, b: 0.9, ...FLAT, rt: 0.05, peak: 0.4 }), { label: 'f' });
add('adductor-magnus', 'g-thigh', 2, () =>
  many(
    F({ path: [[0.55, 8.62, -0.58], leg(0.2, -0.28, -0.35), leg(0.55, -0.2, -0.5), leg(0.92, -0.16, -0.32)], out: [-0.7, 0, -0.4], w: 0.36, h: 0.16, a: 0.04, b: 0.92, peak: 0.4, ...FLAT, rt: 0.05, rings: 48 }),
    F({ path: [[0.35, 8.8, -0.2], leg(0.12, 0.0, -0.45), leg(0.35, -0.06, -0.5), leg(0.55, -0.1, -0.4)], out: [-1, 0, 0], w: 0.28, h: 0.14, a: 0.04, b: 0.92, rt: 0.045, tone: 0.95 }),
  ), { label: 'l', phase: 1 });
add('pectineus', 'g-thigh', 2, () =>
  F({ path: [[0.46, 9.0, 0.42], leg(0.1, 0.18, -0.18), leg(0.22, -0.02, -0.28)], out: [0, 0, 1], w: 0.14, h: 0.06, a: 0.06, b: 0.94, ...FLAT, rt: 0.04 }), { label: 'f' });
add('biceps-femoris', 'g-thigh', 1, () =>
  many(
    F({ path: [[0.68, 8.6, -0.66], leg(0.28, -0.6, 0.12), leg(0.65, -0.52, 0.3), leg(0.9, -0.3, 0.35), leg(1.04, -0.1, 0.4)], out: [0.4, 0, -1], w: 0.28, h: 0.2, a: 0.04, b: 0.9, peak: 0.42, rt: 0.045, bundles: 9, rings: 56 }),
    F({ path: [leg(0.45, -0.3, 0.34), leg(0.7, -0.36, 0.34), leg(0.92, -0.26, 0.36), leg(1.04, -0.1, 0.4)], out: [0.6, 0, -1], w: 0.17, h: 0.12, a: 0.04, b: 0.9, peak: 0.5, rt: 0.04, tone: 0.95 }),
  ), { label: 'b', phase: 1 });
add('semitendinosus', 'g-thigh', 1, () =>
  F({ path: [[0.62, 8.62, -0.62], leg(0.3, -0.56, -0.16), leg(0.62, -0.5, -0.24), leg(0.92, -0.26, -0.36), leg(1.12, -0.08, -0.4), leg(1.24, 0.0, -0.3)], out: [-0.5, 0, -1], w: 0.19, h: 0.14, a: 0.04, b: 0.88, peak: 0.34, rt: 0.045, rings: 56, tone: 0.98 }), { label: 'b', phase: 1 });
add('semimembranosus', 'g-thigh', 2, () =>
  F({ path: [[0.58, 8.64, -0.58], leg(0.3, -0.44, -0.14), leg(0.7, -0.4, -0.24), leg(0.98, -0.22, -0.3), leg(1.1, -0.04, -0.32)], out: [-0.6, 0, -1], w: 0.24, h: 0.12, a: 0.03, b: 0.9, peak: 0.55, ...FLAT, rt: 0.06, rings: 52, tone: 0.94 }), { label: 'b', phase: 1 });

/* --- Голень --- */
const HEEL: V3 = [0.6, 0.3, -0.5];
add('gastrocnemius', 'g-leg', 1, () =>
  many(
    F({ path: [leg(0.98, -0.28, -0.22), leg(1.14, -0.46, -0.24), leg(1.34, -0.46, -0.2), leg(1.62, -0.28, -0.08), [0.62, 0.9, -0.5], HEEL], out: [-0.3, 0, -1], w: 0.27, h: 0.22, a: 0.03, b: 0.55, peak: 0.3, rt: 0.075, bundles: 10, rings: 64 }),
    F({ path: [leg(0.98, -0.28, 0.24), leg(1.14, -0.46, 0.26), leg(1.34, -0.46, 0.2), leg(1.62, -0.28, 0.08), [0.6, 0.9, -0.5], HEEL], out: [0.3, 0, -1], w: 0.24, h: 0.2, a: 0.03, b: 0.55, peak: 0.3, rt: 0.075, bundles: 10, rings: 64, tone: 1.03 }),
  ), { label: 'b', phase: 1 });
add('soleus', 'g-leg', 2, () =>
  F({ path: [leg(1.12, -0.2, 0.22), leg(1.32, -0.34, 0.1), leg(1.6, -0.3, 0.02), [0.6, 1.0, -0.46], HEEL], out: [0.5, 0, -1], w: 0.3, h: 0.17, a: 0.03, b: 0.62, peak: 0.35, ...FLAT, rt: 0.06, rings: 56, tone: 0.95 }), { label: 'l', phase: 1 });
add('tibialis-anterior', 'g-leg', 1, () =>
  F({ path: [leg(1.08, 0.24, 0.16), leg(1.3, 0.36, 0.14), leg(1.7, 0.28, 0.02), [0.6, 0.35, 0.5], [0.46, 0.18, 0.78]], out: [0.3, 0, 1], w: 0.17, h: 0.15, a: 0.03, b: 0.52, peak: 0.35, rt: 0.04, bundles: 8, rings: 56 }), { label: 'f', phase: 0 });
add('extensor-digitorum-longus', 'g-leg', 2, () =>
  F({ path: [leg(1.08, 0.2, 0.36), leg(1.32, 0.26, 0.32), leg(1.8, 0.18, 0.18), [0.68, 0.3, 0.55], [0.7, 0.22, 0.95]], out: [1, 0, 0.8], w: 0.13, h: 0.1, a: 0.03, b: 0.5, peak: 0.4, rt: 0.035, rings: 56 }), { label: 'f', phase: 0 });
add('fibularis-longus', 'g-leg', 1, () =>
  F({ path: [leg(1.06, 0.0, 0.42), leg(1.3, 0.02, 0.46), leg(1.7, -0.1, 0.34), [0.95, 0.55, -0.3], [0.78, 0.15, 0.0], [0.4, 0.1, 0.62]], out: [1, 0, 0], w: 0.14, h: 0.11, a: 0.03, b: 0.5, peak: 0.35, rt: 0.035, rings: 64 }), { label: 'l', phase: 1 });
add('tibialis-posterior', 'g-leg', 3, () =>
  F({ path: [leg(1.1, -0.12, 0.02), leg(1.4, -0.16, -0.05), leg(1.8, -0.1, -0.2), [0.42, 0.6, -0.2], [0.5, 0.22, 0.4]], out: [-0.3, 0, -1], w: 0.14, h: 0.1, a: 0.03, b: 0.55, peak: 0.4, rt: 0.035, rings: 56, tone: 0.92 }), { label: 'b', phase: 1 });

/* --- Стопа --- */
add('abductor-hallucis', 'g-foot', 2, () =>
  F({ path: [[0.55, 0.12, -0.42], [0.46, 0.1, 0.3], [0.36, 0.1, 0.9], [0.3, 0.12, 1.25]], out: [-1, -0.2, 0], w: 0.12, h: 0.07, a: 0.05, b: 0.9, rt: 0.03 }), { label: 'f' });
add('flexor-digitorum-brevis', 'g-foot', 3, () =>
  F({ path: [[0.58, 0.07, -0.42], [0.57, 0.06, 0.3], [0.56, 0.07, 1.0]], out: [0, -1, 0], w: 0.14, h: 0.05, a: 0.05, b: 0.9, ...FLAT, rt: 0.04 }), { label: 'f' });
add('extensor-digitorum-brevis', 'g-foot', 2, () =>
  F({ path: [[0.85, 0.4, 0.12], [0.76, 0.38, 0.5], [0.62, 0.32, 0.9]], out: [0.5, 1, 0], w: 0.1, h: 0.05, a: 0.05, b: 0.9, rt: 0.03 }), { label: 'l' });
add('toe-tendons', 'g-foot', 2, () => {
  const toes: [number, number, number][] = [[0.3, 0.22, 1.95], [0.43, 0.2, 1.85], [0.55, 0.19, 1.75], [0.68, 0.18, 1.62], [0.8, 0.18, 1.5]];
  return merge(
    toes.map(([x, y, z], i) =>
      F({ path: [[0.66, 0.34, 0.6], [lerp(0.66, x, 0.6), y + 0.1, lerp(0.6, z, 0.55)], [x, y, z]], out: [0, 1, 0], w: 0.02, h: 0.02, tendon: true, rt: 0.022 - i * 0.0, rings: 20 }),
    ),
  );
}, { label: 'f' });

export const MUSCLE_DEFS: MuscleDef[] = defs;
export const MUSCLE_IDS: string[] = defs.map((d) => d.id);

export const GROUP_IDS = ['g-head', 'g-back', 'g-chest', 'g-abdomen', 'g-shoulder', 'g-arm', 'g-forearm', 'g-hand', 'g-hip', 'g-thigh', 'g-leg', 'g-foot'] as const;

export const GROUP_OF: Record<string, string> = Object.fromEntries(defs.map((d) => [d.id, d.group]));

/** Разнос слоёв: поверхностные уходят дальше всех. */
export const LAYER_SPREAD: Record<Layer, number> = { 1: 0.9, 2: 0.45, 3: 0.12 };

/** Границы, в которых двигаются плоскости среза (модельные координаты). */
export const CUT_RANGE = { side: [-1.7, 1.7], fundus: [0.1, 17.6], coronal: [-2.8, 2.8] } as const;

export const CUT_DEFAULT_T = { side: 0.5, fundus: 0.4, coronal: 0.5 };

/** Подпись: точка на поверхности мышцы, обращённая в нужную сторону. */
export function labelPoint(g: BufferGeometry, placement: Placement): V3 {
  const pos = g.attributes.position;
  const bb = g.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cy = (bb.min.y + bb.max.y) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  let best = -Infinity;
  let at: V3 = [cx, cy, cz];
  const dir: V3 = placement === 'f' ? [0, 0, 1] : placement === 'b' ? [0, 0, -1] : [1, 0, 0];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // ближе к середине по высоте и дальше в нужную сторону
    const score = (x - cx) * dir[0] + (z - cz) * dir[2] - Math.abs(y - cy) * 0.35 - Math.abs((x - cx) * dir[2]) * 0.0;
    if (score > best) {
      best = score;
      at = [x, y, z];
    }
  }
  return at;
}
