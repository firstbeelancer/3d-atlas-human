/**
 * Реестр частей модели носа: id совпадают с пунктами «Из чего состоит» в src/content/ru/nos.ts.
 * Система координат головы в миллиметрах: +x — влево от пациента (вправо на экране при взгляде спереди),
 * +y — вверх, +z — вперёд (к зрителю). Начало — на срединной линии, в центре полости носа, на уровне
 * прикрепления средней раковины.
 */
export type V3 = [number, number, number];

/** 1 мм = SCALE единиц сцены. */
export const SCALE = 0.07;

export const NOSE_GROUPS = {
  'g-external': ['nasal-root', 'nasal-dorsum', 'nasal-tip', 'ala-left', 'ala-right', 'columella', 'nostrils', 'vibrissae'],
  'g-skeleton': [
    'nasal-bones',
    'frontal-process',
    'upper-lateral-cartilage',
    'alar-cartilage',
    'septal-cartilage',
    'perpendicular-plate',
    'vomer',
    'anterior-nasal-spine',
    'cribriform-plate',
  ],
  'g-cavity': [
    'vestibule',
    'nasal-valve',
    'septum-mucosa',
    'inferior-concha',
    'middle-concha',
    'superior-concha',
    'inferior-meatus',
    'middle-meatus',
    'superior-meatus',
    'lateral-wall',
    'uncinate-process',
    'ethmoid-bulla',
    'sphenoethmoidal-recess',
    'choanae',
  ],
  'g-sinuses': ['frontal-sinus', 'maxillary-sinus', 'anterior-ethmoid-cells', 'posterior-ethmoid-cells', 'sphenoid-sinus', 'frontonasal-duct', 'maxillary-ostium'],
  'g-mucosa': ['respiratory-mucosa', 'cavernous-plexus', 'seromucous-glands', 'kiesselbach-plexus'],
  'g-olfactory': ['olfactory-epithelium', 'olfactory-filaments', 'olfactory-bulb', 'olfactory-tract'],
  'g-vessels': ['sphenopalatine-artery', 'anterior-ethmoidal-artery', 'posterior-ethmoidal-artery', 'greater-palatine-artery', 'angular-artery'],
  'g-nerves': ['nasopalatine-nerve', 'anterior-ethmoidal-nerve', 'pterygopalatine-ganglion', 'infraorbital-nerve'],
  'g-muscles': ['procerus', 'nasalis', 'levator-labii-alaeque-nasi', 'depressor-septi'],
  'g-neighbors': ['face', 'hard-palate', 'soft-palate', 'uvula', 'nasopharynx', 'pharyngeal-tonsil', 'torus-tubarius', 'lacrimal-sac', 'nasolacrimal-duct', 'orbit', 'maxilla'],
} as const;

