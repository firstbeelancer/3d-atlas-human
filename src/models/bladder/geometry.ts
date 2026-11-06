import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { Y_BOTTOM, Y_TOP, Z_SCALE, centerZAt, radiusAt, wallPoint, type V3 } from './anatomy';

/** Плоскость фронтального разреза (вид «Разрез»): срезается передняя стенка при z больше этого значения. */
export const CUT_Z = 0.55;
/** Плоскость поперечного разреза (вид «Дно пузыря»): срезается всё выше этого y. */
export const CUT_Y = 0.95;

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

interface ShellOptions {
  y0: number;
  y1: number;
  off?: number;
  theta0?: number;
  theta1?: number;
  ySegs?: number;
  thetaSegs?: number;
  /** Лёгкая органическая неровность радиуса (доля), с заданным зерном. */
  wobble?: number;
  seed?: number;
  /** Смещение каждой точки по нормали профиля — для складок и бугорков. */
  displace?: (y: number, theta: number) => number;
}

/**
 * Участок поверхности пузыря между высотами y0..y1 и углами theta0..theta1.
 * UV: u — вокруг, v — по высоте. Нормали считаются по сетке.
 */
export function shellGeometry(o: ShellOptions): BufferGeometry {
  const ySegs = o.ySegs ?? 48;
  const thetaSegs = o.thetaSegs ?? 96;
  const theta0 = o.theta0 ?? 0;
  const theta1 = o.theta1 ?? Math.PI * 2;
  const off = o.off ?? 0;
  const rand = mulberry32(o.seed ?? 7);
  const wobPhases = Array.from({ length: 5 }, () => rand() * Math.PI * 2);
  const rows = ySegs + 1;
  const cols = thetaSegs + 1;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  for (let i = 0; i < rows; i++) {
    const v = i / ySegs;
    const y = o.y0 + (o.y1 - o.y0) * v;
    for (let j = 0; j < cols; j++) {
      const u = j / thetaSegs;
      const theta = theta0 + (theta1 - theta0) * u;
      let d = off;
      if (o.wobble) {
        d +=
          o.wobble *
          (Math.sin(theta * 3 + wobPhases[0] + y * 1.7) * 0.5 +
            Math.sin(theta * 5 + wobPhases[1] - y * 2.3) * 0.3 +
            Math.sin(theta * 8 + wobPhases[2] + y * 4.1) * 0.2);
      }
      if (o.displace) d += o.displace(y, theta);
      const p = wallPoint(y, theta, d);
      const k = i * cols + j;
      pos.set(p, k * 3);
      uv.set([u, v], k * 2);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < ySegs; i++) {
    for (let j = 0; j < thetaSegs; j++) {
      const a = i * cols + j;
      const b = a + cols;
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

/** Трубка вдоль кривой с радиусом от r0 (начало) до r1 (конец). */
export function tubeGeometry(points: V3[], r0: number, r1 = r0, tubular = 64, radial = 20): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'centripetal');
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos: number[] = [];
  const uvArr: number[] = [];
  const idx: number[] = [];
  const pt = new Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, pt);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      pos.push(pt.x + r * (cos * N.x + sin * B.x), pt.y + r * (cos * N.y + sin * B.y), pt.z + r * (cos * N.z + sin * B.z));
      uvArr.push(t, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvArr, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Замкнутая трубка-петля по точкам (складки слизистой, кольца сфинктеров заданной формы). */
export function loopGeometry(points: V3[], radius: number, radial = 12): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), true, 'centripetal');
  const tubular = Math.max(48, points.length * 8);
  const frames = curve.computeFrenetFrames(tubular, true);
  const pos: number[] = [];
  const idx: number[] = [];
  const pt = new Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, pt);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      pos.push(pt.x + radius * (cos * N.x + sin * B.x), pt.y + radius * (cos * N.y + sin * B.y), pt.z + radius * (cos * N.z + sin * B.z));
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Мочепузырный треугольник: гладкая заплатка на задней нижней стенке изнутри. */
export function trigoneGeometry(): BufferGeometry {
  const S = 14;
  const T = 12;
  const pos: number[] = [];
  const uvArr: number[] = [];
  const idx: number[] = [];
  const thL = Math.PI * 2 - 2.47;
  const thR = 2.47;
  for (let i = 0; i <= T; i++) {
    const t = i / T;
    for (let j = 0; j <= S; j++) {
      const s = j / S;
      const thTop = thR + (thL - thR) * s;
      const yTop = -1.55 + 0.16 * Math.sin(s * Math.PI);
      const y = yTop + (-2.42 - yTop) * Math.pow(t, 0.92);
      const th = thTop + (Math.PI - thTop) * t;
      const p = wallPoint(y, th, -0.485);
      pos.push(...p);
      uvArr.push(s, t);
    }
  }
  for (let i = 0; i < T; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * (S + 1) + j;
      const b = a + S + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvArr, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Тазовое дно: воронка мышц-леваторов вокруг уретры. */
export function pelvicFloorGeometry(): BufferGeometry {
  const R = 40;
  const C = 72;
  const pos: number[] = [];
  const uvArr: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    const r = 0.66 + (3.95 - 0.66) * t;
    const yBase = -4.66 + 1.18 * Math.pow(t, 1.7);
    for (let j = 0; j <= C; j++) {
      const th = (j / C) * Math.PI * 2;
      const front = Math.max(0, Math.cos(th));
      const y = yBase + 0.3 * front * t - 0.12 * Math.max(0, -Math.cos(th)) * t;
      pos.push(r * Math.sin(th), y, 0.3 + r * 0.94 * Math.cos(th));
      uvArr.push(j / C, t);
    }
  }
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < C; j++) {
      const a = i * (C + 1) + j;
      const b = a + C + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvArr, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- Срезы (caps) на плоскостях разреза ---------- */

/** Контур сечения пузыря плоскостью z = CUT_Z при заданном смещении слоя: точки [x, y]. */
function frontalContour(off: number): [number, number][] {
  const pts: [number, number][] = [];
  const N = 90;
  let started = false;
  for (let i = 0; i <= N; i++) {
    const y = Y_BOTTOM + ((Y_TOP - Y_BOTTOM) * i) / N;
    const r = radiusAt(y) + off;
    const cz = centerZAt(y);
    const c = (CUT_Z - cz) / (r * Z_SCALE);
    if (Math.abs(c) > 1) {
      if (started) break;
      continue;
    }
    started = true;
    const th = Math.acos(Math.min(1, Math.max(-1, c)));
    pts.push([r * Math.sin(th), y]);
  }
  const left: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) left.push([-pts[i][0], pts[i][1]]);
  return [...pts, ...left];
}

/** Кольцо среза стенки на фронтальной плоскости: между наружным и внутренним контурами слоя. */
export function frontalCapGeometry(offOut: number, offIn: number): BufferGeometry {
  const outer = frontalContour(offOut);
  const inner = frontalContour(offIn);
  const shape = new Shape();
  outer.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const holePath = new Path();
  inner.forEach(([x, y], i) => (i === 0 ? holePath.moveTo(x, y) : holePath.lineTo(x, y)));
  holePath.closePath();
  shape.holes.push(holePath);
  const g = new ShapeGeometry(shape, 4);
  g.translate(0, 0, CUT_Z);
  return g;
}

/** Кольцо среза стенки на поперечной плоскости y = CUT_Y: эллипс слоя. */
export function transverseCapGeometry(offOut: number, offIn: number): BufferGeometry {
  const y = CUT_Y;
  const rOut = radiusAt(y) + offOut;
  const rIn = Math.max(0.05, radiusAt(y) + offIn);
  const shape = new Shape();
  shape.absellipse(0, 0, rOut, rOut * Z_SCALE, 0, Math.PI * 2, false, 0);
  const hole = new Path();
  hole.absellipse(0, 0, rIn, rIn * Z_SCALE, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);
  const g = new ShapeGeometry(shape, 48);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, centerZAt(y));
  return g;
}
