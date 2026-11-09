import type { Vec3 } from '../../three/geometry';

export const KIDNEY_CAMERA: Vec3 = [0.40, 0.56, 16];
export const KIDNEY_TARGET: Vec3 = [0, -0.23, 0];

export const GROUPS = {
  overview: ['right-kidney', 'left-kidney', 'capsule', 'adrenal', 'hilum'],
  tissue: ['cortex', 'columns', 'pyramids', 'papillae', 'sinus'],
  drainage: ['minor-calyces', 'major-calyces', 'pelvis', 'ureters'],
  vessels: ['renal-arteries', 'renal-veins', 'segmental', 'interlobar', 'arcuate', 'cortical-radial', 'aorta', 'vena-cava'],
  nephron: ['bowman', 'glomerulus', 'afferent', 'efferent', 'proximal', 'henle', 'distal', 'collecting', 'capillaries', 'vasa-recta'],
} as const;

export const GROUP_OF = Object.fromEntries(Object.entries(GROUPS).flatMap(([group, ids]) => ids.map((id) => [id, group])));
export const MICRO_IDS: ReadonlySet<string> = new Set([...GROUPS.nephron, 'nephron']);
export const TISSUE_IDS: ReadonlySet<string> = new Set(GROUPS.tissue);
export const VASCULAR_IDS: ReadonlySet<string> = new Set(GROUPS.vessels.slice(2, 6));

export function outline(angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const y = 2.44 * s * (1 + 0.025 * c);
  const notch = 0.94 * Math.exp(-((y - 0.13) ** 2) / 1.48) * Math.max(0, c) ** 2;
  const contour = 1 + 0.009 * Math.sin(9 * angle + 0.3) + 0.006 * Math.sin(14 * angle);
  return [-0.12 + (1.48 * c - notch - 0.21 * s ** 2 + 0.10 * s) * contour, y];
}

/** Local +x points towards the hilum. The anatomical right kidney is lower. */
export function placeKidney([x, y, z]: Vec3, left: boolean): Vec3 {
  const side = left ? -1 : 1;
  const slant = left ? 0.10 : 0.085;
  return [side * (x + y * slant - 2.02), y + (left ? 0.36 : -0.14), z - x * 0.12];
}

export const LOBES = [54, 88, 122, 155, 188, 220, 255, 302].map((degrees, i) => {
  const angle = degrees * Math.PI / 180;
  const [x, y] = outline(angle);
  return {
    angle,
    base: [x * 0.82, y * 0.82, -0.10] as Vec3,
    tip: [i === 0 || i === 7 ? 0.25 : -0.02 - 0.13 * Math.sin(i * Math.PI / 7), 0.99 - i * 0.281, 0.19] as Vec3,
    width: [0.37, 0.42, 0.46, 0.39, 0.44, 0.43, 0.43, 0.38][i],
  };
});

export const PELVIS: Vec3[] = [[0.42, 0.04, 0.16], [0.69, -0.23, 0.18], [0.87, -0.58, 0.11], [0.91, -0.99, -0.04]];
export const URETER: Vec3[] = [PELVIS[3], [0.93, -1.45, -0.08], [1.01, -2.02, -0.08], [1.11, -2.64, -0.01], [1.34, -3.15, 0.17]];

export const PROXIMAL: Vec3[] = [[-1.42, 1.66, 0.34], [-1.09, 1.53, 0.68], [-0.99, 1.91, 0.95], [-0.68, 2.13, 0.55], [-0.38, 1.89, 0.42], [-0.65, 1.64, 0.16], [-0.8, 1.47, 0.34], [-0.52, 1.3, 0.64], [-0.32, 1.48, 0.81], [-0.08, 1.2, 0.47], [-0.45, 0.82, 0.39]];
export const HENLE: Vec3[] = [PROXIMAL.at(-1)!, [-0.44, 0.05, 0.28], [-0.37, -1.15, 0.15], [-0.28, -2.02, 0.02], [0.03, -2.34, -0.04], [0.37, -2.11, -0.09], [0.47, -1.23, -0.12], [0.39, -0.25, -0.08], [0.27, 0.89, -0.23]];
export const DISTAL: Vec3[] = [HENLE.at(-1)!, [0.08, 1.36, -0.53], [-0.5, 1.91, -0.40], [-1.12, 2.16, -0.19], [-0.96, 2.46, 0.11], [-0.35, 2.49, 0.30], [0.21, 2.2, 0.37], [0.51, 1.92, 0.62], [0.85, 2.03, 0.53], [1.14, 1.8, 0.31], [1.48, 1.36, 0.05]];
export const COLLECTING: Vec3[] = [[1.48, 2.32, 0.08], DISTAL.at(-1)!, [1.46, 0.4, -0.08], [1.51, -0.84, -0.17], [1.63, -2.54, -0.04]];

export function hilarPath(left: boolean, vein: boolean): Vec3[] {
  const inside = placeKidney(vein ? [0.25, 0.07, 0.33] : [0.24, 0.22, -0.13], left);
  const portal = placeKidney(vein ? [0.73, 0.05, 0.43] : [0.72, 0.15, -0.06], left);
  const end: Vec3 = vein ? [-0.56, left ? 0.40 : -0.22, -0.34] : [-0.12, left ? 0.66 : 0.13, -0.52];
  const crossing: Vec3 = [(portal[0] + end[0]) / 2, (portal[1] + end[1]) / 2 + 0.04, vein ? 0.30 : -0.40];
  return [inside, portal, crossing, end];
}

export const AFFERENT: Vec3[] = [[-3.12, 2.37, -0.08], [-2.79, 2.29, 0.04], [-2.56, 2.12, 0.22], [-2.18, 1.91, 0.34]];
export const EFFERENT: Vec3[] = [[-2.22, 1.61, 0.33], [-2.58, 1.46, 0.39], [-2.71, 1.15, 0.20], [-2.37, 0.91, 0.02], [-1.89, 0.92, -0.13], [-1.35, 0.98, -0.25]];
