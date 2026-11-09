import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ACCESSORY_DUCT_PTS,
  AMPULLA,
  AORTA_PTS,
  BILE_DUCT_PTS,
  CELIAC_PTS,
  CYSTIC_DUCT_PTS,
  DORSAL_ARTERY_PTS,
  DORSAL_BRANCH_RIGHT,
  DUODENUM_R,
  DUODENUM_SPLIT,
  GANGLIA,
  GDA_PTS,
  GALLBLADDER_PTS,
  GREAT_ARTERY_BRANCHES,
  GREAT_ARTERY_PTS,
  HEPATIC_ARTERY_PTS,
  HEPATIC_DUCT_PTS,
  IMV_PTS,
  INF_PD_PTS,
  IVC_PTS,
  JEJUNUM_PTS,
  LIVER,
  LYMPH_NODES,
  L_ADRENAL,
  L_KIDNEY,
  MAIN_DUCT_PTS,
  MAJOR_PAPILLA,
  MINOR_PAPILLA,
  NERVE_PATHS,
  PD_ARCADE_BACK,
  PD_ARCADE_FRONT,
  PORTAL_PTS,
  R_KIDNEY,
  SMA_PTS,
  SMV_PTS,
  SPHINCTER,
  SPINE_C,
  SPINE_LEVELS,
  SPLEEN,
  SPLENIC_ARTERY_PTS,
  SPLENIC_VEIN_PTS,
  SPLENIC_VEIN_TRIBUTARIES,
  STOMACH_PTS,
  STOMACH_R,
  TRANSVERSE_ARTERY_PTS,
  duodenumCurve,
  halfAP,
  halfH,
  lerp,
  onGland,
  smoothstep,
  type V3,
} from './anatomy';
import { glandSdf, REGIONS, type GlandMeshData, type Region } from './field';
import { curveOf, ellipsoid, merge, mulberry32, ringAt, ringPts, tubeGeo, tubePts, type TubeOpts } from '../gallbladder/geometry';

export type MatKey =
  | 'gland' | 'capsule' | 'ductWall' | 'juice' | 'bileWall' | 'bile' | 'mixed' | 'oddi' | 'papilla' | 'hole'
  | 'artery' | 'vein' | 'portal' | 'nerve' | 'ganglion' | 'node' | 'duodenum' | 'fold' | 'ligament' | 'stomach'
  | 'spleen' | 'kidney' | 'adrenal' | 'aorta' | 'ivc' | 'bone' | 'disc' | 'liver' | 'gb' | 'mesocolon';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Не принимает клики (тонкие оболочки поверх ткани). */
  noPick?: boolean;
}

export type PancGeometry = Record<string, MeshDef[]>;

const T = (pts: V3[], r0: number, r1 = r0, o: TubeOpts = {}) => tubePts(pts, r0, r1, { radial: 14, ...o });
const C = curveOf;

/* ---------- Вспомогательные формы ---------- */

/** Гладкая «бобовидная» поверхность: шар с радиусами, вмятиной ворот и мягкой неровностью. */
function blob(c: V3, r: V3, o: { notch?: V3; notchDepth?: number; bump?: number; seed?: number; detail?: number; flat?: (v: Vector3) => number } = {}): BufferGeometry {
  let g: BufferGeometry = new IcosahedronGeometry(1, o.detail ?? 22);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  const v = new Vector3();
  const n = o.notch ? new Vector3(...o.notch).normalize() : null;
  const seed = o.seed ?? 1;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let s = 1;
    if (n) {
      const d = 1 - v.dot(n);
      s -= (o.notchDepth ?? 0.4) * Math.exp(-Math.pow(d / 0.2, 2));
    }
    if (o.bump) s += o.bump * (Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 2) * 0.6 + Math.sin(v.z * 6.7 + seed * 3) * 0.4);
    if (o.flat) s *= o.flat(v);
    p.setXYZ(i, c[0] + v.x * r[0] * s, c[1] + v.y * r[1] * s, c[2] + v.z * r[2] * s);
    uv[i * 2] = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, v.y))) / Math.PI + 0.5;
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Часть кривой двенадцатиперстной кишки между долями длины f0..f1 в виде трубки. */
function duodenumPiece(f0: number, f1: number, capEnd = false): BufferGeometry {
  const M = Math.max(10, Math.round((f1 - f0) * 150));
  const pts: V3[] = [];
  for (let k = 0; k <= M; k++) {
    const p = duodenumCurve.getPointAt(f0 + ((f1 - f0) * k) / M);
    pts.push([p.x, p.y, p.z]);
  }
  return tubeGeo(C(pts), DUODENUM_R, { radial: 30, capEnd });
}

