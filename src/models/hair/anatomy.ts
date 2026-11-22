import { Vector3 } from 'three';
import { curveOf, fbm, lerp, smooth, type V3 } from './geometry';

/*
  Сцены разделов «Волосы» и «Ногти» (масштаб подобран для обзора):
  - follicle: блок кожи (около 18 мм шириной в масштабе ×0,4) с косым волосяным фолликулом, железой и мышцей;
  - shaft:    волос под электронным микроскопом, ступенчатый срез: кутикула, кора, макрофибриллы, филаменты;
  - cycle:    три фолликула рядом: анаген, катаген, телоген;
  - nail:     кончик пальца в миллиметрах: ногтевой аппарат, кость, сухожилия, сосуды, нервы.
*/

export type SceneId = 'follicle' | 'shaft' | 'cycle' | 'nail';
export type CutKind = 'side' | 'fundus' | 'coronal';

export const CUT_DEFAULT_T: Record<CutKind, number> = { side: 0.5, fundus: 0.5, coronal: 0.5 };

/* --------------------------------- Фолликул --------------------------------- */

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
  [4.49, 1.33, -0.18],
  [5.26, 3.01, -0.50],
  [6.35, 4.65, -0.92],
  [7.88, 6.13, -1.35],
  [9.70, 7.16, -1.73],
  [11.62, 7.78, -2.18],
];
export const HAIR_UP = curveOf(HAIR_UP_PTS);

/** Границы слоёв кожи по y (поверхность = 0). */
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

const ridge = (x: number, z: number) =>
  (0.5 + 0.5 * Math.sin(x * 2.6 + 0.4 * Math.cos(z * 1.4))) *
  (0.5 + 0.5 * Math.sin(z * 2.3 + 1.0 + 0.35 * Math.sin(x * 1.7))) *
  (0.82 + 0.36 * fbm(x * 0.9, 0, z * 0.9, 2));

/** Воронка устья волосяного фолликула (остиум) на поверхности кожи. */
export const poreDepression = (x: number, z: number, cx = 4.0): number => {
  const d2 = (x - cx) ** 2 + z ** 2;
  return -0.26 * Math.exp(-d2 / 0.72);
};

/** Нижняя граница эпидермиса с эпидермальными гребнями. */
export const epiBottom = (x: number, z: number): number => SK.epi - 0.26 * ridge(x, z) + poreDepression(x, z) * 0.45;

const bulbK = (u: number) => smooth(0.77, 0.99, u);
const funnel = (u: number) => (u < 0.16 ? (1 - u / 0.16) ** 2 : 0);

