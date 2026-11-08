/** Реестр частей модели мозга: id совпадают с пунктами «Из чего состоит» в src/content/ru/mozg.ts. */
export type V3 = [number, number, number];

/** Масштаб: 1 мм = SCALE единиц сцены. */
export const SCALE = 0.062;

export const BRAIN_GROUPS = {
  'g-cortex': ['frontal-lobe', 'parietal-lobe', 'temporal-lobe', 'occipital-lobe', 'insula'],
  'g-zones': ['motor-cortex', 'sensory-cortex', 'prefrontal-cortex', 'broca-area', 'wernicke-area', 'auditory-cortex', 'visual-cortex', 'cingulate-gyrus'],
  'g-sulci': ['central-sulcus', 'lateral-sulcus', 'longitudinal-fissure'],
  'g-deep': ['corpus-callosum', 'thalamus', 'hypothalamus', 'caudate-nucleus', 'putamen', 'globus-pallidus', 'amygdala', 'hippocampus', 'fornix', 'mammillary-bodies', 'pineal-gland', 'pituitary-gland'],
  'g-ventricles': ['lateral-ventricles', 'third-ventricle', 'fourth-ventricle'],
  'g-stem': ['cerebellum', 'cerebellar-vermis', 'midbrain', 'tectum', 'pons', 'medulla', 'spinal-cord'],
  'g-nerves': ['optic-nerves', 'olfactory-bulbs', 'cranial-nerves'],
  'g-vessels': ['carotid-arteries', 'circle-of-willis', 'anterior-cerebral-artery', 'middle-cerebral-artery', 'posterior-cerebral-artery', 'basilar-artery', 'dural-sinuses'],
  'g-meninges': ['falx-cerebri', 'tentorium', 'arachnoid', 'dura-mater'],
} as const;

export type BrainGroupId = keyof typeof BRAIN_GROUPS;

export const BRAIN_PART_IDS: string[] = Object.values(BRAIN_GROUPS).flat();

