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

function detailVessels(): Vessel[] {
  const out: Vessel[] = [];
  const A = (part: string, points: V3[], r0: number, r1 = r0) =>
    out.push({ group: ARTERY_GROUP, part, blood: 'oxygenated', points, radii: [r0, r1] });
  const V = (part: string, points: V3[], r0: number, r1 = r0) =>
    out.push({ group: VEIN_GROUP, part, blood: 'deoxygenated', points, radii: [r0, r1] });
  // --- грудная аорта: задние межрёберные, бронхиальные, пищеводные ---
  for (let i = 0; i < 6; i++) {
    const y = 13.0 - i * 0.38;
    for (const s of [1, -1] as const) {
      A('aorta', [[0.55, y, -0.5], [s * 0.85, y + 0.04, -0.55], [s * 1.25, y + 0.02, -0.35]], 0.016, 0.007);
      A('aorta', [[s * 1.25, y + 0.02, -0.35], [s * 1.45, y - 0.02, -0.1], [s * 1.42, y - 0.06, 0.25]], 0.009, 0.005);
    }
  }
  A('visceral-arteries', [[0.55, 13.2, -0.5], [0.75, 13.05, -0.35], [0.95, 12.95, -0.3]], 0.014, 0.008);
  A('visceral-arteries', [[0.55, 12.9, -0.5], [0.35, 12.8, -0.3], [0.3, 12.65, 0.0]], 0.012, 0.007);
  for (const s of [1, -1] as const) {
    A('visceral-arteries', [[0.4, 11.5, -0.3], [s * 0.3, 11.35, -0.45], [s * 0.75, 11.3, -0.55]], 0.016, 0.009);
    A('aorta', [[0.28, 10.7 - 0.1, -0.22], [s * 0.3, 10.55, -0.4], [s * 0.9, 10.5, -0.5]], 0.014, 0.007);
    A('aorta', [[0.26, 10.3, -0.2], [s * 0.25, 10.15, -0.35], [s * 0.7, 10.05, -0.45]], 0.013, 0.006);
    A('visceral-arteries', [[0.2, 10.5, 0.3], [s * 0.3, 10.1, 0.5], [s * 0.55, 9.7, 0.55]], 0.02, 0.009);
    V('vena-cava-inferior', [[-0.35, 11.9, -0.3], [s * -0.2 - s * 0.3, 11.85, -0.5], [s * -1.0, 11.8, -0.4]], 0.02, 0.01);
  }
  A('aorta', [[0.22, 10.02, -0.15], [0.22, 9.6, -0.2], [0.2, 9.2, -0.2]], 0.02, 0.008);
  // --- непарная / полунепарная вены ---
  V('vena-cava-superior', [[-0.35, 13.05, 0.23], [-0.15, 12.9, -0.55], [0.3, 12.7, -0.6]], 0.045, 0.028);
  for (let i = 0; i < 4; i++) {
    const y = 12.6 - i * 0.4;
    for (const s of [1, -1] as const) V('vena-cava-superior', [[s * 1.2, y, -0.3], [s * 0.7, y, -0.5], [0.3, 12.7 - i * 0.1, -0.6]], 0.012, 0.008);
  }
  // --- шея: щитовидные, затылочные, ушные ---
  for (const s of [1, -1] as const) {
    const m = (pts: V3[]): V3[] => (s === 1 ? pts : pts.map(([x, y, z]): V3 => [-x, y, z]));
    A('carotid-arteries', m([[0.4, 15.0, 0.09], [0.32, 14.8, 0.25], [0.2, 14.7, 0.3]]), 0.02, 0.01);
    A('facial-arteries', m([[0.54, 15.96, 0.21], [0.68, 16.1, 0.35], [0.72, 16.35, 0.5]]), 0.014, 0.007);
    A('facial-arteries', m([[0.55, 16.21, 0.47], [0.62, 16.4, 0.6], [0.55, 16.62, 0.72]]), 0.012, 0.006);
    A('cerebral-arteries', m([[0.3, 16.09, -0.18], [0.5, 16.2, -0.3], [0.62, 16.4, -0.25]]), 0.016, 0.008);
    A('cerebral-arteries', m([[0.14, 17.16, 0.08], [0.2, 17.3, 0.15], [0.28, 17.38, 0.1]]), 0.012, 0.006);
    V('jugular-veins', m([[0.5, 15.49, 0.07], [0.62, 15.3, 0.2], [0.7, 15.0, 0.25]]), 0.02, 0.012);
    V('jugular-veins', m([[0.53, 15.03, 0.12], [0.75, 14.9, 0.22], [0.95, 14.7, 0.28]]), 0.028, 0.014);
    V('brachiocephalic-veins', m([[0.56, 14.52, 0.15], [0.8, 14.6, 0.3], [1.0, 14.5, 0.35]]), 0.025, 0.012);
    A('subclavian-arteries', m([[0.85, 14.46, -0.01], [0.9, 14.2, -0.3], [0.85, 13.9, -0.5]]), 0.025, 0.012);
    A('subclavian-arteries', m([[0.85, 14.46, -0.01], [1.0, 14.6, 0.2], [1.15, 14.7, 0.3]]), 0.022, 0.01);
  }
  // --- рука: мышечные, возвратные, межкостные ---
  for (const s of [1, -1] as const) {
    const sx = s === 1 ? 1 : -1;
    A('arm-arteries', [[sx * 1.75, 12.5, -0.1], [sx * 1.95, 12.2, 0.05], [sx * 2.0, 11.9, 0.15]], 0.018, 0.008);
    A('arm-arteries', [[sx * 1.85, 10.9, -0.12], [sx * 2.0, 10.6, -0.05], [sx * 2.05, 10.3, 0.0]], 0.014, 0.007);
    A('arm-arteries', [[sx * 2.0, 9.5, -0.15], [sx * 2.1, 9.2, -0.05], [sx * 2.12, 8.9, 0.05]], 0.013, 0.006);
    V('arm-veins', [[sx * 1.9, 12.0, 0.1], [sx * 2.1, 11.7, 0.2], [sx * 2.15, 11.3, 0.22]], 0.02, 0.01);
    V('arm-veins', [[sx * 2.02, 10.42, 0.15], [sx * 2.2, 10.1, 0.2], [sx * 2.25, 9.7, 0.18]], 0.018, 0.009);
    for (let f = 0; f < 3; f++) {
      A('hand-arteries', [[sx * 2.1, 8.2 - f * 0.15, 0.0], [sx * 2.2, 8.0 - f * 0.15, 0.1], [sx * 2.25, 7.8 - f * 0.15, 0.12]], 0.01, 0.005);
      V('arm-veins', [[sx * 2.1, 8.1 - f * 0.15, 0.05], [sx * 2.22, 7.9 - f * 0.15, 0.12], [sx * 2.3, 7.7 - f * 0.15, 0.14]], 0.011, 0.006);
    }
  }
  // --- почки: сегментарные веера ---
  for (const s of [1, -1] as const) {
    const sx = s === 1 ? 1 : -1;
    for (let k = -2; k <= 2; k++) {
      A('renal-arteries', [[sx * 0.9, 10.66, -0.59], [sx * 1.05, 10.66 + k * 0.09, -0.55], [sx * 1.18, 10.6 + k * 0.14, -0.45]], 0.013, 0.006);
      V('renal-veins', [[sx * 1.15, 10.6 + k * 0.12, -0.44], [sx * 0.95, 10.58 + k * 0.08, -0.4], [sx * 0.28, 10.6, -0.26]], 0.014, 0.01);
    }
    A('renal-arteries', [[0.26, 10.62, -0.2], [sx * 0.5, 10.9, -0.4], [sx * 0.62, 11.1, -0.45]], 0.012, 0.006);
  }
  // --- таз: запирательные, ягодичные ---
  for (const s of [1, -1] as const) {
    const sx = s === 1 ? 1 : -1;
    A('iliac-arteries', [[sx * 0.6, 9.5, -0.1], [sx * 0.85, 9.3, -0.35], [sx * 1.0, 9.0, -0.5]], 0.025, 0.01);
    A('iliac-arteries', [[sx * 0.55, 9.2, -0.4], [sx * 0.7, 8.9, -0.6], [sx * 0.85, 8.7, -0.65]], 0.022, 0.009);
    V('iliac-veins', [[sx * 0.95, 9.0, -0.5], [sx * 0.75, 9.3, -0.3], [sx * 0.5, 9.65, -0.1]], 0.024, 0.012);
  }
  // --- нога: прободающие, коленные, малоберцовые, сафены ---
  for (const s of [1, -1] as const) {
    const sx = s === 1 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const y = 7.5 - k * 1.1;
      A('leg-arteries', [[sx * 0.85, y, 0.2], [sx * 1.0, y - 0.1, 0.3], [sx * 1.05, y - 0.2, 0.35]], 0.012, 0.006);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      A('leg-arteries', [[sx * 0.6, 5.0, -0.1], [sx * (0.6 + 0.22 * Math.cos(a)), 4.9 + 0.14 * Math.sin(a), -0.1 + 0.18 * Math.sin(a)], [sx * (0.6 + 0.3 * Math.cos(a)), 4.85 + 0.2 * Math.sin(a), -0.05 + 0.25 * Math.sin(a)]], 0.011, 0.005);
    }
    A('leg-arteries', [[sx * 0.62, 4.28, -0.2], [sx * 0.78, 3.9, -0.35], [sx * 0.8, 3.4, -0.4]], 0.02, 0.009);
    V('leg-veins', [[sx * 0.6, 1.0, 0.3], [sx * 0.5, 2.5, 0.42], [sx * 0.55, 4.0, 0.4]], 0.028, 0.014);
    V('leg-veins', [[sx * 0.67, 0.28, 1.04], [sx * 0.55, 0.5, 0.7], [sx * 0.5, 1.5, 0.45]], 0.02, 0.01);
    for (let f = 0; f < 3; f++) {
      V('leg-veins', [[sx * (0.6 + f * 0.1), 0.15, 1.6], [sx * (0.58 + f * 0.1), 0.3, 1.3], [sx * 0.62, 0.5, 0.9]], 0.009, 0.005);
    }
    V('leg-veins', [[sx * 0.55, 5.39, -0.06], [sx * 0.75, 5.2, 0.2], [sx * 0.8, 5.0, 0.35]], 0.018, 0.009);
  }
  // --- печень/воротная: долевые и сегментарные ---
  V('portal-vein', [[-0.28, 11.1, 0.38], [0.0, 11.25, 0.35], [0.35, 11.35, 0.25]], 0.03, 0.014);
  V('portal-vein', [[-0.28, 11.1, 0.38], [-0.5, 11.2, 0.4], [-0.75, 11.3, 0.45]], 0.028, 0.013);
  V('hepatic-veins', [[-0.39, 11.78, -0.29], [-0.6, 11.85, -0.2], [-0.8, 11.9, -0.05]], 0.03, 0.012);
  V('hepatic-veins', [[-0.39, 11.78, -0.29], [-0.2, 11.85, -0.15], [0.0, 11.9, 0.0]], 0.028, 0.011);
  // --- стопа: плюсневые и пальцевые дуги ---
  for (const s of [1, -1] as const) {
    const sx = s === 1 ? 1 : -1;
    for (let f = 0; f < 4; f++) {
      A('foot-arteries', [[sx * 0.65, 0.2, 1.0], [sx * (0.55 + f * 0.1), 0.14, 1.4], [sx * (0.55 + f * 0.1), 0.11, 1.7]], 0.008, 0.004);
    }
  }
  return out;
}

