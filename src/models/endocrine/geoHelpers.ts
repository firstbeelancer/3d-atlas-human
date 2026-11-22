import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curveOf, merge, sdfMesh, tint, tube, wave, type V3 } from '../body/geo';
import type { MatKey } from './materials';

export { curveOf, merge, sdfMesh, tint, tube, wave };
export type { V3 };

export interface PartMeshDef {
  mat: MatKey;
  geo: BufferGeometry;
  noPick?: boolean;
}

export type PartMeshMap = Record<string, PartMeshDef[]>;

/** Создаёт плавные бесшовные UV-координаты для органических текстур на индексной сетке. */
export function attachOrganicUv(g: BufferGeometry, scale = 1.6): BufferGeometry {
  if (g.attributes.uv) return g;
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    uv[i * 2] = (x * 0.84 + z * 0.54) * scale;
    uv[i * 2 + 1] = (y * 0.92 + z * 0.28 - x * 0.26) * scale;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

/** Эллипсоид, повёрнутый и смещённый, готовый к склейке. */
export function ellipGeo(
  center: V3,
  radius: V3,
  rot: V3 = [0, 0, 0],
  widthSegs = 20,
  heightSegs = 14,
): BufferGeometry {
  const g = new SphereGeometry(1, widthSegs, heightSegs);
  const m = new Matrix4();
  g.scale(radius[0], radius[1], radius[2]);
  if (rot[0] || rot[1] || rot[2]) {
    m.makeRotationX(rot[0]);
    g.applyMatrix4(m);
    m.makeRotationY(rot[1]);
    g.applyMatrix4(m);
    m.makeRotationZ(rot[2]);
    g.applyMatrix4(m);
  }
  g.translate(center[0], center[1], center[2]);
  return g;
}

/** Икосаэдр (органический кристалл / везикула / островок). */
export function blobGeo(center: V3, radius: V3, detail = 1): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const wobble = 1 + 0.14 * Math.sin(x * 7.3 + y * 5.1) * Math.cos(z * 6.7);
    pos.setXYZ(
      i,
      center[0] + x * radius[0] * wobble,
      center[1] + y * radius[1] * wobble,
      center[2] + z * radius[2] * wobble,
    );
  }
  g.computeVertexNormals();
  return g;
}

/** Двояковогнутый эритроцит (реальная форма красной клетки крови). */
export function rbcGeo(center: V3, radius: number, rot: V3 = [0, 0, 0]): BufferGeometry {
  const g = new SphereGeometry(1, 24, 16);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r2 = Math.min(1, x * x + z * z);
    // формула Эванса-Фанга для профиля эритроцита
    const thickness = 0.22 + 0.44 * r2 - 0.34 * r2 * r2;
    pos.setXYZ(i, x * radius, y * radius * thickness, z * radius);
  }
  const m = new Matrix4();
  if (rot[0]) g.applyMatrix4(m.makeRotationX(rot[0]));
  if (rot[1]) g.applyMatrix4(m.makeRotationY(rot[1]));
  if (rot[2]) g.applyMatrix4(m.makeRotationZ(rot[2]));
  g.translate(center[0], center[1], center[2]);
  g.computeVertexNormals();
  return g;
}

