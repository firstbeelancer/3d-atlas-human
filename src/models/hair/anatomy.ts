import { Vector3 } from 'three';
import { curveOf, lerp, smooth, type V3 } from './geometry';

/*
  Волосы и ногти — четыре сцены общей модели (единицы условные, масштаб подобран для обзора):
  - follicle: блок кожи (около 18 мм шириной в масштабе ×0,4) с косым волосяным фолликулом, железой и мышцей;
  - shaft:    волос под электронным микроскопом, ступенчатый срез: кутикула, кора, макрофибриллы, филаменты;
  - cycle:    три фолликула рядом: анаген, катаген, телоген;
  - nail:     кончик пальца в миллиметрах: ногтевой аппарат, кость, сухожилия, сосуды, нервы.
*/

export type SceneId = 'follicle' | 'shaft' | 'cycle' | 'nail';
export type CutKind = 'side' | 'fundus' | 'coronal';

export const CUT_DEFAULT_T: Record<CutKind, number> = { side: 0.5, fundus: 0.5, coronal: 0.5 };

/* ───────────────────────────── Фолликул ───────────────────────────── */

/** Ось фолликула от устья до дна луковицы (в плоскости z = 0, косо вниз и к -x). */
export const AX_PTS: V3[] = [
  [4.0, 0, 0],
  [3.55, -1.2, 0],
  [3.05, -2.6, 0],
  [2.55, -4.0, 0],
  [2.1, -5.4, 0],
  [1.8, -6.5, 0],
  [1.7, -7.2, 0],
];
export const AX = curveOf(AX_PTS);
export const axisAt = (u: number): V3 => {
  const p = AX.getPoint(Math.min(1, Math.max(0, u)));
  return [p.x, p.y, p.z];
};
export const axisDir = (u: number): V3 => {
  const t = AX.getTangent(Math.min(1, Math.max(0, u)));
  return [t.x, t.y, t.z];
};

/** Стержень над кожей: уходит вверх и ложится дугой. */
export const HAIR_UP_PTS: V3[] = [
  [4.0, 0, 0],
  [4.4, 1.3, 0],
  [5.3, 2.7, 0],
  [6.9, 3.9, 0],
  [9.0, 4.5, 0],
  [11.3, 4.2, 0],
  [13.2, 3.2, 0],
];
export const HAIR_UP = curveOf(HAIR_UP_PTS);

/** Границы слоёв кожи по y (поверхность — 0). */
export const SK = {
  x0: -9,
  x1: 9,
  hz: 5.2,
  corneum: -0.16,
  epi: -0.62,
  papillary: -1.9,
  reticular: -5.2,
  bottom: -9.6,
};
const ridge = (x: number, z: number) => (0.5 + 0.5 * Math.sin(x * 2.6)) * (0.5 + 0.5 * Math.sin(z * 2.3 + 1));
/** Нижняя граница эпидермиса с эпидермальными гребнями. */
export const epiBottom = (x: number, z: number): number => SK.epi - 0.24 * ridge(x, z);

const bulbK = (u: number) => smooth(0.78, 0.95, u);
const funnel = (u: number) => (u < 0.15 ? (1 - u / 0.15) ** 2 : 0);

/** Наружные радиусы слоёв фолликула как функции положения вдоль оси (0 — устье, 1 — дно). */
export const R = {
  ct: (u: number) => 0.98 + 0.74 * bulbK(u) + 0.9 * funnel(u),
  glassy: (u: number) => R.ct(u) - 0.1,
  ors: (u: number) => R.ct(u) - 0.12,
  infundibulum: (u: number) => R.ct(u) - 0.1,
  companion: (u: number) => 0.52 + 0.5 * bulbK(u),
  henle: (u: number) => 0.47 + 0.45 * bulbK(u),
  huxley: (u: number) => 0.39 + 0.32 * bulbK(u),
  irsCuticle: (u: number) => 0.32 + 0.18 * bulbK(u),
  cuticle: () => 0.27,
  cortex: () => 0.22,
  medulla: () => 0.075,
  bulb: (u: number) => 0.5 + 0.72 * bulbK(u),
  matrix: (u: number) => 0.36 + 0.58 * bulbK(u),
  bulge: (u: number) => R.ors(u) + 0.1 * Math.sin(Math.PI * smooth(0.3, 0.46, u)) ** 2 * (u > 0.3 && u < 0.46 ? 1 : 0),
};

