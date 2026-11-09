/*
  Аналитическая геометрия уха: трубки по осевым линиям, развёртки, улитка с перегородками, лабиринт, нервы, сосуды, связки.
  Плотные структуры (раковина, кость, воздушные пространства, косточки) строятся из полей расстояний — см. jobs.ts.
*/
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import {
  BONY_END_X, BRAINSTEM_C, CANALS, CHORDA_PTS, COCH, COCH_TH, EAR_N, EU_DIR, EU_S0, EU_S1, EU_S2, FACIAL_PTS, FLACCIDA, GENICULATE, IAM_PTS, ICA_PTS, ICA_R, JUGULAR_C,
  JUGULAR_R, RW, SIGMOID_PTS, SIGMOID_R, T, TM_ANT, TM_N, TM_RA, TM_RU, TM_UP, VEST_C, VIII_PTS, canalAmpulla, canalAt, canalPoint, canalPts, cochAt, cochCenter, cochRad,
  cochTube, ear, tmDepth, vadd, vcross, vlen, vlerp, vmul, vnorm, vsub, type V3,
} from './anatomy';
import { STAPES } from './field';

export type MatKey =
  | 'skin' | 'cartilage' | 'bone' | 'mucosa' | 'ossicle' | 'tm' | 'tmFlaccida' | 'annulus' | 'nerve' | 'ganglion' | 'artery' | 'vein' | 'muscle' | 'ligament'
  | 'canalSkin' | 'hair' | 'gland' | 'cerumen' | 'glass' | 'glassSoft' | 'perilymph' | 'endolymph' | 'membrane' | 'basilar' | 'reissner' | 'corti' | 'tectorial' | 'lamina'
  | 'modiolus' | 'duct' | 'ampulla' | 'cupula' | 'macula' | 'otolith' | 'capsule' | 'brainstem' | 'wall' | 'tube';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  noPick?: boolean;
}

const v3 = (p: V3) => new Vector3(p[0], p[1], p[2]);

/* ------------------------------------------------------------------ инструменты */

interface GridOpts {
  closedJ?: boolean;
  closedT?: boolean;
  capStart?: boolean;
  capEnd?: boolean;
  along?: boolean;
  attrs?: Record<string, (i: number, j: number) => number>;
}

