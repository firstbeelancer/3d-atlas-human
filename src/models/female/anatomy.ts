import { Vector3 } from 'three';
import { curveOf, profile, smooth, type V3 } from './geometry';

/*
  Женский таз спереди: +x — налево от зрителя (правая сторона пациентки: x < 0), +y — вверх, +z — к лобку.
  Единица — сантиметр. Матка наклонена вперёд (anteversio / anteflexio), влагалище идёт вниз и вперёд.
*/

export const SIDES = [-1, 1] as const;
export type Side = -1 | 1;

/* ---------- матка ---------- */

/** Ось матки от наружного зева (s = 0) до дна (s = 1). */
export const UTERUS_AXIS = curveOf([
  [0, -3.3, -0.5],
  [0, -2.0, -0.3],
  [0, -0.4, -0.05],
  [0, 0.9, 0.05],
  [0, 2.6, 0.2],
  [0, 4.2, 0.3],
  [0, 5.3, 0.36],
]);

export const S = { cervixEnd: 0.33, isthmusEnd: 0.41, bodyEnd: 0.84, internalOs: 0.37, cavityTop: 0.895 } as const;

export const uterusOuterX = profile([[0, 0.62], [0.025, 0.95], [0.1, 1.15], [0.22, 1.28], [0.31, 1.2], [0.37, 1.1], [0.43, 1.3], [0.52, 1.65], [0.62, 2.0], [0.72, 2.2], [0.8, 2.3], [0.87, 2.2], [0.93, 1.8], [0.97, 1.1], [0.992, 0.5], [1, 0]]);
export const uterusOuterZ = profile([[0, 0.58], [0.025, 0.88], [0.1, 1.05], [0.22, 1.1], [0.31, 1.05], [0.37, 1.0], [0.43, 1.08], [0.55, 1.2], [0.7, 1.2], [0.8, 1.15], [0.88, 1.05], [0.94, 0.85], [0.98, 0.5], [1, 0]]);
/** Внутренняя граница миометрия: канал шейки и полость матки (треугольник на фронтальном срезе). */
export const uterusInnerX = profile([[0, 0.2], [0.04, 0.26], [0.18, 0.36], [0.3, 0.3], [0.37, 0.16], [0.4, 0.17], [0.46, 0.4], [0.56, 0.85], [0.66, 1.2], [0.74, 1.5], [0.8, 1.62], [0.835, 1.62], [0.86, 1.3], [0.88, 0.7], [0.895, 0]]);
export const uterusInnerZ = profile([[0, 0.18], [0.04, 0.24], [0.18, 0.32], [0.3, 0.26], [0.37, 0.13], [0.4, 0.13], [0.5, 0.3], [0.6, 0.4], [0.7, 0.42], [0.8, 0.42], [0.86, 0.36], [0.895, 0]]);

/** Толщина эндометрия, см: самая тонкая (менструация) и самая толстая (вторая половина цикла). */
export const ENDO_MIN = 0.05;
export const ENDO_MAX = 0.3;

/* ---------- влагалище ---------- */

/** Ось влагалища от входа (s = 0) до свода (s = 1). */
export const VAGINA_AXIS = curveOf([
  [0, -12.2, 1.5],
  [0, -10.0, 1.0],
  [0, -7.5, 0.55],
  [0, -5.0, 0.2],
  [0, -3.2, 0.05],
  [0, -1.3, -0.05],
]);
export const VAGINA_FORNIX_S = 0.82;
export const VAGINA_CEILING_S = 0.957;
export const vaginaOuterX = profile([[0, 1.3], [0.1, 1.45], [0.3, 1.55], [0.55, 1.6], [0.75, 1.75], [0.85, 2.25], [0.92, 2.6], [0.94, 2.55], [0.975, 2.3], [0.992, 1.5], [1, 0]]);
export const vaginaOuterZ = profile([[0, 0.9], [0.3, 1.1], [0.55, 1.15], [0.75, 1.25], [0.85, 1.6], [0.92, 2.1], [0.975, 1.8], [0.992, 1.2], [1, 0]]);
export const vaginaInnerX = profile([[0, 0.9], [0.1, 1.0], [0.3, 1.1], [0.55, 1.2], [0.75, 1.35], [0.85, 1.8], [0.93, 2.1], [0.948, 1.9], [0.957, 1.0], [0.96, 0]]);
export const vaginaInnerZ = profile([[0, 0.35], [0.3, 0.5], [0.55, 0.55], [0.75, 0.65], [0.85, 1.1], [0.92, 1.5], [0.95, 1.4], [0.96, 0]]);

