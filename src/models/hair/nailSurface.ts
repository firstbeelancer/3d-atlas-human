import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import {
  FING,
  TIP_APEX_Y,
  capDorsalY,
  dorsalSkinY,
  tipLength,
  fingerCY,
  nailPlate,
  plateHW,
  plateX,
  proximalEdge,
  sectionBottom,
  sectionPoint,
  tipPoint,
} from './fingertip';
import { fbm, lerp, ringsToGeometry, smooth } from './geometry';

const bell = (x: number, center: number, width: number) => Math.exp(-(((x - center) / width) ** 2));

/** Поле папиллярного завитка на подушечке: 0 в центре, 1 на границе узора. */
const ridgeField = (x: number, z: number) => {
  const dx = (x - 16.2) / 6.4;
  const dz = (z - 0.3 - 0.7 * dx - 0.5 * dx * dx) / 4.9;
  return Math.hypot(dx * (0.99 + 0.13 * dz), dz) + 0.034 * Math.sin(5 * dx + dz * 3);
};

/** Углубление папиллярных гребешков и сгибательных борозд (вдоль внутренней нормали). */
const palmarRelief = (x: number, z: number): number => {
  const crest = ridgeField(x, z);
  const ridges = 0.05 * (0.5 + 0.5 * Math.cos(crest * Math.PI * 2 * 13)) ** 2
    * smooth(0.015, 0.085, crest) * (1 - smooth(0.9, 1.05, crest));
  const creases = (0.3 * bell(x, -1.9 + 0.03 * z * z, 0.34) + 0.12 * bell(x, -2.7 + 0.035 * z * z, 0.35))
    * (1 - smooth(4.2, 6.4, Math.abs(z)));
  return ridges + creases;
};

/** Ладонная поверхность пальца (без узора) — опора для желёз, телец и перегородок. */
export const skinBottomY = (x: number, z: number): number => {
  if (x <= FING.xc) return sectionBottom(x, z);
  // на кончике подушечка сходится к вершине по той же четверти эллипса, что и кожа
  const s = Math.min(0.999, (x - FING.xc) / tipLength(Math.PI));
  const c = Math.sqrt(1 - s * s);
  const cy0 = fingerCY(FING.xc);
  const cy = cy0 + (TIP_APEX_Y - cy0) * s * s;
  return cy + (sectionBottom(FING.xc, z / c) - cy0) * c;
};
/** Тыльная кожа с ногтевым аппаратом. */
export const skinTopY = (x: number, z: number): number => dorsalSkinY(x, z);
export { proximalEdge };

type SkinId = 'finger-skin' | 'proximal-fold' | 'lateral-folds' | 'fingerprint';

