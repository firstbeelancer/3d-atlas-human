import type { CutKind, StageState } from '../../three/types';
import type { V3 } from '../body/geo';

/*
  Анатомия эндокринной системы человека («Гормоны», Systema endocrinum).
  Общая система координат тела — дециметры (рост 17,5), совпадает с body/skin.ts, body/thorax.ts и body/abdomen.ts:
  +x — левая сторона пациента (вправо на экране), +y — вверх, +z — вперёд.
  Две дополнительные диорамы строятся в собственных локальных координатах:
  - «Гипоталамус и гипофиз» (pituitary-axis): масштаб ×10 для детального изучения нейроэндокринного центра;
  - «Клетка и рецептор» (receptor): микроскопическая сцена секреции и взаимодействия гормона с рецептором.
*/

export const BODY_SCALE = 0.30;
export const BODY_FLOOR = -2.33;

/** Камера по умолчанию: крупно охватывает все эндокринные железы от головы до таза. */
export const ENDOCRINE_TARGET: V3 = [0, 1.38, 0.04];
export const ENDOCRINE_CAMERA: V3 = [1.35, 1.62, 6.85];

export type EndocrineView = 'body' | 'feedback' | 'pituitary-axis' | 'receptor';

export const CENTRAL_GROUP = 'g-central';
export const NECK_GROUP = 'g-neck';
export const CHEST_GROUP = 'g-chest';
export const PANCREAS_GROUP = 'g-pancreas';
export const ADRENAL_GROUP = 'g-adrenals';
export const GONAD_GROUP = 'g-gonads';
export const SECONDARY_GROUP = 'g-secondary';
export const PITUITARY_DETAIL_GROUP = 'g-pituitary-detail';
export const RECEPTOR_GROUP = 'g-receptor';

export const GROUPS: Record<string, readonly string[]> = {
  [CENTRAL_GROUP]: ['hypothalamus', 'pituitary-stalk', 'adenohypophysis', 'neurohypophysis', 'pineal-gland'],
  [NECK_GROUP]: ['thyroid-lobes', 'thyroid-isthmus', 'parathyroid-glands'],
  [CHEST_GROUP]: ['thymus'],
  [PANCREAS_GROUP]: ['pancreas-parenchyma', 'islets-of-langerhans'],
  [ADRENAL_GROUP]: ['adrenal-cortex', 'adrenal-medulla'],
  [GONAD_GROUP]: ['ovaries', 'testes'],
  [SECONDARY_GROUP]: ['heart-endocrine', 'kidneys-endocrine', 'endocrine-vessels', 'body-landmarks'],
  [PITUITARY_DETAIL_GROUP]: ['hypo-nuclei', 'optic-chiasm', 'portal-system', 'hypo-tract', 'sella-turcica'],
  [RECEPTOR_GROUP]: [
    'endocrine-cell',
    'fenestrated-capillary',
    'peptide-hormone',
    'membrane-receptor',
    'steroid-hormone',
    'cell-membrane',
    'nuclear-receptor',
  ],
};

export const PART_GROUPS: Record<string, string> = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([group, ids]) => ids.map((id) => [id, group])),
);

export const PART_IDS: readonly string[] = Object.values(GROUPS).flat();

/** Части, которые рисуются на общей 3D-фигуре тела. */
export const BODY_PART_IDS: readonly string[] = [
  ...GROUPS[CENTRAL_GROUP],
  ...GROUPS[NECK_GROUP],
  ...GROUPS[CHEST_GROUP],
  ...GROUPS[PANCREAS_GROUP],
  ...GROUPS[ADRENAL_GROUP],
  ...GROUPS[GONAD_GROUP],
  ...GROUPS[SECONDARY_GROUP],
];

/** Части макродиорамы гипоталамо-гипофизарной системы (10 структур). */
export const PITUITARY_PART_IDS: readonly string[] = [
  ...GROUPS[CENTRAL_GROUP],
  ...GROUPS[PITUITARY_DETAIL_GROUP],
];

/** Части микроскопической диорамы «Клетка и рецептор». */
export const RECEPTOR_PART_IDS: readonly string[] = [...GROUPS[RECEPTOR_GROUP]];

export const PITUITARY_ONLY = new Set<string>(GROUPS[PITUITARY_DETAIL_GROUP]);
export const RECEPTOR_ONLY = new Set<string>(GROUPS[RECEPTOR_GROUP]);

