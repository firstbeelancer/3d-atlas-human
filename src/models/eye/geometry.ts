import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  DEG,
  DISC_DIR,
  IRIS,
  NERVE_CANAL_R,
  NERVE_CANAL_X,
  NERVE_PATH,
  R_SCLERA,
  WALL,
  dirAt,
  foveaPit,
  lerp,
  profileNormals,
  retinaRadius,
  smooth01,
  type P2,
  type V3,
} from './anatomy';

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Тела вращения ---------- */

export interface LatheOptions {
  segments?: number;
  /** Профиль идёт от переднего края к заднему (нормали надо перевернуть). */
  flip?: boolean;
  /** Смещение вдоль нормали профиля в точке (x, y, z): для ямок, выступов и складок. */
  displace?: (x: number, y: number, z: number) => number;
}

/** Поверхность вращения вокруг оси z; UV: u — вокруг оси, v — по длине профиля. */
export function latheGeometry(profile: P2[], o: LatheOptions = {}): BufferGeometry {
  const seg = o.segments ?? 128;
  const n = profile.length;
  const nrm = profileNormals(profile);
  const sign = o.flip ? -1 : 1;
  const arc = [0];
  for (let i = 1; i < n; i++) arc.push(arc[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = arc[n - 1] || 1;
  const pos = new Float32Array(n * (seg + 1) * 3);
  const nor = new Float32Array(n * (seg + 1) * 3);
  const uv = new Float32Array(n * (seg + 1) * 2);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= seg; j++) {
      const th = (2 * Math.PI * j) / seg;
      const c = Math.cos(th);
      const s = Math.sin(th);
      let r = profile[i][0];
      let z = profile[i][1];
      if (o.displace) {
        const d = o.displace(r * c, r * s, z);
        r += nrm[i][0] * d;
        z += nrm[i][1] * d;
      }
      const k = i * (seg + 1) + j;
      pos.set([r * c, r * s, z], k * 3);
      nor.set([sign * nrm[i][0] * c, sign * nrm[i][0] * s, sign * nrm[i][1]], k * 3);
      uv.set([j / seg, arc[i] / total], k * 2);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      const c = a + 1;
      const d = b + 1;
      if (o.flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (o.displace) {
    g.computeVertexNormals();
    const na = g.getAttribute('normal');
    for (let i = 0; i < n; i++) {
      const a = i * (seg + 1);
      const b = a + seg;
      const x = (na.getX(a) + na.getX(b)) / 2;
      const y = (na.getY(a) + na.getY(b)) / 2;
      const z = (na.getZ(a) + na.getZ(b)) / 2;
      na.setXYZ(a, x, y, z);
      na.setXYZ(b, x, y, z);
    }
  }
  return g;
}

/** Обе поверхности тонкой оболочки одной геометрией не склеиваем: у них разные материалы. */
export function shellSurfaces(outer: P2[], inner: P2[], o: LatheOptions = {}) {
  return {
    outer: latheGeometry(outer, o),
    inner: latheGeometry(inner, { ...o, flip: true }),
  };
}

/** Кольцевой торец оболочки между двумя точками профиля. */
export function rimGeometry(a: P2, b: P2, segments = 128): BufferGeometry {
  const g = latheGeometry([a, b], { segments });
  return g;
}

/* ---------- Срезы ---------- */

export function polygonToCap(poly: [number, number][], normalSign = 1): BufferGeometry {
  const shape = new Shape(poly.map(([x, z]) => new Vector2(x, z)));
  const g = new ShapeGeometry(shape);
  const p = g.getAttribute('position');
  const n = p.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos.set([p.getX(i), 0, p.getY(i)], i * 3);
    nor.set([0, normalSign, 0], i * 3);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  // обход треугольников: лицевая сторона смотрит вверх (+y), как нормали
  const src = g.getIndex()!;
  const flipped: number[] = [];
  for (let i = 0; i < src.count; i += 3) flipped.push(src.getX(i), src.getX(i + 2), src.getX(i + 1));
  out.setIndex(flipped);
  g.dispose();
  return out;
}

function mergeOrNull(list: BufferGeometry[]): BufferGeometry | null {
  const flat = list.filter(Boolean);
  if (!flat.length) return null;
  return flat.length === 1 ? flat[0] : mergeGeometries(flat, false);
}

/**
 * Горизонтальный разрез (плоскость y = 0) тонкой оболочки: две полосы по бокам оси.
 * skip — диапазон радиусов (на носовой стороне), который занимает зрительный нерв: там оболочка прорезана.
 */
export function bandCap(outer: P2[], innerIn: P2[] | ((side: 1 | -1) => P2[]), skip?: [number, number]): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const side of [1, -1] as const) {
    const inner = typeof innerIn === 'function' ? innerIn(side) : innerIn;
    const runs: [number, number][] = [];
    let start = -1;
    for (let i = 0; i < outer.length; i++) {
      const cut = side === 1 && !!skip && outer[i][1] < 0 && outer[i][0] > skip[0] && outer[i][0] < skip[1];
      if (!cut && start < 0) start = i;
      if (cut && start >= 0) {
        runs.push([start, i - 1]);
        start = -1;
      }
    }
    if (start >= 0) runs.push([start, outer.length - 1]);
    for (const [a, b] of runs) {
      if (b - a < 1) continue;
      const poly: [number, number][] = [];
      for (let i = a; i <= b; i++) poly.push([side * outer[i][0], outer[i][1]]);
      for (let i = b; i >= a; i--) poly.push([side * inner[i][0], inner[i][1]]);
      parts.push(polygonToCap(poly));
    }
  }
  return mergeOrNull(parts)!;
}

/** Горизонтальный разрез сплошного тела (хрусталик, стекловидное тело, камера). Профиль идёт от оси до оси. */
export function solidCap(profile: P2[]): BufferGeometry {
  const pts = profile.slice();
  pts[0] = [0, pts[0][1]];
  pts[pts.length - 1] = [0, pts[pts.length - 1][1]];
  const poly: [number, number][] = pts.map(([r, z]) => [r, z]);
  for (let i = pts.length - 2; i >= 1; i--) poly.push([-pts[i][0], pts[i][1]]);
  return polygonToCap(poly);
}

function radiusAtZ(pts: P2[], z: number): number | null {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if ((a[1] - z) * (b[1] - z) <= 0 && a[1] !== b[1]) return lerp(a[0], b[0], (z - a[1]) / (b[1] - a[1]));
  }
  return null;
}

