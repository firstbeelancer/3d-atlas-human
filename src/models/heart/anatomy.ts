/* Части сердца: подписи, полёт камеры, разнос при разборе и пути крови. Без three.js. */

import type { V3 } from '../lungs/sdf';
import { AORTIC_CENTER, LA_CENTER, LV_CENTER, MV_A, MV_B, PAPILLARY, PULM_CENTER, RA_CENTER, TV_A, TV_B, hw } from './field';

export type Vec = V3;

export const PART_IDS = [
  'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'septum',
  'aorta', 'aortic-arch-branches', 'pulmonary-trunk', 'pulmonary-arteries', 'superior-vena-cava', 'inferior-vena-cava', 'pulmonary-veins',
  'tricuspid-valve', 'mitral-valve', 'aortic-valve', 'pulmonary-valve', 'papillary-muscles', 'chordae-tendineae',
  'coronary-arteries', 'cardiac-veins', 'epicardial-fat', 'conduction-system',
] as const;

/** Части, которые видны только внутри сердца: выбор такой части открывает разрез. */
export const INTERIOR = new Set(['septum', 'tricuspid-valve', 'mitral-valve', 'aortic-valve', 'pulmonary-valve', 'papillary-muscles', 'chordae-tendineae']);

const mid = (a: V3, b: V3, t = 0.5): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface LabelCfg {
  at: Vec;
  main?: boolean;
  inner?: boolean;
}

export const LABEL_AT: Record<string, LabelCfg> = {
  'right-atrium': { at: [-1.4, 0.7, 0.0], main: true },
  'left-atrium': { at: hw(-0.25, 1.0, 0.4), main: true },
  'right-ventricle': { at: hw(0.9, -0.65, 1.0), main: true },
  'left-ventricle': { at: hw(1.25, 0.95, -0.1), main: true },
  aorta: { at: [0.2, 1.86, -0.45], main: true },
  'aortic-arch-branches': { at: [0.1, 2.3, -0.4] },
  'pulmonary-trunk': { at: [0.38, 1.22, 0.2], main: true },
  'pulmonary-arteries': { at: [1.2, 1.42, -0.8] },
  'superior-vena-cava': { at: [-1.0, 1.8, -0.25], main: true },
  'inferior-vena-cava': { at: [-1.0, -0.7, -0.4] },
  'pulmonary-veins': { at: [1.4, 1.12, -1.15] },
  'coronary-arteries': { at: hw(1.0, 0.1, 0.55) },
  'cardiac-veins': { at: hw(-0.04, 1.0, -0.2) },
  'epicardial-fat': { at: hw(0.14, -1.28, 0.1) },
  septum: { at: hw(1.0, -0.02, 0.2), inner: true },
  'tricuspid-valve': { at: mid(TV_A, TV_B), main: true, inner: true },
  'mitral-valve': { at: mid(MV_A, MV_B, 0.45), main: true, inner: true },
  'aortic-valve': { at: AORTIC_CENTER, inner: true },
  'pulmonary-valve': { at: PULM_CENTER, inner: true },
  'papillary-muscles': { at: PAPILLARY[0].tip, inner: true },
  'chordae-tendineae': { at: mid(PAPILLARY[1].tip, mid(MV_A, MV_B, 0.45), 0.5), inner: true },
  'conduction-system': { at: [-1.2, 1.0, -0.02], inner: true },
};

/** Куда летит камера при выборе части: центр и расстояние. */
export const FOCUS: Record<string, { at: Vec; dist: number }> = {
  'right-atrium': { at: [-1.0, 0.6, 0], dist: 6.5 },
  'left-atrium': { at: [0.5, 0.8, -0.6], dist: 7 },
  'right-ventricle': { at: [-0.1, -0.3, 0.5], dist: 7 },
  'left-ventricle': { at: [0.7, -0.5, 0], dist: 7 },
  septum: { at: [0.3, -0.3, 0.2], dist: 6 },
  aorta: { at: [0.3, 1.0, -0.4], dist: 8 },
  'aortic-arch-branches': { at: [0.2, 2.0, -0.4], dist: 6.5 },
  'pulmonary-trunk': { at: [0.3, 1.1, 0], dist: 6.5 },
  'pulmonary-arteries': { at: [0.3, 1.4, -0.5], dist: 9 },
  'superior-vena-cava': { at: [-1.0, 1.5, -0.2], dist: 7 },
  'inferior-vena-cava': { at: [-1.0, -0.3, -0.3], dist: 7.5 },
  'pulmonary-veins': { at: [0.1, 0.8, -1.0], dist: 8.5 },
  'tricuspid-valve': { at: mid(TV_A, TV_B), dist: 4.5 },
  'mitral-valve': { at: mid(MV_A, MV_B, 0.45), dist: 4.5 },
  'aortic-valve': { at: AORTIC_CENTER, dist: 4 },
  'pulmonary-valve': { at: PULM_CENTER, dist: 4 },
  'papillary-muscles': { at: LV_CENTER, dist: 5 },
  'chordae-tendineae': { at: [0.1, -0.1, 0], dist: 5 },
  'coronary-arteries': { at: [0.1, 0.0, 0.5], dist: 7 },
  'cardiac-veins': { at: [0.3, 0.2, -0.4], dist: 7.5 },
  'epicardial-fat': { at: [0.1, 0.0, 0.4], dist: 7 },
  'conduction-system': { at: [-0.3, 0.1, 0], dist: 6 },
};

