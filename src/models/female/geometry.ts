import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from 'three';

export type V3 = [number, number, number];

/* ---------- шум: значения на целочисленной решётке со сглаживанием ---------- */

function hash(ix: number, iy: number, iz: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Гладкий шум в диапазоне −1..1. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  const r = l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
  return r * 2 - 1;
}

export function fbm(x: number, y: number, z: number, octaves = 3): number {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/* ---------- профили: гладкая кривая по таблице (s, значение) ---------- */

export function profile(table: [number, number][]): (s: number) => number {
  const n = table.length;
  const slope = table.map((_, i) => {
    const a = table[Math.max(0, i - 1)], b = table[Math.min(n - 1, i + 1)];
    return b[0] === a[0] ? 0 : (b[1] - a[1]) / (b[0] - a[0]);
  });
  return (s: number) => {
    if (s <= table[0][0]) return table[0][1];
    if (s >= table[n - 1][0]) return table[n - 1][1];
    let i = 0;
    while (i < n - 2 && s > table[i + 1][0]) i++;
    const [x0, y0] = table[i], [x1, y1] = table[i + 1];
    const h = x1 - x0, t = (s - x0) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slope[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slope[i + 1];
  };
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function curveOf(points: V3[], tension = 0.5): CatmullRomCurve3 {
  return new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'catmullrom', tension);
}

/* ---------- лофт: поверхность вокруг оси-кривой с эллиптическим сечением ---------- */

export interface LoftSpec {
  curve: CatmullRomCurve3;
  /** Направление «ширины» сечения (по умолчанию ось x). */
  up?: Vector3;
  rx: (s: number) => number;
  rz?: (s: number) => number;
  /** Множитель радиуса в точке (s, угол) — рельеф, складки, бугры. */
  mod?: (s: number, th: number) => number;
  ox?: (s: number) => number;
  oz?: (s: number) => number;
}

const UP_X = new Vector3(1, 0, 0);
const TMP_T = new Vector3();

function ring(spec: LoftSpec, s: number, M: number): Vector3[] {
  const t = Math.min(1, Math.max(0, s));
  const C = spec.curve.getPointAt(t);
  const T = spec.curve.getTangentAt(t, TMP_T).normalize();
  const up = spec.up ?? UP_X;
  let U = up.clone().sub(T.clone().multiplyScalar(up.dot(T)));
  if (U.lengthSq() < 1e-4) U = new Vector3(0, 0, 1).sub(T.clone().multiplyScalar(T.z));
  U.normalize();
  const W = new Vector3().crossVectors(T, U);
  const rx = Math.max(0, spec.rx(s));
  const rz = Math.max(0, (spec.rz ?? spec.rx)(s));
  const ox = spec.ox?.(s) ?? 0;
  const oz = spec.oz?.(s) ?? 0;
  const pts: Vector3[] = [];
  for (let j = 0; j <= M; j++) {
    const th = (j % M) / M * Math.PI * 2;
    const m = spec.mod ? spec.mod(s, th) : 1;
    const a = Math.cos(th) * rx * m + ox;
    const b = Math.sin(th) * rz * m + oz;
    pts.push(C.clone().addScaledVector(U, a).addScaledVector(W, b));
  }
  return pts;
}

export const centerRing = (spec: LoftSpec, s: number, M: number): Vector3[] => {
  const c = spec.curve.getPointAt(Math.min(1, Math.max(0, s)));
  return Array.from({ length: M + 1 }, () => c.clone());
};

interface Grid {
  base: number;
  rows: number;
  cols: number;
  closed: boolean;
}

/** Накопитель сетки: набор «решёток» точек, из которых получается одна индексированная геометрия. */
export class Mesher {
  pos: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  grids: Grid[] = [];

  /** inward=true переворачивает обход (нормали внутрь — поверхность просвета). */
  grid(rows: Vector3[][], inward = false, uScale = 1, vScale = 1, closed = true): this {
    const base = this.pos.length / 3;
    const R = rows.length, C = rows[0].length;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const p = rows[r][c];
        this.pos.push(p.x, p.y, p.z);
        this.uv.push((c / (C - 1)) * uScale, (r / Math.max(1, R - 1)) * vScale);
      }
    }
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        const a = base + r * C + c, b = a + 1, c2 = a + C, d = c2 + 1;
        if (!inward) this.idx.push(a, b, c2, b, d, c2);
        else this.idx.push(a, c2, b, b, c2, d);
      }
    }
    this.grids.push({ base, rows: R, cols: C, closed });
    return this;
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const n = g.getAttribute('normal');
    const p = g.getAttribute('position');
    const avg = (ids: number[]) => {
      let x = 0, y = 0, z = 0;
      for (const i of ids) { x += n.getX(i); y += n.getY(i); z += n.getZ(i); }
      const l = Math.hypot(x, y, z) || 1;
      for (const i of ids) n.setXYZ(i, x / l, y / l, z / l);
    };
    for (const gr of this.grids) {
      if (!gr.closed) continue;
      for (let r = 0; r < gr.rows; r++) {
        const row = gr.base + r * gr.cols;
        const far = row + (gr.cols >> 1);
        const collapsed = Math.hypot(p.getX(row) - p.getX(far), p.getY(row) - p.getY(far), p.getZ(row) - p.getZ(far)) < 1e-4;
        if (collapsed) avg(Array.from({ length: gr.cols }, (_, c) => row + c));
        else avg([row, row + gr.cols - 1]);
      }
    }
    n.needsUpdate = true;
    return g;
  }
}

