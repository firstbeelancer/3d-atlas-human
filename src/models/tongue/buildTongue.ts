import { BufferGeometry, CircleGeometry, CylinderGeometry, Float32BufferAttribute, LatheGeometry, Matrix4, Quaternion, SphereGeometry, Vector2, Vector3 } from 'three';
import {
  CARUNCLE,
  FLOOR_Y,
  GENIAL,
  HYOID_PTS,
  MANDIBLE_BODY_PTS,
  MID_LEN,
  PALATE,
  RAMUS_PTS,
  STYLOID_BASE,
  STYLOID_TIP,
  SUBLINGUAL,
  SUBMANDIBULAR,
  U_FORAMEN,
  VALLATE_CENTERS,
  botV,
  chordaPts,
  deepArteryPts,
  deepVeinPts,
  dorsal,
  dorsalBranchPts,
  epiglottisPoint,
  frameAt,
  glossopharyngealBranches,
  glossopharyngealPts,
  halfWidth,
  hypoglossalBranches,
  hypoglossalPts,
  inside,
  lingualArteryPts,
  lingualNerveBranches,
  lingualNervePts,
  lingualVeinPts,
  sublingualArteryPts,
  submandibularDuctPts,
  surface,
  topV,
  uSulcus,
  vagusBranch,
  vagusPts,
  ventral,
} from './anatomy';
import { Batch, alignMatrix, blob, clamp, curveOf, heightSlab, lerp, merge, orientOutward, rng, ringsToGeometry, signedVolume, smooth, tube, type V3 } from './geometry';
import type { Parts } from './types';

const v3 = (p: Vector3): V3 => [p.x, p.y, p.z];
const SIDES: (1 | -1)[] = [1, -1];

/* ───────────────────────────── Поверхность языка ───────────────────────────── */

type Region = 'apex' | 'body' | 'root' | 'dorsum' | 'ventral-surface';

interface Grid {
  pos: Float32Array;
  rows: number;
  cols: number;
  /** u и угол каждой строки/столбца (для разметки областей). */
  rowU: number[];
  rowCap: (0 | 1 | -1)[];
}

/** Сетка поверхности языка со скруглёнными концами: строки — вдоль оси, столбцы — по кругу сечения. */
function tongueGrid(off: number, n: number, m: number, grooves: boolean): Grid {
  const rowsSpec: { u: number; k: number; cap: 0 | 1 | -1 }[] = [];
  const CAP = 7;
  for (let i = CAP; i >= 1; i--) rowsSpec.push({ u: 0, k: i / CAP, cap: -1 });
  for (let i = 0; i <= n; i++) rowsSpec.push({ u: i / n, k: 0, cap: 0 });
  for (let i = 1; i <= CAP; i++) rowsSpec.push({ u: 1, k: i / CAP, cap: 1 });
  const cols = m + 1;
  const pos = new Float32Array(rowsSpec.length * cols * 3);
  rowsSpec.forEach((r, i) => {
    const f = frameAt(r.u);
    const phi = (r.k * Math.PI) / 2;
    const len = r.cap === 1 ? 0.42 : 0.6;
    const shift = r.cap === 0 ? 0 : r.cap * len * Math.sin(phi);
    const scale = r.cap === 0 ? 1 : Math.cos(phi);
    for (let j = 0; j <= m; j++) {
      const a = -Math.PI + (j / m) * Math.PI * 2;
      const p = surface(r.u, a, off, grooves && r.cap === 0);
      p.sub(f.c).multiplyScalar(scale).add(f.c).addScaledVector(f.t, shift);
      const k = (i * cols + j) * 3;
      pos[k] = p.x;
      pos[k + 1] = p.y;
      pos[k + 2] = p.z;
    }
  });
  return { pos, rows: rowsSpec.length, cols, rowU: rowsSpec.map((r) => r.u), rowCap: rowsSpec.map((r) => r.cap) };
}

