import { BufferGeometry, CatmullRomCurve3, Euler, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3, type Curve } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
export type RGB = [number, number, number];

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Детерминированный генератор: у модели всегда одна и та же «случайная» раскладка. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Гладкий шум значений, 0..1. */
export function vnoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number) => hash(ix + a, iy + b, iz + c);
  const x00 = lerp(h(0, 0, 0), h(1, 0, 0), ux);
  const x10 = lerp(h(0, 1, 0), h(1, 1, 0), ux);
  const x01 = lerp(h(0, 0, 1), h(1, 0, 1), ux);
  const x11 = lerp(h(0, 1, 1), h(1, 1, 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
}

/** Многооктавный фрактальный шум (fBm), 0..1, для органического микрорельефа. */
export function fbm(x: number, y: number, z: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / (norm || 1);
}

const sgnPow = (v: number, p: number): number => Math.sign(v) * Math.abs(v) ** p;

function ensureIndex(g: BufferGeometry): void {
  if (g.index) return;
  const n = g.getAttribute('position').count;
  g.setIndex(Array.from({ length: n }, (_, i) => i));
}

/** Склеивает меши в один; недостающие атрибуты (нормали, uv, цвет) добавляются. */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const gs = list.filter((g) => g && g.getAttribute('position')?.count);
  if (!gs.length) return new BufferGeometry();
  const hasColor = gs.some((g) => g.getAttribute('color'));
  for (const g of gs) {
    ensureIndex(g);
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (hasColor && !g.getAttribute('color')) g.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  }
  const out = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
  return out ?? new BufferGeometry();
}

