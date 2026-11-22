import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import { FING, fingerBottom, fingerHW, fingerTop, nailPlate, plateBottom, plateHW, plateX, tipWidth } from './anatomy';
import { clamp, fbm, lerp, ringsToGeometry, smooth, type RGB } from './geometry';

const P = 2.35;
const bell = (x: number, center: number, width: number) => Math.exp(-(((x - center) / width) ** 2));
const tipFactor = (x: number) => Math.sqrt(1 - clamp((x - FING.x1) / FING.cap) ** 2);
// палец симметричен относительно оси ногтя: прежний боковой увод кончика читался как перекос
const centerZ = (_x: number) => 0;
export const proximalEdge = (z: number) => 6.25 + 0.039 * z * z;

function outline(x: number) {
  const top = fingerTop(x);
  const bottom = fingerBottom(x);
  const taper = tipFactor(x);
  return { cy: (top + bottom) / 2, ry: ((top - bottom) / 2) * taper, hw: fingerHW(x) * Math.min(taper, tipWidth(x)) };
}

function baseHeight(x: number, z: number, side: 1 | -1) {
  const { cy, ry, hw } = outline(x);
  const across = Math.abs(z - centerZ(x)) / Math.max(0.001, hw);
  return cy + side * ry * (1 - clamp(across) ** P) ** (1 / P);
}

export function skinTopY(x: number, z: number): number {
  const across = Math.abs(z);
  const intact = baseHeight(x, z, 1);
  const fade = 1 - smooth(22.1, FING.tipX, x);
  const plateEdge = plateHW(x);
  const recess = smooth(proximalEdge(z) - 0.55, proximalEdge(z) + 0.3, x)
    * (1 - smooth(plateEdge - 0.22, plateEdge + 0.36, across)) * (1 - smooth(22.0, 24.0, x));
  const skinBed = plateBottom(x, z) - 0.10;
  const proximalRim = 0.51 * bell(x, proximalEdge(z) - 0.67, 0.85) * (1 - smooth(4.7, 6.15, across));
  const sideRim = 0.71 * bell(across, plateEdge + 0.19, 0.53) * smooth(3.6, 7.2, x) * (1 - smooth(18.5, 23.8, x));
  const folds = 0.25 * bell(x, -2.8 + 0.105 * z * z, 0.21) + 0.17 * bell(x, -4.15 + 0.075 * z * z, 0.24);
  return lerp(intact, Math.min(intact, skinBed), recess) + fade * (proximalRim + sideRim - folds * (1 - smooth(4.3, 6.8, across)));
}

const ridgeField = (x: number, z: number) => {
  const dx = (x - 16.3) / 6.8;
  const dz = (z - 0.25 - 0.75 * dx - 0.59 * dx * dx) / 5.0;
  return Math.hypot(dx * (0.99 + 0.13 * dz), dz) + 0.034 * Math.sin(5 * dx + dz * 3);
};

export function skinBottomY(x: number, z: number): number {
  const crest = ridgeField(x, z);
  const ridges = 0.051 * (0.5 + 0.5 * Math.cos(crest * Math.PI * 2 * 13)) ** 2
    * smooth(0.015, 0.085, crest) * (1 - smooth(0.89, 1.04, crest));
  const creases = 0.32 * bell(x, -1.85 + 0.1 * z * z, 0.34)
    + 0.13 * bell(x, -2.63 + 0.11 * z * z, 0.35);
  return baseHeight(x, z, -1) - ridges + creases * (1 - smooth(4.4, 6.5, Math.abs(z)));
}

type SkinId = 'finger-skin' | 'proximal-fold' | 'lateral-folds' | 'fingerprint';

