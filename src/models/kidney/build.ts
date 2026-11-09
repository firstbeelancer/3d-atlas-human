import { Matrix4, Vector3, type BufferGeometry } from 'three';
import type { Vec3 } from '../../three/geometry';
import { hilarPath, LOBES, outline, PELVIS, URETER } from './anatomy';
import { bulb, combine, duct, grain, surface, tint } from './geometry';
import { buildNephron } from './nephron';

export type View = 'both' | 'cover' | 'cut' | 'internal' | 'vessel' | 'micro';
export interface Piece {
  id: string;
  view: View;
  geometry: BufferGeometry;
  roughness?: number;
  opacity?: number;
}

function part(id: string, view: View, geometry: BufferGeometry, low: string, high: string, roughness = 0.53, opacity?: number): Piece {
  return { id, view, geometry: tint(geometry, low, high, grain), roughness, opacity };
}

function inKidney(geo: BufferGeometry, left: boolean) {
  const side = left ? -1 : 1;
  geo.applyMatrix4(new Matrix4().set(
    side, side * (left ? 0.1 : 0.085), 0, -side * 2.02,
    0, 1, 0, left ? 0.36 : -0.14,
    -0.12, 0, 1, 0,
    0, 0, 0, 1,
  ));
  if (left && geo.index) {
    const index = geo.index.array;
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  }
  return geo;
}

function shell(front: boolean, scale = 1) {
  return surface(72, 180, (t, a) => {
    const [x, y] = outline(a);
    const phi = t * (Math.PI / 2 - 0.0001);
    const r = Math.cos(phi);
    const grainOffset = (grain(x * r, y * r, t) - 0.5) * 0.008;
    const hilumDepth = 1 - 0.20 * Math.max(0, Math.cos(a)) ** 2 * r ** 2;
    return [
      (-0.31 + (x + 0.31) * r) * scale,
      y * r * scale,
      (front ? 0.94 : -0.84) * Math.sin(phi) * hilumDepth * scale + grainOffset * r,
    ];
  }, front);
}

function cutFace(inner: number, outer: number, depth: (x: number, y: number, r: number) => number) {
  return surface(38, 180, (t, a) => {
    const [x, y] = outline(a);
    const r = outer + (inner - outer) * t;
    const px = -0.15 + (x + 0.15) * r;
    return [px, y * r, depth(px, y * r, r)];
  }, true);
}

function kidneyShells(): Piece[] {
  const pieces: Piece[] = [];
  for (const left of [false, true]) {
    const id = left ? 'left-kidney' : 'right-kidney';
    const skin = (front: boolean, view: View) => part(id, view, inKidney(shell(front), left), '#6d252d', '#b94e4c', 0.33);
    pieces.push(skin(true, left ? 'cover' : 'both'), skin(false, 'both'));
    const capsule = (front: boolean, view: View) => part('capsule', view, inKidney(shell(front, 1.006), left), '#ac5859', '#df9390', 0.38, 0.12);
    pieces.push(capsule(true, left ? 'cover' : 'both'), capsule(false, 'both'));
    const adrenal = surface(38, 64, (t, a) => {
      const theta = t * Math.PI;
      const round = Math.sin(theta);
      const x = Math.cos(theta) * 0.62;
      const ridge = 0.28 * Math.exp(-((x + 0.15) ** 2) / 0.08);
      const lobe = 1 + 0.10 * Math.sin(5 * a + 6 * theta);
      return [0.38 + x, 2.19 + ridge - 0.35 * x + round * Math.cos(a) * 0.20 * lobe, -0.24 + round * Math.sin(a) * 0.33 * lobe];
    }, true);
    pieces.push(part('adrenal', 'both', inKidney(adrenal, left), '#a76d2e', '#e7b86c'));
    pieces.push(part('hilum', 'internal', inKidney(bulb([0.31, 0.05, -0.36], [0.26, 0.62, 0.17]), left), '#8c4743', '#bc7064'));
    pieces.push(part('ureters', 'both', inKidney(duct(URETER, (t) => 0.094 + 0.011 * Math.sin(t * 16), 48, 20, 0.60), left), '#c79b68', '#f2cd8f', 0.34));
    if (!left) {
      const pelvicOutlet = duct(PELVIS, (t) => 0.094 + 0.070 * (1 - t), 32, 24, 0.67);
      pieces.push(part('pelvis', 'both', inKidney(pelvicOutlet, left), '#b88c56', '#f2cd8f', 0.34));
    }
  }
  return pieces;
}

