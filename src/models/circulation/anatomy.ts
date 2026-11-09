import { systemicArteries, systemicVeins, type BloodPath } from '../body/bloodPaths';
import type { V3 } from '../body/geo';

export const HEART_GROUP = 'g-pump';
export const ARTERY_GROUP = 'g-systemic-arteries';
export const VEIN_GROUP = 'g-systemic-veins';
export const LUNG_GROUP = 'g-pulmonary';
export const MICRO_GROUP = 'g-microcirculation';

export type View = 'overview' | 'systemic' | 'pulmonary' | 'micro';
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
      for (const z of [-0.42, -0.16, 0.10]) {
        const end: V3 = [side * (outside + 0.06), y + 0.05, z];
        add('pulmonary-arteries', 'deoxygenated', [tip, [side * outside, y + 0.04, (z - 0.27) * 0.5], end], [0.022, 0.011]);
        add('lung-capillaries', 'oxygen-gain', [end, [side * (outside + 0.14), y - 0.04, z + 0.06],
          [side * (outside + 0.08), y - 0.18, z + 0.11], collecting], [0.010, 0.010]);
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

export const VESSELS: Vessel[] = [
  ...systemicArteries.map((p): Vessel => ({ ...p, group: ARTERY_GROUP, blood: 'oxygenated' })),
  ...systemicVeins.map((p): Vessel => ({ ...p, group: VEIN_GROUP, blood: 'deoxygenated' })),
  ...pulmonary(),
  ...microcirculation(),
];

export const ORGAN_GROUPS: Record<string, string> = {
  heart: HEART_GROUP,
  'coronary-arteries': HEART_GROUP,
  'coronary-veins': HEART_GROUP,
  lungs: LUNG_GROUP,
};

export const PART_GROUPS: Record<string, string> = {
  ...ORGAN_GROUPS,
  ...Object.fromEntries(VESSELS.map(({ part, group }) => [part, group])),
};