/** Сетка из точек P(i, j): трубы, листы, эллипсоиды. Нормали считаются по граням, замкнутые тела ориентируются наружу. */
export function gridGeo(nT: number, nJ: number, P: (i: number, j: number) => V3, o: GridOpts = {}): BufferGeometry {
  const rows = o.closedT ? nT : nT + 1;
  const cols = o.closedJ ? nJ : nJ + 1;
  const pos: number[] = [];
  const idx: number[] = [];
  const along: number[] = [];
  const extra: Record<string, number[]> = {};
  for (const k of Object.keys(o.attrs ?? {})) extra[k] = [];
  const push = (p: V3, t: number, i: number, j: number) => {
    pos.push(p[0], p[1], p[2]);
    along.push(t);
    for (const k of Object.keys(extra)) extra[k].push(o.attrs![k](i, j));
  };
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) push(P(i, j), i / nT, i, j);
  const nI = o.closedT ? nT : nT;
  for (let i = 0; i < nI; i++)
    for (let j = 0; j < (o.closedJ ? nJ : nJ); j++) {
      const i1 = (i + 1) % rows;
      const j1 = (j + 1) % cols;
      const a = i * cols + j;
      const b = i * cols + j1;
      const c = i1 * cols + j;
      const d = i1 * cols + j1;
      idx.push(a, c, b, b, c, d);
    }
  const cap = (row: number, flip: boolean) => {
    const c0 = pos.length / 3;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let j = 0; j < cols; j++) {
      const p = P(row, j);
      cx += p[0];
      cy += p[1];
      cz += p[2];
    }
    push([cx / cols, cy / cols, cz / cols], row / nT, row, 0);
    for (let j = 0; j < cols; j++) push(P(row, j), row / nT, row, j);
    for (let j = 0; j < cols; j++) {
      const a = c0 + 1 + j;
      const b = c0 + 1 + ((j + 1) % cols);
      if (flip) idx.push(c0, b, a);
      else idx.push(c0, a, b);
    }
  };
  const closed = !!o.closedJ && (!!o.closedT || (!!o.capStart && !!o.capEnd));
  if (o.closedJ && o.capStart) cap(0, false);
  if (o.closedJ && o.capEnd) cap(nT, true);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  if (o.along) g.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1));
  for (const [k, arr] of Object.entries(extra)) g.setAttribute(k, new BufferAttribute(new Float32Array(arr), 1));
  g.setIndex(idx);
  if (closed) {
    // ориентация наружу: знак объёма
    let vol = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
    }
    if (vol < 0) {
      for (let t = 0; t < idx.length; t += 3) {
        const tmp = idx[t + 1];
        idx[t + 1] = idx[t + 2];
        idx[t + 2] = tmp;
      }
      g.setIndex(idx);
    }
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function mergeGeos(list: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += p.count;
    g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

interface TubeOpts {
  radial?: number;
  seg?: number;
  caps?: boolean;
  /** Множители полуосей сечения: по нормали и по бинормали. */
  ex?: number | ((t: number) => number);
  ey?: number | ((t: number) => number);
  /** Ширина сечения вдоль этого направления (лента). */
  flat?: V3;
  closed?: boolean;
  a0?: number;
  a1?: number;
  along?: boolean;
}
const fn = (v: number | ((t: number) => number) | undefined, d: number) => (typeof v === 'function' ? v : () => (v === undefined ? d : v));

/** Трубка по сглаженной кривой с переменным радиусом, параллельный перенос рамки. */
export function tubeGeo(pts: V3[], radius: number | ((t: number) => number), o: TubeOpts = {}): BufferGeometry {
  const curve = new CatmullRomCurve3(pts.map(v3), !!o.closed, 'centripetal');
  const seg = o.seg ?? Math.max(24, Math.min(240, pts.length * 10));
  const radial = o.radial ?? 14;
  const rf = fn(radius, 1);
  const exf = fn(o.ex, 1);
  const eyf = fn(o.ey, 1);
  const cs: Vector3[] = [];
  const ts: Vector3[] = [];
  const ns: Vector3[] = [];
  const bs: Vector3[] = [];
  const n = o.closed ? seg : seg;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    cs.push(curve.getPointAt(Math.min(t, 0.99999)));
    ts.push(curve.getTangentAt(Math.min(t, 0.99999)).normalize());
  }
  let N = new Vector3();
  if (o.flat) N = new Vector3().crossVectors(ts[0], v3(o.flat)).normalize();
  if (N.lengthSq() < 1e-6) N = Math.abs(ts[0].y) < 0.9 ? new Vector3(0, 1, 0).cross(ts[0]).normalize() : new Vector3(1, 0, 0).cross(ts[0]).normalize();
  for (let i = 0; i <= n; i++) {
    if (o.flat) {
      N = new Vector3().crossVectors(ts[i], v3(o.flat));
      if (N.lengthSq() < 1e-6) N = ns[i - 1]?.clone() ?? new Vector3(1, 0, 0);
      N.normalize();
    } else if (i > 0) N = N.clone().addScaledVector(ts[i], -N.dot(ts[i])).normalize();
    ns.push(N.clone());
    bs.push(new Vector3().crossVectors(ts[i], N).normalize());
  }
  const a0 = o.a0 ?? 0;
  const a1 = o.a1 ?? Math.PI * 2;
  const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  return gridGeo(
    n,
    radial,
    (i, j) => {
      const t = i / n;
      const ph = a0 + ((a1 - a0) * j) / radial;
      const r = rf(t);
      const p = cs[i].clone().addScaledVector(ns[i], Math.cos(ph) * r * exf(t)).addScaledVector(bs[i], Math.sin(ph) * r * eyf(t));
      return [p.x, p.y, p.z];
    },
    { closedJ: full, closedT: !!o.closed, capStart: o.caps !== false && !o.closed && full, capEnd: o.caps !== false && !o.closed && full, along: o.along },
  );
}

/** Эллипсоид с произвольными осями (orth) и полуосями r. */
export function ellipsoidGeo(c: V3, ax: [V3, V3, V3], r: V3, w = 20, h = 14): BufferGeometry {
  return gridGeo(
    h,
    w,
    (i, j) => {
      const th = (Math.PI * i) / h;
      const ph = (2 * Math.PI * j) / w;
      const x = Math.sin(th) * Math.cos(ph) * r[0];
      const y = Math.cos(th) * r[1];
      const z = Math.sin(th) * Math.sin(ph) * r[2];
      return [c[0] + ax[0][0] * x + ax[1][0] * y + ax[2][0] * z, c[1] + ax[0][1] * x + ax[1][1] * y + ax[2][1] * z, c[2] + ax[0][2] * x + ax[1][2] * y + ax[2][2] * z];
    },
    { closedJ: true },
  );
}
const TM_AX: [V3, V3, V3] = [TM_ANT, TM_UP, TM_N];
/** Эллипсоид в осях перепонки (a, u, d). */
const ellT = (c: V3, r: V3, w = 20, h = 14) => ellipsoidGeo(c, TM_AX, r, w, h);

/** Кольцо-«бублик» по эллипсу в плоскости (e1, e2) вокруг c. */
function ringGeo(c: V3, e1: V3, e2: V3, r1: number, r2: number, tube: number, seg = 48): BufferGeometry {
  const pts: V3[] = Array.from({ length: seg }, (_, i) => {
    const a = (2 * Math.PI * i) / seg;
    return vadd(c, vadd(vmul(e1, Math.cos(a) * r1), vmul(e2, Math.sin(a) * r2)));
  });
  return tubeGeo(pts, tube, { closed: true, seg, radial: 10 });
}

const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const perp = (d: V3): [V3, V3] => {
  const h: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = vnorm(vcross(d, h));
  return [u, vcross(d, u)];
};

