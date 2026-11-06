import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sweep } from '../skeleton/sweep';
import { meshSdf, type Sdf, type V3 } from '../skeleton/sdf';

export type { V3 };

export const curveOf = (pts: V3[], closed = false): CatmullRomCurve3 =>
  new CatmullRomCurve3(
    pts.map((p) => new Vector3(...p)),
    closed,
    'centripetal',
  );

export interface TubeOptions {
  segments?: number;
  radial?: number;
  caps?: boolean;
  up?: Vector3;
}

/** Трубка по точкам; радиус — число или функция от t (0..1), возвращающая радиус или [ширина, высота]. */
export function tube(pts: V3[], radius: number | ((t: number) => number | [number, number]), o: TubeOptions = {}): BufferGeometry {
  const curve = curveOf(pts);
  const len = curve.getLength();
  const segments = o.segments ?? Math.max(12, Math.min(900, Math.round(len * 26)));
  const rf = typeof radius === 'number' ? () => radius : radius;
  return sweep(curve, {
    radius: (t) => {
      const r = rf(t);
      return typeof r === 'number' ? [r, r] : r;
    },
    segments,
    radial: o.radial ?? 10,
    caps: o.caps ?? true,
    up: o.up,
  });
}

/** Склеивает геометрии в одну (без uv; нормали пересчитываются при необходимости). */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const withColor = list.some((g) => g.attributes.color);
  const cleaned = list.map((g) => {
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
    // у всех склеиваемых частей должен быть один и тот же набор атрибутов
    if (withColor && !g.attributes.color) g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    return g.index ? g.toNonIndexed() : g;
  });
  const g = mergeGeometries(cleaned, false);
  if (!g) throw new Error('merge failed');
  return g;
}

/** Красит вершины функцией (x,y,z) → [r,g,b] 0..1; цвет перемножается с цветом материала. */
export function tint(g: BufferGeometry, fn: (x: number, y: number, z: number, i: number) => [number, number, number]): BufferGeometry {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const old = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const [r, gg, b] = fn(pos.getX(i), pos.getY(i), pos.getZ(i), i);
    col[i * 3] = r * (old ? old.getX(i) : 1);
    col[i * 3 + 1] = gg * (old ? old.getY(i) : 1);
    col[i * 3 + 2] = b * (old ? old.getZ(i) : 1);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

/** Сетка из поля расстояний в коробке с заданной ячейкой. */
export function sdfMesh(f: Sdf, min: V3, max: V3, cell: number, ao?: number): BufferGeometry {
  return meshSdf(f, { min, max, cell, ao });
}

/** Сдвигает точку к поверхности поля (на расстояние lift над ней): так сосуды ложатся на орган. */
export function snap(f: Sdf, p: V3, lift = 0.02, iterations = 8): V3 {
  let [x, y, z] = p;
  const e = 0.01;
  for (let i = 0; i < iterations; i++) {
    const d = f(x, y, z);
    const gx = f(x + e, y, z) - f(x - e, y, z);
    const gy = f(x, y + e, z) - f(x, y - e, z);
    const gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    const k = (d - lift) / l;
    x -= gx * k;
    y -= gy * k;
    z -= gz * k;
  }
  return [x, y, z];
}

/** Точки пути, отражённые относительно x = 0 (правая сторона). */
export const flipX = (pts: V3[]): V3[] => pts.map(([x, y, z]) => [-x, y, z]);

/** Плавный шум вдоль длины для окраски трубок (0..1). */
export function wave(t: number, a: number, b: number): number {
  return 0.5 + 0.5 * Math.sin(t * a + Math.sin(t * b) * 1.7);
}
