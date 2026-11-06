import type { V3 } from './anatomy';

/** Масштаб модели: 1 мм анатомии = SCALE единиц сцены. */
export const SCALE = 0.13;

/** Фронтальный разрез («дно глаза») проходит по плоскости z = CUT_Z (мм). */
export const CUT_Z = 2.5;

/** Части модели глаза (id совпадают с пунктами «Из чего состоит») и их группы. */
export const EYE_GROUPS = {
  'g-outer': ['sclera', 'cornea', 'limbus', 'conjunctiva'],
  'g-uvea': ['iris', 'pupil', 'ciliary-muscle', 'ciliary-processes', 'choroid'],
  'g-media': ['aqueous', 'lens', 'lens-nucleus', 'zonule', 'vitreous'],
  'g-retina': ['pigment-epithelium', 'retina', 'macula', 'fovea', 'optic-disc', 'retinal-vessels'],
  'g-nerve': ['optic-nerve', 'optic-sheath'],
  'g-muscles': ['rectus-superior', 'rectus-inferior', 'rectus-medial', 'rectus-lateral', 'oblique-superior', 'oblique-inferior'],
} as const;

export type EyeGroupId = keyof typeof EYE_GROUPS;

export const EYE_PART_IDS: string[] = Object.values(EYE_GROUPS).flat();