/* ---------- маточные трубы ---------- */

export function tubeAxis(side: Side) {
  const pts: V3[] = [
    [1.55, 3.88, 0.3], [2.3, 4.05, 0.32], [3.1, 4.3, 0.3], [3.9, 4.7, 0.2], [4.8, 5.0, 0.0],
    [5.8, 4.9, -0.3], [6.5, 4.3, -0.5], [6.8, 3.3, -0.65], [6.7, 2.4, -0.7], [6.4, 1.8, -0.65],
  ];
  return curveOf(pts.map(([x, y, z]) => [x * side, y, z] as V3));
}
export const TUBE_S = { intramural: 0.09, isthmus: 0.27, ampulla: 0.8 } as const;
export const tubeOuter = profile([[0, 0.4], [0.07, 0.38], [0.1, 0.24], [0.2, 0.22], [0.27, 0.27], [0.4, 0.4], [0.6, 0.55], [0.78, 0.66], [0.84, 0.72], [0.93, 0.9], [1, 1.05]]);
export const tubeInner = profile([[0, 0.05], [0.09, 0.05], [0.12, 0.05], [0.27, 0.07], [0.4, 0.16], [0.6, 0.26], [0.78, 0.34], [0.84, 0.42], [0.93, 0.62], [1, 0.82]]);

/* ---------- яичники и фолликулы ---------- */

export const OVARY_CENTER = (side: Side): V3 => [5.3 * side, 2.2, -0.25];
export const OVARY_RADII: V3 = [0.8, 1.55, 0.62];

export type FollicleKind = 'primary' | 'secondary' | 'antral' | 'graafian' | 'luteum' | 'albicans';
export interface FollicleDef {
  id: string;
  kind: FollicleKind;
  /** Положение относительно центра яичника и размер (радиус наружной оболочки). */
  at: V3;
  r: number;
  ovary: Side;
}

/** Яичник «А» (справа у пациентки, слева на экране) проживает цикл; яичник «Б» показывает все стадии разом. */
export const CYCLE_SIDE: Side = -1;
export const REST_SIDE: Side = 1;

export const FOLLICLES: FollicleDef[] = [
  { id: 'a-graafian', kind: 'graafian', at: [-0.42, 0.25, 0.28], r: 0.6, ovary: CYCLE_SIDE },
  { id: 'a-luteum', kind: 'luteum', at: [-0.42, 0.25, 0.26], r: 0.56, ovary: CYCLE_SIDE },
  { id: 'a-albicans', kind: 'albicans', at: [-0.38, 0.0, 0.2], r: 0.3, ovary: CYCLE_SIDE },
  { id: 'a-antral1', kind: 'antral', at: [0.3, 0.88, 0.22], r: 0.3, ovary: CYCLE_SIDE },
  { id: 'a-antral2', kind: 'antral', at: [0.28, -0.82, 0.24], r: 0.26, ovary: CYCLE_SIDE },
  { id: 'a-sec1', kind: 'secondary', at: [-0.3, -0.68, 0.34], r: 0.17, ovary: CYCLE_SIDE },
  { id: 'a-sec2', kind: 'secondary', at: [0.1, 0.4, 0.5], r: 0.15, ovary: CYCLE_SIDE },
  { id: 'a-pri1', kind: 'primary', at: [0.35, 0.1, 0.4], r: 0.1, ovary: CYCLE_SIDE },
  { id: 'a-pri2', kind: 'primary', at: [-0.2, 1.1, 0.25], r: 0.09, ovary: CYCLE_SIDE },
  { id: 'a-pri3', kind: 'primary', at: [-0.1, -1.1, 0.2], r: 0.09, ovary: CYCLE_SIDE },
  { id: 'b-albicans', kind: 'albicans', at: [0.25, -0.35, 0.28], r: 0.28, ovary: REST_SIDE },
  { id: 'b-antral1', kind: 'antral', at: [-0.32, 0.45, 0.28], r: 0.34, ovary: REST_SIDE },
  { id: 'b-antral2', kind: 'antral', at: [0.22, 0.95, 0.2], r: 0.24, ovary: REST_SIDE },
  { id: 'b-sec1', kind: 'secondary', at: [0.3, 0.3, 0.42], r: 0.18, ovary: REST_SIDE },
  { id: 'b-sec2', kind: 'secondary', at: [-0.3, -0.7, 0.3], r: 0.16, ovary: REST_SIDE },
  { id: 'b-pri1', kind: 'primary', at: [0.1, 0.0, 0.5], r: 0.1, ovary: REST_SIDE },
  { id: 'b-pri2', kind: 'primary', at: [-0.2, 1.15, 0.2], r: 0.09, ovary: REST_SIDE },
  { id: 'b-pri3', kind: 'primary', at: [0.28, -1.0, 0.18], r: 0.09, ovary: REST_SIDE },
  { id: 'b-pri4', kind: 'primary', at: [-0.05, -0.3, 0.52], r: 0.08, ovary: REST_SIDE },
];

