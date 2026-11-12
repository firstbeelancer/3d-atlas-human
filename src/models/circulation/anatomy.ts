import { systemicArteries, systemicVeins, type BloodPath } from '../body/bloodPaths';
import type { V3 } from '../body/geo';
import { armPoint } from '../body/skin';
import { buildSystemicBranches, PALM_RADIAL, PALM_ULNAR } from './systemicBranches';

export const HEART_GROUP = 'g-pump';
export const ARTERY_GROUP = 'g-systemic-arteries';
export const VEIN_GROUP = 'g-systemic-veins';
export const LUNG_GROUP = 'g-pulmonary';
export const MICRO_GROUP = 'g-microcirculation';

export type View = 'overview' | 'systemic' | 'pulmonary' | 'micro' | 'wall';
export const WALL_PARTS = new Set(['capillary-wall', 'pericytes', 'erythrocytes']);
export type BloodColor = 'oxygenated' | 'deoxygenated' | 'oxygen-gain' | 'oxygen-loss';

export interface Vessel extends BloodPath {
  group: string;
  blood: BloodColor;
}

function pulmonary(): Vessel[] {
  const paths: Vessel[] = [];
  const add = (part: string, blood: BloodColor, points: V3[], radii: BloodPath['radii']) =>
    paths.push({ group: LUNG_GROUP, part, blood, points, radii });
  const fork: V3 = [-0.11, 13.66, 0.18];
  add('pulmonary-trunk', 'deoxygenated', [[-0.015, 13.08, 0.50], [-0.14, 13.41, 0.42], fork], [0.135, 0.117]);
  for (const side of [1, -1]) {
    const root: V3 = [side * 0.64, 13.52, -0.21];
    add('pulmonary-arteries', 'deoxygenated', [fork, [side * 0.37, 13.63, -0.09], root], [0.087, 0.073]);
    const lobes = side === 1 ? [[13.94, 0.58], [12.44, 0.98]] : [[13.94, 0.58], [13.23, 0.82], [12.40, 1.01]];
    for (const [i, [y, outside]] of lobes.entries()) {
      const tip: V3 = [side * outside, y, -0.27];
      const collecting: V3 = [side * (outside - 0.10), y - 0.17, 0.07];
      const outlet: V3 = [side * 0.64, i === 0 ? 13.35 : 12.99, 0.03];
      add('pulmonary-arteries', 'deoxygenated', [root, [side * 0.80, (y + 13.52) * 0.5, -0.26], tip], [0.053, 0.028]);
      for (const [j, [z, dy]] of [[-0.48, 0.08], [-0.34, 0.22], [-0.21, 0.09], [-0.07, -0.06], [0.09, -0.15]].entries()) {
        const radial = outside + 0.04 + 0.055 * Math.sin(j * 1.5 + i);
        const end: V3 = [side * radial, y + dy, z];
        const drain: V3 = [side * (radial - 0.10), y + dy - 0.14, z + 0.08];
        add('pulmonary-arteries', 'deoxygenated', [tip, [side * (outside + 0.01), y + dy * 0.62, (z - 0.27) * 0.5], end], [0.022, 0.010]);
        add('lung-capillaries', 'oxygen-gain', [end, [side * (radial + 0.06), y + dy - 0.04, z + 0.025],
          [side * (radial + 0.02), y + dy - 0.13, z + 0.055], drain], [0.009, 0.009]);
        add('pulmonary-veins', 'oxygenated', [drain, [side * (radial - 0.14), y + dy - 0.19, z + 0.11], collecting], [0.010, 0.020]);
      }
      add('pulmonary-veins', 'oxygenated', [collecting, [side * 0.80, (y + outlet[1]) * 0.5 - 0.08, 0.11], outlet], [0.033, 0.053]);
    }
    add('pulmonary-veins', 'oxygenated', [[side * 0.64, 13.35, 0.03], [side * 0.43, 13.36, -0.11], [0.22, 13.29, -0.15]], [0.054, 0.069]);
    add('pulmonary-veins', 'oxygenated', [[side * 0.64, 12.99, 0.03], [side * 0.40, 13.03, -0.20], [0.25, 13.10, -0.20]], [0.055, 0.066]);
  }
  return paths;
}