/** Круговые складки слизистой: кольца вдоль кишки, видны сквозь стенку. */
function folds(f0: number, f1: number, R: number, step = 0.03): BufferGeometry {
  const list: BufferGeometry[] = [];
  for (let t = f0 + step / 2; t < f1; t += step) list.push(ringAt(duodenumCurve, t, R * 0.97, 0.06, 0.7, [6, 30]));
  return merge(list);
}

const toV = (p: Vector3): V3 => [p.x, p.y, p.z];

/** Ветвление мелких сосудов: короткие тонкие трубки от точек основной линии. */
function twigs(from: V3[], dirs: (i: number) => V3, len: number, r: number, count: number, seed: number): BufferGeometry {
  const rand = mulberry32(seed);
  const list: BufferGeometry[] = [];
  const curve = C(from);
  for (let k = 0; k < count; k++) {
    const t = (k + 0.5 + (rand() - 0.5) * 0.4) / count;
    const a = curve.getPointAt(Math.min(0.98, Math.max(0.02, t)));
    const d = dirs(k);
    const l = len * (0.7 + rand() * 0.6);
    const mid: V3 = [a.x + d[0] * l * 0.5 + (rand() - 0.5) * 0.16, a.y + d[1] * l * 0.5 + (rand() - 0.5) * 0.16, a.z + d[2] * l * 0.5];
    list.push(T([toV(a), mid, [a.x + d[0] * l, a.y + d[1] * l, a.z + d[2] * l]], r, r * 0.45, { radial: 6, segs: 8, capEnd: true }));
  }
  return merge(list);
}

/** Междольковые протоки: «ёлочка» от главного протока, ветви подрезаны по форме железы. */
function sideDucts(): { wall: BufferGeometry; core: BufferGeometry } {
  const rand = mulberry32(404);
  const curve = C(MAIN_DUCT_PTS);
  const walls: BufferGeometry[] = [];
  const cores: BufferGeometry[] = [];
  const total = 44;
  const tan = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();
  const fit = (a: V3, d: V3, len: number): number => {
    let l = len;
    for (let it = 0; it < 9; it++) {
      if (glandSdf(a[0] + d[0] * l, a[1] + d[1] * l, a[2] + d[2] * l) < -0.3) return l;
      l *= 0.82;
    }
    return 0;
  };
  for (let k = 0; k < total; k++) {
    const s = 0.035 + (k / (total - 1)) * 0.9;
    const a = curve.getPointAt(s);
    curve.getTangentAt(s, tan).normalize();
    e1.crossVectors(tan, new Vector3(0, 0, 1)).normalize();
    e2.crossVectors(tan, e1).normalize();
    const th = k * 2.4 + rand() * 0.5;
    const out = new Vector3().addScaledVector(e1, Math.cos(th)).addScaledVector(e2, Math.sin(th) * 0.55).normalize();
    // притоки впадают под острым углом, открытым в сторону хвоста (против тока сока)
    const d = out.clone().multiplyScalar(0.86).addScaledVector(tan, -0.5).normalize();
    const start = toV(a);
    const dir: V3 = [d.x, d.y, d.z];
    const l = fit(start, dir, 1.0 + rand() * 1.1);
    if (l < 0.35) continue;
    const bend = e2.clone().multiplyScalar((rand() - 0.5) * 0.35);
    const end: V3 = [start[0] + dir[0] * l, start[1] + dir[1] * l, start[2] + dir[2] * l];
    const mid: V3 = [start[0] + dir[0] * l * 0.5 + bend.x, start[1] + dir[1] * l * 0.5 + bend.y, start[2] + dir[2] * l * 0.5 + bend.z];
    const r0 = 0.085 - 0.02 * (k / total);
    walls.push(T([start, mid, end], r0 + 0.035, r0 * 0.6 + 0.03, { radial: 7, segs: 9 }));
    cores.push(T([start, mid, end], r0, r0 * 0.55, { radial: 6, segs: 9, capEnd: true }));
    // две ветви второго порядка и гроздья ацинусов на концах
    for (let b = 0; b < 2; b++) {
      const ang = (b ? 1 : -1) * (0.5 + rand() * 0.35);
      const dd = new Vector3(...dir).applyAxisAngle(e2.clone().multiplyScalar(1), ang * 0.6).applyAxisAngle(e1, ang * 0.5).normalize();
      const dv: V3 = [dd.x, dd.y, dd.z];
      const ll = fit(end, dv, 0.55 + rand() * 0.35);
      if (ll < 0.2) continue;
      const tip: V3 = [end[0] + dv[0] * ll, end[1] + dv[1] * ll, end[2] + dv[2] * ll];
      walls.push(T([end, tip], r0 * 0.6 + 0.03, r0 * 0.4 + 0.025, { radial: 6, segs: 4 }));
      cores.push(T([end, tip], r0 * 0.55, r0 * 0.32, { radial: 5, segs: 4, capEnd: true }));
    }
  }
  return { wall: merge(walls), core: merge(cores) };
}