/** Кожный покров и валики лежат на одной сетке, с общими нормалями на границах. */
export function buildFingerSurface(): Record<SkinId, BufferGeometry> {
  const rows = 334;
  const cols = 224;
  const base = new Color('#bd8771');
  const pad = new Color('#c18a78');
  const pink = new Color('#ab675d');
  const tone = new Color();
  const rings: Vector3[][] = [];
  const colors: RGB[][] = [];
  for (let i = 0; i <= rows + 1; i++) {
    const x = lerp(FING.x0, FING.tipX, clamp((i - 1) / rows));
    const { cy, hw } = outline(x);
    const ring: Vector3[] = [];
    const values: RGB[] = [];
    for (let j = 0; j <= cols; j++) {
      const a = j / cols * Math.PI * 2;
      const sin = Math.sin(a);
      const z = centerZ(x) + Math.sign(sin) * Math.abs(sin) ** (2 / P) * hw * (i === 0 ? 0 : 1);
      const dorsal = Math.cos(a) >= 0;
      const sideWeight = 1 - smooth(0.87, 1, Math.abs(sin) ** (2 / P));
      const tissueY = dorsal ? skinTopY(x, z) : skinBottomY(x, z);
      const y = i === 0 ? cy : lerp(cy, tissueY, sideWeight);
      ring.push(new Vector3(x, y, z));
      const mottling = fbm(x * 0.63, y * 0.75, z * 0.73, 3);
      tone.copy(base).lerp(pad, 1 - sideWeight * Number(dorsal))
        .lerp(pink, (0.43 * bell(x, -3.5, 2.1) + 0.52 * smooth(17, 24, x)) * (0.42 + 0.58 * sideWeight))
        .multiplyScalar(0.91 + mottling * 0.19);
      values.push([tone.r, tone.g, tone.b]);
    }
    rings.push(ring);
    colors.push(values);
  }
  const surface = ringsToGeometry(rings, colors);
  const index = surface.getIndex()!;
  const positions = surface.getAttribute('position');
  const sets: Record<SkinId, number[]> = { 'finger-skin': [], 'proximal-fold': [], 'lateral-folds': [], fingerprint: [] };
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
    const y = (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
    const z = (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3;
    let id: SkinId = 'finger-skin';
    if (y < -2.7 && ridgeField(x, z) < 1.06) id = 'fingerprint';
    else if (y > 1.1 && Math.abs(z) < 5.3 && x > 3 && x < proximalEdge(z) + 0.17) id = 'proximal-fold';
    else if (y > 1.15 && x > 5.3 && x < 23 && Math.abs(Math.abs(z) - plateHW(x)) < 1.0) id = 'lateral-folds';
    sets[id].push(a, b, c);
  }
  // Все участки используют общие позиции и нормали исходной сетки.
  return Object.fromEntries(Object.entries(sets).map(([id, faces]) => {
    const patch = new BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'color']) patch.setAttribute(name, surface.getAttribute(name));
    patch.setIndex(faces);
    return [id, patch];
  })) as Record<SkinId, BufferGeometry>;
}

/** Плавная маска видимого матрикса и свободного края на непрерывной пластинке. */
export function colorPlate(geometry: BufferGeometry): BufferGeometry {
  const body = new Color('#c69188');
  const lunula = new Color('#dfc6b8');
  const tip = new Color('#e6d6c5');
  const band = new Color('#b77f76');
  const tone = new Color();
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const across = clamp(z / plateHW(x), -1, 1);
    const arc = plateX(nailPlate.lunulaEnd, across);
    const edge = plateX(nailPlate.bodyEnd, across) - 0.12 * Math.sin(z * 1.2);
    const middle = smooth(proximalEdge(z), proximalEdge(z) + 1.3, x) * (1 - smooth(arc - 0.8, arc + 0.26, x));
    const free = smooth(edge - 0.45, edge + 0.65, x);
    tone.copy(body).lerp(band, 0.52 * bell(x, edge - 0.68, 0.57));
    tone.lerp(lunula, middle * 0.87).lerp(tip, free * 0.97);
    tone.multiplyScalar(0.95 + 0.09 * fbm(x * 0.6, 7.1, z * 1.2, 3));
    tone.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}
