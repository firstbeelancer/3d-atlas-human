import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  ACCESSORY,
  ADRENAL,
  AORTA_PTS,
  AORTA_R,
  AX_D,
  AX_L,
  AX_W,
  BRANCHES,
  CELIAC_GANGLION,
  CELIAC_PTS,
  COLON_PTS,
  COLON_R,
  DIAPHRAGM,
  GASTROEPIPLOIC_PTS,
  GASTROEPIPLOIC_VEIN_PTS,
  IMV_PTS,
  KIDNEY,
  LIG_GS,
  LIG_PS,
  LIG_SC,
  LIG_SR,
  LYMPH_NODES,
  PANCREAS_TAIL_PTS,
  PANCREATIC_BRANCHES,
  PORTAL_PTS,
  RIBS,
  SHORT_GASTRIC,
  SHORT_GASTRIC_VEINS,
  SPINE_LEVELS,
  SPINE_X,
  SPINE_Z,
  SPLENIC_ARTERY_PTS,
  SPLENIC_VEIN_PTS,
  STOMACH,
  VEIN_BRANCHES,
  curveOf,
  fromLocal,
  lerp,
  ribPts,
  toLocal,
  twigs,
  type Ell,
  type V3,
} from './anatomy';
import { REGIONS, spleenBase, type Region, type SpleenMeshData } from './field';
import { lobulatedBlob, merge, mulberry32, tubeGeo, tubePts, type TubeOpts } from '../gallbladder/geometry';

export type MatKey =
  | 'spleen' | 'capsule' | 'serosa' | 'redPulp' | 'whitePulp' | 'trabecula' | 'segments' | 'intersegment' | 'accessory'
  | 'artery' | 'vein' | 'portal' | 'aorta' | 'nerve' | 'ganglion' | 'node' | 'lymph' | 'ligament'
  | 'stomach' | 'pancreas' | 'kidney' | 'adrenal' | 'colon' | 'diaphragm' | 'bone' | 'disc';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  noPick?: boolean;
}
export type SpleenGeometry = Record<string, MeshDef[]>;

const d = (g: BufferGeometry, m: MatKey, noPick = false): MeshDef => ({ g, m, noPick });
const tube = (pts: V3[], r0: number, r1 = r0, o: TubeOpts = {}) => tubePts(pts, r0, r1, { radial: 12, ...o });

/* ---------- Заготовки ---------- */

/** Часть эллипсоида, заданного в системе (l, w, d) селезёнки: оставляем треугольники, у которых keep(u) истинно у всех вершин. */
function ellCap(e: Ell, keep: (u: V3) => boolean, wSeg = 64, hSeg = 44): BufferGeometry {
  const g = new SphereGeometry(1, wSeg, hSeg);
  const pos = g.getAttribute('position');
  const us: V3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const u: V3 = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    us.push(u);
    const p = fromLocal(e.c[0] + e.r[0] * u[0], e.c[1] + e.r[1] * u[1], e.c[2] + e.r[2] * u[2]);
    pos.setXYZ(i, p[0], p[1], p[2]);
  }
  const idx = g.getIndex()!;
  const out: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (keep(us[a]) && keep(us[b]) && keep(us[c])) out.push(a, b, c);
  }
  g.setIndex(out);
  g.computeVertexNormals();
  return g;
}

/** Бобовидная почка: эллипсоид с вдавлением на внутренней стороне, наклон вокруг оси z. */
function bean(c: V3, r: V3, tilt: number): BufferGeometry {
  const g = new SphereGeometry(1, 64, 48);
  const pos = g.getAttribute('position');
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), tilt);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const t = Math.min(1, Math.max(0, (-x - 0.05) / 0.6));
    const k = 1 - 0.36 * Math.exp(-(y * y / 0.14 + (z - 0.35) * (z - 0.35) / 0.3)) * t;
    x *= k;
    y *= k;
    z *= k;
    v.set(x * r[0], y * r[1], z * r[2]).applyQuaternion(q).add(new Vector3(...c));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Складка брюшины: поверхность между двумя ломаными, слегка волнистая. */