export const GROUP_OF: Record<string, string> = Object.fromEntries(
  (Object.entries(BRAIN_GROUPS) as [string, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Накладки на поверхность коры: видны при выборе или в режиме «Функциональные зоны». */
export const OVERLAYS = new Set<string>([...BRAIN_GROUPS['g-zones'], ...BRAIN_GROUPS['g-sulci'], 'cerebellar-vermis']);
/** Что остаётся плотным, когда выбрана накладка. */
export const OVERLAY_HOST: Record<string, string[]> = Object.fromEntries([
  ...[...BRAIN_GROUPS['g-zones'], ...BRAIN_GROUPS['g-sulci']].map((id) => [id, [...BRAIN_GROUPS['g-cortex']]]),
  ['cerebellar-vermis', ['cerebellum']],
]);
/** Оболочки: по умолчанию скрыты, показываются режимом «Оболочки» или выбором. */
export const MENINGES = new Set<string>(BRAIN_GROUPS['g-meninges']);
/** Части внутри коры: подпись видна сквозь неё. */
export const INNER = new Set<string>([...BRAIN_GROUPS['g-deep'], ...BRAIN_GROUPS['g-ventricles'], 'insula', 'midbrain', 'tectum', 'pons']);
/** Кора и её части (в режиме «Глубокие структуры» становятся призрачными). */
export const CORTEX_IDS = new Set<string>([...BRAIN_GROUPS['g-cortex']]);

export const MAIN_LABELS = new Set<string>([
  'frontal-lobe', 'parietal-lobe', 'temporal-lobe', 'occipital-lobe', 'cerebellum', 'pons', 'medulla', 'central-sulcus', 'lateral-sulcus', 'longitudinal-fissure',
]);

/** Разнос (мм) для частей, не привязанных к стороне. Части коры разъезжаются по сторонам отдельно. */
export const SPREAD: Record<string, V3> = {
  'corpus-callosum': [0, 50, 0],
  fornix: [0, 36, -10],
  'lateral-ventricles': [0, 26, 8],
  'caudate-nucleus': [0, 18, 24],
  putamen: [0, 0, 36],
  'globus-pallidus': [0, -6, 26],
  thalamus: [0, 4, -6],
  hypothalamus: [0, -16, 16],
  amygdala: [0, -20, 28],
  hippocampus: [0, -26, -12],
  'mammillary-bodies': [0, -22, 0],
  'pineal-gland': [0, 16, -22],
  'pituitary-gland': [0, -20, 22],
  'third-ventricle': [0, 24, -10],
  'fourth-ventricle': [0, -2, -30],
  cerebellum: [0, -12, -34],
  'cerebellar-vermis': [0, -12, -34],
  midbrain: [0, 0, 0],
  tectum: [0, 6, -10],
  pons: [0, -6, 8],
  medulla: [0, -14, 0],
  'spinal-cord': [0, -26, -4],
  'optic-nerves': [0, -12, 24],
  'olfactory-bulbs': [0, -10, 30],
  'cranial-nerves': [0, -8, 0],
  'carotid-arteries': [0, -14, 0],
  'circle-of-willis': [0, -14, 12],
  'anterior-cerebral-artery': [0, 34, 6],
  'basilar-artery': [0, -10, 10],
  'dural-sinuses': [0, 0, 0],
  'falx-cerebri': [0, 0, 0],
  tentorium: [0, -8, -8],
  arachnoid: [0, 0, 0],
  'dura-mater': [0, 0, 0],
};
/** Части, которые едут вместе со своим полушарием. */
export const SIDED = new Set<string>([
  ...BRAIN_GROUPS['g-cortex'], ...BRAIN_GROUPS['g-zones'], ...BRAIN_GROUPS['g-sulci'], 'middle-cerebral-artery', 'posterior-cerebral-artery',
]);
export const HEMI_SPREAD = 44;

/** Куда смотрит камера при выборе части: точка (мм), направление на камеру, расстояние (ед. сцены). */
export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}
const f = (at: V3, dir: V3, dist: number): Focus => ({ at, dir, dist });
export const OVERVIEW: Focus = f([0, -6, -4], [0.62, 0.3, 0.72], 21);
export const SPREAD_VIEW: Focus = f([0, -8, -6], [0.35, 0.55, 0.8], 40);
export const CUT_VIEWS: Record<string, Focus> = {
  side: f([0, -8, -6], [1, 0.12, 0.18], 24),
  fundus: f([0, 0, -6], [0.12, 1, 0.3], 24),
  coronal: f([0, -4, 0], [0.18, 0.1, 1], 24),
};

export const FOCUS: Record<string, Focus> = {
  'frontal-lobe': f([30, 10, 50], [0.9, 0.35, 0.9], 16),
  'parietal-lobe': f([40, 30, -25], [0.9, 0.7, -0.4], 16),
  'temporal-lobe': f([55, -22, 5], [1, -0.05, 0.25], 14),
  'occipital-lobe': f([28, 10, -72], [0.6, 0.35, -1], 14),
  insula: f([60, 0, 4], [1, 0.15, 0.3], 9),
  'motor-cortex': f([30, 40, 8], [0.7, 0.9, 0.2], 11),
  'sensory-cortex': f([30, 40, -10], [0.7, 0.9, -0.1], 11),
  'prefrontal-cortex': f([25, 15, 68], [0.6, 0.35, 1], 12),
  'broca-area': f([66, 10, 28], [1, 0.2, 0.4], 9),
  'wernicke-area': f([66, 6, -32], [1, 0.2, -0.3], 9),
  'auditory-cortex': f([68, -6, -6], [1, 0.1, 0], 9),
  'visual-cortex': f([8, 4, -80], [0.3, 0.2, -1], 11),
  'cingulate-gyrus': f([1, 36, -4], [1, 0.1, 0.1], 13),
  'central-sulcus': f([24, 46, -4], [0.6, 1, 0.1], 11),
  'lateral-sulcus': f([66, 2, 4], [1, 0.1, 0.2], 11),
  'longitudinal-fissure': f([0, 52, -4], [0.1, 1, 0.1], 18),
  'corpus-callosum': f([0, 30, 0], [1, 0.25, 0.2], 14),
  thalamus: f([11, 2, -10], [1, 0.4, 0.5], 9),
  hypothalamus: f([5, -14, 6], [1, -0.1, 0.5], 8),
  'caudate-nucleus': f([24, 12, 0], [1, 0.4, 0.2], 14),
  putamen: f([27, 3, 7], [1, 0.2, 0.3], 10),
  'globus-pallidus': f([19, 1, 5], [1, 0.3, 0.3], 8),
  amygdala: f([28, -18, 18], [1, 0, 0.5], 8),
  hippocampus: f([28, -12, -12], [1, 0.3, 0.2], 11),
  fornix: f([8, 12, -8], [1, 0.5, 0.2], 10),
  'mammillary-bodies': f([4, -20, -6], [1, -0.2, 0.6], 6),
  'pineal-gland': f([0, -2, -28], [1, 0.3, -0.2], 6),
  'pituitary-gland': f([0, -46, 15], [1, 0.1, 0.5], 7),
  'lateral-ventricles': f([18, 12, -6], [1, 0.5, 0.3], 14),
  'third-ventricle': f([0, 0, -2], [1, 0.2, 0.2], 9),
  'fourth-ventricle': f([0, -50, -30], [1, 0.1, -0.3], 8),
  cerebellum: f([0, -52, -62], [0.6, 0.3, -1], 16),
  'cerebellar-vermis': f([0, -48, -66], [0.2, 0.5, -1], 11),
  midbrain: f([0, -28, -10], [1, 0.1, 0.4], 9),
  tectum: f([5, -20, -25], [0.6, 0.3, -1], 7),
  pons: f([0, -50, -12], [1, 0, 0.5], 10),
  medulla: f([0, -72, -28], [1, 0, 0.4], 10),
  'spinal-cord': f([0, -98, -38], [1, 0, 0.3], 10),
  'optic-nerves': f([0, -30, 36], [0.2, -0.7, 1], 11),
  'olfactory-bulbs': f([10, -28, 56], [0.4, -0.7, 1], 9),
  'cranial-nerves': f([20, -58, -4], [0.9, -0.3, 0.6], 14),
  'carotid-arteries': f([16, -56, 6], [1, 0, 0.5], 14),
  'circle-of-willis': f([0, -32, 8], [0.3, -1, 0.5], 11),
  'anterior-cerebral-artery': f([1, 18, 10], [1, 0.1, 0.3], 14),
  'middle-cerebral-artery': f([62, 10, 4], [1, 0.2, 0.3], 14),
  'posterior-cerebral-artery': f([14, -26, -34], [0.8, -0.8, -0.5], 14),
  'basilar-artery': f([0, -52, 0], [1, -0.1, 0.8], 9),
  'dural-sinuses': f([0, 30, -60], [0.8, 0.5, -1], 20),
  'falx-cerebri': f([0, 20, 0], [1, 0.2, 0.1], 20),
  tentorium: f([0, -26, -48], [0.5, 0.9, 0.2], 18),
  arachnoid: f([30, 10, 0], [1, 0.4, 0.8], 24),
  'dura-mater': f([30, 10, 0], [1, 0.4, 0.8], 24),
};

/** Привязка подписей к модели (мм). */
export const LABEL_AT: Record<string, V3> = {
  'frontal-lobe': [44, 36, 54],
  'parietal-lobe': [38, 52, -32],
  'temporal-lobe': [62, -20, 6],
  'occipital-lobe': [30, 18, -80],
  insula: [56, 0, 4],
  'motor-cortex': [24, 54, 6],
  'sensory-cortex': [24, 52, -12],
  'prefrontal-cortex': [24, 28, 74],
  'broca-area': [66, 10, 28],
  'wernicke-area': [68, 6, -32],
  'auditory-cortex': [70, -6, -6],
  'visual-cortex': [8, 6, -84],
  'cingulate-gyrus': [1, 40, -2],
  'central-sulcus': [28, 48, -5],
  'lateral-sulcus': [64, 2, 4],
  'longitudinal-fissure': [0, 56, 0],
  'corpus-callosum': [0, 33, 8],
  thalamus: [11, 4, -10],
  hypothalamus: [5, -14, 8],
  'caudate-nucleus': [18, 24, 6],
  putamen: [29, 4, 12],
  'globus-pallidus': [19, 1, 4],
  amygdala: [28, -18, 18],
  hippocampus: [31, -16, -14],
  fornix: [4, 14, 8],
  'mammillary-bodies': [4, -21, -6],
  'pineal-gland': [0, -2, -28],
  'pituitary-gland': [0, -50, 16],
  'lateral-ventricles': [13, 22, -6],
  'third-ventricle': [0, 6, -4],
  'fourth-ventricle': [0, -50, -31],
  cerebellum: [34, -62, -72],
  'cerebellar-vermis': [0, -44, -78],
  midbrain: [8, -28, -6],
  tectum: [5, -20, -26],
  pons: [18, -50, -2],
  medulla: [8, -76, -26],
  'spinal-cord': [4, -104, -40],
  'optic-nerves': [14, -31, 50],
  'olfactory-bulbs': [10, -30, 66],
  'cranial-nerves': [32, -56, 10],
  'carotid-arteries': [18, -60, 12],
  'circle-of-willis': [0, -28, 22],
  'anterior-cerebral-artery': [1, 10, 46],
  'middle-cerebral-artery': [64, 20, 4],
  'posterior-cerebral-artery': [14, -34, -20],
  'basilar-artery': [0, -56, -2],
  'dural-sinuses': [0, 58, -40],
  'falx-cerebri': [0, 44, 40],
  tentorium: [30, -24, -50],
  arachnoid: [-60, 10, 20],
  'dura-mater': [-66, 20, -20],
};

/** Срезы: ось, диапазон (мм) и положение по умолчанию. Срез всегда смотрит в плюс по своей оси. */
export type CutAxis = 'x' | 'y' | 'z';
export const CUTS: Record<'side' | 'fundus' | 'coronal', { axis: CutAxis; min: number; max: number; def: number }> = {
  side: { axis: 'x', min: -56, max: 56, def: -9 },
  fundus: { axis: 'y', min: -64, max: 56, def: 8 },
  coronal: { axis: 'z', min: -90, max: 86, def: 4 },
};
export const CUT_DEFAULT_T = {
  side: (CUTS.side.def - CUTS.side.min) / (CUTS.side.max - CUTS.side.min),
  fundus: (CUTS.fundus.def - CUTS.fundus.min) / (CUTS.fundus.max - CUTS.fundus.min),
  coronal: (CUTS.coronal.def - CUTS.coronal.min) / (CUTS.coronal.max - CUTS.coronal.min),
};