function section(): Piece[] {
  const kidneyPart = (id: string, view: View, geo: BufferGeometry, low: string, high: string, rough?: number) => part(id, view, inKidney(geo, true), low, high, rough);
  const pieces = [
    kidneyPart('capsule', 'cut', cutFace(0.978, 1.006, () => 0.006), '#ae615e', '#f5b4a4'),
    kidneyPart('cortex', 'cut', cutFace(0.785, 0.978, (x, y, r) => -0.015 + (1 - r) * 0.09 + 0.018 * (grain(x, y, 0) - 0.5)), '#bd605d', '#edaa91'),
    kidneyPart('columns', 'cut', cutFace(0.001, 0.788, (x, y, r) => -0.37 + 0.60 * r ** 2 + 0.018 * (grain(x, y, 0) - 0.5)), '#9a4b48', '#cf8275'),
  ];
  const pyramids: BufferGeometry[] = [];
  const papillae: BufferGeometry[] = [];
  const minor: BufferGeometry[] = [];
  const major: BufferGeometry[] = [];
  const fat: BufferGeometry[] = [];
  const junctions: Vec3[] = [[0.28, 0.58, 0.34], [0.31, 0.03, 0.32], [0.43, -0.61, 0.31]];
  for (const [i, { base, tip, width }] of LOBES.entries()) {
    const a = new Vector3(...base);
    const b = new Vector3(...tip);
    const across = new Vector3(b.y - a.y, a.x - b.x, 0).normalize();
    const tipAxis = b.clone().sub(a).normalize();
    const profile = surface(56, 64, (t, angle) => {
      const h = Math.max(0.02, (1 - t) ** 0.88) * Math.min(1, 0.58 + t * 5.8);
      const ridge = 1 + 0.019 * Math.cos(22 * angle + 3 * t) + 0.010 * Math.sin(35 * angle);
      const p = a.clone().lerp(b, t);
      p.z += 0.075 * Math.sin(t * Math.PI);
      p.addScaledVector(across, Math.cos(angle) * width * h * ridge);
      p.z += Math.sin(angle) * 0.26 * h * ridge;
      return p.toArray() as Vec3;
    });
    tint(profile, '#813a3d', '#d78377', (x, y, z, index) => {
      const angle = (index % 64) * Math.PI / 32;
      return 0.68 * grain(x, y, z) + 0.24 * (0.5 + 0.5 * Math.sin(angle * 22 + 2 * z)) + 0.08 * Math.sin(i * 1.6);
    });
    pyramids.push(profile);
    papillae.push(bulb(tip, [0.093, 0.087, 0.083], 18));
    const hub = junctions[i < 3 ? 0 : i < 5 ? 1 : 2];
    const rim = b.clone().addScaledVector(tipAxis, -0.035).toArray() as Vec3;
    const neck = b.clone().addScaledVector(tipAxis, 0.14).toArray() as Vec3;
    minor.push(duct([hub, neck, rim], (t) => 0.045 + 0.083 * t ** 4, 24, 22, 0.72));
    for (let n = 0; n < 4; n++) {
      const t = n / 4;
      fat.push(bulb(
        [tip[0] * (1 - t) + hub[0] * t + 0.075, tip[1] * (1 - t) + hub[1] * t + 0.11, -0.11 - 0.07 * Math.sin(i + n)],
        [0.11 + 0.025 * Math.sin(i + n), 0.10, 0.09], 12,
      ));
    }
  }
  for (const [i, hub] of junctions.entries()) {
    const join: Vec3 = i === 2 ? [0.77, -0.47, 0.14] : [0.53, -0.04, 0.19];
    major.push(duct([hub, [hub[0] + 0.14, hub[1] * 0.8, 0.32], join], (t) => 0.086 + t * 0.044, 26, 22, 0.65));
  }
  const pelvis = duct(PELVIS, (t) => 0.09 + 0.19 * Math.sin((1 - t) * Math.PI * 0.8) ** 1.2, 44, 32, 0.74);
  pieces.push(
    { id: 'pyramids', view: 'internal', geometry: inKidney(combine(pyramids), true), roughness: 0.6 },
    kidneyPart('papillae', 'internal', combine(papillae), '#d89583', '#f4b3a0'),
    kidneyPart('sinus', 'internal', combine(fat), '#b38b54', '#f2c991'),
    kidneyPart('minor-calyces', 'internal', combine(minor), '#c3995d', '#ffe2a8', 0.34),
    kidneyPart('major-calyces', 'internal', combine(major), '#cba669', '#ffe8bc', 0.33),
    kidneyPart('pelvis', 'internal', pelvis, '#b88c56', '#fbd6a0', 0.30),
  );
  return pieces;
}