function sheet(a: V3[], b: V3[], cols = 22, rows = 10, wave = 0.16, seed = 1): BufferGeometry {
  const ca = curveOf(a);
  const cb = curveOf(b);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const pa = ca.getPointAt(i / cols);
    const pb = cb.getPointAt(i / cols);
    for (let j = 0; j <= rows; j++) {
      const s = j / rows;
      const w = wave * Math.sin(Math.PI * s) * Math.sin(i * 1.25 + s * 3.1 + seed);
      pos.push(
        lerp(pa.x, pb.x, s) + AX_D[0] * w,
        lerp(pa.y, pb.y, s) + AX_D[1] * w,
        lerp(pa.z, pb.z, s) + AX_D[2] * w,
      );
      uv.push(i / cols, s);
    }
  }
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const p = i * (rows + 1) + j;
      const q = p + rows + 1;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Трубка с радиусом, меняющимся по длине (гаустры, дольчатость). */
const tubeR = (pts: V3[], r: (t: number) => number, o: TubeOpts = {}) => tubeGeo(curveOf(pts), r, { radial: 18, ...o });

/** Нервные волокна, обвивающие сосуд: спираль вокруг кривой. */
function helix(pts: V3[], radius: number, turns: number, phase: number, tubeRad: number): BufferGeometry {
  const curve = curveOf(pts);
  const N = 90;
  const fr = curve.computeFrenetFrames(N, false);
  const path: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const p = curve.getPointAt(i / N);
    const a = phase + (i / N) * turns * Math.PI * 2;
    const n = fr.normals[i];
    const b = fr.binormals[i];
    const k = radius * (1 + 0.15 * Math.sin(a * 2.3));
    path.push([p.x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * k, p.y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * k, p.z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * k]);
  }
  return tubeGeo(curveOf(path), tubeRad, { radial: 6, segs: 120 });
}

/* ---------- Сосудистое дерево внутри органа ---------- */

interface Twig {
  pts: V3[];
  r: number;
  depth: number;
}

const toWorld = (l: number, w: number, dd: number): V3 => fromLocal(l, w, dd);
const norm3 = (v: V3): V3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const inside = (p: V3, margin: number) => spleenBase(p[0], p[1], p[2]) < -margin;

/** Ветвление в местных координатах: от точки входа вглубь органа, дети расходятся веером. */
function growTree(root: V3, dir: V3, len: number, r: number, depth: number, rand: () => number, out: Twig[], tag = 0): void {
  let q: V3 = [root[0] + dir[0] * len, root[1] + dir[1] * len, root[2] + dir[2] * len];
  let k = 0;
  while (!inside(q, 0.55) && k++ < 8) {
    len *= 0.75;
    q = [root[0] + dir[0] * len, root[1] + dir[1] * len, root[2] + dir[2] * len];
  }
  if (len < 0.35) return;
  const mid: V3 = [(root[0] + q[0]) / 2 + (rand() - 0.5) * 0.3, (root[1] + q[1]) / 2 + (rand() - 0.5) * 0.3, (root[2] + q[2]) / 2 + (rand() - 0.5) * 0.15];
  out.push({ pts: [root, mid, q], r, depth });
  if (depth <= 0) return;
  const kids = depth > 1 ? 2 : 3;
  for (let c = 0; c < kids; c++) {
    const a = (c / kids) * Math.PI * 2 + rand() * 1.2 + tag;
    const spread = 0.55 + rand() * 0.4;
    // перпендикуляр к направлению в плоскости (l, w)
    const perp: V3 = norm3([-dir[1], dir[0], 0.0001]);
    const perp2: V3 = [dir[1] * perp[2] - dir[2] * perp[1], dir[2] * perp[0] - dir[0] * perp[2], dir[0] * perp[1] - dir[1] * perp[0]];
    const nd = norm3([
      dir[0] + (perp[0] * Math.cos(a) + perp2[0] * Math.sin(a)) * spread,
      dir[1] + (perp[1] * Math.cos(a) + perp2[1] * Math.sin(a)) * spread,
      dir[2] + (perp[2] * Math.cos(a) + perp2[2] * Math.sin(a)) * spread * 0.55 - 0.05,
    ]);
    growTree(q, nd, len * (0.62 + rand() * 0.18), r * 0.66, depth - 1, rand, out, tag + 1.3);
  }
}