/** Кольца (каждое замкнуто: первая и последняя точки совпадают) -> поверхность с наружными нормалями. */
export function ringsToGeometry(rings: Vector3[][], colors?: RGB[][], uvLen?: number): BufferGeometry {
  const rows = rings.length;
  const cols = rings[0].length;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const col = colors ? new Float32Array(rows * cols * 3) : null;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const k = i * cols + j;
      pos[k * 3] = rings[i][j].x;
      pos[k * 3 + 1] = rings[i][j].y;
      pos[k * 3 + 2] = rings[i][j].z;
      uv[k * 2] = j / (cols - 1);
      uv[k * 2 + 1] = (i / (rows - 1)) * (uvLen ?? 1);
      if (col && colors) {
        const c = colors[i][j] ?? [1, 1, 1];
        col[k * 3] = c[0];
        col[k * 3 + 1] = c[1];
        col[k * 3 + 2] = c[2];
      }
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // шов кольца: нормали первой и последней точек усредняем, чтобы шва не было видно
  const nr = g.getAttribute('normal');
  for (let i = 0; i < rows; i++) {
    const a = i * cols;
    const b = i * cols + cols - 1;
    const x = nr.getX(a) + nr.getX(b);
    const y = nr.getY(a) + nr.getY(b);
    const z = nr.getZ(a) + nr.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l);
    nr.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

export type CapKind = 'flat' | 'round' | null;

export interface SweepOpt {
  /** Колец вдоль оси. */
  n?: number;
  /** Точек в кольце. */
  m?: number;
  u0?: number;
  u1?: number;
  cap0?: CapKind;
  cap1?: CapKind;
  /** Сжатие размера вдоль «z-оси» кольца (плоские волосы, ленты). */
  squash?: number | ((u: number) => number);
  /** Радиальный множитель по углу (неровность, ребристость). */
  wob?: (u: number, a: number) => number;
  color?: (u: number, a: number) => RGB;
  /** Сколько раз текстура повторяется вдоль трубки. */
  uvLen?: number;
  /** Длина закругления торцов (по умолчанию — радиус). */
  roundLen0?: number;
  roundLen1?: number;
}

interface Ring {
  c: Vector3;
  T: Vector3;
  B: Vector3;
  N: Vector3;
  r: number;
  u: number;
}

/** Трубка вокруг кривой с радиусом, зависящим от параметра: параллельный перенос рамки, закрытые торцы. */
export function sweep(curve: Curve<Vector3>, radius: (u: number) => number, o: SweepOpt = {}): BufferGeometry {
  const n = o.n ?? 64;
  const m = o.m ?? 28;
  const u0 = o.u0 ?? 0;
  const u1 = o.u1 ?? 1;
  const sq = (u: number) => (typeof o.squash === 'function' ? o.squash(u) : (o.squash ?? 1));
  const samples: Ring[] = [];
  let prevT: Vector3 | null = null;
  let B = new Vector3();
  let N = new Vector3();
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    const c = curve.getPoint(clamp(u));
    const T = curve.getTangent(clamp(u)).normalize();
    if (!prevT) {
      const ref = Math.abs(T.z) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
      B = new Vector3().crossVectors(ref, T).normalize();
      N = new Vector3().crossVectors(T, B).normalize();
    } else {
      const q = new Quaternion().setFromUnitVectors(prevT, T);
      B.applyQuaternion(q).normalize();
      N.applyQuaternion(q).normalize();
    }
    prevT = T.clone();
    samples.push({ c, T, B: B.clone(), N: N.clone(), r: radius(u), u });
  }
  const list: Ring[] = [];
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (o.cap0 === 'round') {
    const len = o.roundLen0 ?? first.r;
    for (let k = 8; k >= 1; k--) {
      const phi = (k / 8) * (Math.PI / 2);
      list.push({ ...first, c: first.c.clone().addScaledVector(first.T, -len * Math.sin(phi)), r: first.r * Math.cos(phi) });
    }
  } else if (o.cap0 === 'flat') {
    list.push({ ...first, r: 0 }, { ...first });
  }
  list.push(...samples);
  if (o.cap1 === 'round') {
    const len = o.roundLen1 ?? last.r;
    for (let k = 1; k <= 8; k++) {
      const phi = (k / 8) * (Math.PI / 2);
      list.push({ ...last, c: last.c.clone().addScaledVector(last.T, len * Math.sin(phi)), r: last.r * Math.cos(phi) });
    }
  } else if (o.cap1 === 'flat') {
    list.push({ ...last }, { ...last, r: 0 });
  }
  const rings: Vector3[][] = [];
  const colors: RGB[][] = [];
  for (const s of list) {
    const ring: Vector3[] = [];
    const rc: RGB[] = [];
    const sz = sq(s.u);
    for (let j = 0; j <= m; j++) {
      const a = (j / m) * Math.PI * 2;
      const w = s.r * (o.wob ? o.wob(s.u, a) : 1);
      ring.push(s.c.clone().addScaledVector(s.B, Math.cos(a) * w).addScaledVector(s.N, Math.sin(a) * w * sz));
      if (o.color) rc.push(o.color(s.u, a));
    }
    rings.push(ring);
    if (o.color) colors.push(rc);
  }
  return ringsToGeometry(rings, o.color ? colors : undefined, o.uvLen);
}

export const curveOf = (pts: V3[], closed = false, tension = 0.5): CatmullRomCurve3 =>
  new CatmullRomCurve3(
    pts.map((p) => new Vector3(...p)),
    closed,
    'catmullrom',
    tension,
  );

/** Трубка по ломаной (сосуды, нервы, протоки). */
export function tube(pts: V3[], r: number | ((u: number) => number), o: SweepOpt = {}): BufferGeometry {
  const rad = typeof r === 'number' ? () => r : r;
  return sweep(curveOf(pts), rad, { n: Math.max(18, pts.length * 10), m: 14, cap0: 'round', cap1: 'round', ...o });
}

export interface SectionShape {
  /** Центр по y и полувысота. */
  cy: number;
  ry: number;
  /** Полуширина по z. */
  hw: number;
  /** Сдвиг центра по z. */
  cz?: number;
  /** Показатель суперэллипса: 2 — эллипс, больше — «подушка». */
  p?: number;
  /** Необязательная модуляция радиуса по углу (для мыщелков и костных выступов). */
  mod?: (a: number) => number;
}

export interface LoftOpt {
  n?: number;
  m?: number;
  cap0?: CapKind;
  cap1?: CapKind;
  roundLen0?: number;
  roundLen1?: number;
  uvLen?: number;
}