export interface WallOptions {
  outer: LoftSpec;
  /** Просвет: поверхность с нормалями внутрь. Без неё тело сплошное. */
  inner?: LoftSpec;
  s0?: number;
  s1?: number;
  /** Диапазон по s для внутренней поверхности (по умолчанию тот же). */
  i0?: number;
  i1?: number;
  rings?: number;
  around?: number;
  /** Масштаб текстурных координат: по кругу и вдоль. */
  uv?: [number, number];
  /** Не замыкать торец (для разрезанных или соединённых частей остаётся плоский торец). */
  openStart?: boolean;
  openEnd?: boolean;
}

const sample = (a: number, b: number, i: number, n: number) => a + ((b - a) * i) / n;

/** Толстостенное замкнутое тело: наружная поверхность + перевёрнутая внутренняя + торцы. Из таких тел получаются честные срезы. */
export function wallSolid(o: WallOptions): BufferGeometry {
  const s0 = o.s0 ?? 0, s1 = o.s1 ?? 1;
  const N = o.rings ?? 40, M = o.around ?? 36;
  const [uS, vS] = o.uv ?? [2, 3];
  const ms = new Mesher();
  const outerRows: Vector3[][] = [];
  for (let i = 0; i <= N; i++) outerRows.push(ring(o.outer, sample(s0, s1, i, N), M));
  ms.grid(outerRows, false, uS, vS);
  const closedAt = (spec: LoftSpec, s: number) => Math.max(spec.rx(s), (spec.rz ?? spec.rx)(s)) < 1e-3;
  if (o.inner) {
    const i0 = o.i0 ?? s0, i1 = o.i1 ?? s1;
    const innerRows: Vector3[][] = [];
    for (let i = 0; i <= N; i++) innerRows.push(ring(o.inner, sample(i0, i1, i, N), M));
    ms.grid(innerRows, true, uS, vS);
    if (!closedAt(o.outer, s0) && !o.openStart) ms.grid([outerRows[0], innerRows[0]], true, uS, 1);
    if (!closedAt(o.outer, s1) && !o.openEnd) ms.grid([outerRows[N], innerRows[N]], false, uS, 1);
  } else {
    if (!closedAt(o.outer, s0)) ms.grid([outerRows[0], centerRing(o.outer, s0, M)], true, uS, 1);
    if (!closedAt(o.outer, s1)) ms.grid([outerRows[N], centerRing(o.outer, s1, M)], false, uS, 1);
  }
  return ms.geometry();
}

/** Открытая оболочка (без торцов): оверлеи, плёнки, подсветка отделов. */
export function shellOf(spec: LoftSpec, s0 = 0, s1 = 1, rings = 30, around = 32, inward = false, uv: [number, number] = [2, 3]): BufferGeometry {
  const rows: Vector3[][] = [];
  for (let i = 0; i <= rings; i++) rows.push(ring(spec, sample(s0, s1, i, rings), around));
  return new Mesher().grid(rows, inward, uv[0], uv[1]).geometry();
}