function microcirculation(): Vessel[] {
  const paths: Vessel[] = [];
  const add = (part: string, blood: BloodColor, points: V3[], radii: BloodPath['radii']) =>
    paths.push({ group: MICRO_GROUP, part, blood, points, radii });
  const arterialFork: V3 = [-2.20, 0.05, 0.03];
  const venousFork: V3 = [2.30, -0.04, 0.03];
  add('arterioles', 'oxygenated', [[-3.25, -0.20, 0.17], [-2.76, -0.11, 0.10], arterialFork], [0.155, 0.12]);
  add('venules', 'deoxygenated', [venousFork, [2.80, 0.06, 0.10], [3.27, 0.16, 0.17]], [0.14, 0.19]);
  const nodes: { left: V3; right: V3 }[] = [];
  for (let i = 0; i < 7; i++) {
    const y = (i - 3) * 0.43;
    const depth = 0.38 * Math.cos(i * 1.46);
    const inlet: V3 = [-1.44, y, depth];
    const left: V3 = [-0.65, y + 0.15 * Math.sin(i), depth + 0.14];
    const right: V3 = [0.55, y - 0.09 * Math.cos(i), -depth - 0.11];
    const outlet: V3 = [1.48, y - 0.08, -depth];
    nodes.push({ left, right });
    add('arterioles', 'oxygenated', [arterialFork, [-1.93, y * 0.56, depth * 0.56], [-1.66, y * 0.94, depth * 0.91], inlet], [0.072, 0.044]);
    add('tissue-capillaries', 'oxygen-loss', [inlet, left, [-0.07, y + 0.11 * Math.sin(i * 2), 0.16 * Math.cos(i * 2)], right, outlet], [0.040, 0.044]);
    add('venules', 'deoxygenated', [outlet, [1.69, y * 0.89 - 0.08, -depth * 0.89], [1.95, y * 0.54, -depth * 0.48], venousFork], [0.049, 0.080]);
  }
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i].left;
    const to = nodes[i + 1].right;
    add('tissue-capillaries', 'oxygen-loss', [from, [-0.25, (from[1] + to[1]) * 0.5, -0.46],
      [0.29, to[1] - 0.17, -0.31], to], [0.028, 0.032]);
  }
  return paths;
}

export const SYSTEMIC_BRANCHES = buildSystemicBranches();

const baselineArteries = systemicArteries
  .filter(({ part, points }) => part !== 'hand-arteries' && !(part === 'foot-arteries' && points[0][1] === 0.23))
  .map((p): BloodPath => {
    if (p.part === 'leg-arteries' && p.points[0][1] === 8.50) return { ...p, part: 'deep-femoral-arteries' };
    if (p.part === 'cerebral-arteries' && p.points[0][1] === 14.46) return { ...p, part: 'vertebral-arteries' };
    if (p.part === 'arm-arteries' && (p.radii[0] === 0.037 || p.radii[0] === 0.035)) {
      const side = Math.sign(p.points[0][0]);
      const distal = (p.radii[0] === 0.037 ? PALM_RADIAL : PALM_ULNAR)
        .map((point) => armPoint(point))
        .map(([x, y, z]): V3 => [side * x, y, z]);
      return { ...p, points: [...p.points.slice(0, -1), ...distal] };
    }
    return p;
  });
const baselineVeins = systemicVeins.map((p): BloodPath =>
  p.part === 'leg-veins' && p.radii[0] === 0.041 ? { ...p, part: 'saphenous-veins' } : p,
);