/** Тонкий конус-волосок. */
function coneGeo(base: V3, dir: V3, len: number, r: number): BufferGeometry {
  const [u, w] = perp(dir);
  return gridGeo(
    3,
    5,
    (i, j) => {
      const t = i / 3;
      const a = (2 * Math.PI * j) / 5;
      const rr = r * (1 - t * 0.92);
      return vadd(vadd(base, vmul(dir, len * t)), vadd(vmul(u, Math.cos(a) * rr), vmul(w, Math.sin(a) * rr)));
    },
    { closedJ: true, capStart: true },
  );
}

/* ------------------------------------------------------------------ барабанная перепонка */

const tmP = (rho: number, ph: number): V3 => {
  let d = tmDepth(rho);
  // рыхлая часть плоская и чуть выпуклая наружу
  const sec = Math.exp(-Math.pow((ph - (FLACCIDA.phi0 + FLACCIDA.phi1) / 2) / 0.45, 4)) * Math.max(0, (rho - 0.7) / 0.3);
  d = d * (1 - sec) + (-0.05 + 0.35 * Math.sin(Math.PI * Math.min(1, (rho - 0.7) / 0.3))) * sec;
  return T(Math.cos(ph) * rho * TM_RA, Math.sin(ph) * rho * TM_RU, d);
};

function buildTm(): { tensa: BufferGeometry; flaccida: BufferGeometry } {
  const nR = 36;
  const nP = 96;
  const base = gridGeo(nR, nP, (i, j) => tmP(i / nR, (2 * Math.PI * j) / nP), {
    closedJ: true,
    attrs: { aRho: (i) => i / nR, aU: (i, j) => 0.5 + 0.5 * Math.cos((2 * Math.PI * j) / nP) * (i / nR), aV: (i, j) => 0.5 + 0.5 * Math.sin((2 * Math.PI * j) / nP) * (i / nR) },
  });
  const uv: number[] = [];
  const au = base.getAttribute('aU');
  const av = base.getAttribute('aV');
  for (let i = 0; i < au.count; i++) uv.push(au.getX(i), av.getX(i));
  base.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  // перепонка видна с наружной стороны: нормаль от центра к проходу
  const idx = base.getIndex()!;
  const pos = base.getAttribute('position');
  const flip: number[] = [];
  const tensa: number[] = [];
  const flac: number[] = [];
  const n = new Vector3(...TM_N);
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    const e1 = new Vector3(pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a));
    const e2 = new Vector3(pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a));
    const facing = e1.cross(e2).dot(n) >= 0;
    const tri = facing ? [a, b, c] : [a, c, b];
    flip.push(...tri);
    const ri = Math.floor(a / nP);
    const rho = Math.max(ri, Math.floor(b / nP), Math.floor(c / nP)) / nR;
    const jj = ((a % nP) + (b % nP) + (c % nP)) / 3 / nP;
    const ph = jj * Math.PI * 2;
    const inFlac = rho >= FLACCIDA.rho0 && ph >= FLACCIDA.phi0 && ph <= FLACCIDA.phi1;
    (inFlac ? flac : tensa).push(...tri);
  }
  base.setIndex(flip);
  base.computeVertexNormals();
  const make = (list: number[]) => {
    const g = new BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'aRho']) g.setAttribute(k, base.getAttribute(k));
    g.setIndex(list);
    g.boundingSphere = base.boundingSphere ?? null;
    g.computeBoundingSphere();
    return g;
  };
  return { tensa: make(tensa), flaccida: make(flac) };
}

/* ------------------------------------------------------------------ улитка */

/** Профиль сечения улитки в долях радиуса трубки: s — по радиусу витка, z — вдоль оси. */
type P2 = [number, number];
const RH = 0.92;
const arcPts = (a0: number, a1: number, n: number, sc = 1): P2[] => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [Math.cos(a) * sc, Math.sin(a) * RH * sc] as P2;
});
const PA = -0.24;
const PR = 0.5;
const LAMINA_OUT: P2 = [-0.28, 0];
const BM_OUT: P2 = [Math.cos(PA), Math.sin(PA) * RH];
const LIMBUS: P2 = [-0.34, 0.13];
const REISS_OUT: P2 = [Math.cos(PR), Math.sin(PR) * RH];
const POLY_ST: P2[] = [[-1, 0], LAMINA_OUT, BM_OUT, ...arcPts(PA, -Math.PI, 18).slice(1)];
const POLY_SV: P2[] = [[-1, 0], LAMINA_OUT, LIMBUS, REISS_OUT, ...arcPts(PR, Math.PI, 18).slice(1)];
const POLY_SM: P2[] = [LIMBUS, REISS_OUT, ...arcPts(PR, PA, 6).slice(1), LAMINA_OUT];

const NS = 330;
const spiralTheta = (i: number, n = NS) => (COCH_TH * i) / n;