/** Разнос на части при разборе: вектор смещения в мировых координатах. */
export function spreadOf(part: string): Vec {
  switch (part) {
    case 'right-atrium': return [-1.1, 0.5, 0.2];
    case 'left-atrium': return [0.5, 0.7, -1.3];
    case 'right-ventricle': return [-0.9, -0.5, 0.9];
    case 'left-ventricle': return [1.1, -0.5, -0.1];
    case 'septum': return [0.0, -0.9, 0.5];
    case 'aorta': return [0.3, 1.3, -0.3];
    case 'aortic-arch-branches': return [0.2, 1.9, -0.3];
    case 'pulmonary-trunk': return [0.8, 1.0, 0.5];
    case 'pulmonary-arteries': return [0.6, 1.4, -0.5];
    case 'superior-vena-cava': return [-1.4, 1.2, 0];
    case 'inferior-vena-cava': return [-1.4, -1.0, -0.2];
    case 'pulmonary-veins': return [0.9, 0.9, -1.8];
    case 'tricuspid-valve': return [-1.4, -0.1, 1.5];
    case 'mitral-valve': return [1.3, -0.1, -0.2];
    case 'aortic-valve': return [-0.2, 0.9, 0.8];
    case 'pulmonary-valve': return [1.0, 0.7, 1.4];
    case 'papillary-muscles': return [0.4, -1.4, 0.3];
    case 'chordae-tendineae': return [0.1, -1.0, 0.1];
    case 'coronary-arteries': return [0.3, -0.2, 1.5];
    case 'cardiac-veins': return [0.7, 0.1, -1.0];
    case 'epicardial-fat': return [-0.4, -0.2, 1.2];
    case 'conduction-system': return [-0.3, -0.6, 0.6];
    default: return [0, 0, 0];
  }
}

/** Части, которые остаются видимыми вместе с выбранной (при «рассмотреть отдельно»). */
export const ALSO: Record<string, string[]> = {
  'coronary-arteries': ['epicardial-fat'],
  chambers: ['right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'septum'],
  vessels: ['aorta', 'aortic-arch-branches', 'pulmonary-trunk', 'pulmonary-arteries', 'superior-vena-cava', 'inferior-vena-cava', 'pulmonary-veins'],
  valves: ['tricuspid-valve', 'mitral-valve', 'aortic-valve', 'pulmonary-valve', 'papillary-muscles', 'chordae-tendineae'],
  own: ['coronary-arteries', 'cardiac-veins', 'epicardial-fat', 'conduction-system'],
};

/** Пути крови: правая половина (синяя) и левая (красная), в мировых координатах. */
export const FLOW_BLUE: V3[][] = [
  [[-1.0, 2.0, -0.25], [-0.98, 1.2, -0.2], RA_CENTER, mid(TV_A, TV_B), hw(0.7, -0.55, 0.55), hw(0.2, -0.2, 0.6), PULM_CENTER, [0.3, 1.25, 0.05], [0.3, 1.5, -0.35], [0.7, 1.5, -0.58], [1.3, 1.38, -0.85]],
  [[-0.97, -0.95, -0.44], [-0.98, -0.3, -0.34], [-0.98, 0.2, -0.28], RA_CENTER, mid(TV_A, TV_B), hw(0.8, -0.6, 0.4), hw(0.2, -0.2, 0.6), PULM_CENTER, [0.3, 1.25, 0.05], [0.3, 1.5, -0.35], [-0.2, 1.46, -0.58], [-1.2, 1.3, -0.78]],
];
export const FLOW_RED: V3[][] = [
  [[1.45, 1.12, -1.18], [0.95, 1.05, -1.08], [0.45, 0.98, -0.98], LA_CENTER, mid(MV_A, MV_B, 0.45), hw(1.0, 0.3, -0.2), hw(0.4, 0.1, -0.1), AORTIC_CENTER, [-0.16, 1.0, -0.09], [-0.19, 1.38, -0.12], [-0.05, 1.7, -0.28], [0.38, 1.8, -0.55], [0.76, 1.55, -0.82], [0.86, 0.95, -0.98], [0.86, 0.1, -1.08]],
  [[1.5, 0.4, -1.22], [1.0, 0.45, -1.1], [0.5, 0.5, -1.0], LA_CENTER, mid(MV_A, MV_B, 0.45), hw(1.0, 0.3, -0.2), hw(0.4, 0.1, -0.1), AORTIC_CENTER, [-0.16, 1.0, -0.09], [-0.19, 1.38, -0.12], [-0.05, 1.7, -0.28], [0.38, 1.8, -0.55], [0.76, 1.55, -0.82], [0.86, 0.95, -0.98], [0.86, 0.1, -1.08]],
];

/** Плоскости разреза в мировых координатах уже заданы в field.ts (cutPlane). */