export const VESSELS: Vessel[] = [
  ...[...baselineArteries, ...SYSTEMIC_BRANCHES.arteries].map((p): Vessel => ({ ...p, group: ARTERY_GROUP, blood: 'oxygenated' })),
  ...[...baselineVeins, ...SYSTEMIC_BRANCHES.veins].map((p): Vessel => ({ ...p, group: VEIN_GROUP, blood: 'deoxygenated' })),
  ...pulmonary(),
  ...microcirculation(),
];

/** Разнос при explode: артерии вправо-вверх, вены влево-вниз, малый круг к лёгким, микро остаётся. */
export function spreadOf(id: string, group: string): [number, number, number] {
  if (group === MICRO_GROUP) return [0, 0, 0];
  if (group === LUNG_GROUP) {
    if (id === 'lungs') return [0, 0, -0.75];
    return id === 'pulmonary-veins' ? [0.42, 0.31, -0.31] : [-0.34, 0.48, -0.18];
  }
  if (group === HEART_GROUP) return [0, 0.15, 0.55];
  switch (id) {
    case 'aorta': return [0.55, 0.1, 0];
    case 'brachiocephalic-trunk': return [0.3, 0.9, 0.1];
    case 'carotid-arteries': return [0.5, 1.1, 0.1];
    case 'facial-arteries': return [0.75, 1.25, 0.35];
    case 'cerebral-arteries': return [0.35, 1.45, -0.25];
    case 'vertebral-arteries': return [0.35, 1.38, -0.46];
    case 'subclavian-arteries': return [0.85, 0.6, 0];
    case 'arm-arteries': return [1.15, 0.1, 0];
    case 'deep-arm-arteries': return [1.15, 0.1, -0.44];
    case 'palmar-arches': return [1.32, -0.35, -0.28];
    case 'hand-arteries': return [1.35, -0.35, 0.1];
    case 'visceral-arteries': return [0.6, -0.1, 0.2];
    case 'intercostal-arteries': return [0.35, 0.45, -0.55];
    case 'renal-arteries': return [0.7, -0.05, -0.25];
    case 'iliac-arteries': return [0.5, -0.7, 0.1];
    case 'leg-arteries': return [0.55, -0.9, 0];
    case 'deep-femoral-arteries': return [0.55, -0.9, -0.48];
    case 'fibular-arteries': return [0.65, -0.92, -0.4];
    case 'foot-arteries': return [0.6, -1.2, 0.35];
    case 'plantar-arteries': return [0.6, -1.3, 0.48];
    case 'vena-cava-superior': return [-0.55, 0.5, 0];
    case 'azygos-vein': return [-0.45, 0.44, -0.55];
    case 'vena-cava-inferior': return [-0.55, -0.3, 0];
    case 'brachiocephalic-veins': return [-0.6, 0.7, 0.1];
    case 'jugular-veins': return [-0.65, 1.0, 0.1];
    case 'cerebral-veins': return [-0.4, 1.35, -0.3];
    case 'arm-veins': return [-1.15, 0.0, 0.05];
    case 'renal-veins': return [-0.7, -0.05, -0.2];
    case 'portal-vein': return [-0.5, -0.35, 0.35];
    case 'hepatic-veins': return [-0.5, 0.15, 0.1];
    case 'iliac-veins': return [-0.55, -0.7, 0];
    case 'leg-veins': return [-0.6, -0.9, 0];
    case 'saphenous-veins': return [-0.75, -0.9, 0.32];
    default: return [0, 0, 0];
  }
}

export const ORGAN_GROUPS: Record<string, string> = {
  heart: HEART_GROUP,
  'coronary-arteries': HEART_GROUP,
  'coronary-veins': HEART_GROUP,
  lungs: LUNG_GROUP,
};

export const PART_GROUPS: Record<string, string> = {
  ...ORGAN_GROUPS,
  ...Object.fromEntries(VESSELS.map(({ part, group }) => [part, group])),
  ...Object.fromEntries([...WALL_PARTS].map((part) => [part, MICRO_GROUP])),
};