/** Наружные радиусы слоёв фолликула как функции положения вдоль оси (0 — устье, 1 — дно). */
export const R = {
  ct: (u: number) => 0.67 + 0.56 * bulbK(u) + 0.12 * funnel(u),
  glassy: (u: number) => R.ct(u) - 0.069,
  ors: (u: number) => R.glassy(u) - 0.028,
  infundibulum: (u: number) => R.ct(u) - 0.064,
  companion: (u: number) => 0.397 + 0.26 * bulbK(u),
  henle: (u: number) => 0.346 + 0.22 * bulbK(u),
  huxley: (u: number) => 0.277 + 0.19 * bulbK(u),
  irsCuticle: (u: number) => 0.204 + 0.13 * bulbK(u),
  cuticle: () => 0.173,
  cortex: () => 0.148,
  medulla: () => 0.038,
  bulge: (u: number) => R.ors(u) + 0.12 * Math.sin(Math.PI * smooth(0.3, 0.46, u)) ** 2 * (u > 0.3 && u < 0.46 ? 1 : 0),
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

/** Папилла: грушевидный сосочек у дна луковицы. */
export const PAPILLA: { c: V3; r: V3 } = { c: [1.7, -7.45, 0], r: [0.56, 0.88, 0.56] };
export const SEBACEOUS_DUCT: V3[] = [[1.0, -1.52, -0.13], [1.72, -1.39, -0.10], [2.47, -1.16, -0.055], [3.06, -1.08, 0], [3.45, -1.04, 0]];

/** Мышца, поднимающая волос: от выпуклости фолликула к сосочковому слою. */
export const ARRECTOR = {
  from: (() => {
    const p = axisAt(0.4);
    return [p[0] - 0.9, p[1], 0];
  })(),
  to: [-3.1, -1.05, 0] as V3,
};

/* --------------------------------- Сечения --------------------------------- */

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

/* --------------------------------- Ноготь и палец --------------------------------- */

export const FING = { x0: -14, x1: 22, cap: 3.1, tipX: 25.1 };

/**
  Скругление кончика пальца в плане (если смотреть на ноготь): палец шириной около 14 мм
  сходится к кончику дугой длиной около 6 мм, а не обрубается торцом. Профиль сбоку задаёт FING.cap.
*/
const TIP_ROUND = 6.2;
export const tipWidth = (x: number): number => {
  const t = Math.min(1, Math.max(0, (x - (FING.tipX - TIP_ROUND)) / TIP_ROUND));
  return Math.pow(1 - t ** 2.2, 1 / 2.2);
};

export const nailPlate = {
  x0: 2.6,
  x1: 25.9,
  hw: 5.35,
  rootEnd: 6.5,
  lunulaEnd: 9.8,
  bodyEnd: 23.25,
  top: 3.95,
  thick: 0.5,
};

/** Дистальные границы лунулы, ложа и пластинки выступают по центру. */
export const plateX = (x: number, across: number): number => {
  const root = 1.15 * (1 - smooth(2.6, 6.5, x));
  const crescent = 1.05 * smooth(6.5, 9.8, x) * (1 - smooth(9.8, 15.5, x));
  const tip = 1.5 * smooth(17, 25, x);
  return x + (root - crescent) * across ** 2 - tip * Math.abs(across) ** 4;
};

/** Полуширина ногтевой пластины с плавным анатомическим скруглением у корня и свободного края. */
export const plateHW = (x: number): number => {
  const rootRound = 0.74 + 0.23 * smooth(2.6, 8.3, x);
  const tipRound = 1 + 0.03 * smooth(8, 18, x) - 0.17 * smooth(21.8, 25.9, x);
  return nailPlate.hw * rootRound * tipRound;
};

/** Верх пластины: выгнута поперек и слегка загнута книзу у свободного края. */
export const plateTop = (x: number, z: number): number => {
  const across = z / nailPlate.hw;
  return nailPlate.top + 0.39 * Math.sin(smooth(2.6, 25.9, x) * Math.PI)
    - 0.79 * across ** 2 - 0.44 * across ** 4 - 0.53 * smooth(20.8, 26, x)
    + 0.09 * across;
};
export const plateBottom = (x: number, z: number): number =>
  plateTop(x, z) - nailPlate.thick * (1 - 0.12 * (z / nailPlate.hw) ** 2);

/** Рельеф над суставом, сужение диафиза и округлая ладонная подушечка. */
export const fingerTop = (x: number): number =>
  4.25 + 0.7 * Math.exp(-(((x + 3.3) / 3.7) ** 2)) - 0.37 * smooth(1, 18.5, x);
export const fingerBottom = (x: number): number =>
  -4.2 + 0.27 * Math.sin((x + 14) * 0.12) - 1.35 * smooth(1, 17, x);
export const fingerHW = (x: number): number =>
  6.78 + 0.85 * Math.exp(-(((x + 3.8) / 5) ** 2)) - 0.54 * smooth(0, 11, x) + 0.49 * smooth(11, 20, x);

/** Кость: дистальная фаланга с выраженной талией диафиза и расширенным основанием. */
export const boneTop = (x: number): number => lerp(2.2, 1.45, smooth(0, 20, x)) - 0.26 * Math.sin(Math.PI * smooth(3, 16, x));
export const boneBottom = (x: number): number => lerp(-2.0, 0.35, smooth(0, 19, x)) + 0.35 * Math.sin(Math.PI * smooth(2, 16, x));
export const boneHW = (x: number): number => 5.1 - 2.6 * smooth(0, 9.5, x) + 2.1 * smooth(14, 20.5, x);

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const vec = (p: V3): Vector3 => new Vector3(...p);