function gridIndex(gr: Grid, keep?: (i: number, j: number) => boolean): number[] {
  const idx: number[] = [];
  for (let i = 0; i < gr.rows - 1; i++)
    for (let j = 0; j < gr.cols - 1; j++) {
      if (keep && !keep(i, j)) continue;
      const a = i * gr.cols + j;
      const b = a + 1;
      const c = a + gr.cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  return idx;
}

function gridGeometry(gr: Grid, idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(gr.pos.slice(), 3));
  const uv = new Float32Array(gr.rows * gr.cols * 2);
  const color = new Float32Array(gr.pos.length);
  for (let i = 0; i < gr.rows; i++)
    for (let j = 0; j < gr.cols; j++) {
      const k = (i * gr.cols + j) * 2;
      uv[k] = i / (gr.rows - 1);
      uv[k + 1] = j / (gr.cols - 1);
      const above = Math.sin(-Math.PI + uv[k + 1] * Math.PI * 2);
      const top = smooth(0.06, 0.92, above) * smooth(0.43, 0.64, gr.rowU[i]);
      const below = smooth(0.15, 0.94, -above);
      const root = 1 - smooth(0.07, 0.47, gr.rowU[i]);
      const q = (i * gr.cols + j) * 3;
      color[q] = 0.97 + 0.035 * top - 0.16 * root;
      color[q + 1] = 0.84 + 0.25 * top + 0.09 * below - 0.06 * root;
      color[q + 2] = 0.85 + 0.21 * top + 0.18 * below - 0.13 * root;
    }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(color, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // шов сечения: нормали первой и последней точек кольца усредняем, чтобы шва не было видно
  const nr = g.getAttribute('normal');
  for (let i = 0; i < gr.rows; i++) {
    const a = i * gr.cols;
    const b = a + gr.cols - 1;
    const x = nr.getX(a) + nr.getX(b);
    const y = nr.getY(a) + nr.getY(b);
    const z = nr.getZ(a) + nr.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l);
    nr.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

/** Сохраняет только использованные вершины. */
function compact(g: BufferGeometry): BufferGeometry {
  const idx = g.index!.array;
  const p = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const color = g.getAttribute('color');
  const map = new Map<number, number>();
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const C: number[] = [];
  const I: number[] = [];
  for (let k = 0; k < idx.length; k++) {
    const v = idx[k];
    let w = map.get(v);
    if (w === undefined) {
      w = P.length / 3;
      map.set(v, w);
      P.push(p.getX(v), p.getY(v), p.getZ(v));
      N.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
      U.push(uv.getX(v), uv.getY(v));
      C.push(color.getX(v), color.getY(v), color.getZ(v));
    }
    I.push(w);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new Float32BufferAttribute(U, 2));
  out.setAttribute('color', new Float32BufferAttribute(C, 3));
  out.setIndex(I);
  return out;
}

/** Слизистая: одна замкнутая поверхность, поделённая на области (верхушка, тело, корень, спинка, нижняя поверхность). */
function mucosaRegions(): Record<Region, BufferGeometry> {
  const n = 240;
  const m = 168;
  const gr = tongueGrid(0, n, m, true);
  const raw = gridGeometry(gr, gridIndex(gr));
  const flipped = signedVolume(raw) < 0;
  const full = orientOutward(raw);
  const normals = full.getAttribute('normal');
  const region = (i: number, j: number): Region => {
    const cap = gr.rowCap[i] !== 0 ? gr.rowCap[i] : gr.rowCap[i + 1];
    const u = (gr.rowU[i] + gr.rowU[i + 1]) / 2;
    if (cap === 1 || u > 0.885) return 'apex';
    const a = -Math.PI + ((j + 0.5) / m) * Math.PI * 2;
    const sa = Math.sin(a);
    const z = halfWidth(u) * Math.cos(a);
    if (cap === -1 || u < uSulcus(z)) return 'root';
    if (sa > 0.3) return 'dorsum';
    if (sa < -0.35 && u > 0.6) return 'ventral-surface';
    return 'body';
  };
  const lists: Record<Region, number[]> = { apex: [], body: [], root: [], dorsum: [], 'ventral-surface': [] };
  for (let i = 0; i < gr.rows - 1; i++)
    for (let j = 0; j < gr.cols - 1; j++) {
      const a = i * gr.cols + j;
      const b = a + 1;
      const c = a + gr.cols;
      const d = c + 1;
      const L = lists[region(i, j)];
      if (flipped) L.push(a, c, b, b, c, d);
      else L.push(a, b, c, b, d, c);
    }
  const out = {} as Record<Region, BufferGeometry>;
  for (const r of Object.keys(lists) as Region[]) {
    const g = new BufferGeometry();
    g.setAttribute('position', full.getAttribute('position'));
    g.setAttribute('normal', normals);
    g.setAttribute('uv', full.getAttribute('uv'));
    g.setAttribute('color', full.getAttribute('color'));
    g.setIndex(lists[r]);
    out[r] = compact(g);
  }
  full.dispose();
  return out;
}

/** Тело в «языковых» координатах: x — доля длины u, y — высота над осью, z — сбоку. */
function curvedSlab(o: Parameters<typeof heightSlab>[0]): BufferGeometry {
  const g = heightSlab(o);
  const p = g.getAttribute('position');
  for (let k = 0; k < p.count; k++) {
    const u = clamp(p.getX(k));
    const q = inside(u, p.getZ(k), p.getY(k));
    p.setXYZ(k, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return orientOutward(g);
}

/** Прямое волокно-цилиндр между двумя точками. */
const CYL = new CylinderGeometry(1, 1, 1, 7, 1, false);
function fibre(b: Batch, a: Vector3, c: Vector3, r: number): void {
  const d = c.clone().sub(a);
  const mid = a.clone().add(c).multiplyScalar(0.5);
  b.add(CYL, alignMatrix(v3(mid), v3(d), [r, d.length(), r]));
}

/* ───────────────────────────── Сосочки и рельеф ───────────────────────────── */

// Округлое основание, сужение и загнутый к корню кончик.
const FILIFORM = orientOutward(ringsToGeometry(
  [[-0.18, 0.88, 0], [0.06, 1, 0], [0.38, 0.63, -0.11], [0.71, 0.34, -0.34], [0.95, 0.11, -0.65], [1, 0, -0.72]]
    .map(([y, r, x]) => Array.from({ length: 7 }, (_, j) => {
      const a = (j / 6) * Math.PI * 2;
      return new Vector3(x + r * Math.cos(a), y, r * Math.sin(a));
    })),
));
const BALL = new SphereGeometry(1, 10, 8);
const MUSHROOM = orientOutward(
  new LatheGeometry(
    [
      [0, -0.06],
      [0.055, -0.06],
      [0.069, 0.016],
      [0.097, 0.032],
      [0.102, 0.054],
      [0.085, 0.074],
      [0.052, 0.085],
      [0, 0.088],
    ].map(([r, y]) => new Vector2(r, y)),
    12,
  ),
);
const VALLATE = orientOutward(
  new LatheGeometry(
    [
      [0, -0.3],
      [0.117, -0.3],
      [0.126, 0.0],
      [0.115, 0.031],
      [0.09, 0.046],
      [0, 0.051],
    ].map(([r, y]) => new Vector2(r, y)),
    20,
  ),
);
const NODULE = new LatheGeometry(
  [[0.02, 0.4], [0.13, 0.41], [0.18, 0.68], [0.25, 0.91], [0.43, 1], [0.67, 0.8], [0.88, 0.42], [1, -0.12]]
    .map(([r, y]) => new Vector2(r, y)), 18,
);
const CRYPT = new CircleGeometry(0.15, 10).rotateX(-Math.PI / 2);

function filiform(): BufferGeometry {
  const b = new Batch();
  const rand = rng(11);
  const step = 0.09;
  for (let s = (U_FORAMEN + 0.02) * MID_LEN; s < 0.985 * MID_LEN; s += step) {
    const u0 = s / MID_LEN;
    const w = halfWidth(u0) * 0.93;
    for (let z = -w; z <= w; z += step) {
      const u = u0 + ((rand() - 0.5) * step * 0.8) / MID_LEN;
      const zz = z + (rand() - 0.5) * step * 0.97;
      if (u < uSulcus(zz) + 0.029 || u > 0.987 || rand() < 0.075) continue;
      if (VALLATE_CENTERS.some((v) => Math.hypot((u - v.u) * MID_LEN, zz - v.z) < 0.235 * v.scale)) continue;
      const { p, n } = dorsal(u, zz, -0.011);
      const t = frameAt(u).t;
      const dir = n.clone().addScaledVector(t, -0.12 - rand() * 0.27);
      const h = 0.035 + rand() * 0.039;
      const r = 0.024 + rand() * 0.014;
      b.add(FILIFORM, alignMatrix(v3(p), v3(dir), [r, h, r * (0.79 + 0.34 * rand())], rand() * 6));
    }
  }
  return b.build();
}

function fungiform(): BufferGeometry {
  const b = new Batch();
  const rand = rng(23);
  const placed: [number, number][] = [];
  for (let tries = 0; tries < 6000 && placed.length < 145; tries++) {
    const u = lerp(U_FORAMEN + 0.06, 0.985, rand());
    const w = halfWidth(u) * 0.95;
    const z = (rand() * 2 - 1) * w;
    if (u < uSulcus(z) + 0.04) continue;
    if (VALLATE_CENTERS.some((v) => Math.hypot((u - v.u) * MID_LEN, z - v.z) < 0.27)) continue;
    // больше всего на верхушке и по краям
    const weight = 0.06 + 0.9 * smooth(0.74, 0.97, u) + 0.6 * smooth(0.6, 0.97, Math.abs(z) / w);
    if (rand() > weight) continue;
    if (placed.some(([u0, z0]) => Math.hypot((u0 - u) * MID_LEN, z0 - z) < 0.116)) continue;
    const { p, n } = dorsal(u, z, 0.0);
    const k = 0.48 + rand() * 0.36;
    b.add(MUSHROOM, alignMatrix(v3(p), v3(n), [k, k * (0.85 + rand() * 0.3), k * (0.88 + rand() * 0.2)], rand() * 6));
    placed.push([u, z]);
  }
  return b.build();
}

function foliate(): BufferGeometry {
  const list: BufferGeometry[] = [];
  for (const s of SIDES)
    for (let k = 0; k < 6; k++) {
      const u = lerp(0.435, 0.552, k / 5) + 0.003 * Math.sin(k * 2.4 + s);
      const pts: V3[] = [];
      for (let q = 0; q <= 8; q++) {
        const a = lerp(-0.26, 0.54 + 0.15 * Math.sin(k + 1), q / 8);
        const p = surface(u + 0.008 * Math.sin(q * 0.35 + k * 0.22), s === 1 ? a : Math.PI - a, -0.012);
        pts.push(v3(p));
      }
      list.push(tube(pts, (x) => 0.016 + 0.049 * Math.sin(Math.PI * x) ** 0.85, { m: 10, n: 24 }));
    }
  return merge(list);
}

function vallate(): BufferGeometry {
  const b = new Batch();
  for (const { u, z, scale } of VALLATE_CENTERS) {
    const { p, n } = dorsal(u, z, -0.009);
    b.add(VALLATE, alignMatrix(v3(p), v3(n), [scale, 0.88 + scale * 0.14, scale * 0.94], z * 2));
  }
  return b.build();
}

function lingualTonsil(): { bumps: BufferGeometry; crypts: BufferGeometry } {
  const b = new Batch();
  const c = new Batch();
  const rand = rng(31);
  const placed: [number, number][] = [];
  for (let tries = 0; tries < 3000 && placed.length < 64; tries++) {
    const u = lerp(0.05, U_FORAMEN, rand());
    const w = halfWidth(u) * 0.8;
    const z = (rand() * 2 - 1) * w;
    if (u > uSulcus(z) - 0.04) continue;
    if (placed.some(([u0, z0]) => Math.hypot((u0 - u) * MID_LEN, z0 - z) < 0.22)) continue;
    const { p, n } = dorsal(u, z, -0.018);
    const r = 0.12 + rand() * 0.15;
    const h = 0.049 + rand() * 0.063;
    const m = alignMatrix(v3(p), v3(n), [r, h, r * (0.7 + rand() * 0.48)], rand() * 6);
    b.add(NODULE, m);
    c.add(CRYPT, m.clone().multiply(new Matrix4().makeTranslation(0, 0.417, 0)));
    placed.push([u, z]);
  }
  return { bumps: b.build(), crypts: c.build() };
}

/* ───────────────────────────── Мышцы ───────────────────────────── */

function supLongitudinal(): BufferGeometry {
  return curvedSlab({
    x0: 0.16,
    x1: 0.975,
    zh: (u) => halfWidth(u) * 0.86,
    top: (u, z) => topV(u, z, -0.14, false),
    bot: (u, z) => topV(u, z, -0.14, false) - 0.26 * (0.35 + 0.65 * (1 - smooth(0.9, 0.98, u))),
    nx: 70,
    nz: 18,
  });
}

function infLongitudinal(): BufferGeometry {
  const list: BufferGeometry[] = [];
  for (const s of SIDES) {
    const pts: V3[] = [];
    for (let k = 0; k <= 14; k++) {
      const u = lerp(0.2, 0.97, k / 14);
      const z = halfWidth(u) * 0.5 * s;
      pts.push(v3(inside(u, z, botV(u, z) * 0.55)));
    }
    list.push(tube(pts, (x) => lerp(0.2, 0.06, x), { m: 12, n: 60 }));
  }
  return merge(list);
}

function transverse(): BufferGeometry {
  const b = new Batch();
  for (let k = 0; k < 22; k++) {
    const u = lerp(0.3, 0.95, k / 21);
    const w = halfWidth(u);
    for (const f of [-0.5, -0.17, 0.17, 0.5]) {
      for (const s of SIDES) {
        const v = f > 0 ? f * (topV(u, 0, -0.2, false)) * 1.3 : f * -botV(u, 0, -0.2) * 1.3;
        const z1 = w * 0.84 * Math.sqrt(Math.max(0.05, 1 - Math.abs(f) * 0.9));
        fibre(b, inside(u, 0.06 * s, v), inside(u, z1 * s, v), 0.045);
      }
    }
  }
  return b.build();
}

function vertical(): BufferGeometry {
  const b = new Batch();
  for (let k = 0; k < 18; k++) {
    const u = lerp(0.45, 0.95, (k + 0.5) / 18);
    const w = halfWidth(u);
    for (const f of [0.18, 0.4, 0.62, 0.8]) {
      for (const s of SIDES) {
        const z = w * f * s;
        const top = topV(u, z, -0.2, false) - 0.04;
        const bot = botV(u, z, -0.2) + 0.04;
        if (top - bot < 0.2) continue;
        fibre(b, inside(u, z, bot), inside(u, z, top), 0.04);
      }
    }
  }
  return b.build();
}

function septum(): BufferGeometry {
  return curvedSlab({
    x0: 0.1,
    x1: 0.93,
    zh: 0.03,
    top: (u) => topV(u, 0, -0.28, false),
    bot: (u) => botV(u, 0, -0.18) * lerp(0.95, 0.7, smooth(0.3, 0.9, u)),
    nx: 50,
    nz: 1,
  });
}

function genioglossus(): BufferGeometry {
  return merge(SIDES.map((s) => {
    const paths = new Map<number, ReturnType<typeof curveOf>>();
    const path = (f: number) => {
      const key = Math.round(f * 64);
      const cached = paths.get(key);
      if (cached) return cached;
      const u = lerp(0.045, 0.93, f);
      const o: V3 = [GENIAL[0] - 0.09 * (1 - f), GENIAL[1] + 0.24 * f, (0.18 + 0.095 * f) * s];
      const z = (0.4 + 0.045 * Math.cos(f * Math.PI)) * s;
      const entry = inside(u, z, botV(u, z) * 0.9);
      const end = inside(u, z, lerp(botV(u, z), topV(u, z, -0.2, false), 0.62));
      const mid = new Vector3(lerp(o[0], entry.x, 0.55), lerp(o[1], entry.y, 0.42), lerp(o[2], z, 0.72));
      const curve = curveOf([o, v3(mid), v3(entry), v3(end)]);
      paths.set(key, curve);
      return curve;
    };
    // Сплошной мышечный веер; неглубокие волны на поверхности идут вдоль пучков.
    const thickness = (t: number, across: number) => {
      const f = (across + 1) * 0.5;
      const breadth = 0.038 + 0.14 * Math.sin(Math.PI * t) ** 0.66;
      const feather = 0.25 + 0.75 * (Math.sin(Math.PI * f) ** 0.37);
      return breadth * feather * (0.89 + 0.11 * Math.cos(f * 85 + 0.45 * Math.sin(t * 8)));
    };
    const g = heightSlab({
      x0: 0, x1: 1, zh: 1, top: thickness, bot: (t, f) => -thickness(t, f),
      nx: 44, nz: 64,
    });
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const q = path((p.getZ(i) + 1) * 0.5).getPoint(p.getX(i));
      p.setXYZ(i, q.x, q.y, q.z + p.getY(i));
    }
    g.computeVertexNormals();
    return orientOutward(g);
  }));
}

const hyoidAt = (t: number, s: 1 | -1): Vector3 => {
  const c = curveOf(HYOID_PTS);
  const p = c.getPoint(clamp(t));
  return new Vector3(p.x, p.y, p.z * s);
};

function hyoglossus(): BufferGeometry {
  const list: BufferGeometry[] = [];
  for (const s of SIDES)
    for (let k = 0; k < 11; k++) {
      const t = lerp(0.18, 0.92, k / 10);
      const o = hyoidAt(t, s).add(new Vector3(0, 0.16, 0));
      const u = lerp(0.12, 0.56, k / 10);
      const z = halfWidth(u) * 0.8 * s;
      const entry = inside(u, z, botV(u, z) * 0.3);
      const end = inside(Math.min(0.62, u + 0.08), z * 0.85, 0.1);
      list.push(tube([v3(o), v3(o.clone().lerp(entry, 0.5).add(new Vector3(0, 0, 0.12 * s))), v3(entry), v3(end)], 0.07, { m: 7, n: 24 }));
    }
  return merge(list);
}

function styloglossus(): BufferGeometry {
  const list: BufferGeometry[] = [];
  for (const s of SIDES) {
    const st: V3 = [STYLOID_TIP[0], STYLOID_TIP[1], STYLOID_TIP[2] * s];
    const pts: V3[] = [st, [-3.5, -0.05, 2.55 * s]];
    for (let k = 0; k <= 8; k++) {
      const u = lerp(0.36, 0.9, k / 8);
      const z = halfWidth(u) * 0.86 * s;
      pts.push(v3(inside(u, z, 0.12)));
    }
    list.push(tube(pts, (x) => lerp(0.14, 0.05, x), { m: 9, n: 70 }));
    // часть волокон уходит вниз и переплетается с подъязычно-язычной мышцей
    list.push(tube([[-3.5, -0.05, 2.55 * s], v3(inside(0.3, halfWidth(0.3) * 0.84 * s, -0.25)), v3(inside(0.4, halfWidth(0.4) * 0.8 * s, -0.55))], 0.065, { m: 7, n: 20 }));
  }
  return merge(list);
}

function palatoglossus(): BufferGeometry {
  const list: BufferGeometry[] = [];
  for (const s of SIDES) {
    const top: V3 = [PALATE[0], PALATE[1], PALATE[2] * s];
    const z = halfWidth(0.38) * 0.94 * s;
    list.push(tube([top, [-0.95, 1.95, 1.75 * s], [-1.05, 1.2, 2.05 * s], v3(inside(0.37, z, 0.55)), v3(inside(0.42, z * 0.6, 0.4))], (x) => lerp(0.1, 0.065, x), { m: 8, n: 36 }));
  }
  return merge(list);
}

/* ───────────────────────────── Кости, хрящ ───────────────────────────── */

/** Трубка с эллиптическим сечением; большая полуось ra направлена по «верху» up. */
function sweepUp(pts: V3[], ra: (u: number) => number, rb: (u: number) => number, up: V3, n = 64, m = 18): BufferGeometry {
  const c = curveOf(pts);
  const U = new Vector3(...up);
  const rings: Vector3[][] = [];
  const ring = (u: number, scale: number, shift: number): Vector3[] => {
    const p = c.getPointAt(u);
    const T = c.getTangentAt(u).normalize();
    const A = U.clone().addScaledVector(T, -U.dot(T)).normalize();
    const B = new Vector3().crossVectors(T, A).normalize();
    p.addScaledVector(T, shift);
    const out: Vector3[] = [];
    for (let j = 0; j <= m; j++) {
      const a = (j / m) * Math.PI * 2;
      out.push(p.clone().addScaledVector(A, Math.cos(a) * ra(u) * scale).addScaledVector(B, Math.sin(a) * rb(u) * scale));
    }
    return out;
  };
  const CAP = 5;
  for (let k = CAP; k >= 1; k--) rings.push(ring(0, Math.cos((k / CAP) * (Math.PI / 2)), -rb(0) * Math.sin((k / CAP) * (Math.PI / 2))));
  for (let i = 0; i <= n; i++) rings.push(ring(i / n, 1, 0));
  for (let k = 1; k <= CAP; k++) rings.push(ring(1, Math.cos((k / CAP) * (Math.PI / 2)), rb(1) * Math.sin((k / CAP) * (Math.PI / 2))));
  const P: number[] = [];
  for (const r of rings) for (const p of r) P.push(p.x, p.y, p.z);
  const idx: number[] = [];
  const cols = m + 1;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < m; j++) {
      const a = i * cols + j;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orientOutward(g);
}

function hyoid(): BufferGeometry {
  const half = HYOID_PTS.slice(1).reverse().map((p): V3 => [p[0], p[1], -p[2]]);
  const pts = [...half, ...HYOID_PTS];
  const body = sweepUp(pts, (u) => lerp(0.17, 0.48, Math.exp(-(((u - 0.5) / 0.2) ** 2))), (u) => lerp(0.13, 0.2, Math.exp(-(((u - 0.5) / 0.2) ** 2))), [0, 1, 0.0], 80, 16);
  const list = [body];
  for (const s of SIDES) {
    list.push(blob([-4.85, -3.38, 2.18 * s], [0.2, 0.17, 0.17], { seg: 10 }));
    list.push(tube([[-2.9, -3.7, 0.95 * s], [-3.05, -3.38, 1.0 * s], [-3.25, -3.12, 1.05 * s]], (x) => lerp(0.08, 0.035, x), { m: 8, n: 10 }));
  }
  return merge(list);
}

function mandible(): BufferGeometry {
  const list = [sweepUp(MANDIBLE_BODY_PTS, (u) => lerp(1.05, 1.3, Math.exp(-(((u - 0.5) / 0.18) ** 2))), (u) => lerp(0.5, 0.45, Math.exp(-(((u - 0.5) / 0.18) ** 2))), [0, 1, 0], 90, 20)];
  for (const s of SIDES) list.push(sweepUp(RAMUS_PTS(s), () => 1.35, () => 0.28, [1, 0, 0], 24, 16));
  return merge(list);
}

function epiglottis(): BufferGeometry {
  const g = heightSlab({ x0: 0, x1: 1, zh: 1, top: () => 0.07, bot: () => -0.07, nx: 24, nz: 14 });
  const p = g.getAttribute('position');
  for (let k = 0; k < p.count; k++) {
    const q = epiglottisPoint(p.getX(k), p.getZ(k), -p.getY(k));
    p.setXYZ(k, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return orientOutward(g);
}

/* ───────────────────────────── Сборка ───────────────────────────── */

const both = (f: (s: 1 | -1) => V3[], r: number | ((u: number) => number), m = 9): BufferGeometry => merge(SIDES.map((s) => tube(f(s), r, { m, n: Math.max(30, f(s).length * 10) })));
const bothMany = (f: (s: 1 | -1) => V3[][], r: number | ((u: number) => number)): BufferGeometry => merge(SIDES.flatMap((s) => f(s).map((pts) => tube(pts, r, { m: 6, n: 18 }))));

function frenulum(): BufferGeometry {
  const under: [number, number][] = [];
  for (let k = 0; k <= 40; k++) {
    const u = lerp(0.5, 0.95, k / 40);
    const p = inside(u, 0, botV(u, 0));
    under.push([p.x, p.y]);
  }
  const yAt = (x: number): number => {
    for (let k = 1; k < under.length; k++) if (x <= under[k][0]) return lerp(under[k - 1][1], under[k][1], (x - under[k - 1][0]) / (under[k][0] - under[k - 1][0]));
    return under[under.length - 1][1];
  };
  return merge([
    orientOutward(heightSlab({
      x0: 1.25,
      x1: 3.75,
      zh: (x) => 0.024 + 0.068 * Math.sin(Math.PI * (x - 1.25) / 2.5) ** 1.4,
      top: (x) => yAt(x) + 0.055,
      bot: (x, z) => {
        const blend = smooth(1.25, 2.95, x) * (1 - smooth(3.13, 3.75, x));
        return lerp(yAt(x) + 0.024, FLOOR_Y + 0.07 + Math.abs(z) * 0.36, blend);
      },
      nx: 46,
      nz: 6,
    })),
    blob([3.13, FLOOR_Y + 0.01, 0], [0.48, 0.11, 0.45], { amp: 0.15, seed: 4, seg: 20 }),
  ]);
}

function fimbriated(): BufferGeometry {
  return merge(
    SIDES.map((s) => {
      const pts: V3[] = [];
      for (let k = 0; k <= 12; k++) {
        const u = lerp(0.64, 0.93, k / 12);
        pts.push(v3(ventral(u, halfWidth(u) * 0.6 * s, 0.015).p));
      }
      return tube(pts, 0.035, { m: 8, n: 60, wob: (u, a) => 1 + 0.6 * Math.max(0, Math.sin(u * 70)) * Math.max(0, -Math.sin(a)) });
    }),
  );
}

function ribbonTube(pts: V3[], r: number): BufferGeometry {
  return tube(pts, r, { m: 8, n: pts.length * 6 });
}

export function buildTongue(): Parts {
  const R = mucosaRegions();
  const V = vallate();
  const T = lingualTonsil();

  const median: V3[] = [];
  for (let k = 0; k <= 44; k++) {
    const u = lerp(0.51, 0.94, k / 44);
    median.push(v3(dorsal(u, 0.033 * Math.sin(u * 35) + 0.016 * Math.cos(u * 83), -0.01).p));
  }
  const terminal: V3[] = [];
  for (let k = 0; k <= 24; k++) {
    const z = lerp(-2.0, 2.0, k / 24);
    terminal.push(v3(dorsal(uSulcus(z), z, -0.01).p));
  }
  const cecum = dorsal(U_FORAMEN, 0, -0.035);

  const submandibular = merge([
    blob(SUBMANDIBULAR.c, SUBMANDIBULAR.r, { seed: 3, amp: 0.22, freq: 2.2, seg: 22 }),
    blob([SUBMANDIBULAR.c[0], SUBMANDIBULAR.c[1], -SUBMANDIBULAR.c[2]], SUBMANDIBULAR.r, { seed: 4, amp: 0.22, freq: 2.2, seg: 22 }),
    ...SIDES.map((s) => tube([[-2.1, -3.2, 2.6 * s], [-1.5, -3.05, 2.45 * s], [-1.05, -2.95, 2.35 * s]], 0.32, { m: 12, n: 16 })),
  ]);
  const sublingual = merge(SIDES.map((s) => blob([SUBLINGUAL.c[0], SUBLINGUAL.c[1], SUBLINGUAL.c[2] * s], SUBLINGUAL.r, { seed: 7 + s, amp: 0.3, freq: 3, seg: 20, rot: [0, -0.42 * s, 0] })));
  const subDucts: BufferGeometry[] = [];
  for (const s of SIDES)
    for (let k = 0; k < 9; k++) {
      const x = lerp(0.95, 3.0, k / 8);
      const z = (SUBLINGUAL.c[2] + (x - SUBLINGUAL.c[0]) * -0.42 * 0.95) * s;
      subDucts.push(tube([[x, SUBLINGUAL.c[1] + 0.2, z], [x + 0.04, FLOOR_Y + 0.05, z * 0.97]], 0.025, { m: 6, n: 6 }));
    }
  const ebner = new Batch();
  {
    const rand = rng(5);
    for (let k = 0; k < 9; k++) {
      const z = lerp(-1.65, 1.65, k / 8);
      const u = uSulcus(z) + 0.038;
      for (let q = 0; q < 4; q++) {
        const p = inside(u + (rand() - 0.5) * 0.03, z + (rand() - 0.5) * 0.3, topV(u, z) - 0.42 - rand() * 0.15);
        ebner.add(BALL, new Matrix4().compose(p, new Quaternion(), new Vector3(0.1, 0.08, 0.1)));
      }
    }
  }

  const parts: Parts = {
    apex: [{ g: R.apex, m: 'mucosa' }],
    body: [{ g: R.body, m: 'mucosa' }],
    root: [{ g: R.root, m: 'mucosa' }],
    dorsum: [{ g: R.dorsum, m: 'mucosa' }],
    'ventral-surface': [{ g: R['ventral-surface'], m: 'mucosa' }],
    'median-sulcus': [{ g: ribbonTube(median, 0.012), m: 'sulcus' }],
    'terminal-sulcus': [{ g: ribbonTube(terminal, 0.014), m: 'sulcus' }],
    'foramen-cecum': [{ g: blob(v3(cecum.p), [0.075, 0.075, 0.075], { seg: 12 }), m: 'pit' }],
    frenulum: [{ g: frenulum(), m: 'frenulum' }],
    'fimbriated-fold': [{ g: fimbriated(), m: 'fimbria' }],
    'sublingual-caruncle': [{ g: merge(SIDES.map((s) => blob(CARUNCLE(s), [0.13, 0.1, 0.12], { seg: 12, amp: 0.1 }))), m: 'caruncle' }],
    filiform: [{ g: filiform(), m: 'filiform' }],
    fungiform: [{ g: fungiform(), m: 'fungiform' }],
    foliate: [{ g: foliate(), m: 'foliate' }],
    vallate: [{ g: V, m: 'vallate' }],
    'lingual-tonsil': [
      { g: T.bumps, m: 'tonsil' },
      { g: T.crypts, m: 'trench' },
    ],
    'sup-longitudinal': [{ g: supLongitudinal(), m: 'supLong' }],
    'inf-longitudinal': [{ g: infLongitudinal(), m: 'infLong' }],
    transverse: [{ g: transverse(), m: 'transverse' }],
    vertical: [{ g: vertical(), m: 'vertical' }],
    septum: [{ g: septum(), m: 'septum' }],
    genioglossus: [{ g: genioglossus(), m: 'extrinsic' }],
    hyoglossus: [{ g: hyoglossus(), m: 'extrinsicB' }],
    styloglossus: [{ g: styloglossus(), m: 'extrinsic' }],
    palatoglossus: [{ g: palatoglossus(), m: 'extrinsicB' }],
    hyoid: [{ g: hyoid(), m: 'bone' }],
    mandible: [{ g: mandible(), m: 'ghostBone', noPick: true }],
    styloid: [{ g: merge(SIDES.map((s) => tube([[STYLOID_BASE[0], STYLOID_BASE[1], STYLOID_BASE[2] * s], [STYLOID_TIP[0], STYLOID_TIP[1], STYLOID_TIP[2] * s]], (x) => lerp(0.2, 0.035, x), { m: 10, n: 16 }))), m: 'bone' }],
    epiglottis: [{ g: epiglottis(), m: 'cartilage' }],
    'lingual-artery': [{ g: merge([both(lingualArteryPts, 0.13), bothMany(dorsalBranchPts, 0.055), both(sublingualArteryPts, (x) => lerp(0.07, 0.045, x))]), m: 'artery' }],
    'deep-lingual-artery': [{ g: both(deepArteryPts, (x) => lerp(0.1, 0.05, x), 8), m: 'artery' }],
    'lingual-vein': [{ g: both(lingualVeinPts, (x) => lerp(0.08, 0.17, x)), m: 'vein' }],
    'deep-lingual-vein': [{ g: both(deepVeinPts, (x) => lerp(0.064, 0.039, x), 10), m: 'submucosalVein' }],
    hypoglossal: [{ g: merge([both(hypoglossalPts, 0.1), bothMany(hypoglossalBranches, 0.04)]), m: 'nerve' }],
    'lingual-nerve': [{ g: merge([both(lingualNervePts, 0.1), bothMany(lingualNerveBranches, 0.035)]), m: 'nerve' }],
    'chorda-tympani': [{ g: both(chordaPts, 0.045, 7), m: 'chorda' }],
    glossopharyngeal: [{ g: merge([both(glossopharyngealPts, 0.085), bothMany(glossopharyngealBranches, 0.035)]), m: 'nerve' }],
    vagus: [{ g: merge([both(vagusPts, 0.15), both(vagusBranch, 0.05, 7)]), m: 'nerve' }],
    'submandibular-gland': [{ g: submandibular, m: 'gland' }],
    'submandibular-duct': [{ g: both(submandibularDuctPts, 0.06, 8), m: 'duct' }],
    'sublingual-gland': [{ g: sublingual, m: 'glandSub' }],
    'sublingual-ducts': [{ g: merge(subDucts), m: 'duct' }],
    'ebner-glands': [{ g: ebner.build(), m: 'ebner' }],
  };
  return parts;
}