/** Позвонки: тела со скруглёнными краями, диски и поперечные отростки. */
function spine(): { bodies: BufferGeometry; discs: BufferGeometry } {
  const profile = [new Vector2(0, -1.5), new Vector2(2.1, -1.5), new Vector2(2.4, -1.25), new Vector2(2.3, -0.4), new Vector2(2.2, 0), new Vector2(2.3, 0.4), new Vector2(2.4, 1.25), new Vector2(2.1, 1.5), new Vector2(0, 1.5)];
  const bodies: BufferGeometry[] = [];
  const discs: BufferGeometry[] = [];
  for (const y of SPINE_LEVELS) {
    const b = new LatheGeometry(profile, 36);
    b.scale(1, 1, 0.82);
    b.translate(SPINE_C[0], y, SPINE_C[2]);
    bodies.push(b);
    for (const sx of [-1, 1]) bodies.push(T([[SPINE_C[0] + sx * 1.6, y, SPINE_C[2] - 1.0], [SPINE_C[0] + sx * 3.2, y, SPINE_C[2] - 1.5], [SPINE_C[0] + sx * 4.4, y + 0.1, SPINE_C[2] - 1.4]], 0.5, 0.36, { radial: 10, capEnd: true }));
    const d = new CylinderGeometry(2.2, 2.2, 0.86, 36, 1);
    d.scale(1, 1, 0.8);
    d.translate(SPINE_C[0], y - 2.0, SPINE_C[2]);
    discs.push(d);
  }
  return { bodies: merge(bodies), discs: merge(discs) };
}