export const AORTA: Vec3[] = [[-0.16, 2.38, -0.55], [-0.11, 1.1, -0.54], [-0.08, -0.22, -0.53], [-0.03, -1.45, -0.58], [-0.04, -3.04, -0.59]];
export const CAVA: Vec3[] = [[-0.56, -3.05, -0.48], [-0.56, -1.3, -0.46], [-0.56, 0.02, -0.44], [-0.57, 1.26, -0.44], [-0.54, 2.38, -0.48]];

function vessels(): Piece[] {
  const pieces: Piece[] = [
    part('aorta', 'both', duct(AORTA, (t) => 0.19 - 0.032 * t, 68, 28, 0.72), '#90232c', '#db5a50', 0.39),
    part('vena-cava', 'both', duct(CAVA, (t) => 0.22 + 0.021 * t, 68, 28, 0.77), '#355485', '#6c92bd', 0.39),
  ];
  for (const vein of [false, true]) {
    const palette = (id: string, view: View, geo: BufferGeometry) => part(id, view, geo, vein ? '#3c5f95' : '#9d2c32', vein ? '#82b1d2' : '#e86e5f', 0.38);
    const trunks = [false, true].map((left) => duct(hilarPath(left, vein), (t) => (vein ? 0.107 : 0.079) + t * 0.043, 44, 20));
    pieces.push(palette(vein ? 'renal-veins' : 'renal-arteries', 'both', combine(trunks)));
    const segmental: BufferGeometry[] = [];
    const interlobar: BufferGeometry[] = [];
    const arcuate: BufferGeometry[] = [];
    const cortical: BufferGeometry[] = [];
    const z = vein ? -0.22 : -0.36;
    const root: Vec3 = [0.28, vein ? 0.07 : 0.21, vein ? 0.33 : -0.13];
    const divisions: Vec3[] = [[-0.19, 0.71, z], [-0.40, 0.19, z], [-0.11, -0.69, z]];
    divisions.forEach((point) => segmental.push(duct([root, [0.05, point[1] * 0.59, z + 0.03], point], (t) => (vein ? 0.092 : 0.064) - t * 0.022, 22)));
    for (const [i, lobe] of LOBES.entries()) {
      const angle = lobe.angle + (vein ? 0.12 : 0.06);
      const [x, y] = outline(angle);
      const start = divisions[i < 3 ? 0 : i < 5 ? 1 : 2];
      const edge: Vec3 = [x * 0.79, y * 0.79, z];
      interlobar.push(duct([start, [edge[0] * 0.59, edge[1] * 0.67, z - 0.04], edge], (t) => 0.044 - 0.020 * t, 26, 12));
      const arc = Array.from({ length: 7 }, (_, n): Vec3 => {
        const [px, py] = outline(angle + (n - 3) * 0.078);
        return [px * 0.80, py * 0.80, z + 0.014 * Math.cos(n)];
      });
      arcuate.push(duct(arc, (t) => 0.024 - Math.abs(t - 0.5) * 0.020, 28, 12));
      for (let n = 0; n < 7; n++) {
        const [px, py] = outline(angle + (n - 3) * 0.08);
        const a: Vec3 = arc[n];
        const end: Vec3 = [px * 0.96, py * 0.94, z + 0.045 * Math.sin(n + i)];
        cortical.push(duct([a, [px * 0.88, py * 0.87, end[2] - 0.045], end], (t) => 0.012 - 0.006 * t, 12, 8));
      }
    }
    for (const [id, geos] of [['segmental', segmental], ['interlobar', interlobar], ['arcuate', arcuate], ['cortical-radial', cortical]] as const) {
      pieces.push(palette(id, 'vessel', inKidney(combine(geos), true)));
    }
  }
  return pieces;
}

export function buildKidney(progress: (completed: number) => void) {
  const pieces = kidneyShells();
  progress(0.20);
  pieces.push(...section());
  progress(0.44);
  pieces.push(...vessels());
  progress(0.68);
  pieces.push(...buildNephron());
  progress(0.88);
  return pieces;
}