/** Части, которые при режиме «Просвечивание» становятся полупрозрачными, чтобы открыть внутренние структуры. */
export const XRAY_GHOST = new Set<string>([
  'body-landmarks',
  'heart-endocrine',
  'kidneys-endocrine',
  'adrenal-cortex',
  'pancreas-parenchyma',
  'thyroid-lobes',
  'thyroid-isthmus',
  'hypothalamus',
  'sella-turcica',
  'cell-membrane',
]);

/** Части, которые не режутся плоскостью среза (ориентиры и сосудистый контур тела). */
export const NO_CLIP = new Set<string>(['endocrine-vessels', 'body-landmarks']);

/** Определяет активную сцену по выбранным режимам и кликнутой части. */
export function viewOf(modes: StageState['modes'], selected: string | null): EndocrineView {
  const group = selected ? PART_GROUPS[selected] ?? selected : undefined;
  if (selected && (RECEPTOR_ONLY.has(selected) || group === RECEPTOR_GROUP)) return 'receptor';
  if (selected && (PITUITARY_ONLY.has(selected) || group === PITUITARY_DETAIL_GROUP)) return 'pituitary-axis';
  if (
    selected &&
    group &&
    group !== CENTRAL_GROUP &&
    group !== PITUITARY_DETAIL_GROUP &&
    group !== RECEPTOR_GROUP
  ) {
    return modes.feedback ? 'feedback' : 'body';
  }
  if (modes.receptor) return 'receptor';
  if (modes['pituitary-axis']) return 'pituitary-axis';
  if (modes.feedback) return 'feedback';
  return 'body';
}

/* ---------------- Координаты желёз на теле (в дм) ---------------- */

export const GLAND_CENTERS: Record<string, V3> = {
  hypothalamus: [0, 16.24, 0.04],
  'pituitary-stalk': [0, 16.10, 0.08],
  adenohypophysis: [0, 15.96, 0.14],
  neurohypophysis: [0, 15.96, 0.05],
  'pineal-gland': [0, 16.30, -0.34],
  'thyroid-lobes': [0, 14.62, 0.22],
  'thyroid-isthmus': [0, 14.62, 0.30],
  'parathyroid-glands': [0, 14.60, 0.08],
  thymus: [0, 13.68, 0.50],
  'pancreas-parenchyma': [0.24, 10.88, 0.04],
  'islets-of-langerhans': [0.40, 10.96, -0.02],
  'adrenal-cortex': [0, 11.34, -0.48],
  'adrenal-medulla': [0, 11.34, -0.48],
  ovaries: [0, 9.15, 0.08],
  testes: [0, 8.38, 0.34],
  'heart-endocrine': [0.25, 12.68, 0.32],
  'kidneys-endocrine': [0, 10.69, -0.52],
  'endocrine-vessels': [0, 12.40, -0.05],
  'body-landmarks': [0, 15.40, 0.0],
};

/** Точки привязки выносных подписей в общем виде тела (дм). */
export const BODY_LABEL_AT: Record<string, V3> = {
  hypothalamus: [0.16, 16.44, 0.10],
  'pituitary-stalk': [0.06, 16.12, 0.11],
  adenohypophysis: [0.14, 15.94, 0.18],
  neurohypophysis: [-0.12, 15.96, 0.04],
  'pineal-gland': [-0.16, 16.36, -0.34],
  'thyroid-lobes': [0.30, 14.66, 0.26],
  'thyroid-isthmus': [0.0, 14.62, 0.35],
  'parathyroid-glands': [-0.24, 14.74, 0.06],
  thymus: [-0.32, 13.72, 0.56],
  'pancreas-parenchyma': [0.72, 11.02, 0.10],
  'islets-of-langerhans': [0.94, 11.24, -0.22],
  'adrenal-cortex': [-0.76, 11.34, -0.46],
  'adrenal-medulla': [0.68, 11.42, -0.46],
  ovaries: [0.58, 9.18, 0.12],
  testes: [-0.26, 8.38, 0.40],
  'heart-endocrine': [0.58, 12.60, 0.54],
  'kidneys-endocrine': [0.96, 10.68, -0.50],
  'endocrine-vessels': [-0.46, 12.10, -0.18],
  'body-landmarks': [-0.45, 16.85, 0.20],
};

/** Основные подписи, видимые по умолчанию в общем виде тела (без нагромождения и перекрытий). */
export const BODY_MAIN_LABELS = new Set<string>([
  'adenohypophysis',
  'thyroid-lobes',
  'thymus',
  'adrenal-cortex',
  'pancreas-parenchyma',
  'ovaries',
  'testes',
]);