/** Корень брыжейки поперечной ободочной кишки: полупрозрачная «занавеска», свисающая вниз и вперёд от железы. */
function mesocolon(): BufferGeometry {
  const root: V3[] = [
    [-6.4, -2.2, 1.1],
    [-3.6, -3.2, 1.5],
    [-0.8, -0.6, 0.95],
    onGland(0.25, -halfH(0.25) * 0.85, halfAP(0.25) * 0.9),
    onGland(0.5, -halfH(0.5) * 0.85, halfAP(0.5) * 0.9),
    onGland(0.75, -halfH(0.75) * 0.85, halfAP(0.75) * 0.9),
    onGland(0.95, -halfH(0.95) * 0.8, halfAP(0.95) * 0.9),
  ];
  const curve = C(root);
  const X = 60;
  const Y = 28;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= Y; i++) {
    const v = i / Y;
    for (let j = 0; j <= X; j++) {
      const s = j / X;
      const p = curve.getPointAt(s);
      const w = Math.sin(s * 15 + v * 4) * 0.16 * v + Math.sin(s * 6.5 - v * 3) * 0.12 * v;
      pos.push(p.x + 0.35 * v + w * 0.4, p.y - 4.2 * v * (1 - 0.25 * s) + w * 0.2, p.z + 3.8 * v + w);
      uv.push(s * 4, v * 1.4);
    }
  }
  for (let i = 0; i < Y; i++)
    for (let j = 0; j < X; j++) {
      const a = i * (X + 1) + j;
      const b = a + X + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- Железа ---------- */

/** Отделы железы из построенной в воркере сетки: общие буферы, у каждого отдела свой индекс. */
export function glandParts(d: GlandMeshData): PancGeometry {
  const pos = new BufferAttribute(d.positions, 3);
  const nrm = new BufferAttribute(d.normals, 3);
  const col = new BufferAttribute(d.colors, 3);
  const out: PancGeometry = {};
  for (const r of REGIONS) {
    const g = new BufferGeometry();
    g.setAttribute('position', pos);
    g.setAttribute('normal', nrm);
    g.setAttribute('color', col);
    g.setIndex(new BufferAttribute(d.indices[r as Region], 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    out[r] = [{ g, m: 'gland' }];
  }
  // капсула — тончайшая оболочка чуть снаружи поверхности
  const shellPos = new Float32Array(d.positions.length);
  for (let i = 0; i < shellPos.length; i++) shellPos[i] = d.positions[i] + d.normals[i] * 0.05;
  const all: number[] = [];
  for (const r of REGIONS) for (const v of d.indices[r as Region]) all.push(v);
  const cap = new BufferGeometry();
  cap.setAttribute('position', new BufferAttribute(shellPos, 3));
  cap.setAttribute('normal', nrm);
  cap.setIndex(new BufferAttribute(new Uint32Array(all), 1));
  cap.computeBoundingSphere();
  out.capsule = [{ g: cap, m: 'capsule', noPick: true }];
  return out;
}

/* ---------- Всё остальное ---------- */

export function buildStatic(): PancGeometry {
  const G: PancGeometry = {};
  const add = (id: string, ...defs: MeshDef[]) => (G[id] = defs);
  const d = (g: BufferGeometry, m: MatKey, noPick = false): MeshDef => ({ g, m, noPick });

  /* Протоки */
  const mainCurve = C(MAIN_DUCT_PTS);
  add(
    'main-duct',
    d(tubeGeo(mainCurve, (t) => 0.2 + 0.1 * t + 0.07, { radial: 16, capStart: true }), 'ductWall', true),
    d(tubeGeo(mainCurve, (t) => 0.12 + 0.12 * t, { radial: 14, capStart: true }), 'juice'),
  );
  const sd = sideDucts();
  add('side-ducts', d(sd.wall, 'ductWall', true), d(sd.core, 'juice'));
  add(
    'accessory-duct',
    d(T(ACCESSORY_DUCT_PTS, 0.2, 0.17, { radial: 12 }), 'ductWall', true),
    d(T(ACCESSORY_DUCT_PTS, 0.12, 0.1, { radial: 10, capStart: true }), 'juice'),
  );
  add('bile-duct', d(T(BILE_DUCT_PTS, 0.41, 0.4, { radial: 16 }), 'bileWall', true), d(T(BILE_DUCT_PTS, 0.3, 0.3, { radial: 14 }), 'bile'));
  add('ampulla', d(ellipsoid(AMPULLA, [0.5, 0.44, 0.44], 26), 'ductWall', true), d(ellipsoid(AMPULLA, [0.4, 0.34, 0.34], 22), 'mixed'));
  add(
    'sphincter-oddi',
    d(ringPts([-7.68, -2.75, -1.72], [1, 0, 0], 0.5, 0.15), 'oddi'),
    d(ringPts([-7.95, -2.75, -1.72], [1, 0, 0], 0.46, 0.14), 'oddi'),
    d(ringPts([-6.45, -2.7, -1.72], [1, 0.08, 0], 0.46, 0.12), 'oddi'),
    d(ringPts([-6.55, -2.62, -1.62], [1, 0.1, 0.08], 0.38, 0.1), 'oddi'),
    d(ringPts(SPHINCTER, [1, 0, 0], 0.4, 0.12), 'oddi'),
  );
  const mp = ellipsoid(MAJOR_PAPILLA, [0.52, 0.46, 0.46], 28);
  const hole = new CircleGeometry(0.11, 16);
  hole.rotateY(-Math.PI / 2);
  hole.translate(MAJOR_PAPILLA[0] - 0.5, MAJOR_PAPILLA[1], MAJOR_PAPILLA[2]);
  add('major-papilla', d(mp, 'papilla'), d(hole, 'hole', true));
  const np = ellipsoid(MINOR_PAPILLA, [0.3, 0.26, 0.26], 22);
  const hole2 = new CircleGeometry(0.06, 12);
  hole2.rotateY(-Math.PI / 2);
  hole2.translate(MINOR_PAPILLA[0] - 0.29, MINOR_PAPILLA[1], MINOR_PAPILLA[2]);
  add('minor-papilla', d(np, 'papilla'), d(hole2, 'hole', true));

  /* Артерии */
  add(
    'celiac-trunk',
    d(T(CELIAC_PTS, 0.58, 0.5, { radial: 18, capStart: true }), 'artery'),
    d(T([[1.4, 5.85, -2.6], [1.0, 7.0, -2.4], [0.2, 8.4, -2.0]], 0.25, 0.2, { radial: 10, capEnd: true }), 'artery'),
  );
  add('hepatic-artery', d(T(HEPATIC_ARTERY_PTS, 0.32, 0.24, { radial: 14, capEnd: true }), 'artery'));
  add('gastroduodenal-artery', d(T(GDA_PTS, 0.24, 0.17, { radial: 12, capEnd: true }), 'artery'));
  const arcF = T(PD_ARCADE_FRONT, 0.11, 0.09, { radial: 8, capEnd: true });
  const arcB = T(PD_ARCADE_BACK, 0.11, 0.09, { radial: 8, capEnd: true });
  const arcTwigsF = twigs(PD_ARCADE_FRONT, () => [0.95, 0.0, -0.25], 0.9, 0.04, 9, 11);
  const arcTwigsB = twigs(PD_ARCADE_BACK, () => [0.95, 0.0, 0.25], 0.9, 0.04, 9, 12);
  add('pd-arcades', d(merge([arcF, arcB, arcTwigsF, arcTwigsB]), 'artery'));
  add('inferior-pd-artery', d(T(INF_PD_PTS, 0.18, 0.12, { radial: 10, capEnd: true }), 'artery'));
  const saTw = twigs(SPLENIC_ARTERY_PTS.slice(2, -1), () => [0.0, -1, -0.12], 0.95, 0.055, 9, 21);
  add('splenic-artery', d(T(SPLENIC_ARTERY_PTS, 0.32, 0.22, { radial: 14, capEnd: true }), 'artery'), d(saTw, 'artery'));
  add(
    'dorsal-artery',
    d(
      merge([
        T(DORSAL_ARTERY_PTS, 0.19, 0.15, { radial: 10 }),
        T(DORSAL_BRANCH_RIGHT, 0.15, 0.1, { radial: 8, capEnd: true }),
        T(TRANSVERSE_ARTERY_PTS, 0.14, 0.09, { radial: 8, capEnd: true }),
      ]),
      'artery',
    ),
  );
  add('great-artery', d(merge([T(GREAT_ARTERY_PTS, 0.19, 0.14, { radial: 10 }), ...GREAT_ARTERY_BRANCHES.map((b) => T(b, 0.13, 0.08, { radial: 8, capEnd: true }))]), 'artery'));
  const smaTw = twigs(SMA_PTS.slice(2), (k) => [0.9, -0.35, 0.05 * k], 1.5, 0.11, 4, 31);
  add('sma', d(T(SMA_PTS, 0.62, 0.42, { radial: 20, capStart: true, capEnd: true }), 'artery'), d(smaTw, 'artery'));

  /* Вены */
  add(
    'splenic-vein',
    d(T(SPLENIC_VEIN_PTS, 0.56, 0.46, { radial: 16, capEnd: true }), 'portal'),
    ...SPLENIC_VEIN_TRIBUTARIES.map((t) => d(T(t, 0.28, 0.18, { radial: 10, capEnd: true }), 'portal')),
  );
  add('imv', d(T(IMV_PTS, 0.3, 0.3, { radial: 12, capStart: true }), 'vein'));
  const smvTw = twigs(SMV_PTS.slice(0, -2), (k) => [-0.7, -0.3, 0.2 * k], 1.0, 0.1, 3, 41);
  add(
    'smv',
    d(T(SMV_PTS, 0.62, 0.7, { radial: 20, capStart: true }), 'vein'),
    d(T([[-0.5, -1.6, -1.6], [0.3, -2.2, 1.5], [1.0, -3.2, 3.6]], 0.26, 0.2, { radial: 10, capEnd: true }), 'vein'),
    d(smvTw, 'vein'),
  );
  add('portal-vein', d(T(PORTAL_PTS, 0.82, 0.64, { radial: 22, capEnd: true }), 'portal'));

  /* Нервы и лимфа */
  const gang = GANGLIA.map((g) => d(blob(g.c, g.r, { detail: 10, bump: 0.08 }), 'ganglion'));
  const rand = mulberry32(5);
  const web: BufferGeometry[] = [];
  const ga = GANGLIA[0].c;
  const gb = GANGLIA[1].c;
  for (let k = 0; k < 8; k++) {
    const o = (rand() - 0.5) * 0.7;
    web.push(T([[ga[0] + 0.6, ga[1] + o, ga[2] + 0.2], [1.1 + o, 5.4 + o * 0.6, -3.2 + o], [1.7 - o, 5.1 + o * 0.5, -3.7 - o * 0.5], [gb[0] - 0.6, gb[1] - o, gb[2] + 0.2]], 0.055, 0.045, { radial: 6, capEnd: true }));
  }
  for (const gg of GANGLIA) for (let k = 0; k < 4; k++) web.push(T([[gg.c[0], gg.c[1], gg.c[2]], [gg.c[0] + (k - 1.5) * 0.4, gg.c[1] - 0.8 - k * 0.15, gg.c[2] + 0.3], [gg.c[0] + (k - 1.5) * 0.7, gg.c[1] - 1.6 - k * 0.2, gg.c[2] + 0.5]], 0.05, 0.035, { radial: 6, capEnd: true }));
  add('celiac-plexus', ...gang, d(merge(web), 'nerve'));
  const fibres = NERVE_PATHS.map((p) => T(p, 0.07, 0.05, { radial: 7, capEnd: true }));
  const fine = NERVE_PATHS.flatMap((p, i) => [0.3, 0.6].map((t) => twigs(p, () => [0.2 * (i % 2 ? 1 : -1), -0.4, 0.55], 0.9, 0.03, 3, 50 + i + t * 10)));
  add('nerve-fibres', d(merge([...fibres, ...fine]), 'nerve'));
  add('lymph-nodes', ...LYMPH_NODES.map((n, i) => d(blob(n.at, n.r, { detail: 8, bump: 0.12, seed: i + 1 }), 'node')));

  /* Двенадцатиперстная и тощая кишка */
  const [f1, f2, f3] = DUODENUM_SPLIT;
  const part = (id: string, a: number, b: number, extra: MeshDef[] = []) =>
    add(id, d(duodenumPiece(a, b), 'duodenum', true), d(folds(a, b, DUODENUM_R), 'fold', true), ...extra);
  part('duo-superior', 0, f1);
  part('duo-descending', f1, f2);
  part('duo-horizontal', f2, f3);
  part('duo-ascending', f3, 1);
  add('treitz', d(T([[4.2, -0.7, -2.0], [3.8, 0.8, -3.5], [2.6, 2.6, -4.4]], 0.24, 0.12, { radial: 10, capEnd: true }), 'ligament'));
  const jej = tubeGeo(C(JEJUNUM_PTS), 1.25, { radial: 28, capEnd: true });
  const jf: BufferGeometry[] = [];
  const jc = C(JEJUNUM_PTS);
  for (let t = 0.05; t < 0.98; t += 0.09) jf.push(ringAt(jc, t, 1.2, 0.055, 0.7, [6, 28]));
  add('jejunum', d(jej, 'duodenum', true), d(merge(jf), 'fold', true));

  /* Желудок: плоская труба, сплюснутая спереди назад */
  const sc = C(STOMACH_PTS);
  const stomach = tubeGeo(
    sc,
    (t) => {
      let r = STOMACH_R[STOMACH_R.length - 1][1];
      for (let i = 1; i < STOMACH_R.length; i++) {
        if (t <= STOMACH_R[i][0]) {
          const k = (t - STOMACH_R[i - 1][0]) / (STOMACH_R[i][0] - STOMACH_R[i - 1][0]);
          r = lerp(STOMACH_R[i - 1][1], STOMACH_R[i][1], smoothstep(0, 1, k));
          break;
        }
      }
      return r;
    },
    { radial: 44, segs: 90, capStart: true },
  );
  stomach.translate(0, 0, -3.6);
  stomach.scale(1, 1, 0.78);
  stomach.translate(0, 0, 3.6);
  stomach.computeVertexNormals();
  add('stomach', d(stomach, 'stomach', true));

  /* Органы вокруг */
  add('spleen', d(blob(SPLEEN.c, SPLEEN.r, { notch: [-1, -0.1, 0.25], notchDepth: 0.32, bump: 0.05, seed: 3 }), 'spleen'));
  add('left-kidney', d(blob(L_KIDNEY.c, L_KIDNEY.r, { notch: [-1, -0.05, 0.4], notchDepth: 0.4, bump: 0.02, seed: 5 }), 'kidney'));
  add('right-kidney', d(blob(R_KIDNEY.c, R_KIDNEY.r, { notch: [1, -0.05, 0.4], notchDepth: 0.4, bump: 0.02, seed: 8 }), 'kidney'));
  add('left-adrenal', d(blob(L_ADRENAL.c, L_ADRENAL.r, { bump: 0.16, seed: 9, detail: 14 }), 'adrenal'));
  const aortaCurve = C(AORTA_PTS);
  add('aorta', d(tubeGeo(aortaCurve, 1.05, { radial: 28, segs: 40 }), 'aorta'));
  const ivc = tubeGeo(C(IVC_PTS), 1.22, { radial: 28, segs: 40 });
  ivc.translate(0, 0, 5.0);
  ivc.scale(1, 1, 0.82);
  ivc.translate(0, 0, -5.0);
  ivc.computeVertexNormals();
  add('ivc', d(ivc, 'ivc'));
  const sp = spine();
  add('spine', d(sp.bodies, 'bone'), d(sp.discs, 'disc'));
  add('liver', d(blob(LIVER.c, LIVER.r, { bump: 0.07, seed: 4, detail: 24, flat: (v) => 1 - 0.18 * Math.max(0, -v.y) }), 'liver'));
  add(
    'gallbladder',
    d(tubeGeo(C(GALLBLADDER_PTS), (t) => 0.34 + 0.98 * Math.sin(Math.min(1, t * 1.12) * Math.PI * 0.5), { radial: 30, segs: 40, capStart: true, capEnd: true }), 'gb'),
  );
  add('cystic-duct', d(T(CYSTIC_DUCT_PTS, 0.22, 0.24, { radial: 12 }), 'bileWall'));
  add('hepatic-duct', d(T(HEPATIC_DUCT_PTS, 0.26, 0.28, { radial: 12, capStart: true }), 'bileWall'));
  add('mesocolon', d(mesocolon(), 'mesocolon', true));

  return G;
}