/** Труба переменного радиуса по кривой, с закрытыми торцами. */
export function tubeSolid(curve: CatmullRomCurve3, radius: (s: number) => number, o: { s0?: number; s1?: number; rings?: number; around?: number; inner?: (s: number) => number; mod?: LoftSpec['mod']; up?: Vector3; openStart?: boolean; openEnd?: boolean } = {}): BufferGeometry {
  const spec: LoftSpec = { curve, rx: radius, mod: o.mod, up: o.up ?? new Vector3(0, 0, 1) };
  const inner: LoftSpec | undefined = o.inner ? { curve, rx: o.inner, up: spec.up } : undefined;
  return wallSolid({ outer: spec, inner, s0: o.s0, s1: o.s1, rings: o.rings ?? 40, around: o.around ?? 14, uv: [1, Math.max(2, curve.getLength() * 0.8)], openStart: o.openStart, openEnd: o.openEnd });
}

/** Поверхность-лист: параметрическое полотно (u, v) → точка; двусторонний лист для связок и брыжейки. */
export function patch(f: (u: number, v: number) => V3, nu: number, nv: number, uv: [number, number] = [2, 2]): BufferGeometry {
  const rows: Vector3[][] = [];
  for (let j = 0; j <= nv; j++) {
    const row: Vector3[] = [];
    for (let i = 0; i <= nu; i++) row.push(new Vector3(...f(i / nu, j / nv)));
    rows.push(row);
  }
  return new Mesher().grid(rows, false, uv[0], uv[1], false).geometry();
}

/** Эллипсоид-замкнутое тело с рельефом, повёрнутое и смещённое (запекается в вершины: поворотов в сцене нет). */
export function blob(center: V3, radii: V3, o: { rot?: V3; detail?: number; bump?: (x: number, y: number, z: number) => number; seed?: number } = {}): BufferGeometry {
  const N = o.detail ?? 28, M = N * 2;
  const rows: Vector3[][] = [];
  const rot = o.rot ?? [0, 0, 0];
  const e = new Vector3();
  const cx = Math.cos(rot[0]), sx = Math.sin(rot[0]), cy = Math.cos(rot[1]), sy = Math.sin(rot[1]), cz = Math.cos(rot[2]), sz = Math.sin(rot[2]);
  for (let i = 0; i <= N; i++) {
    const ph = (i / N) * Math.PI;
    const row: Vector3[] = [];
    for (let j = 0; j <= M; j++) {
      const th = ((j % M) / M) * Math.PI * 2;
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
      const b = o.bump ? 1 + o.bump(nx + (o.seed ?? 0), ny, nz) : 1;
      e.set(nx * radii[0] * b, ny * radii[1] * b, nz * radii[2] * b);
      // повороты Эйлера: z, затем x, затем y
      let x = e.x * cz - e.y * sz, y = e.x * sz + e.y * cz, z = e.z;
      const y2 = y * cx - z * sx, z2 = y * sx + z * cx;
      y = y2; z = z2;
      const x3 = x * cy + z * sy, z3 = -x * sy + z * cy;
      row.push(new Vector3(x3 + center[0], y + center[1], z3 + center[2]));
    }
    rows.push(row);
  }
  return new Mesher().grid(rows, false, 2, 1).geometry();
}

export function mergeGeos(list: BufferGeometry[]): BufferGeometry {
  const ms = new Mesher();
  let base = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    const ix = g.getIndex()!;
    for (let i = 0; i < p.count; i++) {
      ms.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      ms.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    for (let i = 0; i < ix.count; i++) ms.idx.push(ix.getX(i) + base);
    base += p.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(ms.pos, 3));
  out.setAttribute('uv', new Float32BufferAttribute(ms.uv, 2));
  out.setIndex(ms.idx);
  // нормали сливаются «как есть» из исходных геометрий
  const normals: number[] = [];
  for (const g of list) {
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) normals.push(n.getX(i), n.getY(i), n.getZ(i));
  }
  out.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  return out;
}

/* ---------- срез: заглушка (cap) сечения замкнутого тела плоскостью, перпендикулярной оси ---------- */

export interface CapMesh {
  position: Float32Array;
  index: Uint32Array;
}

type P2 = [number, number];

function inside(pt: P2, poly: P2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const area = (poly: P2[]): number => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
};

/**
 * Сечение замкнутого тела плоскостью coord(axis) = c. Контуры собираются из отрезков пересечения,
 * вложенность (стенка с просветом, срез внутри среза) определяется по чётности, затем контуры триангулируются.
 */