/** Точки подписей в диораме «Гипоталамус и гипофиз» (локальные координаты диорамы). */
export const PITUITARY_LABEL_AT: Record<string, V3> = {
  hypothalamus: [0.0, 1.98, 0.22],
  'hypo-nuclei': [-0.62, 1.72, 0.45],
  'optic-chiasm': [0.85, 1.12, 1.38],
  'pituitary-stalk': [0.35, 0.48, 0.42],
  'portal-system': [0.46, 0.20, 0.72],
  'hypo-tract': [-0.42, 0.28, -0.10],
  adenohypophysis: [0.68, -0.60, 0.85],
  neurohypophysis: [-0.55, -0.65, -0.42],
  'pineal-gland': [0.15, 1.88, -2.52],
  'sella-turcica': [-0.85, -1.68, 0.20],
};

export const PITUITARY_MAIN_LABELS = new Set<string>([
  'hypothalamus',
  'optic-chiasm',
  'portal-system',
  'adenohypophysis',
  'neurohypophysis',
  'pineal-gland',
  'sella-turcica',
]);

/** Точки подписей в диораме «Клетка и рецептор»: разнесены по высоте без наложений. */
export const RECEPTOR_LABEL_AT: Record<string, V3> = {
  'endocrine-cell': [-3.15, -1.42, 0.35],
  'fenestrated-capillary': [-0.45, 2.02, 0.22],
  'peptide-hormone': [0.68, 1.24, 0.24],
  'membrane-receptor': [1.68, 0.64, 0.24],
  'steroid-hormone': [0.76, -0.78, 0.24],
  'cell-membrane': [3.25, 1.76, 0.24],
  'nuclear-receptor': [3.38, -1.96, 0.22],
};

export const RECEPTOR_MAIN_LABELS = new Set<string>([
  'endocrine-cell',
  'fenestrated-capillary',
  'peptide-hormone',
  'membrane-receptor',
  'steroid-hormone',
  'nuclear-receptor',
]);

/* ---------------- Векторы разноса (ползунок «Разобрать на части») ---------------- */

export const BODY_SPREAD: Record<string, V3> = {
  hypothalamus: [0, 0.55, 0.25],
  'pituitary-stalk': [0, 0.22, 0.55],
  adenohypophysis: [0, -0.02, 0.95],
  neurohypophysis: [0, -0.05, -0.55],
  'pineal-gland': [0, 0.45, -1.15],
  'thyroid-lobes': [0, 0.15, 0.95],
  'thyroid-isthmus': [0, 0.15, 1.35],
  'parathyroid-glands': [0, 0.15, -0.75],
  thymus: [0, 0.05, 1.45],
  'pancreas-parenchyma': [0.55, -0.15, 0.90],
  'islets-of-langerhans': [0.95, -0.15, 1.45],
  'adrenal-cortex': [0, 0.45, -0.55],
  'adrenal-medulla': [0, 0.85, -1.05],
  ovaries: [0, -0.18, 0.75],
  testes: [0, -0.65, 0.95],
  'heart-endocrine': [0.35, 0.05, 0.55],
  'kidneys-endocrine': [0, -0.25, -0.85],
  'endocrine-vessels': [0, 0, -0.35],
  'body-landmarks': [0, 0.2, -0.45],
};

export const PITUITARY_SPREAD: Record<string, V3> = {
  hypothalamus: [0, 1.1, 0],
  'hypo-nuclei': [-0.55, 1.35, 0.45],
  'optic-chiasm': [0, 0.55, 1.65],
  'pituitary-stalk': [0, 0.25, 0.25],
  'portal-system': [0.95, 0.1, 0.95],
  'hypo-tract': [-0.95, 0.2, -0.35],
  adenohypophysis: [0.35, -0.45, 1.25],
  neurohypophysis: [-0.35, -0.45, -1.15],
  'pineal-gland': [0, 0.85, -1.65],
  'sella-turcica': [0, -1.45, 0],
};

export const RECEPTOR_SPREAD: Record<string, V3> = {
  'endocrine-cell': [-1.45, 0, 0],
  'fenestrated-capillary': [0, 0.95, 0],
  'peptide-hormone': [0.25, 1.15, 0.55],
  'membrane-receptor': [0.65, 0.45, 0.45],
  'steroid-hormone': [0.25, -1.05, 0.55],
  'cell-membrane': [1.05, 0, -0.25],
  'nuclear-receptor': [1.75, -0.25, 0.35],
};

/* ---------------- Три плоскости среза с ползунком ---------------- */

