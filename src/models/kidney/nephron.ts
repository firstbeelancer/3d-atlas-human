import type { BufferGeometry } from 'three';
import type { Vec3 } from '../../three/geometry';
import { AFFERENT, COLLECTING, DISTAL, EFFERENT, HENLE, PROXIMAL } from './anatomy';
import { bulb, combine, duct, grain, surface, tint } from './geometry';
import type { Piece } from './build';

const CORPUSCLE: Vec3 = [-1.85, 1.72, 0.25];
function corpuscle() {
  const wall = (r: number, flip: boolean) => surface(36, 60, (t, a) => {
    const polar = 0.93 + (Math.PI - 0.931) * t;
    return [
      CORPUSCLE[0] + r * Math.cos(a) * Math.sin(polar),
      CORPUSCLE[1] + r * 0.94 * Math.sin(a) * Math.sin(polar),
      CORPUSCLE[2] + r * Math.cos(polar),
    ];
  }, flip);
  const rim = surface(3, 60, (t, a) => {
    const r = 0.476 + 0.069 * t;
    return [CORPUSCLE[0] + Math.cos(a) * Math.sin(0.93) * r, CORPUSCLE[1] + Math.sin(a) * Math.sin(0.93) * r * 0.94, CORPUSCLE[2] + Math.cos(0.93) * r];
  });
  return combine([wall(0.545, true), wall(0.476, false), rim]);
}

function tuft() {
  const loops: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const phase = i * 2.399963;
    const pts: Vec3[] = [AFFERENT.at(-1)!];
    for (let n = 0; n <= 16; n++) {
      const a = (n / 16) * Math.PI * 2;
      const r = 0.20 + 0.073 * Math.sin(3 * a + i) + i * 0.009;
      pts.push([
        CORPUSCLE[0] + Math.cos(a) * r + 0.085 * Math.cos(phase),
        CORPUSCLE[1] + Math.sin(a) * r * Math.cos(phase) + 0.10 * Math.sin(phase),
        CORPUSCLE[2] + Math.sin(a) * r * Math.sin(phase) + 0.035 * Math.cos(phase),
      ]);
    }
    pts.push(EFFERENT[0]);
    loops.push(duct(pts, (t) => 0.026 + 0.007 * Math.sin(t * 12 + i), 66, 10));
  }
  return combine(loops);
}

function peritubular() {
  const branches: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const span = i / 5;
    const end: Vec3 = [1.44, 1.01 + 0.87 * span, -0.39];
    const points: Vec3[] = [EFFERENT.at(-1)!, [-1.11, 1.24 + 0.73 * span, -0.29]];
    for (let n = 0; n <= 17; n++) {
      const t = n / 17;
      points.push([
        -1.04 + 2.49 * t,
        1.31 + span * 0.78 + 0.13 * Math.sin(t * 24 + i),
        -0.23 + 0.27 * Math.sin(t * 14 + i * 0.82),
      ]);
    }
    points.push(end);
    branches.push(duct(points, (t) => 0.020 - 0.006 * Math.sin(t * Math.PI), 58, 8));
  }
  branches.push(duct([[-0.95, 1.43, -0.27], [-0.47, 1.86, -0.33], [0.16, 1.29, -0.51], [0.72, 1.82, -0.48], [1.44, 1.49, -0.39]], () => 0.021, 48, 10));
  return combine(branches);
}

export function buildNephron(): Piece[] {
  const micro = (id: string, geometry: BufferGeometry, a: string, b: string, opacity?: number): Piece => ({
    id, view: 'micro', geometry: tint(geometry, a, b, grain), roughness: 0.43, opacity,
  });
  const straightVessels = Array.from({ length: 4 }, (_, i) => {
    const shift = i * 0.084;
    return duct([[-1.35, 0.98, -0.25], [-0.85 + shift, 0.19, -0.22 - shift],
      [-0.76 + shift, -1.41, -0.23 - shift], [-0.58 + shift, -2.08 + shift, -0.23 - shift],
      [-0.33 + shift, -2.01 + shift, -0.28 - shift], [-0.27 + shift, -0.83, -0.29 - shift],
      [-0.25 + shift, 0.63, -0.41 - shift], [0.10, 1.12, -0.41]], () => 0.025, 72, 10);
  });
  const collecting = [
    duct(COLLECTING, (t) => 0.105 + t * 0.068, 84, 24, 0.67),
    duct([[2.12, 1.76, -0.30], [1.87, 1.14, -0.22], [1.46, 0.40, -0.08]], (t) => 0.052 + t * 0.021, 26, 12),
    duct([[2.18, 0.72, 0.13], [1.89, 0.32, 0.02], [1.49, -0.18, -0.14]], (t) => 0.052 + t * 0.024, 26, 12),
  ];
  const brushBorder = surface(14, 22, (t, a) => {
    const r = 0.14 - 0.02 * t + 0.012 * Math.sin(17 * a);
    return [-1.45 + t * 0.21, 1.66 - t * 0.1 + Math.cos(a) * r, 0.34 + t * 0.12 + Math.sin(a) * r];
  }, true);
  return [
    micro('bowman', corpuscle(), '#ca7c58', '#f6c799'),
    micro('glomerulus', tuft(), '#a92034', '#f15f67'),
    micro('afferent', duct(AFFERENT, (t) => 0.119 - 0.043 * t, 42, 22, 0.62), '#a11e31', '#f06769'),
    micro('efferent', duct(EFFERENT, (t) => 0.074 - 0.031 * t, 55, 18, 0.67), '#971c32', '#db5966'),
    micro('proximal', combine([duct(PROXIMAL, (t) => 0.145 - 0.043 * t, 132, 24, 0.59), brushBorder]), '#c18044', '#ffd395'),
    micro('henle', duct(HENLE, (t) => 0.063 + 0.050 * Math.abs(t - 0.49) ** 1.8 + 0.030 * t ** 4, 110, 20, 0.65), '#a6624c', '#eda17b'),
    micro('distal', duct(DISTAL, (t) => 0.096 + 0.007 * Math.cos(t * 14), 132, 22, 0.65), '#ba9161', '#f9d6a9'),
    micro('collecting', combine(collecting), '#b4915a', '#ffdc91'),
    micro('capillaries', peritubular(), '#645889', '#d389a5'),
    micro('vasa-recta', combine(straightVessels), '#4f6496', '#b48ab0'),
    micro('collecting', bulb([1.63, -2.54, -0.04], [0.11, 0.083, 0.11], 16), '#b4915a', '#ffdc91'),
  ];
}