interface Inner {
  arteries: Twig[];
  veins: Twig[];
  trabeculae: V3[][];
  nodules: { c: V3; r: [number, number, number]; dir: V3 }[];
  central: V3[][];
}

function buildInner(): Inner {
  const rand = mulberry32(777);
  const arteries: Twig[] = [];
  const veins: Twig[] = [];
  const HL = [-3.4, -2.3, -1.2, -0.1, 1.0, 2.1, 3.2];
  HL.forEach((l, i) => {
    const w = 0.25 - 0.07 * l;
    const root: V3 = [l, w + 0.22, -1.1];
    growTree(root, norm3([l * 0.05 + (rand() - 0.5) * 0.4, 0.55 + (rand() - 0.5) * 0.5, 1]), 1.5, 0.12, 2, rand, arteries, i * 0.7);
    const rootV: V3 = [l, w - 0.26, -1.1];
    growTree(rootV, norm3([-l * 0.05 + (rand() - 0.5) * 0.4, -0.55 + (rand() - 0.5) * 0.5, 1]), 1.5, 0.15, 2, rand, veins, i * 0.9 + 2);
  });

  // белая пульпа: узелки «бусами» на концах артериальных веточек, центральная артерия — нить через узелок
  const nodules: Inner['nodules'] = [];
  const central: V3[][] = [];
  for (const t of arteries) {
    if (t.depth > 0) continue;
    const [a, , b] = t.pts;
    const dir = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const lenT = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = 2 + Math.floor(rand() * 2);
    const start: V3 = [a[0] + (b[0] - a[0]) * 0.35, a[1] + (b[1] - a[1]) * 0.35, a[2] + (b[2] - a[2]) * 0.35];
    const end: V3 = [b[0] + dir[0] * 0.5, b[1] + dir[1] * 0.5, b[2] + dir[2] * 0.5];
    central.push([start, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2], inside(end, 0.4) ? end : b]);
    for (let k = 0; k < n; k++) {
      const s = 0.45 + (k / n) * 0.6;
      const c: V3 = [a[0] + dir[0] * lenT * s * 1.25, a[1] + dir[1] * lenT * s * 1.25, a[2] + dir[2] * lenT * s * 1.25];
      if (!inside(c, 0.35)) continue;
      nodules.push({ c, r: [0.16 + rand() * 0.07, 0.16 + rand() * 0.07, 0.3 + rand() * 0.15], dir });
    }
  }
  // разбросанные одиночные узелки по красной пульпе
  let guard = 0;
  while (nodules.length < 420 && guard++ < 4000) {
    const p: V3 = [(rand() - 0.5) * 11, (rand() - 0.5) * 7, -1.6 + rand() * 4.2];
    if (!inside(p, 0.5)) continue;
    const u = norm3([rand() - 0.5, rand() - 0.5, rand() - 0.5]);
    nodules.push({ c: p, r: [0.1 + rand() * 0.05, 0.1 + rand() * 0.05, 0.1 + rand() * 0.06], dir: u });
  }

  // трабекулы: от капсулы вглубь, к узлам сосудистого дерева
  const trabeculae: V3[][] = [];
  const targets = arteries.filter((t) => t.depth <= 1).map((t) => t.pts[2]);
  const surfacePoint = (u: V3): V3 => {
    let lo = 0;
    let hi = 9;
    for (let it = 0; it < 28; it++) {
      const m = (lo + hi) / 2;
      if (spleenBase(u[0] * m, u[1] * m * 0.62, u[2] * m * 0.4) < 0) lo = m;
      else hi = m;
    }
    return [u[0] * lo, u[1] * lo * 0.62, u[2] * lo * 0.4];
  };
  for (let i = 0; i < 54; i++) {
    const u = norm3([rand() - 0.5, rand() - 0.5, (rand() - 0.5) * 1.2]);
    const s = surfacePoint(u);
    const start: V3 = [s[0] * 0.97, s[1] * 0.97, s[2] * 0.97];
    const tg = targets[Math.floor(rand() * targets.length)];
    const mid: V3 = [(start[0] + tg[0]) / 2 + (rand() - 0.5) * 0.5, (start[1] + tg[1]) / 2 + (rand() - 0.5) * 0.5, (start[2] + tg[2]) / 2 + (rand() - 0.5) * 0.3];
    trabeculae.push([start, mid, tg]);
  }
  return { arteries, veins, trabeculae, nodules, central };
}