/** Развёртка многоугольника вдоль спирали; closed — замкнутое тело, иначе лента. */
function sweepProfile(poly: P2[], o: { closed?: boolean; scale?: number; thick?: number; along?: boolean; capped?: boolean } = {}): BufferGeometry {
  const sc = o.scale ?? 1;
  const m = poly.length;
  return gridGeo(
    NS,
    o.closed ? m : m - 1,
    (i, j) => {
      const th = spiralTheta(i);
      const r = cochTube(th) * sc;
      const [s, z] = poly[j % m];
      return cochAt(th, s * r, z * r);
    },
    { closedJ: !!o.closed, capStart: o.closed && o.capped !== false, capEnd: o.closed && o.capped !== false, along: o.along },
  );
}
/** Лента (мембрана) заданной толщины вдоль спирали между двумя точками профиля. */
function ribbon(path: P2[], th = 0.05, along = true): BufferGeometry {
  const up = path.map(([s, z]) => [s, z + th] as P2);
  const dn = path.map(([s, z]) => [s, z - th] as P2).reverse();
  return sweepProfile([...up, ...dn], { closed: true, along });
}

function buildCochlea(): Record<string, MeshDef[]> {
  const spir = Array.from({ length: 121 }, (_, i) => cochCenter((COCH_TH * i) / 120));
  const shell = sweepProfile(arcPts(0, Math.PI * 2, 28, 1.3).slice(0, 28), { closed: true });
  const hAx = COCH.height;
  const modPts: V3[] = [vadd(COCH.c0, vmul(COCH.axis, -0.7)), vadd(COCH.c0, vmul(COCH.axis, hAx * 0.5)), vadd(COCH.c0, vmul(COCH.axis, hAx + 0.7))];
  const modiolus = tubeGeo(modPts, (t) => 1.45 - 1.0 * Math.pow(t, 0.9), { radial: 24, seg: 40 });
  // спиральный ганглий: трубка внутри модиолуса вдоль витка
  const gang: V3[] = Array.from({ length: 140 }, (_, i) => {
    const th = 0.15 + ((COCH_TH - 1.6) * i) / 139;
    const r = cochTube(th);
    return vadd(cochCenter(th), vadd(vmul(cochRad(th), -r * 1.18), vmul(COCH.axis, 0.0)));
  });
  const ganglion = tubeGeo(gang, 0.27, { radial: 10, seg: 280 });
  // волокна улитчатого нерва: от ганглия к оси модиолуса и вниз к основанию
  const fibers: BufferGeometry[] = [];
  for (let k = 0; k < 26; k++) {
    const th = 0.3 + ((COCH_TH - 2.0) * k) / 25;
    const r = cochTube(th);
    const from = vadd(cochCenter(th), vmul(cochRad(th), -r * 1.18));
    const axisZ = (COCH.height * th) / COCH_TH;
    const onAxis = vadd(COCH.c0, vmul(COCH.axis, axisZ));
    const base = vadd(COCH.c0, vmul(COCH.axis, -0.5 + 0.0 * k));
    fibers.push(tubeGeo([from, vlerp(from, onAxis, 0.6), onAxis, vlerp(onAxis, base, 0.5), base], 0.06, { radial: 5, seg: 14 }));
  }
  const nerveTrunk = tubeGeo([vadd(COCH.c0, vmul(COCH.axis, -0.5)), vadd(COCH.c0, vmul(COCH.axis, -1.8)), vlerp(COCH.c0, IAM_PTS[0], 0.7), IAM_PTS[0]], 0.7, { radial: 14, seg: 30 });
  const apex = cochCenter(COCH_TH);
  const [au, aw] = perp(vnorm(vsub(cochCenter(COCH_TH), cochCenter(COCH_TH - 0.1))));
  const helico = ringGeo(apex, au, aw, 0.3, 0.3, 0.07, 24);
  const apexGlow = ellipsoidGeo(apex, [au, vnorm(vsub(cochCenter(COCH_TH), cochCenter(COCH_TH - 0.1))), aw], [0.32, 0.38, 0.32], 14, 10);
  const corti = sweepProfile([[-0.14, 0.0], [-0.05, 0.13], [0.08, 0.19], [0.22, 0.14], [0.36, 0.05], [0.4, -0.03], [0.2, -0.06], [-0.1, -0.03]].map(([s, z]) => [s, z] as P2), { closed: true, along: true });
  const tectorial = ribbon([[-0.34, 0.15], [-0.14, 0.31], [0.12, 0.36], [0.34, 0.24], [0.44, 0.12]], 0.035, true);
  return {
    'cochlea-bony': [{ g: shell, m: 'glass' }],
    modiolus: [{ g: modiolus, m: 'modiolus' }],
    'spiral-lamina': [{ g: ribbon([[-1, 0], [-0.28, 0]], 0.05, false), m: 'lamina' }],
    'scala-vestibuli': [{ g: sweepProfile(POLY_SV, { closed: true, scale: 0.97 }), m: 'perilymph' }],
    'scala-tympani': [{ g: sweepProfile(POLY_ST, { closed: true, scale: 0.97 }), m: 'perilymph' }],
    'cochlear-duct': [{ g: sweepProfile(POLY_SM, { closed: true, scale: 0.97 }), m: 'endolymph' }],
    reissner: [{ g: ribbon([LIMBUS, REISS_OUT], 0.012, true), m: 'reissner' }],
    'basilar-membrane': [{ g: ribbon([LAMINA_OUT, BM_OUT], 0.025, true), m: 'basilar' }],
    'organ-of-corti': [{ g: corti, m: 'corti' }],
    'tectorial-membrane': [{ g: tectorial, m: 'tectorial' }],
    'spiral-ganglion': [{ g: ganglion, m: 'ganglion' }],
    helicotrema: [{ g: helico, m: 'ganglion' }, { g: apexGlow, m: 'perilymph' }],
    'cochlear-nerve': [{ g: nerveTrunk, m: 'nerve' }, { g: mergeGeos(fibers), m: 'nerve' }],
    _spiral: [{ g: tubeGeo(spir, 0.01, { radial: 3, seg: 120 }), m: 'tube', noPick: true }],
  };
}