/** Кожа пальца — одна замкнутая поверхность: тело пальца и скруглённый кончик. */
export function buildFingerSurface(): Record<SkinId, BufferGeometry> {
  const bodyRows = 300;
  const tipRows = 48;
  const cols = 240;
  const rings: Vector3[][] = [];
  const angles = Array.from({ length: cols + 1 }, (_, j) => (j / cols) * Math.PI * 2);
  const skinRing = (x: number) =>
    angles.map((a) => {
      const p = sectionPoint(x, a);
      if (Math.cos(a) > 0) p.y = dorsalSkinY(x, p.z);
      return p;
    });

  // основание: срез пальца закрыт плоским диском
  const cy0 = fingerCY(FING.x0);
  rings.push(angles.map(() => new Vector3(FING.x0, cy0, 0)));
  for (let i = 0; i <= bodyRows; i++) {
    const x = lerp(FING.x0, FING.xc, i / bodyRows);
    rings.push(skinRing(x).map((p) => new Vector3(x, p.y, p.z)));
  }
  const start = skinRing(FING.xc);
  for (let i = 1; i <= tipRows; i++) {
    const phi = (i / tipRows) * Math.PI / 2;
    rings.push(angles.map((a, j) => {
      const [x, y, z] = tipPoint(start[j], a, phi);
      return new Vector3(x, Math.cos(a) > 0 ? capDorsalY(x, z, y) : y, z);
    }));
  }

  const surface = ringsToGeometry(rings);
  // папиллярный узор и борозды — вдавление по нормали на ладонной стороне
  const pos = surface.getAttribute('position');
  const nrm = surface.getAttribute('normal');
  for (let k = 0; k < pos.count; k++) {
    const ny = nrm.getY(k);
    if (ny > -0.2) continue;
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const h = palmarRelief(x, z) * smooth(0.2, 0.45, -ny);
    pos.setXYZ(k, x - nrm.getX(k) * h, pos.getY(k) - ny * h, z - nrm.getZ(k) * h);
  }
  surface.computeVertexNormals();
  const cols1 = cols + 1;
  for (let i = 0; i < rings.length; i++) {
    const a = i * cols1;
    const b = a + cols;
    const n = new Vector3(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
    nrm.setXYZ(a, n.x, n.y, n.z);
    nrm.setXYZ(b, n.x, n.y, n.z);
  }

  // цвет: тыл чуть темнее, подушечка светлее, кончик и область над суставом розовее
  const base = new Color('#bd8771');
  const pad = new Color('#c48e7b');
  const pink = new Color('#ae6a5f');
  const tone = new Color();
  const colors = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const y = pos.getY(k);
    const z = pos.getZ(k);
    const palm = smooth(-0.1, -0.7, nrm.getY(k));
    tone.copy(base).lerp(pad, palm)
      .lerp(pink, 0.4 * bell(x, -3.4, 2.2) + 0.45 * smooth(18, FING.tipX, x))
      .multiplyScalar(0.91 + fbm(x * 0.63, y * 0.75, z * 0.73, 3) * 0.19);
    tone.toArray(colors, k * 3);
  }
  surface.setAttribute('color', new Float32BufferAttribute(colors, 3));

  const index = surface.getIndex()!;
  const sets: Record<SkinId, number[]> = { 'finger-skin': [], 'proximal-fold': [], 'lateral-folds': [], fingerprint: [] };
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const edge = Math.abs(z) - plateHW(x);
    let id: SkinId = 'finger-skin';
    if (y < fingerCY(x) - 2.2 && ridgeField(x, z) < 1.06) id = 'fingerprint';
    else if (y > 1.0 && edge < 0.75 && x > nailPlate.x0 - 1.6 && x < proximalEdge(z) + 0.12) id = 'proximal-fold';
    else if (y > 0.6 && x >= proximalEdge(z) + 0.12 && x < 22.5 && Math.abs(edge) < 0.95) id = 'lateral-folds';
    sets[id].push(a, b, c);
  }
  // все участки используют общие позиции и нормали исходной сетки
  return Object.fromEntries(Object.entries(sets).map(([id, faces]) => {
    const patch = new BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'color']) patch.setAttribute(name, surface.getAttribute(name));
    patch.setIndex(faces);
    return [id, patch];
  })) as Record<SkinId, BufferGeometry>;
}

/** Плавная маска видимой лунулы и свободного края на непрерывной пластинке. */
export function colorPlate(geometry: BufferGeometry): BufferGeometry {
  const body = new Color('#c99690');
  const lunula = new Color('#e2cbbf');
  const tip = new Color('#ece0d0');
  const band = new Color('#b98078');
  const tone = new Color();
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const across = Math.max(-1, Math.min(1, z / plateHW(x)));
    const arc = plateX(nailPlate.lunulaEnd, across);
    const edge = plateX(nailPlate.bodyEnd, across) - 0.1 * Math.sin(z * 1.2);
    const middle = smooth(proximalEdge(z), proximalEdge(z) + 1.2, x) * (1 - smooth(arc - 0.8, arc + 0.25, x));
    const free = smooth(edge - 0.35, edge + 0.55, x);
    tone.copy(body).lerp(band, 0.5 * bell(x, edge - 0.6, 0.5));
    tone.lerp(lunula, middle * 0.85).lerp(tip, free * 0.97);
    tone.multiplyScalar(0.95 + 0.09 * fbm(x * 0.6, 7.1, z * 1.2, 3));
    tone.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}
