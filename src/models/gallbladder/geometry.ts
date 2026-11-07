import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GB_LENGTH, gbAxis, gbPoint, gbTangent, LIVER_C, liverFront, liverRadius, makeFrames, radiusAt, smoothstep, type V3 } from './anatomy';

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

/** Гладкий трёхмерный шум значений (0..1) для бугристых поверхностей. */
export function valueNoise3(x: number, y: number, z: number, seed = 1): number {
  const hash = (i: number, j: number, k: number) => {
    let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/* ---------- Оболочки пузыря ---------- */

export interface ShellOpts {
  s0: number;
  s1: number;
  off?: number;
  th0?: number;
  th1?: number;
  sSegs?: number;
  tSegs?: number;
  seed?: number;
  /** Амплитуда мягкой органической неровности. */
  wobble?: number;
  /** Дополнительное смещение по радиусу в точке (s, theta). */
  extra?: (s: number, th: number) => number;
  /** Сколько раз текстура повторяется вокруг. */
  uvRep?: number;
}

/** Мягкие продольные складки и вмятины: пузырь не идеальная колбаса. */
export function organic(s: number, th: number, seed: number): number {
  const a = seed * 1.7;
  return (
    Math.sin(th * 3 + a + s * 9.0) * 0.45 +
    Math.sin(th * 5 - a * 0.6 + s * 14.0) * 0.3 +
    Math.sin(th * 2 + a * 1.3 - s * 5.0) * 0.5
  );
}

/** Участок поверхности пузыря между s0..s1 и theta0..theta1: UV — вокруг и вдоль, нормали сглажены, шов и кончик дна без разрывов. */
export function wallShell(o: ShellOpts): BufferGeometry {
  const sSegs = o.sSegs ?? 60;
  const tSegs = o.tSegs ?? 96;
  const th0 = o.th0 ?? 0;
  const th1 = o.th1 ?? Math.PI * 2;
  const off = o.off ?? 0;
  const wob = o.wobble ?? 0;
  const seed = o.seed ?? 3;
  const rep = o.uvRep ?? 2;
  const rows = sSegs + 1;
  const cols = tSegs + 1;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  for (let i = 0; i < rows; i++) {
    const s = o.s0 + (o.s1 - o.s0) * (i / sSegs);
    for (let j = 0; j < cols; j++) {
      const th = th0 + (th1 - th0) * (j / tSegs);
      let extra = wob ? wob * organic(s, th, seed) : 0;
      if (o.extra) extra += o.extra(s, th);
      const p = gbPoint(s, th, off, extra);
      const k = i * cols + j;
      pos.set(p, k * 3);
      uv.set([(j / tSegs) * ((th1 - th0) / (Math.PI * 2)) * rep, ((s * GB_LENGTH) / 7.2) * rep * 0.55], k * 2);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < sSegs; i++) {
    for (let j = 0; j < tSegs; j++) {
      const a = i * cols + j;
      const b = a + cols;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal');
  const full = Math.abs(th1 - th0 - Math.PI * 2) < 1e-6;
  if (full) {
    for (let i = 0; i < rows; i++) {
      const a = i * cols;
      const b = a + tSegs;
      const x = nrm.getX(a) + nrm.getX(b);
      const y = nrm.getY(a) + nrm.getY(b);
      const z = nrm.getZ(a) + nrm.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(a, x / l, y / l, z / l);
      nrm.setXYZ(b, x / l, y / l, z / l);
    }
  }
  if (o.s0 <= 0 && radiusAt(0) < 0.01) {
    const t = gbTangent(0);
    for (let j = 0; j < cols; j++) nrm.setXYZ(j, -t[0], -t[1], -t[2]);
  }
  return g;
}

/** Лёгкий двойник для наведения мышью. */
export function shellProxy(o: ShellOpts): BufferGeometry {
  return wallShell({ ...o, sSegs: 14, tSegs: 24, wobble: 0, extra: undefined });
}

/* ---------- Трубки ---------- */

export interface TubeOpts {
  radial?: number;
  segs?: number;
  capStart?: boolean;
  capEnd?: boolean;
  uvRep?: number;
}

const pickRef = (t: Vector3) => (Math.abs(t.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0));

/** Трубка вдоль кривой с переменным радиусом и закруглёнными концами. */
export function tubeGeo(curve: CatmullRomCurve3, radius: number | ((t: number) => number), o: TubeOpts = {}): BufferGeometry {
  const radial = o.radial ?? 14;
  const segs = o.segs ?? Math.max(10, Math.min(120, Math.round(curve.getLength() * 9)));
  const fr = makeFrames(curve, segs, pickRef(curve.getTangentAt(0)));
  const rad = typeof radius === 'number' ? () => radius : radius;
  const capSteps = 5;
  const rings: { p: Vector3; n: Vector3; b: Vector3; r: number; t: number }[] = [];
  const mk = (i: number) => ({
    p: new Vector3(fr.P[i * 3], fr.P[i * 3 + 1], fr.P[i * 3 + 2]),
    t: new Vector3(fr.T[i * 3], fr.T[i * 3 + 1], fr.T[i * 3 + 2]),
    n: new Vector3(fr.N[i * 3], fr.N[i * 3 + 1], fr.N[i * 3 + 2]),
    b: new Vector3(fr.B[i * 3], fr.B[i * 3 + 1], fr.B[i * 3 + 2]),
  });
  if (o.capStart) {
    const m = mk(0);
    const r0 = rad(0);
    for (let k = capSteps; k >= 1; k--) {
      const a = (k / capSteps) * (Math.PI / 2);
      rings.push({ p: m.p.clone().addScaledVector(m.t, -r0 * Math.sin(a)), n: m.n, b: m.b, r: r0 * Math.cos(a), t: 0 });
    }
  }
  for (let i = 0; i <= segs; i++) {
    const m = mk(i);
    rings.push({ p: m.p, n: m.n, b: m.b, r: rad(i / segs), t: i / segs });
  }
  if (o.capEnd) {
    const m = mk(segs);
    const r1 = rad(1);
    for (let k = 1; k <= capSteps; k++) {
      const a = (k / capSteps) * (Math.PI / 2);
      rings.push({ p: m.p.clone().addScaledVector(m.t, r1 * Math.sin(a)), n: m.n, b: m.b, r: r1 * Math.cos(a), t: 1 });
    }
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rep = o.uvRep ?? 1;
  const len = curve.getLength();
  rings.forEach((rg, i) => {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a) * Math.max(0.001, rg.r);
      const s = Math.sin(a) * Math.max(0.001, rg.r);
      pos.push(rg.p.x + c * rg.n.x + s * rg.b.x, rg.p.y + c * rg.n.y + s * rg.b.y, rg.p.z + c * rg.n.z + s * rg.b.z);
      uv.push((j / radial) * rep, (i / (rings.length - 1)) * len * 0.35 * rep);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const curveOf = (pts: V3[]): CatmullRomCurve3 => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');

/** Трубка по ломаной точек: радиус от r0 к r1. */
export function tubePts(pts: V3[], r0: number, r1 = r0, o: TubeOpts = {}): BufferGeometry {
  return tubeGeo(curveOf(pts), (t) => r0 + (r1 - r0) * t, o);
}

/** Склейка нескольких геометрий в одну. */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const clean = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    // единый набор атрибутов: position, normal, uv
    for (const name of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(name)) c.deleteAttribute(name);
    if (!c.getAttribute('uv')) c.setAttribute('uv', new Float32BufferAttribute(new Float32Array(c.getAttribute('position').count * 2), 2));
    return c;
  });
  return mergeGeometries(clean, false)!;
}

/** Кольцо (тор) вокруг кривой в точке t, плоскостью поперёк кривой: сфинктеры, складки кишки. */
export function ringAt(curve: CatmullRomCurve3, t: number, R: number, r: number, flat = 1, seg = [10, 36]): BufferGeometry {
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t).normalize();
  const g = new TorusGeometry(R, r, seg[0], seg[1]);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), tan);
  g.applyMatrix4(new Matrix4().compose(p, q, new Vector3(1, 1, flat)));
  return g;
}

export function ringPts(center: V3, dir: V3, R: number, r: number, flat = 1): BufferGeometry {
  const g = new TorusGeometry(R, r, 10, 36);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...dir).normalize());
  g.applyMatrix4(new Matrix4().compose(new Vector3(...center), q, new Vector3(1, 1, flat)));
  return g;
}