export interface CutAxisSpec {
  axis: 'x' | 'y' | 'z';
  min: number;
  max: number;
}

export const CUT_DEFAULT_T: Record<CutKind, number> = {
  side: 0.50,
  fundus: 0.54,
  coronal: 0.54,
};

/** Границы плоскостей среза в локальных координатах каждой сцены. */
export const BODY_CUTS: Record<CutKind, CutAxisSpec> = {
  side: { axis: 'x', min: -1.35, max: 1.35 },
  fundus: { axis: 'y', min: 8.1, max: 16.9 },
  coronal: { axis: 'z', min: -0.95, max: 0.85 },
};

export const PITUITARY_CUTS: Record<CutKind, CutAxisSpec> = {
  side: { axis: 'x', min: -1.8, max: 1.8 },
  fundus: { axis: 'y', min: -2.1, max: 2.8 },
  coronal: { axis: 'z', min: -3.2, max: 2.0 },
};

export const RECEPTOR_CUTS: Record<CutKind, CutAxisSpec> = {
  side: { axis: 'x', min: -4.8, max: 4.8 },
  fundus: { axis: 'y', min: -2.2, max: 2.2 },
  coronal: { axis: 'z', min: -1.8, max: 1.8 },
};

export function cutsFor(view: EndocrineView): Record<CutKind, CutAxisSpec> {
  if (view === 'pituitary-axis') return PITUITARY_CUTS;
  if (view === 'receptor') return RECEPTOR_CUTS;
  return BODY_CUTS;
}

export function cutPosition(view: EndocrineView, kind: CutKind, t: number): number {
  const { min, max } = cutsFor(view)[kind];
  const clamped = Math.max(0, Math.min(1, t));
  return min + (max - min) * clamped;
}

/* ---------------- Направление облёта камеры для особых частей ---------------- */

/** Особые ракурсы камеры (например, сзади для паращитовидных желёз). */
export const CAMERA_DIR_OVERRIDE: Record<string, V3> = {
  'parathyroid-glands': [-0.32, 0.14, -1.0],
  'pineal-gland': [0.65, 0.25, -0.82],
  neurohypophysis: [-0.72, 0.18, -0.68],
  'adrenal-cortex': [0.15, 0.22, -0.96],
  'adrenal-medulla': [0.22, 0.16, 0.96],
  'kidneys-endocrine': [0.15, 0.16, -0.96],
  'hypo-tract': [-0.88, 0.20, 0.45],
  'portal-system': [0.78, 0.18, 0.68],
};

/* ---------------- Потоки гормонов и оси обратной связи (в дм) ---------------- */

export interface HormoneFlowPath {
  id: string;
  /** Часть или ось, к которой привязан поток. */
  source: string;
  axis: 'systemic' | 'hpa-cmd' | 'hpa-fb' | 'hpt-cmd' | 'hpt-fb' | 'glucose' | 'gonad';
  points: V3[];
  color: string;
  count: number;
  speed: number;
  size: number;
}

/** Базовые потоки гормонов в кровотоке в общем виде. */
export const SYSTEMIC_FLOWS: readonly HormoneFlowPath[] = [
  // Гипофиз → яремная вена → сердце → аорта (тропные гормоны)
  {
    id: 'pituitary-down',
    source: 'adenohypophysis',
    axis: 'systemic',
    points: [
      [0.04, 15.95, 0.14],
      [0.24, 15.60, 0.06],
      [0.34, 14.95, 0.06],
      [0.22, 14.15, 0.10],
      [0.14, 13.45, 0.22],
      [0.24, 12.90, 0.25],
    ],
    color: '#f5be36',
    count: 6,
    speed: 0.18,
    size: 0.036,
  },
  // Щитовидная железа → верхняя полая вена → сердце → тело
  {
    id: 'thyroid-to-body',
    source: 'thyroid-lobes',
    axis: 'systemic',
    points: [
      [-0.22, 14.55, 0.22],
      [-0.38, 14.18, 0.12],
      [-0.44, 13.55, 0.12],
      [-0.24, 12.95, 0.20],
      [0.22, 13.05, 0.26],
      [0.42, 14.05, -0.08],
      [0.54, 13.10, -0.48],
      [0.42, 11.90, -0.35],
    ],
    color: '#34b8a8',
    count: 7,
    speed: 0.16,
    size: 0.036,
  },
  // Надпочечники → НПВ → сердце (адреналин и кортизол)
  {
    id: 'adrenal-surge',
    source: 'adrenal-medulla',
    axis: 'systemic',
    points: [
      [-0.64, 11.24, -0.45],
      [-0.36, 11.35, -0.34],
      [-0.36, 12.15, -0.25],
      [-0.34, 12.75, -0.10],
      [0.18, 12.90, 0.24],
    ],
    color: '#ff7a45',
    count: 6,
    speed: 0.22,
    size: 0.038,
  },
  // Поджелудочная железа (островки Лангерганса) → воротная / системный кровоток (инсулин)
  {
    id: 'islet-insulin',
    source: 'islets-of-langerhans',
    axis: 'systemic',
    points: [
      [0.72, 11.12, -0.12],
      [0.28, 10.95, 0.04],
      [-0.18, 11.05, -0.05],
      [-0.36, 11.55, -0.22],
      [-0.38, 12.35, -0.20],
    ],
    color: '#6ad166',
    count: 5,
    speed: 0.17,
    size: 0.035,
  },
  // Нисходящая аорта → половые железы (ЛГ, ФСГ)
  {
    id: 'gonad-delivery',
    source: 'ovaries',
    axis: 'gonad',
    points: [
      [0.36, 11.40, -0.28],
      [0.26, 10.55, -0.20],
      [0.24, 10.02, -0.15],
      [0.48, 9.55, 0.02],
      [0.50, 9.15, 0.08],
    ],
    color: '#e67db5',
    count: 5,
    speed: 0.17,
    size: 0.034,
  },
];