export const VESSELS: Vessel[] = [
  ...systemicArteries.map((p): Vessel => ({ ...p, group: ARTERY_GROUP, blood: 'oxygenated' })),
  ...systemicVeins.map((p): Vessel => ({ ...p, group: VEIN_GROUP, blood: 'deoxygenated' })),
  ...detailVessels(),
  ...pulmonary(),
  ...microcirculation(),
];

/** Разнос при explode: артерии вправо-вверх, вены влево-вниз, малый круг к лёгким, микро остаётся. */
export function spreadOf(id: string, group: string): [number, number, number] {
  if (group === MICRO_GROUP) return [0, 0, 0];
  if (group === LUNG_GROUP) return id.includes('vein') || id.includes('ven') ? [0.35, 0.35, -0.5] : [-0.35, 0.4, -0.45];
  if (group === HEART_GROUP) return [0, 0.15, 0.55];
  switch (id) {
    case 'aorta': return [0.55, 0.1, 0];
    case 'brachiocephalic-trunk': return [0.3, 0.9, 0.1];
    case 'carotid-arteries': return [0.5, 1.1, 0.1];
    case 'facial-arteries': return [0.75, 1.25, 0.35];
    case 'cerebral-arteries': return [0.35, 1.45, -0.25];
    case 'subclavian-arteries': return [0.85, 0.6, 0];
    case 'arm-arteries': return [1.15, 0.1, 0];
    case 'hand-arteries': return [1.35, -0.35, 0.1];
    case 'visceral-arteries': return [0.6, -0.1, 0.2];
    case 'renal-arteries': return [0.7, -0.05, -0.25];
    case 'iliac-arteries': return [0.5, -0.7, 0.1];
    case 'leg-arteries': return [0.55, -0.9, 0];
    case 'foot-arteries': return [0.6, -1.2, 0.35];
    case 'vena-cava-superior': return [-0.55, 0.5, 0];
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
};