/** Фронтальный разрез (плоскость z = c): кольцо между двумя поверхностями оболочки. Внутренний радиус 0 даёт диск. */
export function ringCapAtZ(outer: P2[], inner: P2[] | null, c: number, segments = 128): BufferGeometry | null {
  const ro = radiusAtZ(outer, c);
  const ri = inner ? radiusAtZ(inner, c) : 0;
  if (ro === null || ri === null) return null;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segments; j++) {
    const th = (2 * Math.PI * j) / segments;
    pos.push(ro * Math.cos(th), ro * Math.sin(th), c, ri * Math.cos(th), ri * Math.sin(th), c);
    nor.push(0, 0, 1, 0, 0, 1);
  }
  for (let j = 0; j < segments; j++) {
    const a = j * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/* ---------- Трубки с эллиптическим сечением ---------- */

export interface SweepOptions {
  radial?: number;
  samples?: number;
  /** Полуоси сечения вдоль нормали N и поперёк W (мм) в зависимости от доли длины t. */
  b: (t: number) => number;
  a?: (t: number) => number;
  /** Опорный вектор для нормали сечения (по умолчанию — направление от центра глаза). */
  ref?: (p: Vector3) => Vector3;
  /** Искривление сечения по внешней стороне: смещение вдоль -N равно (a sinθ)² · bend(t). */
  bend?: (t: number) => number;
  capEnds?: boolean;
}

export interface Sweep {
  geometry: BufferGeometry;
  rings: Vector3[][];
}

export function sweepTube(points: V3[], o: SweepOptions): Sweep {
  const radial = o.radial ?? 16;
  const samples = o.samples ?? Math.max(8, points.length * 6);
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    false,
    'centripetal',
  );
  const path = curve.getSpacedPoints(samples);
  const rings: Vector3[][] = [];
  const centers: Vector3[] = [];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const T = new Vector3();
  const N = new Vector3();
  const W = new Vector3();
  for (let i = 0; i <= samples; i++) {
    const p = path[i];
    const t = i / samples;
    T.copy(path[Math.min(samples, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize();
    const ref = o.ref ? o.ref(p) : p.clone().normalize();
    N.copy(ref).addScaledVector(T, -ref.dot(T));
    if (N.lengthSq() < 1e-6) N.set(0, 1, 0).addScaledVector(T, -T.y);
    N.normalize();
    W.crossVectors(T, N).normalize();
    const b = o.b(t);
    const a = o.a ? o.a(t) : b;
    const bend = o.bend ? o.bend(t) : 0;
    const ring: Vector3[] = [];
    for (let k = 0; k <= radial; k++) {
      const th = (2 * Math.PI * k) / radial;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      const v = p.clone().addScaledVector(N, b * cs - bend * a * a * sn * sn).addScaledVector(W, a * sn);
      ring.push(v);
      pos.push(v.x, v.y, v.z);
      const nv = new Vector3().addScaledVector(N, cs / Math.max(b, 1e-3)).addScaledVector(W, sn / Math.max(a, 1e-3)).normalize();
      nor.push(nv.x, nv.y, nv.z);
      uv.push(k / radial, t);
    }
    rings.push(ring);
    centers.push(p);
  }
  const idx: number[] = [];
  const stride = radial + 1;
  for (let i = 0; i < samples; i++) {
    for (let k = 0; k < radial; k++) {
      const a0 = i * stride + k;
      const b0 = a0 + stride;
      idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
    }
  }
  if (o.capEnds) {
    for (const end of [0, samples]) {
      const base = pos.length / 3;
      const c = centers[end];
      pos.push(c.x, c.y, c.z);
      T.copy(path[Math.min(samples, end + 1)]).sub(path[Math.max(0, end - 1)]).normalize();
      const sgn = end === 0 ? -1 : 1;
      nor.push(T.x * sgn, T.y * sgn, T.z * sgn);
      uv.push(0.5, end === 0 ? 0 : 1);
      for (let k = 0; k < radial; k++) {
        const v = rings[end][k];
        pos.push(v.x, v.y, v.z);
        nor.push(T.x * sgn, T.y * sgn, T.z * sgn);
        uv.push(k / radial, end === 0 ? 0 : 1);
      }
      for (let k = 0; k < radial; k++) {
        const v0 = base + 1 + k;
        const v1 = base + 1 + ((k + 1) % radial);
        if (end === 0) idx.push(base, v1, v0);
        else idx.push(base, v0, v1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geometry: g, rings };
}

/** Продольный срез трубки, лежащей в плоскости y = 0: полоса между крайними точками сечения. */
export function tubeLongitudinalCap(rings: Vector3[][], radial: number): BufferGeometry {
  const half = radial / 2;
  const poly: [number, number][] = [];
  rings.forEach((r) => poly.push([r[0].x, r[0].z]));
  for (let i = rings.length - 1; i >= 0; i--) poly.push([rings[i][half].x, rings[i][half].z]);
  const g = polygonToCap(poly);
  return g;
}

/** Поперечные срезы трубки плоскостью (ось 'z' = c или 'y' = c) — многоугольники в месте пересечения. */
export function tubeCrossCaps(rings: Vector3[][], axis: 'y' | 'z', c: number): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  const coord = (v: Vector3) => (axis === 'z' ? v.z : v.y);
  const centroid = (r: Vector3[]) => r.reduce((s, v) => s + coord(v), 0) / r.length;
  for (let i = 0; i < rings.length - 1; i++) {
    const c0 = centroid(rings[i]);
    const c1 = centroid(rings[i + 1]);
    if ((c0 - c) * (c1 - c) >= 0 || c0 === c1) continue;
    const f = (c - c0) / (c1 - c0);
    const pts = rings[i].map((v, k) => v.clone().lerp(rings[i + 1][k], f));
    const mid = new Vector3();
    pts.forEach((v) => mid.add(v));
    mid.multiplyScalar(1 / pts.length);
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const set = (v: Vector3) => {
      if (axis === 'z') pos.push(v.x, v.y, c);
      else pos.push(v.x, c, v.z);
      nor.push(axis === 'z' ? 0 : 0, axis === 'z' ? 0 : 1, axis === 'z' ? 1 : 0);
    };
    set(mid);
    pts.forEach(set);
    for (let k = 0; k < pts.length - 1; k++) idx.push(0, k + 1, k + 2);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    parts.push(g);
  }
  return mergeOrNull(parts);
}

/* ---------- Пятна на сетчатке ---------- */

/** Эллиптическая накладка на внутренней поверхности сетчатки вокруг направления dir. */
export function retinaDecal(dir: V3, aMM: number, bMM: number, lift: number, rings = 10, segs = 64): BufferGeometry {
  const d = new Vector3(...dir).normalize();
  const e1 = new Vector3(0, 1, 0).cross(d).normalize();
  const e2 = new Vector3().crossVectors(d, e1);
  const R0 = retinaRadius(Math.acos(-d.z));
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const rho = i / rings;
    for (let j = 0; j <= segs; j++) {
      const th = (2 * Math.PI * j) / segs;
      const off = e1.clone().multiplyScalar(rho * Math.cos(th) * aMM).addScaledVector(e2, rho * Math.sin(th) * bMM);
      const v = d.clone().multiplyScalar(R0).add(off);
      const u = v.clone().normalize();
      const r = retinaRadius(Math.acos(Math.min(1, -u.z))) + foveaPit([u.x, u.y, u.z]) - lift;
      pos.push(u.x * r, u.y * r, u.z * r);
      nor.push(-u.x, -u.y, -u.z);
      uv.push(0.5 + 0.5 * rho * Math.cos(th), 0.5 + 0.5 * rho * Math.sin(th));
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ---------- Сосуды сетчатки ---------- */

interface Branch {
  pts: V3[];
  r0: number;
  r1: number;
  vein: boolean;
}

function onRetina(az: number, el: number, lift: number): V3 {
  const d = dirAt(az, el);
  const r = retinaRadius(Math.acos(Math.min(1, -d[2]))) + foveaPit(d) - lift;
  return [d[0] * r, d[1] * r, d[2] * r];
}

/** Ветвящиеся артерии и вены: четыре дуги от диска зрительного нерва вокруг жёлтого пятна. */
export function retinalBranches(): Branch[] {
  const rng = mulberry32(11);
  const out: Branch[] = [];
  const discAz = Math.atan2(DISC_DIR[0], -DISC_DIR[2]) / DEG;

  function grow(az: number, el: number, h: number, turn: number, steps: number, r0: number, depth: number, vein: boolean) {
    const pts: V3[] = [];
    let side = rng() < 0.5 ? 1 : -1;
    for (let s = 0; s < steps; s++) {
      pts.push(onRetina(az, el, vein ? 0.05 : 0.06));
      h += turn + (rng() - 0.5) * 3.2;
      az += 0.95 * Math.cos(h * DEG);
      el += 0.95 * Math.sin(h * DEG);
      if (Math.hypot(az, el) > 64) break;
      if (depth < 3 && s > 6 && s % 9 === 4 && rng() < 0.85) {
        side = -side;
        const len = Math.round((steps - s) * (0.55 + rng() * 0.25));
        grow(az, el, h + side * (28 + rng() * 26), turn * 0.3 * -side, len, r0 * 0.7, depth + 1, vein);
      }
    }
    if (pts.length > 3) out.push({ pts, r0, r1: r0 * 0.72, vein });
  }

  const arcs: [number, number, number, number][] = [
    // начальное направление, поворот за шаг, число шагов
    [118, 0.85, 78, 0.0],
    [242, -0.85, 78, 0.0],
    [62, -0.14, 56, 0.0],
    [298, 0.14, 56, 0.0],
  ];
  arcs.forEach(([h, turn, steps], i) => {
    // артерия идёт чуть выше вены
    const shift = i % 2 === 0 ? 0.55 : -0.55;
    grow(discAz, shift * 0.7, h, turn, steps, 0.12, 0, false);
    grow(discAz, -shift * 0.7 + (i < 2 ? 0 : 0), h + (i < 2 ? -6 : 6), turn, steps - 6, 0.15, 0, true);
  });
  return out;
}

export function retinalVesselGeometry(vein: boolean): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const br of retinalBranches()) {
    if (br.vein !== vein) continue;
    const pts = br.pts.filter((_, i) => i % 2 === 0 || i === br.pts.length - 1);
    if (pts.length < 3) continue;
    parts.push(
      sweepTube(pts, {
        radial: 6,
        samples: pts.length * 2,
        b: (t) => lerp(br.r0, br.r1, t),
        capEnds: true,
        ref: (p) => p.clone().normalize(),
      }).geometry,
    );
  }
  return mergeGeometries(parts, false);
}

/* ---------- Глазодвигательные мышцы ---------- */

export interface MuscleSpec {
  id: string;
  path: V3[];
  /** Полуширина (поперёк, мм) и полутолщина (вдоль нормали) по длине: таблицы [t, значение]. */
  width: [number, number][];
  thick: [number, number][];
  ref: V3 | null;
  bendUntil: number;
}

const NERVE_X = (z: number) => 7.4 * smooth01((-5.5 - z) / 33);

function rectus(id: string, omegaDeg: number, insertMM: number): MuscleSpec {
  const phiL = WALL.phi[WALL.iLimbus];
  const phiIns = phiL - (insertMM / R_SCLERA) / DEG;
  const dirR: V3 = [Math.cos(omegaDeg * DEG), Math.sin(omegaDeg * DEG), 0];
  const pts: V3[] = [];
  const Rm = R_SCLERA + 0.28;
  for (let k = 0; k <= 5; k++) {
    const ph = lerp(phiIns, 66, k / 5) * DEG;
    const rho = Rm * Math.sin(ph);
    const z = -Rm * Math.cos(ph);
    pts.push([dirR[0] * rho + NERVE_X(z), dirR[1] * rho, z]);
  }
  const tail: [number, number][] = [[10.3, -10], [8.8, -19], [6.8, -28], [4.6, -37]];
  for (const [rho, z] of tail) pts.push([dirR[0] * rho + NERVE_X(z), dirR[1] * rho, z]);
  return {
    id,
    path: pts,
    width: [[0, 4.5], [0.1, 4.2], [0.3, 3.4], [0.6, 3.1], [1, 2.4]],
    thick: [[0, 0.2], [0.12, 0.45], [0.3, 1.6], [0.55, 1.95], [1, 1.35]],
    ref: dirR,
    bendUntil: 0.3,
  };
}

export const MUSCLES: MuscleSpec[] = [
  rectus('rectus-medial', 0, 5.5),
  rectus('rectus-lateral', 180, 6.9),
  rectus('rectus-superior', 90, 7.7),
  rectus('rectus-inferior', 270, 6.5),
  {
    id: 'oblique-superior',
    path: [
      [5.2, 4.2, -37], [8.4, 11, -22], [9.8, 14.4, -8], [9.4, 15.2, 2.5], [8.8, 14.7, 6.2],
      [7.4, 13.6, 4.2], [4.4, 12.9, -0.6], [0.4, 12.5, -2.6], [-3.6, 11.6, -4.0], [-5.5, 9.9, -4.6],
    ],
    width: [[0, 2.0], [0.4, 2.2], [0.62, 1.2], [0.72, 0.6], [1, 2.5]],
    thick: [[0, 1.0], [0.4, 1.35], [0.62, 0.9], [0.72, 0.28], [1, 0.22]],
    ref: null,
    bendUntil: 0,
  },
  {
    id: 'oblique-inferior',
    path: [
      [8.6, -12.6, 4.6], [5.6, -12.6, 1.2], [1.8, -12.2, -1.8], [-2.6, -11.3, -4.6], [-6.2, -8.6, -6.2], [-8.2, -5.2, -6.6],
    ],
    width: [[0, 2.4], [0.4, 2.6], [0.8, 3.0], [1, 3.5]],
    thick: [[0, 0.9], [0.4, 1.0], [0.8, 0.45], [1, 0.22]],
    ref: null,
    bendUntil: 0,
  },
];

function tableAt(t: [number, number][], x: number): number {
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) return lerp(t[i - 1][1], t[i][1], (x - t[i - 1][0]) / (t[i][0] - t[i - 1][0]));
  }
  return t[t.length - 1][1];
}

export function muscleSweep(m: MuscleSpec, radial = 20): Sweep {
  const ref = m.ref ? new Vector3(...m.ref) : null;
  return sweepTube(m.path, {
    radial,
    samples: 90,
    b: (t) => tableAt(m.thick, t),
    a: (t) => tableAt(m.width, t),
    ref: ref ? () => ref : undefined,
    bend: (t) => (m.bendUntil > 0 ? (1 / (2 * (R_SCLERA + 0.5))) * (1 - smooth01((t - m.bendUntil * 0.5) / (m.bendUntil * 0.7))) : 0),
    capEnds: true,
  });
}

/* ---------- Зрительный нерв ---------- */

export interface NerveLayer {
  sweep: Sweep;
  radial: number;
}

/** Слои нерва: волокна, пространство под паутинной оболочкой и твёрдая оболочка (две стенки). */
export function nerveSweeps(radial = 24) {
  const grow = (t: number) => smooth01(t / 0.06);
  const core = sweepTube(NERVE_PATH, {
    radial,
    samples: 60,
    b: (t) => lerp(NERVE_CANAL_R, 1.5, grow(t)),
    ref: () => new Vector3(1, 0, 0),
    capEnds: true,
  });
  const subarachnoid = sweepTube(NERVE_PATH.slice(1), {
    radial,
    samples: 50,
    b: (t) => lerp(1.8, 1.84, t),
    ref: () => new Vector3(1, 0, 0),
    capEnds: true,
  });
  const dura = sweepTube(NERVE_PATH.slice(1), {
    radial,
    samples: 50,
    b: (t) => lerp(2.1, 2.05, t),
    ref: () => new Vector3(1, 0, 0),
    capEnds: true,
  });
  return { core, subarachnoid, dura, radial };
}

/** Центральные артерия и вена, идущие внутри нерва к диску. */
export function nerveVessels(radial = 8) {
  const mk = (off: number, r: number) => {
    const pts: V3[] = NERVE_PATH.slice(0, 5).map(([x, y, z], i) => [x + off * (i < 1 ? 0.6 : 1), y, i === 0 ? z + 0.1 : z] as V3);
    return sweepTube(pts, {
      radial,
      samples: 40,
      b: () => r,
      ref: () => new Vector3(1, 0, 0),
      capEnds: true,
    });
  };
  return { artery: mk(-0.38, 0.2), vein: mk(0.4, 0.26), radial };
}

export const NERVE_SKIP: [number, number] = [NERVE_CANAL_X - NERVE_CANAL_R - 0.05, NERVE_CANAL_X + NERVE_CANAL_R + 0.05];

/* ---------- Радужка (меняет размер зрачка) ---------- */

const IRIS_SEG = 128;
const IRIS_RINGS = 28;

export interface IrisMesh {
  front: BufferGeometry;
  back: BufferGeometry;
  rim: BufferGeometry;
  cap: BufferGeometry;
  update: (pupil: number) => void;
  dispose: () => void;
}

export function createIris(): IrisMesh {
  const nv = (IRIS_RINGS + 1) * (IRIS_SEG + 1);
  const mk = (flipWinding: boolean) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(nv * 3), 3));
    g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(nv * 3), 3));
    const uv = new Float32Array(nv * 2);
    for (let i = 0; i <= IRIS_RINGS; i++) for (let j = 0; j <= IRIS_SEG; j++) uv.set([j / IRIS_SEG, i / IRIS_RINGS], (i * (IRIS_SEG + 1) + j) * 2);
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let i = 0; i < IRIS_RINGS; i++) {
      for (let j = 0; j < IRIS_SEG; j++) {
        const a = i * (IRIS_SEG + 1) + j;
        const b = a + IRIS_SEG + 1;
        if (flipWinding) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    g.setIndex(idx);
    return g;
  };
  const front = mk(false);
  const back = mk(true);

  const rim = new BufferGeometry();
  const rimN = (IRIS_SEG + 1) * 2;
  rim.setAttribute('position', new Float32BufferAttribute(new Float32Array(rimN * 3), 3));
  rim.setAttribute('normal', new Float32BufferAttribute(new Float32Array(rimN * 3), 3));
  const rimUv = new Float32Array(rimN * 2);
  for (let j = 0; j <= IRIS_SEG; j++) rimUv.set([j / IRIS_SEG, 0, j / IRIS_SEG, 0.02], j * 4);
  rim.setAttribute('uv', new Float32BufferAttribute(rimUv, 2));
  const rimIdx: number[] = [];
  for (let j = 0; j < IRIS_SEG; j++) {
    const a = j * 2;
    rimIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  rim.setIndex(rimIdx);

  // срез: по полосе на каждой стороне, между передней и задней поверхностью
  const cap = new BufferGeometry();
  const capN = 2 * (IRIS_RINGS + 1) * 2;
  cap.setAttribute('position', new Float32BufferAttribute(new Float32Array(capN * 3), 3));
  const capNor = new Float32Array(capN * 3);
  for (let i = 0; i < capN; i++) capNor.set([0, 1, 0], i * 3);
  cap.setAttribute('normal', new Float32BufferAttribute(capNor, 3));
  const capIdx: number[] = [];
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < IRIS_RINGS; i++) {
      const a = (s * (IRIS_RINGS + 1) + i) * 2;
      capIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  cap.setIndex(capIdx);

  const update = (pupil: number) => {
    const fp = front.getAttribute('position');
    const fn = front.getAttribute('normal');
    const bp = back.getAttribute('position');
    const bn = back.getAttribute('normal');
    const rp = rim.getAttribute('position');
    const rn = rim.getAttribute('normal');
    const cp = cap.getAttribute('position');
    for (let i = 0; i <= IRIS_RINGS; i++) {
      const v = i / IRIS_RINGS;
      const r = lerp(pupil, IRIS.root, v);
      const zf = IRIS.front(r);
      const zb = zf - IRIS.thickness(r);
      // слегка бугристая лицевая поверхность: складки сокращения
      const fold = 0.035 * Math.sin(v * 38) * (1 - v) * (1 - v);
      for (let j = 0; j <= IRIS_SEG; j++) {
        const th = (2 * Math.PI * j) / IRIS_SEG;
        const c = Math.cos(th);
        const s = Math.sin(th);
        const k = i * (IRIS_SEG + 1) + j;
        fp.setXYZ(k, r * c, r * s, zf + fold);
        fn.setXYZ(k, 0.1 * c, 0.1 * s, 0.995);
        bp.setXYZ(k, r * c, r * s, zb);
        bn.setXYZ(k, -0.05 * c, -0.05 * s, -0.999);
      }
      for (const [s, side] of [[0, 1], [1, -1]] as const) {
        const a = (s * (IRIS_RINGS + 1) + i) * 2;
        cp.setXYZ(a, side * r, 0, zf);
        cp.setXYZ(a + 1, side * r, 0, zb);
      }
    }
    const zf0 = IRIS.front(pupil);
    const zb0 = zf0 - IRIS.thickness(pupil);
    for (let j = 0; j <= IRIS_SEG; j++) {
      const th = (2 * Math.PI * j) / IRIS_SEG;
      const c = Math.cos(th);
      const s = Math.sin(th);
      rp.setXYZ(j * 2, pupil * c, pupil * s, zf0);
      rp.setXYZ(j * 2 + 1, pupil * c, pupil * s, zb0);
      rn.setXYZ(j * 2, -c, -s, 0);
      rn.setXYZ(j * 2 + 1, -c, -s, 0);
    }
    for (const g of [fp, fn, bp, bn, rp, rn, cp]) g.needsUpdate = true;
  };
  update(IRIS.pupil);
  for (const g of [front, back, rim, cap]) g.computeBoundingSphere();
  return {
    front,
    back,
    rim,
    cap,
    update,
    dispose: () => [front, back, rim, cap].forEach((g) => g.dispose()),
  };
}

/* ---------- Цинновы связки ---------- */

export function zonuleGeometry(
  from: (theta: number) => V3,
  to: (theta: number) => V3,
  count: number,
  radius: number,
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const th = (2 * Math.PI * k) / count;
    parts.push(
      sweepTube([from(th), to(th)], {
        radial: 4,
        samples: 1,
        b: () => radius,
        ref: () => new Vector3(0, 0, 1),
        capEnds: false,
      }).geometry,
    );
  }
  return mergeGeometries(parts, false);
}

/** Продольная полоса между двумя трубками: от вершины ia колец a до вершины ib колец b (в плоскости y = 0). */
export function stripCap(a: Vector3[][], ia: number, b: Vector3[][], ib: number): BufferGeometry {
  const poly: [number, number][] = [];
  a.forEach((r) => poly.push([r[ia].x, r[ia].z]));
  for (let i = b.length - 1; i >= 0; i--) poly.push([b[i][ib].x, b[i][ib].z]);
  return polygonToCap(poly);
}