/* ------------------------------------------------------------------ лабиринт: преддверие и каналы */

const VR: V3 = [2.0, 2.45, 1.95];

function buildVestibular(): Record<string, MeshDef[]> {
  const out: Record<string, MeshDef[]> = {};
  out.vestibule = [{ g: ellT(VEST_C, [VR[0] + 0.32, VR[1] + 0.32, VR[2] + 0.32], 28, 20), m: 'glass' }];
  const ampBulge = (c: (typeof CANALS)[number], base: number, add: number) => (t: number) => {
    const e = c.ampEnd === 0 ? t : 1 - t;
    return base + add * Math.exp(-Math.pow(e / 0.1, 2));
  };
  const bony = CANALS.map((c) => tubeGeo(canalPts(c, 56), ampBulge(c, 0.84, 0.5), { radial: 16, seg: 110 }));
  out['bony-canals'] = [{ g: mergeGeos(bony), m: 'glass' }];
  for (const c of CANALS) out[c.id] = [{ g: tubeGeo(canalPts(c, 56), 0.3, { radial: 12, seg: 110 }), m: 'duct' }];
  const amps: BufferGeometry[] = [];
  const cups: BufferGeometry[] = [];
  for (const c of CANALS) {
    const a = canalAmpulla(c);
    const tan = vnorm(vsub(canalPoint(c, c.ampEnd === 0 ? 0.7 : 2 * Math.PI - 0.7), canalPoint(c, c.ampEnd === 0 ? 0.45 : 2 * Math.PI - 0.45)));
    const [u, w] = perp(tan);
    amps.push(ellipsoidGeo(a, [u, tan, w], [0.62, 0.78, 0.62], 16, 12));
    cups.push(ellipsoidGeo(vadd(a, vmul(u, 0.12)), [u, tan, w], [0.4, 0.32, 0.12], 14, 10));
  }
  out.ampullae = [{ g: mergeGeos(amps), m: 'ampulla' }];
  out.cupulae = [{ g: mergeGeos(cups), m: 'cupula' }];
  const U = vadd(VEST_C, T(-0.55, 0.85, 0.15));
  const S = vadd(VEST_C, T(0.95, -0.95, -0.55));
  out.utricle = [{ g: ellT(U, [1.15, 0.62, 0.72], 20, 14), m: 'duct' }];
  out.saccule = [{ g: ellT(S, [0.62, 0.9, 0.42], 18, 14), m: 'duct' }];
  const macU = vadd(U, T(0.05, -0.5, 0.0));
  const macS = vadd(S, T(0, 0, -0.38));
  const rnd = rng(5);
  const crystals: BufferGeometry[] = [];
  const ax: [V3, V3, V3] = [TM_ANT, TM_UP, TM_N];
  for (let k = 0; k < 190; k++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    const p = vadd(macU, T(Math.cos(a) * r * 0.85, 0.07 + rnd() * 0.05, Math.sin(a) * r * 0.5));
    crystals.push(ellipsoidGeo(p, ax, [0.038, 0.06, 0.038], 6, 5));
  }
  for (let k = 0; k < 150; k++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    const p = vadd(macS, T(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.62, 0.07 + rnd() * 0.05));
    crystals.push(ellipsoidGeo(p, ax, [0.038, 0.038, 0.06], 6, 5));
  }
  out.maculae = [
    { g: mergeGeos([ellT(macU, [0.9, 0.08, 0.5], 20, 8), ellT(macS, [0.42, 0.62, 0.07], 16, 8)]), m: 'macula' },
    { g: mergeGeos(crystals), m: 'otolith' },
  ];
  const sacPts = [vadd(VEST_C, T(-0.8, -0.2, -0.9)), vadd(VEST_C, T(-2.8, -0.1, -2.6)), vadd(VEST_C, T(-5.2, 0.0, -5.4)), vadd(VEST_C, T(-6.2, 0.1, -6.5))];
  const sacC = vadd(VEST_C, T(-6.7, 0.3, -7.0));
  out['endolymphatic-sac'] = [
    { g: tubeGeo(sacPts, 0.17, { radial: 8, seg: 30 }), m: 'duct' },
    { g: ellT(sacC, [1.3, 2.0, 0.4], 16, 12), m: 'duct' },
  ];
  const G = vadd(IAM_PTS[0], T(0.6, 0.7, 0.5));
  const ganglion = mergeGeos([ellT(vadd(G, T(0, 0.45, 0)), [0.8, 0.55, 0.75], 14, 10), ellT(vadd(G, T(-0.2, -0.55, 0)), [0.8, 0.55, 0.7], 14, 10)]);
  out['vestibular-ganglion'] = [{ g: ganglion, m: 'ganglion' }];
  const nerveTo = (to: V3, r: number, from: V3 = G) => tubeGeo([from, vlerp(from, to, 0.5), to], r, { radial: 8, seg: 24 });
  out['vestibular-nerve'] = [
    {
      g: mergeGeos([
        nerveTo(macU, 0.17), nerveTo(macS, 0.15), nerveTo(canalAmpulla(CANALS[0]), 0.13), nerveTo(canalAmpulla(CANALS[2]), 0.13), nerveTo(canalAmpulla(CANALS[1]), 0.13),
        tubeGeo([IAM_PTS[1], vlerp(IAM_PTS[1], G, 0.5), G], 0.8, { radial: 12, seg: 20 }),
      ]),
      m: 'nerve',
    },
  ];
  return out;
}

