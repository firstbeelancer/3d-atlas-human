import { BufferAttribute, BufferGeometry, Color, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { curve, type Vec3 } from '../../three/geometry';

const TAU = Math.PI * 2;

export function surface(rows: number, sides: number, point: (t: number, angle: number) => Vec3, flip = false) {
  const positions = new Float32Array((rows + 1) * sides * 3);
  const indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let side = 0; side < sides; side++) {
      const a = row * sides + side;
      positions.set(point(row / rows, TAU * side / sides), a * 3);
      if (row === rows) continue;
      const b = row * sides + (side + 1) % sides;
      if (flip) indices.push(a, b, a + sides, b, b + sides, a + sides);
      else indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function tint(geometry: BufferGeometry, low: string, high: string, variation: (x: number, y: number, z: number, index: number) => number) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  const a = new Color(low);
  const b = new Color(high);
  for (let i = 0; i < positions.count; i++) {
    const amount = variation(positions.getX(i), positions.getY(i), positions.getZ(i), i);
    color.copy(a).lerp(b, Math.min(1, Math.max(0, amount))).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

export function grain(x: number, y: number, z: number) {
  return 0.5 + 0.17 * Math.sin(13 * x + 7 * y - 9 * z) * Math.cos(19 * y + 8 * z)
    + 0.15 * Math.sin(57 * x - 73 * y + 31 * z) * Math.sin(91 * x + 43 * y + 49 * z)
    + 0.1 * Math.cos(113 * x + 73 * z) * Math.cos(113 * y - 57 * z);
}

export function bulb(center: Vec3, scale: Vec3, sides = 28) {
  const geo = new SphereGeometry(1, sides, Math.ceil(sides * 0.7));
  geo.deleteAttribute('uv');
  return geo.scale(...scale).translate(...center);
}

/** Sweep with variable radii. Wall and rim are one mesh when a lumen is supplied. */
export function duct(points: Vec3[], radius: (t: number) => number, steps = 32, sides = 16, lumen = 0) {
  const path = curve(points);
  const frames = path.computeFrenetFrames(steps, false);
  const centers = path.getSpacedPoints(steps);
  const p = new Vector3();
  const sweep = (t: number, angle: number, scale: number): Vec3 => {
    const i = Math.round(t * steps);
    const r = radius(t) * scale;
    return p.copy(centers[i])
      .addScaledVector(frames.normals[i], Math.cos(angle) * r)
      .addScaledVector(frames.binormals[i], Math.sin(angle) * r).toArray() as Vec3;
  };
  const outer = surface(steps, sides, (t, a) => sweep(t, a, 1), true);
  if (!lumen) return outer;
  return combine([
    outer,
    surface(steps, sides, (t, a) => sweep(t, a, lumen)),
    surface(2, sides, (r, a) => sweep(0, a, lumen + (1 - lumen) * r), true),
    surface(2, sides, (r, a) => sweep(1, a, lumen + (1 - lumen) * r)),
  ]);
}

export function combine(geometries: BufferGeometry[]) {
  if (geometries.length === 1) return geometries[0];
  const merged = mergeGeometries(geometries)!;
  geometries.forEach((geo) => geo.dispose());
  return merged;
}