/** Ключевые положения вдоль оси. */
export const U = {
  duct: 0.14,
  irsStart: 0.3,
  bulgeA: 0.33,
  bulgeB: 0.45,
  keratogenous: 0.78,
  rootEnd: 0.865,
  irsEnd: 0.9,
};

/** Папилла: эллипсоид у дна луковицы. */
export const PAPILLA: { c: V3; r: V3 } = { c: [1.7, -7.45, 0], r: [0.56, 0.86, 0.56] };

/** Мышца, поднимающая волос: от выпуклости фолликула к сосочковому слою. */
export const ARRECTOR = {
  from: ((): V3 => {
    const p = axisAt(0.4);
    return [p[0] - 0.9, p[1], 0];
  })(),
  to: [-3.1, -1.05, 0] as V3,
};

/* ───────────────────────────── Сечения ───────────────────────────── */

export function cutPlane(scene: SceneId, kind: CutKind, t: number): { n: V3; c: number } {
  switch (scene) {
    case 'follicle': {
      if (kind === 'side') return { n: [0, 0, -1], c: 5.2 * (1 - 2 * t) };
      if (kind === 'fundus') {
        const u = lerp(0.04, 0.97, t);
        const q = axisAt(u);
        const d = axisDir(u);
        return { n: d, c: -(d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) };
      }
      return { n: [0, -1, 0], c: lerp(0.4, -9.6, t) };
    }
    case 'cycle':
      if (kind === 'side') return { n: [0, 0, -1], c: 5.2 * (1 - 2 * t) };
      if (kind === 'fundus') return { n: [-1, 0, 0], c: lerp(10.5, -10.5, t) };
      return { n: [0, -1, 0], c: lerp(0.4, -9.6, t) };
    case 'shaft':
      if (kind === 'side') return { n: [0, 0, -1], c: 2.6 * (1 - 2 * t) };
      if (kind === 'fundus') return { n: [-1, 0, 0], c: lerp(9, -8, t) };
      return { n: [0, -1, 0], c: lerp(2.6, -2.6, t) };
    case 'nail':
      if (kind === 'side') return { n: [0, 0, -1], c: 7.4 * (1 - 2 * t) };
      if (kind === 'fundus') return { n: [-1, 0, 0], c: lerp(26, -14, t) };
      return { n: [0, -1, 0], c: lerp(6.2, -6, t) };
  }
}

/* ───────────────────────────── Ноготь и палец ───────────────────────────── */

export const FING = { x0: -14, x1: 22, cap: 3.3, tipX: 25.3 };

export const nailPlate = {
  x0: 0.8,
  x1: 26.4,
  hw: 5.0,
  rootEnd: 5.6,
  lunulaEnd: 9.6,
  bodyEnd: 22.0,
  top: 3.95,
  thick: 0.5,
};

/** Верх пластины: слегка выгнута поперёк (края опущены) и загнута книзу у свободного края. */
export const plateTop = (x: number, z: number): number => nailPlate.top - 0.55 * (z / nailPlate.hw) ** 2 - 0.011 * Math.max(0, x - 22) ** 1.6 * 0.5;
export const plateBottom = (x: number, z: number): number => plateTop(x, z) - nailPlate.thick;

/** Верх кожи пальца: спинка, ступенька у проксимального валика, ложе ногтя, подушечка. */
export const fingerTop = (x: number): number => {
  const step = smooth(5.1, 5.9, x);
  const bed = 3.3 - 0.01 * Math.max(0, x - 7.6);
  return lerp(4.6, bed, step);
};
export const fingerBottom = (x: number): number => -4.4 + 0.5 * smooth(6, 22, x) - 0.15 * smooth(-14, -6, x);
export const fingerHW = (x: number): number => 7.4 - 1.0 * smooth(-4, 21, x);
export const bedTop = (x: number, z: number): number => plateBottom(Math.min(x, 22), z) - 0.02;

/** Кость и сочленение. */
export const boneTop = (x: number): number => lerp(2.2, 1.45, smooth(0, 20, x));
export const boneBottom = (x: number): number => lerp(-2.0, 0.35, smooth(0, 19, x));
export const boneHW = (x: number): number => 5.1 - 2.4 * smooth(0, 9, x) + 1.9 * smooth(14, 20.5, x);

export const NAIL_VIEW = { x: 11, dist: 52 };

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const vec = (p: V3): Vector3 => new Vector3(...p);