/* ------------------------------------------------------------------ наружное ухо, проход, перепонка, среднее ухо */

function buildOuter(): Record<string, MeshDef[]> {
  const out: Record<string, MeshDef[]> = {};
  const band = (a: V3, b: V3, c: V3, w0: number, w1: number): BufferGeometry =>
    tubeGeo([a, b, c], (t) => 0.5 * (w0 + (w1 - w0) * t), { radial: 12, seg: 40, flat: EAR_N, ey: 0.16, ex: 1 });
  out['auricularis-superior'] = [{ g: band(ear(3, 44, 6), ear(5, 37, 4), ear(6.5, 30, 1), 9, 4), m: 'muscle' }];
  out['auricularis-anterior'] = [{ g: band(ear(1, 17, -26), ear(2.5, 16, -20), ear(3.5, 14, -15), 8, 4), m: 'muscle' }];
  out['auricularis-posterior'] = [{ g: band(ear(-2, 6, 32), ear(0, 6, 26), ear(3, 5.5, 20.5), 7, 4), m: 'muscle' }];

  // костная часть прохода: выстилка кожей
  const xs = Array.from({ length: 22 }, (_, i) => 0.3 + ((BONY_END_X + 0.8) * i) / 21);
  const ptsB = xs.map((x) => canalAt(x).c);
  const rB = (t: number) => canalAt(0.3 + (BONY_END_X + 0.8) * t).r - 0.16;
  out['meatus-bony'] = [{ g: tubeGeo(ptsB, rB, { radial: 32, seg: 60, caps: false }), m: 'canalSkin' }];

  // волоски у входа и серные железы в хрящевой части
  const rnd = rng(23);
  const hairs: BufferGeometry[] = [];
  for (let k = 0; k < 230; k++) {
    const x = 18.5 + rnd() * 8.2;
    const ph = rnd() * Math.PI * 2;
    const { c, r } = canalAt(x);
    const ahead = canalAt(x + 0.5).c;
    const tan = vnorm(vsub(ahead, c));
    const [u, w] = perp(tan);
    const rad = vadd(vmul(u, Math.cos(ph)), vmul(w, Math.sin(ph)));
    const base = vadd(c, vmul(rad, r - 0.08));
    const dir = vnorm(vadd(vadd(vmul(rad, -0.5), vmul(tan, 0.75)), [rnd() * 0.3 - 0.15, rnd() * 0.3 - 0.15, rnd() * 0.3 - 0.15]));
    hairs.push(coneGeo(base, dir, 0.9 + rnd() * 1.4, 0.05));
  }
  out['ear-hairs'] = [{ g: mergeGeos(hairs), m: 'hair' }];
  const glands: BufferGeometry[] = [];
  for (let k = 0; k < 56; k++) {
    const x = 17.2 + rnd() * 8.4;
    const ph = rnd() * Math.PI * 2;
    const { c, r } = canalAt(x);
    const tan = vnorm(vsub(canalAt(x + 0.5).c, c));
    const [u, w] = perp(tan);
    const rad = vadd(vmul(u, Math.cos(ph)), vmul(w, Math.sin(ph)));
    const rr = 0.3 + rnd() * 0.28;
    glands.push(ellipsoidGeo(vadd(c, vmul(rad, r + 0.42)), [u, tan, w], [rr, rr * 1.15, rr], 10, 8));
  }
  const waxX = Array.from({ length: 14 }, (_, i) => 17.5 + (9.6 * i) / 13);
  out['ceruminous-glands'] = [
    { g: mergeGeos(glands), m: 'gland' },
    { g: tubeGeo(waxX.map((x) => canalAt(x).c), (t) => canalAt(17.5 + 9.6 * t).r - 0.1, { radial: 28, seg: 40, caps: false }), m: 'cerumen' },
  ];

  // барабанная перепонка
  const tm = buildTm();
  out['tympanic-membrane'] = [{ g: tm.tensa, m: 'tm' }];
  out['pars-flaccida'] = [{ g: tm.flaccida, m: 'tmFlaccida' }];
  const rimPts: V3[] = Array.from({ length: 64 }, (_, i) => {
    const a = (2 * Math.PI * i) / 64;
    return T(Math.cos(a) * (TM_RA + 0.12), Math.sin(a) * (TM_RU + 0.12), 0.12);
  });
  out['tympanic-annulus'] = [{ g: tubeGeo(rimPts, 0.36, { closed: true, seg: 96, radial: 10 }), m: 'annulus' }];
  return out;
}