export function sliceSolid(pos: ArrayLike<number>, index: ArrayLike<number>, axis: 0 | 1 | 2, c: number): CapMesh | null {
  const A = (axis + 1) % 3, B = (axis + 2) % 3;
  const segs: [number, number, number, number][] = [];
  const d = [0, 0, 0];
  const pt = (ia: number, ib: number): P2 => {
    const t = d[ia] / (d[ia] - d[ib]);
    return [pos[ia3[ia] + A] + (pos[ia3[ib] + A] - pos[ia3[ia] + A]) * t, pos[ia3[ia] + B] + (pos[ia3[ib] + B] - pos[ia3[ia] + B]) * t];
  };
  const ia3 = [0, 0, 0];
  for (let t = 0; t < index.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      ia3[k] = index[t + k] * 3;
      let v = pos[ia3[k] + axis] - c;
      if (Math.abs(v) < 1e-7) v = 1e-7;
      d[k] = v;
    }
    const s0 = d[0] > 0, s1 = d[1] > 0, s2 = d[2] > 0;
    if (s0 === s1 && s1 === s2) continue;
    const found: P2[] = [];
    if (s0 !== s1) found.push(pt(0, 1));
    if (s1 !== s2) found.push(pt(1, 2));
    if (s2 !== s0) found.push(pt(2, 0));
    if (found.length === 2) segs.push([found[0][0], found[0][1], found[1][0], found[1][1]]);
  }
  if (segs.length < 3) return null;
  const Q = 5000;
  const key = (x: number, y: number) => `${Math.round(x * Q)},${Math.round(y * Q)}`;
  const adj = new Map<string, number[]>();
  const add = (k: string, i: number) => {
    const l = adj.get(k);
    if (l) l.push(i);
    else adj.set(k, [i]);
  };
  segs.forEach((s, i) => {
    add(key(s[0], s[1]), i);
    add(key(s[2], s[3]), i);
  });
  const used = new Uint8Array(segs.length);
  const loops: P2[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const poly: P2[] = [[segs[i][0], segs[i][1]]];
    const startKey = key(segs[i][0], segs[i][1]);
    let cur = key(segs[i][2], segs[i][3]);
    let tail: P2 = [segs[i][2], segs[i][3]];
    let closed = false;
    for (let guard = 0; guard < segs.length + 2; guard++) {
      poly.push(tail);
      if (cur === startKey) { closed = true; break; }
      const next = (adj.get(cur) ?? []).find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = 1;
      const s = segs[next];
      if (key(s[0], s[1]) === cur) { tail = [s[2], s[3]]; cur = key(s[2], s[3]); }
      else { tail = [s[0], s[1]]; cur = key(s[0], s[1]); }
    }
    if (closed) {
      poly.pop();
      if (poly.length >= 3 && area(poly) > 1e-6) loops.push(poly);
    }
  }
  if (!loops.length) return null;
  const areas = loops.map(area);
  const parent = loops.map((l, i) => {
    let depth = 0;
    let best = -1;
    loops.forEach((o, j) => {
      if (i !== j && areas[j] > areas[i] && inside(l[0], o)) {
        depth++;
        if (best < 0 || areas[j] < areas[best]) best = j;
      }
    });
    return { depth, best };
  });
  const positions: number[] = [];
  const indices: number[] = [];
  loops.forEach((contour, i) => {
    if (parent[i].depth % 2) return;
    const holes = loops.filter((_, j) => parent[j].depth % 2 === 1 && parent[j].best === i);
    const all = [contour, ...holes];
    const v2 = contour.map((p) => new Vector2(p[0], p[1]));
    const h2 = holes.map((h) => h.map((p) => new Vector2(p[0], p[1])));
    const tris = ShapeUtils.triangulateShape(v2, h2);
    const base = positions.length / 3;
    for (const poly of all) {
      for (const p of poly) {
        const v = [0, 0, 0];
        v[axis] = c;
        v[A] = p[0];
        v[B] = p[1];
        positions.push(v[0], v[1], v[2]);
      }
    }
    for (const t of tris) indices.push(base + t[0], base + t[1], base + t[2]);
  });
  if (!indices.length) return null;
  return { position: new Float32Array(positions), index: new Uint32Array(indices) };
}