export const GROUP_OF: Record<string, EyeGroupId> = Object.fromEntries(
  (Object.entries(EYE_GROUPS) as [EyeGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Части группы по id группы, либо сама часть. */
export function membersOf(id: string): readonly string[] {
  return (EYE_GROUPS as Record<string, readonly string[]>)[id] ?? [id];
}

/** Точка, на которую смотрит камера при выборе части, направление на камеру и расстояние (единицы сцены). */
export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}

export const OVERVIEW: Focus = { at: [0, 0, -3], dir: [0.46, 0.22, 0.86], dist: 11.4 };
/** Вид на разрез: сверху и немного спереди, чтобы была видна плоскость среза. */
export const CUT_VIEW: Focus = { at: [0, 0, -3], dir: [0.34, 1, 0.3], dist: 13.5 };
/** Вид сбоку для разноса: ось глаза идёт поперёк кадра, и все слои видны по очереди. */
export const SPREAD_VIEW: Focus = { at: [0, 0, -4], dir: [1, 0.3, 0.1], dist: 27 };
/** Вид на дно глаза через открытую переднюю часть. */
export const FUNDUS_VIEW: Focus = { at: [0, 0, -8], dir: [0.06, 0.05, 1], dist: 7.2 };

export const FOCUS: Record<string, Focus> = {
  cornea: { at: [0, 0, 11], dir: [0.55, 0.28, 0.8], dist: 4.4 },
  sclera: { at: [0, 0, -2], dir: [0.95, 0.3, 0.2], dist: 8.6 },
  limbus: { at: [0, 0, 10], dir: [0.2, 0.15, 1], dist: 5 },
  conjunctiva: { at: [0, 4, 8], dir: [0.4, 0.5, 0.75], dist: 6.4 },
  iris: { at: [0, 0, 9], dir: [0.14, 0.08, 1], dist: 4.2 },
  pupil: { at: [0, 0, 9], dir: [0.12, 0.06, 1], dist: 3.2 },
  'ciliary-muscle': { at: [0, 6.5, 6.5], dir: [0.3, 0.85, 0.6], dist: 5 },
  'ciliary-processes': { at: [0, 5.2, 7.5], dir: [0.1, 0.35, 1], dist: 4.4 },
  choroid: { at: [0, 0, -8], dir: [0.1, 0.05, 1], dist: 8.6 },
  aqueous: { at: [0, 0, 10], dir: [0.7, 0.35, 0.7], dist: 5.4 },
  lens: { at: [0, 0, 6.8], dir: [0.7, 0.45, 0.7], dist: 5 },
  'lens-nucleus': { at: [0, 0, 6.8], dir: [0.7, 0.45, 0.7], dist: 4.2 },
  zonule: { at: [0, 4, 7], dir: [0.15, 0.3, 1], dist: 4.4 },
  vitreous: { at: [0, 0, -2], dir: [0.8, 0.5, 0.7], dist: 9 },
  'pigment-epithelium': { at: [0, 0, -8], dir: [0.1, 0.05, 1], dist: 8.2 },
  retina: { at: [0, 0, -8], dir: [0.1, 0.05, 1], dist: 8.2 },
  macula: { at: [-0.8, 0, -9], dir: [0.02, 0.02, 1], dist: 3.9 },
  fovea: { at: [-0.85, 0, -9.5], dir: [0.02, 0.02, 1], dist: 3.2 },
  'optic-disc': { at: [1.7, 0, -9.5], dir: [0.02, 0.02, 1], dist: 3.7 },
  'retinal-vessels': { at: [0, 0, -9], dir: [0.03, 0.03, 1], dist: 6 },
  'optic-nerve': { at: [4.6, 0, -22], dir: [0.4, 0.9, 0.5], dist: 8.2 },
  'optic-sheath': { at: [4.6, 0, -22], dir: [0.4, 0.9, 0.5], dist: 8.2 },
  'rectus-medial': { at: [10, 0, -14], dir: [1, 0.35, 0.25], dist: 8.6 },
  'rectus-lateral': { at: [-10, 0, -14], dir: [-1, 0.35, 0.25], dist: 8.6 },
  'rectus-superior': { at: [0, 11, -12], dir: [0.2, 1, 0.45], dist: 8.6 },
  'rectus-inferior': { at: [0, -11, -12], dir: [0.2, -1, 0.45], dist: 8.6 },
  'oblique-superior': { at: [6, 12, -6], dir: [0.7, 0.9, 0.5], dist: 8.4 },
  'oblique-inferior': { at: [0, -10, -3], dir: [0.4, -0.9, 0.5], dist: 8 },
  'g-outer': { at: [0, 0, 0], dir: [0.46, 0.22, 0.86], dist: 10 },
  'g-uvea': { at: [0, 0, 5], dir: [0.4, 0.5, 0.8], dist: 8 },
  'g-media': { at: [0, 0, 4], dir: [0.6, 0.4, 0.7], dist: 8.5 },
  'g-retina': { at: [0, 0, -7], dir: [0.1, 0.05, 1], dist: 8.6 },
  'g-nerve': { at: [4.6, 0, -22], dir: [0.4, 0.9, 0.5], dist: 9.5 },
  'g-muscles': { at: [0, 0, -14], dir: [0.5, 0.45, 0.8], dist: 12 },
};

/** Разнос при «Разобрать»: сдвиг вдоль оси (мм) и радиальное расширение слоя. */
export interface Spread {
  dz?: number;
  k?: number;
}

export const SPREAD: Record<string, Spread> = {
  cornea: { dz: 22 },
  limbus: { dz: 20 },
  aqueous: { dz: 18 },
  iris: { dz: 14 },
  pupil: { dz: 14 },
  'lens-nucleus': { dz: 12 },
  lens: { dz: 8 },
  zonule: { dz: 4.5 },
  'ciliary-processes': { dz: 3 },
  'ciliary-muscle': { dz: 3 },
  vitreous: {},
  retina: { k: 0.12 },
  macula: { k: 0.12 },
  fovea: { k: 0.12 },
  'optic-disc': { k: 0.12 },
  'retinal-vessels': { k: 0.12 },
  'pigment-epithelium': { k: 0.22 },
  choroid: { k: 0.34 },
  sclera: { k: 0.55 },
  conjunctiva: { k: 0.6 },
  'optic-nerve': { dz: -6 },
  'optic-sheath': { dz: -6 },
  'rectus-superior': { k: 0.7 },
  'rectus-inferior': { k: 0.7 },
  'rectus-medial': { k: 0.7 },
  'rectus-lateral': { k: 0.7 },
  'oblique-superior': { k: 0.7 },
  'oblique-inferior': { k: 0.7 },
};

/** Якоря подписей на модели (мм, в системе глаза). */
export const LABEL_AT: Record<string, V3> = {
  cornea: [0, 3.2, 12.2],
  sclera: [0, 10.8, -3.5],
  limbus: [5.6, 1.5, 10],
  conjunctiva: [-4, 8.4, 6.5],
  iris: [-3.6, 0, 8.8],
  pupil: [0, 0, 8.9],
  'ciliary-muscle': [0, 7.2, 6.2],
  'ciliary-processes': [0, 5.6, 7.3],
  choroid: [0, -8.2, -5],
  aqueous: [2.6, 0, 10.4],
  lens: [0, 0, 6.2],
  'lens-nucleus': [0, 0, 6.8],
  zonule: [0, 4.9, 7.1],
  vitreous: [0, 0, -3],
  'pigment-epithelium': [0, -9.4, -4.5],
  retina: [0, -8.6, -5.5],
  macula: [-1.6, -0.2, -9.4],
  fovea: [-0.85, 0, -9.6],
  'optic-disc': [1.74, 0, -9.6],
  'retinal-vessels': [-3.6, -1.5, -9],
  'optic-nerve': [4, 0, -17],
  'optic-sheath': [5.6, 0, -25],
  'rectus-medial': [11.4, 0, -10],
  'rectus-lateral': [-11.6, 0, -9],
  'rectus-superior': [0, 13.6, -9],
  'rectus-inferior': [0, -13.6, -9],
  'oblique-superior': [9.4, 15.2, 2.5],
  'oblique-inferior': [-3, -11.6, -4],
};

/** Какие части подписаны на модели сразу (остальные подписываются при выборе). */
export const MAIN_LABELS = new Set(['cornea', 'sclera', 'iris', 'lens', 'retina', 'optic-nerve', 'rectus-medial']);

/** Подписи внутренних частей видны сквозь стенки и не прячутся при повороте. */
export const INNER_LABELS = new Set([
  'lens',
  'lens-nucleus',
  'vitreous',
  'retina',
  'choroid',
  'pigment-epithelium',
  'ciliary-muscle',
  'ciliary-processes',
  'zonule',
  'macula',
  'fovea',
  'optic-disc',
  'retinal-vessels',
  'aqueous',
]);