function buildMiddle(): Record<string, MeshDef[]> {
  const out: Record<string, MeshDef[]> = {};
  const { s, W, L } = STAPES;
  const M = vnorm(vcross(L, s));
  // овальное окно: костный ободок и тонкая перепонка; кольцевая связка вокруг подножной пластинки
  out['oval-window'] = [
    { g: ringGeo(W, L, M, 1.78, 0.98, 0.27, 56), m: 'bone' },
    { g: ellipsoidGeo(vsub(W, vmul(s, 0.16)), [L, M, s], [1.7, 0.9, 0.04], 24, 8), m: 'membrane' },
  ];
  out['annular-ligament'] = [{ g: ringGeo(W, L, M, 1.62, 0.82, 0.12, 56), m: 'ligament' }];
  // круглое окно: ободок и вторичная барабанная перепонка
  const rn = vnorm(RW.n);
  const [ru, rw] = perp(rn);
  out['round-window'] = [
    { g: ringGeo(RW.c, ru, rw, 1.1, 1.1, 0.2, 40), m: 'bone' },
    { g: ellipsoidGeo(vsub(RW.c, vmul(rn, 0.1)), [ru, rn, rw], [0.98, 0.1, 0.98], 22, 8), m: 'membrane' },
  ];
  // суставы
  out['incudomalleolar-joint'] = [{ g: ellT(T(-1.1, 7.0, -3.15), [0.62, 0.95, 0.75], 16, 12), m: 'capsule' }];
  const lent = T(-2.62, 2.25, -3.7);
  out['incudostapedial-joint'] = [{ g: ellipsoidGeo(vlerp(lent, STAPES.head, 0.5), [TM_ANT, TM_UP, TM_N], [0.52, 0.52, 0.52], 14, 10), m: 'capsule' }];
  const lig = (a: V3, b: V3, r0: number, r1: number) => tubeGeo([a, vlerp(a, b, 0.5), b], (t) => r0 + (r1 - r0) * t, { radial: 8, seg: 16 });
  out['ossicular-ligaments'] = [
    {
      g: mergeGeos([
        lig(T(0.4, 8.6, -3.0), T(0.5, 10.9, -3.7), 0.12, 0.3),
        lig(T(1.0, 4.9, -1.0), T(2.4, 5.4, 0.5), 0.14, 0.32),
        lig(T(3.4, 5.2, -2.0), T(5.2, 5.0, -2.4), 0.12, 0.28),
        lig(T(-6.3, 7.6, -3.0), T(-7.6, 7.9, -2.3), 0.14, 0.3),
        lig(T(-2.6, 9.0, -3.4), T(-2.8, 10.8, -3.5), 0.12, 0.28),
      ]),
      m: 'ligament',
    },
  ];
  // мышцы: сухожилие и брюшко
  const spindle = (t: number) => 0.18 + 0.8 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.9);
  out['tensor-tympani'] = [
    { g: tubeGeo([T(0.8, 3.8, -5.6), T(0.7, 3.8, -4.0), T(0.95, 4.3, -1.55)], 0.2, { radial: 8, seg: 24 }), m: 'ligament' },
    { g: tubeGeo([T(0.9, 3.8, -5.7), T(3.8, 3.3, -7.2), T(8.2, 2.3, -9.3)], spindle, { radial: 14, seg: 40 }), m: 'muscle' },
  ];
  const sn = vsub(STAPES.head, vmul(STAPES.s, 0.8));
  out.stapedius = [
    { g: tubeGeo([T(-6.1, 2.1, -5.4), vlerp(T(-6.1, 2.1, -5.4), sn, 0.5), sn], 0.14, { radial: 8, seg: 20 }), m: 'ligament' },
    { g: tubeGeo([T(-6.5, 1.6, -5.3), T(-7.3, -2.2, -5.1), T(-8.4, -6.2, -4.8)], spindle, { radial: 12, seg: 40 }), m: 'muscle' },
  ];
  return out;
}

