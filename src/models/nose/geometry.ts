import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Euler, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Quaternion, Shape, SphereGeometry, Vector2, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V3 } from './anatomy';

/* Чистая геометрия в миллиметрах. Все функции возвращают индексированные BufferGeometry с нормалями и uv. */

export type Xf = { pos?: V3; rot?: V3; scale?: V3 | number };

export function xf(g: BufferGeometry, t: Xf): BufferGeometry {
  const rot = t.rot ?? [0, 0, 0];
  const s = typeof t.scale === 'number' ? [t.scale, t.scale, t.scale] : (t.scale ?? [1, 1, 1]);
  const q = new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'XYZ'));
  const m = new Matrix4().compose(new Vector3(...(t.pos ?? [0, 0, 0])), q, new Vector3(s[0], s[1], s[2]));
  g.applyMatrix4(m);
  return g;
}

/** Сетка из колец одинаковой длины: соседние кольца соединяются четырёхугольниками. */
export function loft(rings: V3[][], opts: { closed?: boolean; capStart?: boolean; capEnd?: boolean } = {}): BufferGeometry {
  const closed = opts.closed ?? true;
  const n = rings[0].length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const cols = closed ? n + 1 : n;
  for (let i = 0; i < rings.length; i++) {
    for (let j = 0; j < cols; j++) {
      const p = rings[i][j % n];
      pos.push(p[0], p[1], p[2]);
      uv.push(j / (cols - 1), i / (rings.length - 1));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (ring: V3[], flip: boolean) => {
    const cx = ring.reduce((s, p) => s + p[0], 0) / n;
    const cy = ring.reduce((s, p) => s + p[1], 0) / n;
    const cz = ring.reduce((s, p) => s + p[2], 0) / n;
    const base = pos.length / 3;
    pos.push(cx, cy, cz);
    uv.push(0.5, 0.5);
    for (let j = 0; j < n; j++) {
      const p = ring[j];
      pos.push(p[0], p[1], p[2]);
      uv.push(0.5 + 0.5 * Math.cos((j / n) * Math.PI * 2), 0.5 + 0.5 * Math.sin((j / n) * Math.PI * 2));
    }
    for (let j = 0; j < n; j++) {
      const a = base + 1 + j;
      const b = base + 1 + ((j + 1) % n);
      if (flip) idx.push(base, b, a);
      else idx.push(base, a, b);
    }
  };
  if (opts.capStart) cap(rings[0], false);
  if (opts.capEnd) cap(rings[rings.length - 1], true);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

/** Параметрическая поверхность по сетке (открытая). */
export function grid(nu: number, nv: number, fn: (u: number, v: number) => V3): BufferGeometry {
  const rings: V3[][] = [];
  for (let i = 0; i <= nv; i++) {
    const row: V3[] = [];
    for (let j = 0; j <= nu; j++) row.push(fn(j / nu, i / nv));
    rings.push(row);
  }
  return loft(rings, { closed: false });
}

/** Кольцо в плоскости с осями right/up вокруг центра: суперэллипс с показателем n и радиусами (a, b). */
export function ring(center: V3, right: V3, up: V3, a: number, b: number, segs: number, shape: (theta: number) => [number, number] = superellipse(2)): V3[] {
  const out: V3[] = [];
  for (let j = 0; j < segs; j++) {
    const th = (j / segs) * Math.PI * 2;
    const [cx, cy] = shape(th);
    out.push([
      center[0] + right[0] * a * cx + up[0] * b * cy,
      center[1] + right[1] * a * cx + up[1] * b * cy,
      center[2] + right[2] * a * cx + up[2] * b * cy,
    ]);
  }
  return out;
}

export function superellipse(n: number): (theta: number) => [number, number] {
  const e = 2 / n;
  return (th) => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    return [Math.sign(c) * Math.pow(Math.abs(c), e), Math.sign(s) * Math.pow(Math.abs(s), e)];
  };
}

/** Трубка переменного радиуса вдоль сплайна. Профиль — эллипс (ra, rb) с поворотом. */
export function tube(
  pts: V3[],
  radius: number | ((t: number) => number),
  opts: { segs?: number; radial?: number; caps?: boolean; flat?: number; closedCurve?: boolean } = {},
): BufferGeometry {
  const segs = opts.segs ?? Math.max(8, pts.length * 6);
  const radial = opts.radial ?? 12;
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), opts.closedCurve ?? false, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, opts.closedCurve ?? false);
  const rings: V3[][] = [];
  const r = typeof radius === 'number' ? () => radius : radius;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const rr = r(t);
    rings.push(ring([c.x, c.y, c.z], [N.x, N.y, N.z], [B.x, B.y, B.z], rr, rr * (opts.flat ?? 1), radial));
  }
  return loft(rings, { closed: true, capStart: opts.caps ?? true, capEnd: opts.caps ?? true });
}

/** Эллипсоид с центром и полуосями; rot — углы Эйлера (рад). */
export function ellipsoid(center: V3, radii: V3, rot: V3 = [0, 0, 0], detail = 24): BufferGeometry {
  const g = new SphereGeometry(1, detail, Math.round(detail * 0.75));
  return xf(g, { pos: center, rot, scale: radii });
}

