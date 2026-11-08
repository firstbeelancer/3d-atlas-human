/* Части модели лёгких: группы, разнос, подписи, фокус камеры. Оси: +x — левая сторона человека, +y — вверх, +z — к зрителю. */

export type Vec = [number, number, number];

export const LOBE_IDS = ['upper-lobe-right', 'middle-lobe', 'lower-lobe-right', 'upper-lobe-left', 'lower-lobe-left'] as const;

export const LUNG_GROUPS = {
  'g-lobes': ['right-lung', 'left-lung', 'upper-lobe-right', 'middle-lobe', 'lower-lobe-right', 'upper-lobe-left', 'lower-lobe-left', 'fissures'],
  'g-airways': ['trachea', 'carina', 'main-bronchi', 'lobar-bronchi', 'segmental-bronchi', 'bronchioles', 'alveoli'],
  'g-vessels': ['pulmonary-trunk', 'pulmonary-veins', 'bronchial-vessels', 'lymph-nodes', 'nerves'],
  'g-cover': ['pleura', 'pleural-cavity', 'hilum', 'diaphragm', 'surfactant'],
  'g-neighbors': ['heart', 'aorta', 'esophagus', 'vena-cava'],
} as const;

export type LungGroupId = keyof typeof LUNG_GROUPS;

export const GROUP_OF: Record<string, LungGroupId> = Object.fromEntries(
  Object.entries(LUNG_GROUPS).flatMap(([g, ids]) => ids.map((id) => [id, g as LungGroupId])),
);

/** Разнос по местам: доля, сторона (R, L) или центр (C). */
export const WHERE_SPREAD: Record<string, Vec> = {
  ru: [-1.0, 0.85, 0.3], rm: [-1.25, -0.1, 0.8], rl: [-0.9, -0.95, -0.35],
  lu: [1.0, 0.85, 0.3], ll: [0.9, -0.95, -0.35],
  R: [-0.75, 0, 0], L: [0.75, 0, 0], C: [0, 0, 0],
};

/** Разнос частей, не привязанных к доле: по ключу «часть|место», затем по части. */
export const PART_SPREAD: Record<string, Vec> = {
  trachea: [0, 1.1, 0], carina: [0, 0.6, 0], diaphragm: [0, -1.25, 0], heart: [0, -0.3, 1.7],
  aorta: [1.4, 0.4, -0.6], esophagus: [0, 0, -1.4], 'vena-cava': [-1.4, 0.3, 0.3],
  'pulmonary-trunk|C': [0, 0.7, 1.0], 'lymph-nodes': [0, 0.35, -0.9], nerves: [0, 0.5, -1.1],
  'pleura|R': [-0.55, 0, 0.55], 'pleura|L': [0.55, 0, 0.55],
  'pleural-cavity|R': [-0.3, 0, 0.3], 'pleural-cavity|L': [0.3, 0, 0.3],
  'hilum|R': [-0.9, 0.3, -0.7], 'hilum|L': [0.9, 0.3, -0.7],
  'pulmonary-veins|R': [-0.7, -0.3, -0.6], 'pulmonary-veins|L': [0.7, -0.3, -0.6],
};

export function spreadOf(part: string, where: string): Vec {
  return PART_SPREAD[`${part}|${where}`] ?? PART_SPREAD[part] ?? WHERE_SPREAD[where] ?? [0, 0, 0];
}

/** Части, которые «подсвечиваются вместе» с выбранной. */
export const ALSO: Record<string, string[]> = {
  'right-lung': ['upper-lobe-right', 'middle-lobe', 'lower-lobe-right'],
  'left-lung': ['upper-lobe-left', 'lower-lobe-left'],
  hilum: ['hilum'],
};

/** Внешние оболочки, которые в режиме «Сосуды внутри» становятся прозрачными. */
export const OUTER_KINDS = new Set(['lung', 'pleura', 'diaphragm', 'fissure', 'cavity']);

/** Части микроуровня: вместо органа показываем альвеолу. */
export const ALVEOLUS_PARTS = new Set(['alveoli', 'surfactant']);

/** Части без собственной сетки на макромодели (видны только на микроуровне). */
export const MICRO_ONLY = new Set(['surfactant']);

/** Подписи: точка на модели; inner — подпись внутренней части (видна сквозь стенки). */
export const LABEL_AT: Record<string, { at: Vec; inner?: boolean; main?: boolean }> = {
  trachea: { at: [0, 2.55, -0.05], main: true },
  carina: { at: [0, 1.0, -0.1], inner: true },
  'upper-lobe-right': { at: [-1.55, 1.35, 1.0], main: true },
  'middle-lobe': { at: [-1.7, -0.55, 1.1], main: true },
  'lower-lobe-right': { at: [-1.9, -1.2, -0.3], main: true },
  'upper-lobe-left': { at: [1.5, 1.35, 1.0], main: true },
  'lower-lobe-left': { at: [1.85, -1.2, -0.3], main: true },
  'main-bronchi': { at: [-0.45, 0.78, -0.3], inner: true },
  'pulmonary-trunk': { at: [0.3, 0.1, 0.55], inner: true, main: true },
  'pulmonary-veins': { at: [-0.55, 0.05, 0.12], inner: true },
  diaphragm: { at: [1.3, -1.95, 0.9], main: true },
  pleura: { at: [-2.35, -0.3, 0.6] },
  heart: { at: [0.6, -1.0, 1.1], main: true },
  aorta: { at: [0.55, 1.3, 0.1] },
  esophagus: { at: [0.12, -1.0, -0.66] },
  'vena-cava': { at: [-0.55, 0.45, 0.25] },
  'lymph-nodes': { at: [0.0, 0.82, -0.26], inner: true },
  nerves: { at: [-0.3, 1.8, -0.35] },
  hilum: { at: [-0.9, 0.2, -0.2], inner: true },
  alveoli: { at: [-1.3, 1.5, 0.35], inner: true },
  fissures: { at: [-2.0, -0.45, 0.2] },
};

/** Куда летит камера при выборе части: центр и расстояние. */
export const FOCUS: Record<string, { at: Vec; dist: number }> = {
  trachea: { at: [0, 2.0, -0.1], dist: 6.5 },
  carina: { at: [0, 1.0, -0.2], dist: 4.2 },
  'main-bronchi': { at: [0, 0.7, -0.3], dist: 5.2 },
  'pulmonary-trunk': { at: [0, 0.4, 0.2], dist: 5.5 },
  'pulmonary-veins': { at: [0, 0.0, -0.2], dist: 5.5 },
  'lymph-nodes': { at: [0, 0.8, -0.3], dist: 5 },
  nerves: { at: [0, 1.5, -0.3], dist: 6 },
  hilum: { at: [0, 0.4, -0.2], dist: 6 },
  'bronchial-vessels': { at: [0, 0.7, -0.3], dist: 5 },
  heart: { at: [0.3, -0.7, 0.4], dist: 7 },
  aorta: { at: [0.3, 0.6, 0], dist: 8 },
  esophagus: { at: [0.1, 0, -0.5], dist: 9 },
  'vena-cava': { at: [-0.5, 0.5, 0.1], dist: 8 },
};

/** Плоскости разреза: фронтальный (убирается передняя половина) и осевой (убирается верх, как срез КТ). */
export const CUT_Z = -0.24;
export const CUT_Y = 0.55;