function buildTube(): Record<string, MeshDef[]> {
  const out: Record<string, MeshDef[]> = {};
  const [eu, ev] = perp(EU_DIR);
  // широкая ось щели — вдоль «лево-право» относительно направления трубы
  const bonyPts = [EU_S0, vlerp(EU_S0, EU_S1, 0.5), EU_S1];
  out['eustachian-bony'] = [{ g: tubeGeo(bonyPts, 1.4, { radial: 18, seg: 24, ex: 1.15, ey: 0.85, flat: TM_UP, caps: false }), m: 'mucosa' }];
  const cartPts = [EU_S1, vlerp(EU_S1, EU_S2, 0.33), vlerp(EU_S1, EU_S2, 0.66), EU_S2];
  const inner = tubeGeo(cartPts, (t) => 1.0 + 0.5 * t, { radial: 18, seg: 50, ex: 1.2, ey: 0.55, flat: TM_UP, caps: false });
  const hook = tubeGeo(cartPts, (t) => 1.55 + 0.6 * t, { radial: 22, seg: 50, ex: 1.2, ey: 0.62, flat: TM_UP, caps: false, a0: -0.3 * Math.PI, a1: 1.25 * Math.PI });
  out['eustachian-cartilaginous'] = [{ g: inner, m: 'mucosa' }, { g: hook, m: 'wall' }];
  const n = EU_DIR;
  const wallC = vadd(EU_S2, vmul(n, 1.4));
  const patch = gridGeo(24, 24, (i, j) => {
    const a = (i / 24 - 0.5) * 22;
    const b = (j / 24 - 0.5) * 22;
    return vadd(vadd(wallC, vadd(vmul(eu, a), vmul(ev, b))), vmul(n, -0.02 * (a * a + b * b) * 0.12));
  });
  const torus = ringGeo(vsub(EU_S2, vmul(n, 0.1)), eu, ev, 3.5, 2.1, 1.1, 40);
  const lip = ellipsoidGeo(vadd(EU_S2, vadd(vmul(ev, 2.4), vmul(eu, 0))), [eu, n, ev], [3.0, 1.2, 1.3], 18, 12);
  const hole = ellipsoidGeo(vadd(EU_S2, vmul(n, 0.3)), [eu, n, ev], [2.5, 0.12, 1.5], 18, 8);
  out['pharyngeal-opening'] = [{ g: patch, m: 'wall' }, { g: mergeGeos([torus, lip]), m: 'mucosa' }, { g: hole, m: 'brainstem' }];
  return out;
}

function buildNerves(): Record<string, MeshDef[]> {
  const out: Record<string, MeshDef[]> = {};
  const facialRoot: V3[] = [T(-6.6, -0.8, -40), T(-5.4, 0.6, -31), T(-3.9, 2.1, -22)];
  out['facial-nerve'] = [{ g: tubeGeo([...facialRoot, ...FACIAL_PTS], 0.58, { radial: 12, seg: 220 }), m: 'nerve' }];
  out['geniculate-ganglion'] = [{ g: ellT(GENICULATE, [1.1, 0.8, 0.85], 16, 12), m: 'ganglion' }];
  out['chorda-tympani'] = [{ g: tubeGeo(CHORDA_PTS, 0.2, { radial: 8, seg: 80 }), m: 'nerve' }];
  out['vestibulocochlear-nerve'] = [{ g: tubeGeo([...IAM_PTS.slice(1), ...VIII_PTS.slice(1)], (t) => 1.25 + 0.2 * t, { radial: 18, seg: 100 }), m: 'nerve' }];
  out['internal-acoustic-meatus'] = [{ g: tubeGeo(IAM_PTS, 2.3, { radial: 22, seg: 40, caps: false }), m: 'glassSoft' }];
  const bs = tubeGeo([vadd(BRAINSTEM_C, [0, -9, 0]), vadd(BRAINSTEM_C, [0, 0, 0]), vadd(BRAINSTEM_C, [0, 7, 0])], (t) => 4.6 + 1.2 * Math.sin(Math.PI * t * 0.8), { radial: 28, seg: 40 });
  out.brainstem = [{ g: bs, m: 'brainstem' }];
  out['internal-carotid'] = [{ g: tubeGeo(ICA_PTS, ICA_R, { radial: 18, seg: 120 }), m: 'artery' }];
  const jv = tubeGeo([JUGULAR_C, vadd(JUGULAR_C, T(0.3, -5, -0.4)), vadd(JUGULAR_C, T(0.7, -10, -1.0))], (t) => JUGULAR_R - 0.5 * t, { radial: 20, seg: 40 });
  out['jugular-bulb'] = [{ g: jv, m: 'vein' }, { g: ellipsoidGeo(JUGULAR_C, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [JUGULAR_R, JUGULAR_R * 0.95, JUGULAR_R], 22, 16), m: 'vein' }];
  out['sigmoid-sinus'] = [{ g: tubeGeo([...SIGMOID_PTS, JUGULAR_C], (t) => SIGMOID_R + 0.5 * t, { radial: 20, seg: 120 }), m: 'vein' }];
  return out;
}

/** Все аналитические части уха. Плотные поля (раковина, кость, воздух, косточки) подключаются из загрузчика. */
export function buildEar(): Record<string, MeshDef[]> {
  const all = { ...buildOuter(), ...buildMiddle(), ...buildTube(), ...buildCochlea(), ...buildVestibular(), ...buildNerves() };
  delete all._spiral;
  return all;
}

export { vlen };