/** Потоки в режиме «Обратная связь»: прямые команды сверху (золото) и тормозящая обратная связь (бирюза). */
export const FEEDBACK_FLOWS: readonly HormoneFlowPath[] = [
  // ГГН (ось стресса): Гипоталамус → Гипофиз → АКТГ по аорте → Надпочечники
  {
    id: 'hpa-command',
    source: 'adrenal-cortex',
    axis: 'hpa-cmd',
    points: [
      [0.0, 16.24, 0.04],
      [0.08, 15.96, 0.16],
      [0.42, 15.10, 0.14],
      [0.54, 14.08, 0.04],
      [0.68, 13.02, -0.34],
      [0.58, 11.98, -0.32],
      [0.66, 11.42, -0.46],
    ],
    color: '#ffbe33',
    count: 11,
    speed: 0.20,
    size: 0.056,
  },
  // ГГН обратная связь: Кортизол от надпочечников → обратно вверх к гипофизу и гипоталамусу (торможение!)
  {
    id: 'hpa-feedback',
    source: 'adrenal-cortex',
    axis: 'hpa-fb',
    points: [
      [-0.66, 11.24, -0.46],
      [-0.56, 11.75, -0.22],
      [-0.56, 12.75, -0.06],
      [-0.56, 13.92, 0.14],
      [-0.48, 15.05, 0.16],
      [-0.24, 15.88, 0.14],
      [0.0, 16.22, 0.06],
    ],
    color: '#2be0d2',
    count: 11,
    speed: 0.18,
    size: 0.054,
  },
  // ГГЩ (ось обмена): Гипофиз → ТТГ → Щитовидная железа
  {
    id: 'hpt-command',
    source: 'thyroid-lobes',
    axis: 'hpt-cmd',
    points: [
      [0.0, 16.22, 0.05],
      [0.06, 15.96, 0.16],
      [0.28, 15.42, 0.20],
      [0.24, 14.72, 0.26],
    ],
    color: '#ffbe33',
    count: 7,
    speed: 0.26,
    size: 0.050,
  },
  // ГГЩ обратная связь: T3/T4 от щитовидной → обратно вверх к гипофизу
  {
    id: 'hpt-feedback',
    source: 'thyroid-lobes',
    axis: 'hpt-fb',
    points: [
      [-0.24, 14.72, 0.26],
      [-0.32, 15.36, 0.18],
      [-0.16, 15.92, 0.14],
      [0.0, 16.20, 0.06],
    ],
    color: '#2be0d2',
    count: 7,
    speed: 0.24,
    size: 0.048,
  },
  // Контур сахара крови: Поджелудочная железа (инсулин / глюкагон) ↔ циркуляция
  {
    id: 'glucose-loop',
    source: 'islets-of-langerhans',
    axis: 'glucose',
    points: [
      [0.85, 11.18, -0.18],
      [0.32, 10.95, 0.12],
      [-0.24, 11.00, 0.20],
      [-0.45, 11.55, 0.22],
      [0.08, 11.65, 0.28],
      [0.58, 11.30, 0.14],
    ],
    color: '#78e664',
    count: 8,
    speed: 0.20,
    size: 0.048,
  },
];