export type NoseGroupId = keyof typeof NOSE_GROUPS;
export const NOSE_PART_IDS: string[] = Object.values(NOSE_GROUPS).flat();
export const GROUP_OF: Record<string, string> = Object.fromEntries(
  (Object.entries(NOSE_GROUPS) as [string, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/* ---------- Ориентиры (мм) ---------- */

/** Переносица (назион). */
export const NASION: V3 = [0, 30, 18];
/** Граница костей и хрящей на спинке (ринион). */
export const RHINION: V3 = [0, 14, 31];
/** Кончик носа (проназале). */
export const PRONASALE: V3 = [0, -8, 45];
/** Основание колумеллы (субназале). */
export const SUBNASALE: V3 = [0, -21, 29];
/** Передняя носовая ость. */
export const ANS: V3 = [0, -19, 23];
/** Уровень дна полости носа (твёрдое нёбо). */
export const FLOOR_Y = -22;
/** Уровень крыши полости носа (решётчатая пластинка). */
export const ROOF_Y = 28;
/** Передний и задний край решётчатой пластинки по z. */
export const CRIBRIFORM_Z: [number, number] = [-26, -2];
/** Хоаны: задний край полости носа. */
export const CHOANA_Z = -42;
/** Задняя стенка носоглотки. */
export const PHARYNX_BACK_Z = -64;
/** Половина ширины полости носа на уровне раковин. */
export const CAVITY_HALF_W = 14;

/** Спинка носа: сплайн от назиона до кончика и дальше к основанию колумеллы. */
export const DORSUM_PTS: V3[] = [
  [0, 42, 14],
  NASION,
  [0, 22, 26],
  RHINION,
  [0, 4, 38],
  [0, -4, 44],
  PRONASALE,
  [0, -14, 42],
  [0, -19, 35],
  SUBNASALE,
];

/* ---------- Срезы ---------- */

export type CutAxis = 'x' | 'y' | 'z';
/** Срез всегда смотрит в плюс по своей оси: остаётся то, что по эту сторону плоскости. */
export const CUTS: Record<'side' | 'fundus' | 'coronal', { axis: CutAxis; min: number; max: number; def: number }> = {
  // сагиттальный: по умолчанию убирает левую половину и перегородку — открыта латеральная стенка с раковинами
  side: { axis: 'x', min: -44, max: 44, def: -3 },
  // горизонтальный: на уровне средней раковины
  fundus: { axis: 'y', min: -40, max: 60, def: 2 },
  // фронтальный: через середину полости — все три раковины и верхнечелюстные пазухи
  coronal: { axis: 'z', min: -60, max: 46, def: -8 },
};
export const CUT_DEFAULT_T = {
  side: (CUTS.side.def - CUTS.side.min) / (CUTS.side.max - CUTS.side.min),
  fundus: (CUTS.fundus.def - CUTS.fundus.min) / (CUTS.fundus.max - CUTS.fundus.min),
  coronal: (CUTS.coronal.def - CUTS.coronal.min) / (CUTS.coronal.max - CUTS.coronal.min),
};
/** Положение среза в мм по доле ползунка. */
export function cutPosition(kind: 'side' | 'fundus' | 'coronal', t: number): number {
  const c = CUTS[kind];
  return c.min + (c.max - c.min) * Math.min(1, Math.max(0, t));
}

/** Части, которые срез не трогает (ориентиры и сосуды снаружи). */
export const NO_CLIP = new Set<string>(['face']);
/** Части, которые становятся призрачными в режиме «Просвечивание». */
export const XRAY_GHOST = new Set<string>([
  'nasal-root',
  'nasal-dorsum',
  'nasal-tip',
  'ala-left',
  'ala-right',
  'columella',
  'face',
  'maxilla',
  'orbit',
  'nasal-bones',
  'frontal-process',
  'upper-lateral-cartilage',
  'alar-cartilage',
  'procerus',
  'nasalis',
  'levator-labii-alaeque-nasi',
  'depressor-septi',
  'angular-artery',
  'infraorbital-nerve',
]);
/** Части, видимые только при выборе, в режиме «Просвечивание» или на срезе (лежат внутри). */
export const INNER = new Set<string>([
  'vestibule',
  'nasal-valve',
  'septum-mucosa',
  'inferior-concha',
  'middle-concha',
  'superior-concha',
  'inferior-meatus',
  'middle-meatus',
  'superior-meatus',
  'lateral-wall',
  'uncinate-process',
  'ethmoid-bulla',
  'sphenoethmoidal-recess',
  'choanae',
  'septal-cartilage',
  'perpendicular-plate',
  'vomer',
  'anterior-nasal-spine',
  'cribriform-plate',
  'frontal-sinus',
  'maxillary-sinus',
  'anterior-ethmoid-cells',
  'posterior-ethmoid-cells',
  'sphenoid-sinus',
  'frontonasal-duct',
  'maxillary-ostium',
  'respiratory-mucosa',
  'cavernous-plexus',
  'seromucous-glands',
  'kiesselbach-plexus',
  'olfactory-epithelium',
  'olfactory-filaments',
  'olfactory-bulb',
  'olfactory-tract',
  'sphenopalatine-artery',
  'anterior-ethmoidal-artery',
  'posterior-ethmoidal-artery',
  'greater-palatine-artery',
  'nasopalatine-nerve',
  'anterior-ethmoidal-nerve',
  'pterygopalatine-ganglion',
  'hard-palate',
  'soft-palate',
  'uvula',
  'nasopharynx',
  'pharyngeal-tonsil',
  'torus-tubarius',
  'lacrimal-sac',
  'nasolacrimal-duct',
]);

/* ---------- Камера ---------- */

export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}
const S = (v: V3): V3 => [v[0] * SCALE, v[1] * SCALE, v[2] * SCALE];
const f = (at: V3, distMm: number, dir: V3 = [0.55, 0.3, 0.78]): Focus => ({ at: S(at), dir, dist: distMm * SCALE });

/** Вид по умолчанию: три четверти спереди-справа, чуть сверху. */
export const OVERVIEW: Focus = f([0, 4, 4], 300, [0.62, 0.28, 0.73]);
/** Вид на сагиттальный срез — сбоку. */
export const SIDE_CUT_VIEW: Focus = f([0, 2, -6], 250, [0.985, 0.12, 0.12]);
/** Вид на горизонтальный срез — сверху. */
export const AXIAL_VIEW: Focus = f([0, 0, -8], 250, [0.1, 0.98, 0.17]);
/** Вид на фронтальный срез — спереди. */
export const CORONAL_VIEW: Focus = f([0, 2, -6], 250, [0.12, 0.18, 0.98]);
/** Вид при разносе. */
export const SPREAD_VIEW: Focus = f([0, 4, -4], 400, [0.6, 0.35, 0.72]);

const FRONT: V3 = [0.3, 0.2, 0.93];
const RIGHT: V3 = [0.95, 0.2, 0.25];
const BELOW: V3 = [0.35, -0.6, 0.72];

export const FOCUS: Record<string, Focus> = {
  'nasal-root': f(NASION, 140, FRONT),
  'nasal-dorsum': f([0, 6, 36], 150, [0.7, 0.25, 0.67]),
  'nasal-tip': f(PRONASALE, 120, FRONT),
  'ala-left': f([16, -14, 30], 120, [0.8, 0.1, 0.6]),
  'ala-right': f([-16, -14, 30], 120, [-0.8, 0.1, 0.6]),
  columella: f([0, -17, 36], 100, BELOW),
  nostrils: f([0, -20, 34], 120, BELOW),
  vibrissae: f([8, -16, 32], 90, BELOW),
  'nasal-bones': f([0, 22, 25], 130, FRONT),
  'frontal-process': f([12, 20, 16], 140, FRONT),
  'upper-lateral-cartilage': f([0, 6, 36], 130, FRONT),
  'alar-cartilage': f([0, -10, 42], 120, FRONT),
  'septal-cartilage': f([0, -2, 26], 170, RIGHT),
  'perpendicular-plate': f([0, 14, -8], 180, RIGHT),
  vomer: f([0, -10, -20], 180, RIGHT),
  'anterior-nasal-spine': f(ANS, 110, [0.6, -0.1, 0.8]),
  'cribriform-plate': f([0, 28, -14], 160, [0.3, 0.85, 0.45]),
  vestibule: f([8, -14, 30], 130, RIGHT),
  'nasal-valve': f([6, -4, 24], 130, RIGHT),
  'septum-mucosa': f([0, 2, -4], 190, RIGHT),
  'inferior-concha': f([9, -10, -10], 180, RIGHT),
  'middle-concha': f([8, 8, -14], 170, RIGHT),
  'superior-concha': f([6, 20, -22], 150, RIGHT),
  'inferior-meatus': f([12, -16, -8], 170, RIGHT),
  'middle-meatus': f([12, 2, -10], 170, RIGHT),
  'superior-meatus': f([10, 16, -22], 150, RIGHT),
  'lateral-wall': f([14, 0, -10], 210, RIGHT),
  'uncinate-process': f([12, 2, -4], 140, RIGHT),
  'ethmoid-bulla': f([13, 8, -12], 140, RIGHT),
  'sphenoethmoidal-recess': f([6, 20, -34], 150, RIGHT),
  choanae: f([0, -8, CHOANA_Z], 190, [0.25, 0.15, -0.96]),
  'frontal-sinus': f([0, 48, 12], 190, FRONT),
  'maxillary-sinus': f([26, -8, 0], 230, FRONT),
  'anterior-ethmoid-cells': f([17, 16, -4], 160, FRONT),
  'posterior-ethmoid-cells': f([17, 16, -26], 160, [0.95, 0.25, 0.2]),
  'sphenoid-sinus': f([0, 10, -46], 200, RIGHT),
  'frontonasal-duct': f([10, 30, 6], 140, FRONT),
  'maxillary-ostium': f([16, 4, -8], 130, RIGHT),
  'respiratory-mucosa': f([8, -4, -10], 190, RIGHT),
  'cavernous-plexus': f([9, -10, -10], 150, RIGHT),
  'seromucous-glands': f([6, 2, -6], 130, RIGHT),
  'kiesselbach-plexus': f([3, -10, 20], 120, RIGHT),
  'olfactory-epithelium': f([4, 24, -14], 150, RIGHT),
  'olfactory-filaments': f([5, 28, -14], 140, RIGHT),
  'olfactory-bulb': f([6, 33, -12], 150, [0.6, 0.6, 0.5]),
  'olfactory-tract': f([8, 34, -32], 170, [0.6, 0.6, 0.5]),
  'sphenopalatine-artery': f([12, -2, -30], 170, RIGHT),
  'anterior-ethmoidal-artery': f([6, 24, -4], 150, RIGHT),
  'posterior-ethmoidal-artery': f([6, 24, -24], 150, RIGHT),
  'greater-palatine-artery': f([10, -20, -4], 170, RIGHT),
  'angular-artery': f([16, 2, 28], 150, FRONT),
  'nasopalatine-nerve': f([3, -4, -6], 170, RIGHT),
  'anterior-ethmoidal-nerve': f([4, 20, 6], 150, RIGHT),
  'pterygopalatine-ganglion': f([22, -2, -34], 150, RIGHT),
  'infraorbital-nerve': f([26, 6, 14], 170, FRONT),
  procerus: f([0, 32, 20], 130, FRONT),
  nasalis: f([10, 2, 32], 130, FRONT),
  'levator-labii-alaeque-nasi': f([18, 4, 24], 160, FRONT),
  'depressor-septi': f([0, -24, 28], 110, BELOW),
  face: f([0, 4, 10], 320, FRONT),
  'hard-palate': f([0, FLOOR_Y, -8], 220, [0.3, -0.75, 0.6]),
  'soft-palate': f([0, -30, -50], 200, RIGHT),
  uvula: f([0, -42, -60], 150, RIGHT),
  nasopharynx: f([0, -12, -54], 220, RIGHT),
  'pharyngeal-tonsil': f([0, 8, -58], 160, RIGHT),
  'torus-tubarius': f([16, -8, -50], 150, [0.9, 0.1, -0.42]),
  'lacrimal-sac': f([22, 20, 8], 130, FRONT),
  'nasolacrimal-duct': f([18, 2, 6], 150, FRONT),
  orbit: f([32, 30, -4], 230, FRONT),
  maxilla: f([24, -14, 10], 260, FRONT),
  'g-external': f([0, -4, 34], 200, FRONT),
  'g-skeleton': f([0, 8, 20], 230, [0.75, 0.25, 0.6]),
  'g-cavity': f([6, 2, -8], 230, RIGHT),
  'g-sinuses': f([0, 14, -6], 290, FRONT),
  'g-mucosa': f([6, -2, -6], 220, RIGHT),
  'g-olfactory': f([5, 28, -14], 190, [0.6, 0.55, 0.58]),
  'g-vessels': f([6, 0, -10], 240, RIGHT),
  'g-nerves': f([10, 4, -10], 240, RIGHT),
  'g-muscles': f([0, 4, 30], 200, FRONT),
  'g-neighbors': f([0, -10, -24], 330, RIGHT),
};

/** Точки подписей (мм, внутри масштабированной группы модели). */
const L = (v: V3): V3 => v;
export const LABEL_AT: Record<string, V3> = {
  'nasal-root': L([0, 31, 19]),
  'nasal-dorsum': L([0, 8, 36]),
  'nasal-tip': L([0, -8, 46]),
  'ala-left': L([17, -14, 30]),
  'ala-right': L([-17, -14, 30]),
  columella: L([0, -17, 37]),
  nostrils: L([8, -21, 32]),
  vibrissae: L([-8, -17, 31]),
  'nasal-bones': L([4, 22, 25]),
  'frontal-process': L([13, 20, 17]),
  'upper-lateral-cartilage': L([6, 6, 35]),
  'alar-cartilage': L([-9, -8, 42]),
  'septal-cartilage': L([0, -2, 26]),
  'perpendicular-plate': L([0, 14, -8]),
  vomer: L([0, -10, -20]),
  'anterior-nasal-spine': L([0, -19, 24]),
  'cribriform-plate': L([0, 29, -14]),
  vestibule: L([8, -14, 30]),
  'nasal-valve': L([6, -3, 25]),
  'septum-mucosa': L([1.6, 4, -2]),
  'inferior-concha': L([8, -10, -8]),
  'middle-concha': L([8, 8, -14]),
  'superior-concha': L([6, 20, -22]),
  'inferior-meatus': L([12, -17, -8]),
  'middle-meatus': L([12, 1, -8]),
  'superior-meatus': L([10, 16, -24]),
  'lateral-wall': L([15, -2, -14]),
  'uncinate-process': L([12, 2, -2]),
  'ethmoid-bulla': L([13, 9, -12]),
  'sphenoethmoidal-recess': L([6, 22, -34]),
  choanae: L([8, -8, CHOANA_Z]),
  'frontal-sinus': L([10, 50, 12]),
  'maxillary-sinus': L([26, -8, 2]),
  'anterior-ethmoid-cells': L([17, 17, -4]),
  'posterior-ethmoid-cells': L([17, 17, -26]),
  'sphenoid-sinus': L([8, 12, -46]),
  'frontonasal-duct': L([10, 30, 6]),
  'maxillary-ostium': L([16, 4, -8]),
  'respiratory-mucosa': L([8, -3, -16]),
  'cavernous-plexus': L([8, -11, -14]),
  'seromucous-glands': L([6, 3, -6]),
  'kiesselbach-plexus': L([2.5, -10, 20]),
  'olfactory-epithelium': L([4, 24, -14]),
  'olfactory-filaments': L([5, 29, -10]),
  'olfactory-bulb': L([6, 34, -12]),
  'olfactory-tract': L([8, 34, -32]),
  'sphenopalatine-artery': L([12, -2, -30]),
  'anterior-ethmoidal-artery': L([6, 25, -2]),
  'posterior-ethmoidal-artery': L([6, 25, -24]),
  'greater-palatine-artery': L([10, -20, -6]),
  'angular-artery': L([16, 4, 29]),
  'nasopalatine-nerve': L([3, -5, -6]),
  'anterior-ethmoidal-nerve': L([4, 20, 8]),
  'pterygopalatine-ganglion': L([22, -2, -34]),
  'infraorbital-nerve': L([26, 7, 15]),
  procerus: L([0, 34, 20]),
  nasalis: L([11, 2, 32]),
  'levator-labii-alaeque-nasi': L([19, 6, 24]),
  'depressor-septi': L([0, -25, 28]),
  face: L([40, 30, 10]),
  'hard-palate': L([0, FLOOR_Y - 3, -6]),
  'soft-palate': L([0, -31, -50]),
  uvula: L([0, -44, -60]),
  nasopharynx: L([0, -14, -56]),
  'pharyngeal-tonsil': L([0, 9, -58]),
  'torus-tubarius': L([16, -8, -50]),
  'lacrimal-sac': L([22, 21, 9]),
  'nasolacrimal-duct': L([18, 2, 7]),
  orbit: L([32, 32, -2]),
  maxilla: L([26, -16, 12]),
};

/** Подписи, видимые без выбора (чтобы не загромождать сцену). */
export const MAIN_LABELS = new Set<string>([
  'nasal-root',
  'nasal-dorsum',
  'nasal-tip',
  'ala-left',
  'nostrils',
  'nasal-bones',
  'frontal-sinus',
  'maxillary-sinus',
  'inferior-concha',
  'middle-concha',
  'septum-mucosa',
  'olfactory-bulb',
  'nasopharynx',
  'hard-palate',
]);

/** Подписи внутренних частей: не прячутся, когда точка на обратной стороне. */
export const INNER_LABELS = INNER;

/** Разнос при «Разобрать»: сдвиг части (мм). */
export const SPREAD: Record<string, V3> = {
  'nasal-root': [0, 14, 30],
  'nasal-dorsum': [0, 6, 34],
  'nasal-tip': [0, -4, 40],
  'ala-left': [16, -6, 32],
  'ala-right': [-16, -6, 32],
  columella: [0, -14, 36],
  nostrils: [0, -20, 34],
  vibrissae: [0, -18, 34],
  'nasal-bones': [0, 12, 20],
  'frontal-process': [0, 10, 18],
  'upper-lateral-cartilage': [0, 2, 24],
  'alar-cartilage': [0, -6, 28],
  'septal-cartilage': [0, 0, 14],
  'perpendicular-plate': [0, 8, 0],
  vomer: [0, -8, 0],
  'anterior-nasal-spine': [0, -10, 12],
  'cribriform-plate': [0, 24, 0],
  'inferior-concha': [22, -14, 0],
  'middle-concha': [26, 4, 0],
  'superior-concha': [28, 20, 0],
  'inferior-meatus': [22, -14, 0],
  'middle-meatus': [26, 4, 0],
  'superior-meatus': [28, 20, 0],
  'lateral-wall': [34, 0, 0],
  'uncinate-process': [30, 2, 0],
  'ethmoid-bulla': [30, 8, 0],
  'sphenoethmoidal-recess': [28, 22, -4],
  'maxillary-ostium': [34, 4, 0],
  'frontal-sinus': [0, 30, 10],
  'maxillary-sinus': [40, -10, 0],
  'anterior-ethmoid-cells': [36, 18, 4],
  'posterior-ethmoid-cells': [36, 18, -14],
  'sphenoid-sinus': [0, 14, -34],
  'frontonasal-duct': [8, 26, 8],
  'olfactory-epithelium': [0, 26, 0],
  'olfactory-filaments': [0, 34, 0],
  'olfactory-bulb': [0, 44, 0],
  'olfactory-tract': [0, 46, -6],
  'hard-palate': [0, -30, 0],
  'soft-palate': [0, -36, -10],
  uvula: [0, -40, -12],
  nasopharynx: [0, -10, -40],
  'pharyngeal-tonsil': [0, 0, -42],
  'torus-tubarius': [10, -10, -40],
  'lacrimal-sac': [24, 18, 10],
  'nasolacrimal-duct': [24, 4, 10],
  orbit: [40, 30, -4],
  maxilla: [44, -16, 10],
  face: [0, 0, 60],
  procerus: [0, 20, 36],
  nasalis: [0, 4, 40],
  'levator-labii-alaeque-nasi': [0, 4, 38],
  'depressor-septi': [0, -16, 40],
  'angular-artery': [0, 2, 42],
  'infraorbital-nerve': [0, 6, 40],
  'sphenopalatine-artery': [30, -4, -20],
  'greater-palatine-artery': [30, -26, 0],
  'pterygopalatine-ganglion': [34, -2, -30],
  'nasopalatine-nerve': [0, -4, 6],
  'anterior-ethmoidal-nerve': [0, 28, 10],
  'anterior-ethmoidal-artery': [0, 30, 2],
  'posterior-ethmoidal-artery': [0, 30, -20],
  'cavernous-plexus': [22, -14, 0],
  'respiratory-mucosa': [0, 0, 0],
  'seromucous-glands': [0, 0, 0],
  'kiesselbach-plexus': [0, 0, 14],
  vestibule: [0, -12, 30],
  'nasal-valve': [0, -6, 24],
  choanae: [0, -6, -24],
  'septum-mucosa': [0, 0, 0],
};

/** Пути воздуха при вдохе (мм): от ноздри через общий носовой ход к хоане и в носоглотку. */
export function airwayPath(side: 1 | -1): V3[] {
  const s = side;
  return [
    [s * 9, -24, 34],
    [s * 8, -16, 30],
    [s * 6.5, -6, 24],
    [s * 6, 4, 14],
    [s * 6, 8, 2],
    [s * 6, 6, -14],
    [s * 6.5, 2, -28],
    [s * 7, -6, CHOANA_Z],
    [s * 6, -16, -52],
    [s * 3, -34, -58],
    [s * 1.5, -52, -60],
  ];
}

/** Путь запаха: от обонятельной щели вверх через решётчатую пластинку к луковице и по тракту. */
export function smellPath(side: 1 | -1, k: number): V3[] {
  const s = side;
  const z = -8 - k * 6;
  const x = s * (3 + (k % 2) * 2.5);
  return [
    [x, 16, z + 6],
    [x, 24, z + 2],
    [x + s * 1.5, 29, z],
    [s * 6, 33, z - 1],
    [s * 7, 34, -24],
    [s * 9, 35, -36],
  ];
}

export const vlen = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vdot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
