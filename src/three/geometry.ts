import { BufferGeometry, CatmullRomCurve3, Euler, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';

export type Vec3 = [number, number, number];

/**
 * «Капля» — сфера, сужающаяся книзу в конус. Основа для желудочков, предсердий и других органов.
 * taper — ширина у кончика (0..1), power — насколько резко идёт сужение,
 * sx/sy/sz — масштабы, flattenBack — сплющивание задней стороны (z<0).
 */
export interface BlobShape {
  taper: number;
  power: number;
  sx: number;
  sy: number;
  sz: number;
  flattenBack?: number;
  /** Сдвиг кончика по x в долях высоты (лёгкий изгиб). */
  bend?: number;
}

export function blobPoint(dir: Vector3, s: BlobShape, out = new Vector3()): Vector3 {
  const t = (dir.y + 1) / 2;
  const r = s.taper + (1 - s.taper) * Math.pow(Math.min(1, t / 0.8), s.power);
  out.set(dir.x * r * s.sx, dir.y * s.sy, dir.z * r * s.sz);
  if (s.flattenBack && out.z < 0) out.z *= s.flattenBack;
  if (s.bend) out.x += s.bend * Math.pow(1 - t, 2) * s.sy;
  return out;
}

const blobCache = new WeakMap<BlobShape, Map<number, BufferGeometry>>();

/** Геометрия капли; одна на форму и детализацию — повторное включение разреза не плодит буферы на видеокарте. */
export function blobGeometry(s: BlobShape, segments = 96): BufferGeometry {
  let bySeg = blobCache.get(s);
  if (!bySeg) blobCache.set(s, (bySeg = new Map()));
  const cached = bySeg.get(segments);
  if (cached) return cached;
  const g = buildBlob(s, segments);
  bySeg.set(segments, g);
  return g;
}

function buildBlob(s: BlobShape, segments: number): BufferGeometry {
  const g = new SphereGeometry(1, segments, segments);
  const pos = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    blobPoint(v.normalize(), s, v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function transformMatrix(position: Vec3, rotation: Vec3 = [0, 0, 0], scale = 1): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(scale, scale, scale),
  );
}

/**
 * Точка на поверхности капли в координатах родителя.
 * theta — азимут (0 = +z, к зрителю; π/2 = +x), phi — от верхушки (0) до кончика (π).
 */
export function blobSurface(s: BlobShape, m: Matrix4) {
  return (theta: number, phi: number, lift = 0.03): Vector3 => {
    const dir = new Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
    const p = blobPoint(dir, s);
    const n = p.clone().normalize();
    return p.addScaledVector(n, lift).applyMatrix4(m);
  };
}

export function curve(points: Vec3[] | Vector3[]): CatmullRomCurve3 {
  const pts = points.map((p) => (p instanceof Vector3 ? p : new Vector3(...p)));
  return new CatmullRomCurve3(pts, false, 'centripetal');
}

/** Пульс сердца: возвращает силу сокращения предсердий (a) и желудочков (v), 0..1. */
export function heartbeat(time: number, bpm = 62): { a: number; v: number; phase: number } {
  const phase = (time * bpm) / 60 % 1;
  const a = Math.exp(-Math.pow((phase - 0.06) / 0.055, 2));
  const v = Math.exp(-Math.pow((phase - 0.27) / 0.09, 2));
  return { a, v, phase };
}