/* ---------- цикл: всё привязано к фазе 0..1 (28 «дней») ---------- */

export const CYCLE_SECONDS = 42;
export const phaseOf = (time: number): number => ((time % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS / CYCLE_SECONDS;
export const dayOf = (phase: number): number => Math.min(28, Math.floor(phase * 28) + 1);

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';
export function phaseName(phase: number): CyclePhase {
  if (phase < 0.18) return 'menstrual';
  if (phase < 0.45) return 'follicular';
  if (phase < 0.56) return 'ovulation';
  return 'luteal';
}

/** Толщина эндометрия: тонкий в менструацию, растёт до овуляции и ещё сильнее — после, перед месячными быстро сбрасывается. */
export function endometriumThickness(phase: number): number {
  const rise = smooth(0.12, 0.5, phase);
  const secretory = smooth(0.5, 0.78, phase);
  const shed = smooth(0.9, 1.0, phase) + (phase < 0.08 ? 1 - smooth(0.0, 0.08, phase) : 0);
  const t = ENDO_MIN + 0.4 * (ENDO_MAX - ENDO_MIN) * rise + 0.6 * (ENDO_MAX - ENDO_MIN) * secretory;
  return Math.max(ENDO_MIN, t - (t - ENDO_MIN) * Math.min(1, shed));
}

export function follicleScale(f: FollicleDef, phase: number): number {
  if (f.ovary !== CYCLE_SIDE) return f.kind === 'albicans' ? 1 : 1;
  switch (f.id) {
    case 'a-graafian':
      return phase < 0.49 ? 0.28 + 0.72 * smooth(0.05, 0.48, phase) : 0.0001;
    case 'a-luteum':
      return phase < 0.5 ? 0.0001 : Math.max(0.0001, smooth(0.5, 0.6, phase) * (1 - 0.45 * smooth(0.8, 0.98, phase)));
    case 'a-albicans':
      return Math.max(0.0001, smooth(0.9, 1, phase) * 0.8 + (phase < 0.3 ? 0.8 * (1 - smooth(0.05, 0.3, phase)) : 0));
    case 'a-antral1':
    case 'a-antral2':
      return 0.55 + 0.45 * smooth(0.05, 0.4, phase) - 0.5 * smooth(0.45, 0.8, phase);
    default:
      return 0.85 + 0.15 * Math.sin(phase * Math.PI * 2 + f.r * 30);
  }
}

/* ---------- сосуды, нервы: линии ---------- */

export const mirror = (pts: V3[], side: Side): V3[] => pts.map(([x, y, z]) => [x * side, y, z] as V3);

export const PELVIS_CENTER = new Vector3(0, -1.5, 0.4);

/* ---------- сводка для камеры ---------- */

export const OVERVIEW = { at: [0, -1.6, 0.4] as V3, dir: [0.22, 0.12, 0.97] as V3, dist: 45 };
export const SIDE_VIEW = { at: [0, -1.4, 0.4] as V3, dir: [0.97, 0.12, 0.22] as V3, dist: 41 };
export const TOP_VIEW = { at: [0, 0.5, 0.2] as V3, dir: [0.1, 0.95, 0.35] as V3, dist: 30 };

/** Диапазоны плоскостей среза: [min, max] по оси и положение по умолчанию (0..1). */
export const CUTS = {
  side: { axis: 2 as const, min: -3.2, max: 4.2 },
  fundus: { axis: 1 as const, min: -12.4, max: 6.0 },
  coronal: { axis: 0 as const, min: -8.4, max: 8.4 },
};
export const CUT_DEFAULT_T = { side: (0.1 - -3.2) / 7.4, fundus: (2.0 - -12.4) / 18.4, coronal: 0.5 };