/** Шестиугольное стероидное кольцо (узнаваемый силуэт стероидного гормона из холестерина). */
export function steroidMoleculeGeo(center: V3, scale: number, rot: V3 = [0, 0, 0]): BufferGeometry {
  // четыре сочленённых кольца ядра циклопентанпергидрофенантрена (A, B, C — гексагоны, D — пентагон)
  const rings: { ox: number; oy: number; r: number; segs: number }[] = [
    { ox: -0.95, oy: -0.32, r: 0.46, segs: 6 },
    { ox: -0.18, oy: -0.32, r: 0.46, segs: 6 },
    { ox: 0.22, oy: 0.38, r: 0.46, segs: 6 },
    { ox: 0.94, oy: 0.44, r: 0.38, segs: 5 },
  ];
  const parts: BufferGeometry[] = [];
  for (const ring of rings) {
    const t = new TorusGeometry(ring.r * scale, 0.11 * scale, 8, ring.segs);
    t.translate(ring.ox * scale, ring.oy * scale, 0);
    parts.push(t);
  }
  // боковая группа
  parts.push(ellipGeo([1.35 * scale, 0.65 * scale, 0], [0.16 * scale, 0.16 * scale, 0.16 * scale], [0, 0, 0], 10, 8));
  const merged = merge(parts);
  const m = new Matrix4();
  if (rot[0]) merged.applyMatrix4(m.makeRotationX(rot[0]));
  if (rot[1]) merged.applyMatrix4(m.makeRotationY(rot[1]));
  if (rot[2]) merged.applyMatrix4(m.makeRotationZ(rot[2]));
  merged.translate(center[0], center[1], center[2]);
  return merged;
}

/** Пептидный гормон-«ключ»: свёрнутый глобулярный белок с выступающим активным доменом. */
export function peptideMoleculeGeo(center: V3, scale: number, rot: V3 = [0, 0, 0]): BufferGeometry {
  const parts: BufferGeometry[] = [
    ellipGeo([0, 0, 0], [0.42 * scale, 0.36 * scale, 0.36 * scale], [0, 0, 0], 14, 10),
    ellipGeo([0.36 * scale, 0.22 * scale, 0.12 * scale], [0.28 * scale, 0.24 * scale, 0.24 * scale], [0, 0, 0], 12, 8),
    ellipGeo([-0.34 * scale, 0.24 * scale, -0.10 * scale], [0.26 * scale, 0.26 * scale, 0.24 * scale], [0, 0, 0], 12, 8),
    // активный «зубец ключа», точно входящий в карман мембранного рецептора
    ellipGeo([0.48 * scale, -0.22 * scale, 0], [0.28 * scale, 0.22 * scale, 0.22 * scale], [0, 0, -0.35], 12, 8),
  ];
  const merged = merge(parts);
  const m = new Matrix4();
  if (rot[0]) merged.applyMatrix4(m.makeRotationX(rot[0]));
  if (rot[1]) merged.applyMatrix4(m.makeRotationY(rot[1]));
  if (rot[2]) merged.applyMatrix4(m.makeRotationZ(rot[2]));
  merged.translate(center[0], center[1], center[2]);
  return merged;
}

/** Цилиндр между двумя точками (для перемычек ДНК, спиралей рецепторов и коротких связей). */
export function strutGeo(a: V3, b: V3, rA: number, rB = rA, radial = 8): BufferGeometry {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const g = new CylinderGeometry(rB, rA, Math.max(1e-4, len), radial, 1);
  const up = new Vector3(0, 1, 0);
  const q = new Matrix4();
  const n = dir.clone().normalize();
  if (Math.abs(n.dot(up)) > 0.999) {
    if (n.y < 0) q.makeRotationX(Math.PI);
  } else {
    const axis = new Vector3().crossVectors(up, n).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, up.dot(n))));
    q.makeRotationAxis(axis, ang);
  }
  g.applyMatrix4(q);
  const mid = va.add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Склеивает набор геометрий, гарантируя совместимость атрибутов. */
export function safeMerge(list: BufferGeometry[]): BufferGeometry {
  if (list.length === 1) return list[0];
  const withColor = list.some((g) => g.attributes.color);
  const cleaned = list.map((g) => {
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
    if (withColor && !g.attributes.color) {
      g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    }
    return g.index ? g.toNonIndexed() : g;
  });
  const out = mergeGeometries(cleaned, false);
  if (!out) throw new Error('safeMerge failed');
  return out;
}

/** Вспомогательный распределитель точек по кривой (для островков, фолликулов, пузырьков). */
export function sampleAlong(pts: V3[], t: number): V3 {
  const c = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');
  const p = c.getPointAt(Math.max(0, Math.min(1, t)));
  return [p.x, p.y, p.z];
}

/** Детерминированный ГПСЧ для воспроизводимого размещения островков и долек. */
export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}