/** Эллипсоид с деформацией: fn(p) возвращает множитель радиуса для точки единичной сферы. */
export function blob(center: V3, radii: V3, fn: (x: number, y: number, z: number) => number, rot: V3 = [0, 0, 0], detail = 32): BufferGeometry {
  const g = new SphereGeometry(1, detail, Math.round(detail * 0.75));
  const p = g.attributes.position as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = fn(x, y, z);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  xf(g, { pos: center, rot, scale: radii });
  g.computeVertexNormals();
  return g;
}

/** Плоская пластина заданной толщины по контуру (в локальной плоскости XY), затем преобразование. */
export function plate(outline: [number, number][], thickness: number, t: Xf = {}, bevel = Math.min(0.6, thickness * 0.3)): BufferGeometry {
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  const g = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -thickness / 2);
  const merged = mergeVertices(g, 1e-3);
  merged.computeVertexNormals();
  return xf(merged, t);
}

/** Гладкий замкнутый контур через опорные точки (сплайн Катмулла — Рома). */
export function smoothOutline(pts: [number, number][], n = 48): [number, number][] {
  const curve = new CatmullRomCurve3(pts.map(([x, y]) => new Vector3(x, y, 0)), true, 'centripetal');
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = curve.getPointAt(i / n);
    out.push([p.x, p.y]);
  }
  return out;
}

/** Зеркальная копия относительно плоскости x = 0 с правильной ориентацией треугольников. */
export function mirrorX(g: BufferGeometry): BufferGeometry {
  const m = g.clone();
  m.applyMatrix4(new Matrix4().makeScale(-1, 1, 1));
  const idx = m.getIndex();
  if (idx) {
    const a = idx.array as unknown as number[];
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  m.computeVertexNormals();
  return m;
}

/** Деталь и её зеркальная копия в одной геометрии. */
export function bothSides(g: BufferGeometry): BufferGeometry {
  return merge([g, mirrorX(g)]);
}

export function merge(gs: BufferGeometry[]): BufferGeometry {
  const list = gs.map((g) => {
    const c = g.index ? g : g;
    // уравниваем набор атрибутов: только position, normal, uv
    const out = new BufferGeometry();
    out.setAttribute('position', c.getAttribute('position'));
    if (!c.getAttribute('normal')) c.computeVertexNormals();
    out.setAttribute('normal', c.getAttribute('normal'));
    const uv = c.getAttribute('uv');
    out.setAttribute('uv', uv ?? new Float32BufferAttribute(new Float32Array(c.getAttribute('position').count * 2), 2));
    if (c.index) out.setIndex(c.index);
    return out;
  });
  const merged = mergeGeometries(list, false);
  if (!merged) throw new Error('merge failed');
  return merged;
}

/** Точка на сплайне через опорные точки. */
export function spline(pts: V3[]): { at: (t: number) => V3; dir: (t: number) => V3; length: number } {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');
  return {
    at: (t) => {
      const p = curve.getPointAt(Math.min(1, Math.max(0, t)));
      return [p.x, p.y, p.z];
    },
    dir: (t) => {
      const d = curve.getTangentAt(Math.min(1, Math.max(0, t)));
      return [d.x, d.y, d.z];
    },
    length: curve.getLength(),
  };
}

export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Колокол с центром c и полушириной w. */
export const bump = (x: number, c: number, w: number) => {
  const t = Math.abs(x - c) / w;
  return t >= 1 ? 0 : (1 - t * t) * (1 - t * t);
};

/** Разбить геометрию на части: треугольник уходит в ту часть, которую назначает classify по его центру. */
export function split(g: BufferGeometry, classify: (p: V3, n: V3) => string): Record<string, BufferGeometry> {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const idx = g.getIndex()!;
  const buckets: Record<string, number[]> = {};
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const p: V3 = [
      (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3,
      (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3,
      (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3,
    ];
    const n: V3 = [
      (nor.getX(a) + nor.getX(b) + nor.getX(c)) / 3,
      (nor.getY(a) + nor.getY(b) + nor.getY(c)) / 3,
      (nor.getZ(a) + nor.getZ(b) + nor.getZ(c)) / 3,
    ];
    const key = classify(p, n);
    (buckets[key] ??= []).push(a, b, c);
  }
  const out: Record<string, BufferGeometry> = {};
  for (const [key, tris] of Object.entries(buckets)) {
    const part = new BufferGeometry();
    part.setAttribute('position', pos);
    part.setAttribute('normal', nor);
    if (uv) part.setAttribute('uv', uv);
    part.setIndex(tris);
    out[key] = part;
  }
  return out;
}

/** Пустая геометрия (для частей, которых нет на одной стороне). */
export function empty(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([], 3));
  g.setAttribute('normal', new Float32BufferAttribute([], 3));
  g.setAttribute('uv', new Float32BufferAttribute([], 2));
  g.setIndex([]);
  return g;
}