const lw = (pts: V3[]): V3[] => pts.map((p) => toWorld(p[0], p[1], p[2]));

/* ---------- Оболочки селезёнки ---------- */

export function shellOf(d0: SpleenMeshData, regions: readonly Region[], offset: number): BufferGeometry {
  const pos = new Float32Array(d0.positions.length);
  for (let i = 0; i < pos.length; i++) pos[i] = d0.positions[i] + d0.normals[i] * offset;
  const all: number[] = [];
  for (const r of regions) for (const v of d0.indices[r]) all.push(v);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(d0.normals, 3));
  g.setAttribute('seg', new BufferAttribute(d0.seg, 1));
  g.setIndex(new BufferAttribute(new Uint32Array(all), 1));
  g.computeBoundingSphere();
  return g;
}

/** Плоскость между сегментами: тонкий диск, обрезанный по контуру среза органа. */
function segmentDisc(s0: number): BufferGeometry {
  const rays = 72;
  const steps = 14;
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (w: number, dd: number): V3 => [s0 - 0.28 * w, w, dd];
  const cD = 0.2;
  pos.push(...toWorld(...at(0, cD)));
  for (let a = 0; a < rays; a++) {
    const ang = (a / rays) * Math.PI * 2;
    const cw = Math.cos(ang);
    const cd = Math.sin(ang);
    let lo = 0;
    let hi = 7;
    for (let it = 0; it < 24; it++) {
      const m = (lo + hi) / 2;
      const q = at(cw * m, cD + cd * m * 0.62);
      if (spleenBase(q[0], q[1], q[2]) < -0.08) lo = m;
      else hi = m;
    }
    for (let k = 1; k <= steps; k++) {
      const m = (lo * k) / steps;
      pos.push(...toWorld(...at(cw * m, cD + cd * m * 0.62)));
    }
  }
  for (let a = 0; a < rays; a++) {
    const a2 = (a + 1) % rays;
    idx.push(0, 1 + a * steps, 1 + a2 * steps);
    for (let k = 0; k < steps - 1; k++) {
      const p = 1 + a * steps + k;
      const q = 1 + a2 * steps + k;
      idx.push(p, p + 1, q, q, p + 1, q + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Части самой селезёнки из сетки, построенной в воркере: у каждой части поверхности свой индекс, общие буферы. */
export function spleenParts(dd: SpleenMeshData): SpleenGeometry {
  const pos = new BufferAttribute(dd.positions, 3);
  const nrm = new BufferAttribute(dd.normals, 3);
  const col = new BufferAttribute(dd.colors, 3);
  const seg = new BufferAttribute(dd.seg, 1);
  const out: SpleenGeometry = {};
  for (const r of REGIONS) {
    const g = new BufferGeometry();
    g.setAttribute('position', pos);
    g.setAttribute('normal', nrm);
    g.setAttribute('color', col);
    g.setAttribute('seg', seg);
    g.setIndex(new BufferAttribute(dd.indices[r as Region], 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    out[r] = [d(g, 'spleen')];
  }
  const all = REGIONS as unknown as Region[];
  out.capsule = [d(shellOf(dd, all, 0.045), 'capsule', true)];
  out.serosa = [d(shellOf(dd, all.filter((r) => r !== 'hilum'), 0.1), 'serosa', true)];
  out['red-pulp'] = [d(shellOf(dd, all, -0.3), 'redPulp', true)];
  out.segments = [d(shellOf(dd, all, 0.035), 'segments', true)];
  return out;
}

/* ---------- Всё остальное ---------- */

export function buildStatic(): SpleenGeometry {
  const G: SpleenGeometry = {};
  const add = (id: string, ...defs: MeshDef[]) => (G[id] = defs);
  const inner = buildInner();

  /* Внутри органа */
  const nod = inner.nodules.map((n) => {
    const g = new SphereGeometry(1, 10, 8);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...fromLocal(...n.dir)));
    const w = fromLocal(...n.c);
    g.applyMatrix4(new Matrix4().compose(new Vector3(...w), q, new Vector3(n.r[0], n.r[1], n.r[2])));
    return g;
  });
  add('white-pulp', d(merge(nod), 'whitePulp', true));
  add('central-arteries', d(merge(inner.central.map((c) => tube(lw(c), 0.035, 0.03, { radial: 6, capEnd: true }))), 'artery', true));
  add('trabeculae', d(merge(inner.trabeculae.map((t, i) => tube(lw(t), 0.1 + (i % 3) * 0.02, 0.05, { radial: 8, capEnd: true, capStart: true }))), 'trabecula', true));
  add('trabecular-arteries', d(merge(inner.arteries.map((t) => tube(lw(t.pts), t.r, t.r * 0.7, { radial: 8, capEnd: true }))), 'artery', true));
  add('trabecular-veins', d(merge(inner.veins.map((t) => tube(lw(t.pts), t.r, t.r * 0.7, { radial: 8, capEnd: true }))), 'vein', true));
  add('intersegmental', d(merge([segmentDisc(-2.2), segmentDisc(2.3)]), 'intersegment', true));

  /* Добавочные селезёнки */
  add('accessory-spleens', ...ACCESSORY.map((a) => d(lobulatedBlob(a.c, [a.r * 1.1, a.r * 0.9, a.r], 4, 0.1), 'accessory')));

  /* Сосуды */
  const celiac = curveOf(CELIAC_PTS);
  add(
    'celiac-trunk',
    d(tubeGeo(celiac, (t) => 0.4 - 0.08 * t, { radial: 16, capStart: false }), 'artery'),
    // обрезанные концы общей печёночной и левой желудочной артерий
    d(tube([CELIAC_PTS[2], [CELIAC_PTS[2][0] - 0.7, CELIAC_PTS[2][1] + 0.25, CELIAC_PTS[2][2] + 0.45], [CELIAC_PTS[2][0] - 1.5, CELIAC_PTS[2][1] + 0.35, CELIAC_PTS[2][2] + 0.5]], 0.27, 0.22, { capEnd: true }), 'artery'),
    d(tube([CELIAC_PTS[1], [CELIAC_PTS[1][0] + 0.05, CELIAC_PTS[1][1] + 0.7, CELIAC_PTS[1][2] + 0.25], [CELIAC_PTS[1][0] + 0.2, CELIAC_PTS[1][1] + 1.5, CELIAC_PTS[1][2] + 0.35]], 0.2, 0.15, { capEnd: true }), 'artery'),
  );
  add('splenic-artery', d(tubeGeo(curveOf(SPLENIC_ARTERY_PTS), (t) => 0.3 - 0.04 * t, { radial: 14, segs: 110 }), 'artery'));
  add('pancreatic-branches', d(merge(PANCREATIC_BRANCHES.map((p) => tube(p, 0.09, 0.05, { radial: 8, capEnd: true }))), 'artery'));
  for (const b of BRANCHES) add(`sa-${b.id}`, d(tubeGeo(curveOf(b.trunk), (t) => 0.22 - 0.06 * t, { radial: 12 }), 'artery'));
  add('hilar-arteries', d(merge(twigs('artery').map((t) => tube(t, 0.13, 0.085, { radial: 10, capEnd: true }))), 'artery'));
  add('short-gastric', d(merge(SHORT_GASTRIC.map((p) => tube(p, 0.085, 0.06, { radial: 8, capEnd: true }))), 'artery'));
  add('gastroepiploic-artery', d(tubeGeo(curveOf(GASTROEPIPLOIC_PTS), (t) => 0.13 - 0.04 * t, { radial: 10, capEnd: true }), 'artery'));
  add('splenic-vein', d(tubeGeo(curveOf(SPLENIC_VEIN_PTS), (t) => 0.46 + 0.1 * t, { radial: 18, segs: 80 }), 'portal'));
  add('hilar-veins', d(merge([...VEIN_BRANCHES.map((p) => tube(p, 0.28, 0.2, { radial: 12 })), ...twigs('vein').map((t) => tube(t, 0.17, 0.11, { radial: 10, capEnd: true }))]), 'vein'));
  add('short-gastric-veins', d(merge(SHORT_GASTRIC_VEINS.map((p) => tube(p, 0.1, 0.07, { radial: 8, capEnd: true }))), 'vein'));
  add('gastroepiploic-vein', d(tubeGeo(curveOf(GASTROEPIPLOIC_VEIN_PTS), (t) => 0.15 - 0.04 * t, { radial: 10, capEnd: true }), 'vein'));
  add('imv', d(tubeGeo(curveOf(IMV_PTS), (t) => 0.22 + 0.06 * t, { radial: 12, capStart: true }), 'vein'));
  add('portal-vein', d(tubeGeo(curveOf(PORTAL_PTS), (t) => 0.68 + 0.05 * t, { radial: 18, capEnd: true }), 'portal'));

  /* Лимфа и нервы */
  add(
    'lymph-nodes',
    ...LYMPH_NODES.map((n, i) => d(lobulatedBlob(n.c, [n.r * 1.35, n.r, n.r * 0.85], 20 + i, 0.08), 'node')),
    d(merge(LYMPH_NODES.slice(0, -1).map((n, i) => tube([n.c, [(n.c[0] + LYMPH_NODES[i + 1].c[0]) / 2, (n.c[1] + LYMPH_NODES[i + 1].c[1]) / 2 - 0.2, (n.c[2] + LYMPH_NODES[i + 1].c[2]) / 2], LYMPH_NODES[i + 1].c], 0.035, 0.035, { radial: 6 }))), 'lymph', true),
  );
  add(
    'splenic-plexus',
    d(merge([0, 1, 2, 3].map((k) => helix(SPLENIC_ARTERY_PTS, 0.4, 9 + k, (k * Math.PI) / 2, 0.034))), 'nerve'),
    d(merge(BRANCHES.map((b, k) => helix(b.trunk, 0.3, 3, k, 0.03))), 'nerve'),
    d(lobulatedBlob([CELIAC_GANGLION[0] - 0.9, CELIAC_GANGLION[1] - 0.2, CELIAC_GANGLION[2] - 0.2], [0.5, 0.35, 0.3], 41, 0.1), 'ganglion'),
    d(lobulatedBlob([CELIAC_GANGLION[0] + 0.2, CELIAC_GANGLION[1] - 0.2, CELIAC_GANGLION[2] + 0.1], [0.5, 0.33, 0.3], 42, 0.1), 'ganglion'),
  );

  /* Связки */
  add('gastrosplenic', d(sheet(LIG_GS.a, LIG_GS.b, 24, 12, 0.2, 1), 'ligament', true));
  add('splenorenal', d(sheet(LIG_SR.a, LIG_SR.b, 22, 12, 0.18, 2), 'ligament', true));
  add('phrenicosplenic', d(sheet(LIG_PS.a, LIG_PS.b, 18, 8, 0.12, 3), 'ligament', true));
  add('splenocolic', d(sheet(LIG_SC.a, LIG_SC.b, 18, 8, 0.12, 4), 'ligament', true));

  /* Соседи */
  const toward = (a: number) => (u: V3) => u[2] > a;
  add('stomach', d(ellCap(STOMACH, toward(-0.12)), 'stomach', true));
  const tailLen = curveOf(PANCREAS_TAIL_PTS).getLength();
  add('pancreatic-tail', d(tubeR(PANCREAS_TAIL_PTS, (t) => (1.0 + 0.06 * Math.sin(t * tailLen * 3.2)) * (1 - 0.1 * t), { capStart: true }), 'pancreas'));
  add('left-kidney', d(bean(KIDNEY.c, KIDNEY.r, KIDNEY.tilt), 'kidney'));
  add('left-adrenal', d(lobulatedBlob(ADRENAL.c, ADRENAL.r, 31, 0.12), 'adrenal'));
  const colonLen = curveOf(COLON_PTS).getLength();
  add('colon-flexure', d(tubeR(COLON_PTS, (t) => COLON_R * (0.9 + 0.1 * Math.pow(Math.cos(t * colonLen * 1.9), 2)), { capStart: true, capEnd: true }), 'colon', true));
  add('diaphragm', d(ellCap(DIAPHRAGM, (u) => u[2] > 0.02, 72, 44), 'diaphragm', true));
  add('ribs', d(merge(RIBS.map((r) => tubeGeo(curveOf(ribPts(r.w)), (t) => 0.5 - 0.1 * Math.abs(t - 0.5), { radial: 14, capStart: true, capEnd: true }))), 'bone'));

  const ys = SPINE_LEVELS;
  const bodies: BufferGeometry[] = [];
  const discs: BufferGeometry[] = [];
  const arch: BufferGeometry[] = [];
  ys.forEach((y, i) => {
    const b = new CylinderGeometry(2.0, 2.1, 2.3, 28, 1);
    b.translate(SPINE_X, y, SPINE_Z);
    bodies.push(b);
    const disc = new CylinderGeometry(2.08, 2.08, 0.5, 28);
    disc.translate(SPINE_X, y - 1.4, SPINE_Z);
    discs.push(disc);
    const ring = new TorusGeometry(1.15, 0.38, 8, 20, Math.PI * 1.2);
    ring.rotateX(Math.PI / 2);
    ring.rotateY(Math.PI * 0.4);
    ring.translate(SPINE_X, y, SPINE_Z - 2.75);
    arch.push(ring);
    const sp = new CylinderGeometry(0.1, 0.42, 3.2, 10);
    sp.rotateX(Math.PI / 2 + 0.35);
    sp.translate(SPINE_X, y - 0.45, SPINE_Z - 5.3);
    arch.push(sp);
    for (const s of [-1, 1]) {
      const tp = new CylinderGeometry(0.28, 0.4, 3.0, 10);
      tp.rotateZ(Math.PI / 2);
      tp.translate(SPINE_X + s * 3.2, y + 0.1, SPINE_Z - 3.2 - (i % 2) * 0.05);
      arch.push(tp);
    }
  });
  add('spine', d(merge([...bodies, ...arch]), 'bone'), d(merge(discs.slice(0, -1)), 'disc'));
  add('aorta', d(tubeGeo(curveOf(AORTA_PTS), AORTA_R, { radial: 22, capStart: true, capEnd: true }), 'aorta'));
  void toLocal;
  void AX_L;
  void AX_W;
  return G;
}