/** Тело вдоль оси x: сечение — суперэллипс, размеры задаются функцией от x. Основа пальца и костей. */
export function loft(x0: number, x1: number, sec: (x: number) => SectionShape, o: LoftOpt = {}): BufferGeometry {
  const n = o.n ?? 72;
  const m = o.m ?? 36;
  const ringAt = (xs: number, xp: number, scale: number): Vector3[] => {
    const s = sec(xs);
    const p = 2 / (s.p ?? 2.4);
    const out: Vector3[] = [];
    for (let j = 0; j <= m; j++) {
      const a = (j / m) * Math.PI * 2;
      const k = s.mod ? s.mod(a) : 1;
      const cy = sgnPow(Math.cos(a), p);
      const cz = sgnPow(Math.sin(a), p);
      out.push(new Vector3(xp, s.cy + s.ry * cy * scale * k, (s.cz ?? 0) + s.hw * cz * scale * k));
    }
    return out;
  };
  const point = (xs: number, xp: number): Vector3[] => {
    const s = sec(xs);
    return Array.from({ length: m + 1 }, () => new Vector3(xp, s.cy, s.cz ?? 0));
  };
  const rings: Vector3[][] = [];
  if (o.cap0 === 'round') {
    const len = o.roundLen0 ?? sec(x0).ry;
    for (let k = 8; k >= 1; k--) {
      const phi = (k / 8) * (Math.PI / 2);
      rings.push(ringAt(x0, x0 - len * Math.sin(phi), Math.cos(phi)));
    }
  } else if (o.cap0 === 'flat') {
    rings.push(point(x0, x0), ringAt(x0, x0, 1));
  }
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    rings.push(ringAt(x, x, 1));
  }
  if (o.cap1 === 'round') {
    const len = o.roundLen1 ?? sec(x1).ry;
    for (let k = 1; k <= 8; k++) {
      const phi = (k / 8) * (Math.PI / 2);
      rings.push(ringAt(x1, x1 + len * Math.sin(phi), Math.cos(phi)));
    }
  } else if (o.cap1 === 'flat') {
    rings.push(ringAt(x1, x1, 1), point(x1, x1));
  }
  return ringsToGeometry(rings, undefined, o.uvLen);
}

export interface SlabOpt {
  x0: number;
  x1: number;
  zh: number | ((x: number) => number);
  top: (x: number, z: number) => number;
  bot: (x: number, z: number) => number;
  nx?: number;
  nz?: number;
}