export function ellipsoid(c: V3, r: V3, detail = 24): BufferGeometry {
  const g = new SphereGeometry(1, detail, Math.round(detail * 0.7));
  g.applyMatrix4(new Matrix4().compose(new Vector3(...c), new Quaternion(), new Vector3(...r)));
  return g;
}

/* ---------- Спиральная складка Хейстера ---------- */

/** Винтовая складка внутри шейки и пузырного протока: лента от стенки к оси, несколько витков. */
export function spiralValve(path: CatmullRomCurve3, innerR: (t: number) => number, turns = 4.2, ribbon = 0.5): BufferGeometry {
  const segs = 260;
  const fr = makeFrames(path, segs, pickRef(path.getTangentAt(0)));
  const rows = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    const R = innerR(t);
    const P = new Vector3(fr.P[i * 3], fr.P[i * 3 + 1], fr.P[i * 3 + 2]);
    const N = new Vector3(fr.N[i * 3], fr.N[i * 3 + 1], fr.N[i * 3 + 2]);
    const B = new Vector3(fr.B[i * 3], fr.B[i * 3 + 1], fr.B[i * 3 + 2]);
    const T = new Vector3(fr.T[i * 3], fr.T[i * 3 + 1], fr.T[i * 3 + 2]);
    for (let j = 0; j <= rows; j++) {
      const u = j / rows;
      // от стенки (u = 0) к свободному краю (u = 1); край изгибается по ходу винта и утолщается
      const rr = R * (1 - ribbon * u);
      const along = 0.05 * Math.sin(u * Math.PI) + 0.03 * u * u;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(
        P.x + rr * (c * N.x + s * B.x) + along * T.x,
        P.y + rr * (c * N.y + s * B.y) + along * T.y,
        P.z + rr * (c * N.z + s * B.z) + along * T.z,
      );
      uv.push(u, t * turns);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- Печень ---------- */

/** Нижняя поверхность правой доли печени: толстая линза с ямкой для пузыря и воротами. */
export function liverGeometry(rings = 56, cols = 160): BufferGeometry {
  const rowsTotal = rings * 2 + 1;
  const pos = new Float32Array(rowsTotal * (cols + 1) * 3);
  const uv = new Float32Array(rowsTotal * (cols + 1) * 2);
  for (let k = 0; k < rowsTotal; k++) {
    const front = k <= rings;
    const rho = front ? k / rings : (rings * 2 - k) / rings;
    for (let j = 0; j <= cols; j++) {
      const phi = (j / cols) * Math.PI * 2;
      const r = liverRadius(phi) * Math.max(rho, 0.0005);
      const x = LIVER_C[0] + r * Math.cos(phi);
      const y = LIVER_C[1] + r * Math.sin(phi);
      const zf = liverFront(x, y);
      const thick = 4.6 * Math.pow(Math.max(0, 1 - Math.pow(rho, 2.3)), 0.58);
      const z = front ? zf : zf - thick;
      const i = k * (cols + 1) + j;
      pos.set([x, y, z], i * 3);
      uv.set([x / 7, y / 7 + (front ? 0 : 0.37)], i * 2);
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < rowsTotal - 1; k++) {
    for (let j = 0; j < cols; j++) {
      const a = k * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.getAttribute('normal');
  for (let k = 0; k < rowsTotal; k++) {
    const a = k * (cols + 1);
    const b = a + cols;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

/** Ложе пузыря: участок печени без брюшины, повторяет ямку. */
export function fossaPatch(): BufferGeometry {
  const S = 44;
  const T = 14;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const s0 = 0.27;
  const s1 = 0.97;
  for (let i = 0; i <= S; i++) {
    const u = i / S;
    const s = s0 + (s1 - s0) * u;
    const c = gbAxis(s);
    const t = gbTangent(s);
    let px = -t[1];
    let py = t[0];
    const pl = Math.hypot(px, py) || 1;
    px /= pl;
    py /= pl;
    const w = (0.92 * radiusAt(s) + 0.2) * Math.sqrt(Math.max(0.0, 1 - Math.abs((u - 0.5) / 0.5) ** 2.4)) + 0.02;
    for (let j = 0; j <= T; j++) {
      const v = (j / T) * 2 - 1;
      const x = c[0] + px * w * v;
      const y = c[1] + py * w * v;
      pos.push(x, y, liverFront(x, y) + 0.016);
      uv.push(u * 2, (v * 0.5 + 0.5) * 1.2);
    }
  }
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < T; j++) {
      const a = i * (T + 1) + j;
      const b = a + T + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- Железа и кишка ---------- */

/** Долчатая поверхность: эллипсоид с неровностями долек. */
export function lobulatedBlob(c: V3, r: V3, seed: number, amp = 0.16): BufferGeometry {
  const g = new IcosahedronGeometry(1, 5);
  const p = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n1 = valueNoise3(v.x * 3.2 + 7, v.y * 3.2 + 3, v.z * 3.2 + 1, seed) - 0.5;
    const n2 = valueNoise3(v.x * 7.5, v.y * 7.5, v.z * 7.5, seed + 5) - 0.5;
    const k = 1 + amp * 2 * n1 + amp * 0.9 * n2;
    p.setXYZ(i, c[0] + v.x * r[0] * k, c[1] + v.y * r[1] * k, c[2] + v.z * r[2] * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Треугольник Кало: плоская заплатка с тремя вершинами. */
export function triangleGeo(a: V3, b: V3, c: V3): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([...a, ...b, ...c], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  g.setIndex([0, 1, 2]);
  g.computeVertexNormals();
  return g;
}

/** Печёночно-двенадцатиперстная связка: тонкая волнистая «занавеска» между воротами печени и кишкой. */
export function curtainGeometry(): BufferGeometry {
  const X = 20;
  const Y = 26;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= Y; i++) {
    const v = i / Y;
    const y = 4.0 - 4.75 * v;
    const xl = 1.95 + 0.5 * v;
    const xr = 4.7 - 0.4 * v;
    for (let j = 0; j <= X; j++) {
      const u = j / X;
      const x = xl + (xr - xl) * u;
      const z = -1.42 + 0.06 * Math.sin(u * 6 + v * 5) - 0.08 * smoothstep(0.7, 1, u);
      pos.push(x, y, z);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < Y; i++) {
    for (let j = 0; j < X; j++) {
      const a = i * (X + 1) + j;
      const b = a + X + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