/** Замкнутая плита с переменной верхней и нижней поверхностью: слои кожи, пластина ногтя, ложе. */
export function heightSlab(o: SlabOpt): BufferGeometry {
  const nx = o.nx ?? 32;
  const nz = o.nz ?? 24;
  const zhOf = (x: number) => (typeof o.zh === 'function' ? o.zh(x) : o.zh);
  const P: number[] = [];
  const UV: number[] = [];
  const I: number[] = [];
  const spanX = Math.max(1e-4, o.x1 - o.x0);
  const grid = (f: (x: number, z: number) => number, flip: boolean) => {
    const base = P.length / 3;
    for (let i = 0; i <= nx; i++) {
      const x = o.x0 + (spanX * i) / nx;
      const zh = zhOf(x);
      for (let j = 0; j <= nz; j++) {
        const z = ((2 * j) / nz - 1) * zh;
        P.push(x, f(x, z), z);
        UV.push((x - o.x0) / spanX, j / nz);
      }
    }
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const a = base + i * (nz + 1) + j;
        const b = a + 1;
        const c = a + nz + 1;
        const d = c + 1;
        if (flip) I.push(a, c, b, b, c, d);
        else I.push(a, b, c, b, d, c);
      }
    }
  };
  grid(o.top, false);
  grid(o.bot, true);
  const quad = (p0: V3, p1: V3, p2: V3, p3: V3, out: V3) => {
    const base = P.length / 3;
    P.push(...p0, ...p1, ...p2, ...p3);
    UV.push(0, 0, 1, 0, 0, 1, 1, 1);
    const u = new Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const v = new Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    const nrm = new Vector3().crossVectors(u, v);
    if (nrm.dot(new Vector3(...out)) >= 0) I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    else I.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  const pt = (x: number, z: number, top: boolean): V3 => [x, top ? o.top(x, z) : o.bot(x, z), z];
  for (let i = 0; i < nx; i++) {
    const xa = o.x0 + (spanX * i) / nx;
    const xb = o.x0 + (spanX * (i + 1)) / nx;
    quad(pt(xa, -zhOf(xa), true), pt(xb, -zhOf(xb), true), pt(xa, -zhOf(xa), false), pt(xb, -zhOf(xb), false), [0, 0, -1]);
    quad(pt(xa, zhOf(xa), true), pt(xb, zhOf(xb), true), pt(xa, zhOf(xa), false), pt(xb, zhOf(xb), false), [0, 0, 1]);
  }
  for (let j = 0; j < nz; j++) {
    for (const [x, sx] of [[o.x0, -1], [o.x1, 1]] as [number, number][]) {
      const za = ((2 * j) / nz - 1) * zhOf(x);
      const zb = ((2 * (j + 1)) / nz - 1) * zhOf(x);
      quad(pt(x, za, true), pt(x, zb, true), pt(x, za, false), pt(x, zb, false), [sx, 0, 0]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

export const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): BufferGeometry =>
  heightSlab({ x0, x1, zh: (z1 - z0) / 2, top: () => y1, bot: () => y0, nx: 1, nz: 1 }).translate(0, 0, (z0 + z1) / 2);

export interface BlobOpt {
  seed?: number;
  amp?: number;
  freq?: number;
  seg?: number;
  rot?: V3;
}

/** Неровный эллипсоид: клетки, дольки, железы, тельца. */
export function blob(c: V3, r: V3, o: BlobOpt = {}): BufferGeometry {
  const seg = o.seg ?? 18;
  let g: BufferGeometry = new SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.75)));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position');
  const seed = (o.seed ?? 1) * 13.37;
  const amp = o.amp ?? 0;
  const f = o.freq ?? 1.6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + amp * (fbm(x * f + seed, y * f - seed, z * f + seed * 0.5, 2) - 0.5) * 2;
    p.setXYZ(i, x * k * r[0], y * k * r[1], z * k * r[2]);
  }
  if (o.rot) g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...o.rot)));
  g.translate(c[0], c[1], c[2]);
  g.computeVertexNormals();
  return g;
}

/** Поворот, масштаб и сдвиг уже построенной геометрии. */
export function place(g: BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): BufferGeometry {
  g.applyMatrix4(new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale)));
  return g;
}

/** Диск-торец в плоскости x = const с наружной нормалью по -x: срез волокна, сечения типов волоса. */
export function disc(x: number, ry: number, rz: number, o: { cy?: number; cz?: number; shape?: (a: number) => number; m?: number; thick?: number } = {}): BufferGeometry {
  const m = o.m ?? 56;
  const thick = o.thick ?? 0.04;
  const shape = o.shape ?? (() => 1);
  const cy = o.cy ?? 0;
  const cz = o.cz ?? 0;
  const ringAt = (xx: number): Vector3[] =>
    Array.from({ length: m + 1 }, (_, j) => {
      const a = (j / m) * Math.PI * 2;
      const k = shape(a);
      return new Vector3(xx, cy + ry * Math.cos(a) * k, cz + rz * Math.sin(a) * k);
    });
  const centre = (xx: number): Vector3[] => Array.from({ length: m + 1 }, () => new Vector3(xx, cy, cz));
  return ringsToGeometry([centre(x), ringAt(x), ringAt(x), ringAt(x + thick), ringAt(x + thick), centre(x + thick)]);
}

/** Объём замкнутого меша (положительный, если нормали наружу); нужен тестам. */
export function signedVolume(g: BufferGeometry): number {
  const p = g.getAttribute('position');
  const idx = g.index;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let v = 0;
  const tri = (i: number, j: number, k: number) => {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, j);
    c.fromBufferAttribute(p, k);
    v += a.dot(new Vector3().crossVectors(b, c)) / 6;
  };
  if (idx) for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  else for (let i = 0; i < p.count; i += 3) tri(i, i + 1, i + 2);
  return v;
}
