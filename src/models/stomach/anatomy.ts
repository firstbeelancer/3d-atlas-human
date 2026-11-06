/*
  Части модели желудка (id совпадают с пунктами «Из чего состоит») и их группы.
  Оси: +x — левая сторона человека (справа для зрителя), +y — вверх, +z — к зрителю. Вид спереди.
  Вдоль желудка идёт длина дуги s (от купола дна до конца нисходящей части двенадцатиперстной кишки)
  и угол обхода v: 0 — большая кривизна, π/2 — передняя стенка, π — малая кривизна, 3π/2 — задняя стенка.
*/

export type Vec = [number, number, number];

/** Прямоугольная область на стенке: диапазон s (в единицах landmark-индекса), центр и полуширина по углу v. */
export interface Zone {
  /** От и до — номера опорных точек средней линии (дробные). */
  k0: number;
  k1: number;
  /** Центр по углу обхода, рад; null — вся окружность. */
  v: number | null;
  /** Полуширина по углу, рад. */
  dv: number;
}

const PI = Math.PI;

/** Отделы и особые места стенки: подсвечиваются шейдером по (s, v). */
export const ZONES: Record<string, { zone: Zone; hole?: Zone }> = {
  fundus: { zone: { k0: 0, k1: 1.25, v: null, dv: 10 } },
  cardia: { zone: { k0: 0.8, k1: 1.75, v: PI + 0.2, dv: 1.0 } },
  body: { zone: { k0: 1.25, k1: 4.45, v: null, dv: 10 }, hole: { k0: 0.8, k1: 1.75, v: PI + 0.2, dv: 1.0 } },
  antrum: { zone: { k0: 4.45, k1: 7.0, v: null, dv: 10 } },
  'pyloric-canal': { zone: { k0: 7.0, k1: 7.75, v: null, dv: 10 } },
  pylorus: { zone: { k0: 7.75, k1: 8.25, v: null, dv: 10 } },
  duodenum: { zone: { k0: 8.25, k1: 14, v: null, dv: 10 } },
  'lesser-curvature': { zone: { k0: 1.0, k1: 8.0, v: PI, dv: 0.26 } },
  'greater-curvature': { zone: { k0: 0.35, k1: 7.7, v: 0, dv: 0.26 } },
  'angular-notch': { zone: { k0: 4.1, k1: 5.1, v: PI, dv: 0.5 } },
  'cardiac-notch': { zone: { k0: 0.55, k1: 1.2, v: PI - 0.15, dv: 0.5 } },
  'gastric-canal': { zone: { k0: 1.6, k1: 7.4, v: PI, dv: 0.55 } },
  'pyloric-sphincter': { zone: { k0: 7.75, k1: 8.25, v: null, dv: 10 } },
};

export const GROUPS = {
  'g-regions': ['cardia', 'fundus', 'body', 'antrum', 'pyloric-canal', 'pylorus'],
  'g-landmarks': ['lesser-curvature', 'greater-curvature', 'angular-notch', 'cardiac-notch'],
  'g-neighbors': ['esophagus', 'duodenum'],
  'g-wall': ['serosa', 'muscle-longitudinal', 'muscle-circular', 'muscle-oblique', 'submucosa', 'mucosa'],
  'g-inside': ['rugae', 'gastric-canal', 'pyloric-sphincter'],
  'g-vessels': ['left-gastric-artery', 'right-gastric-artery', 'gastroepiploic-arteries', 'short-gastric-arteries', 'gastric-veins'],
  'g-nerves': ['vagus-nerves'],
  'g-omenta': ['lesser-omentum', 'greater-omentum'],
  'g-gland': [
    'gastric-gland',
    'gastric-pit',
    'surface-cells',
    'neck-cells',
    'parietal-cells',
    'chief-cells',
    'endocrine-cells',
    'capillaries',
    'muscularis-mucosae',
  ],
} as const;

export type GroupId = keyof typeof GROUPS;

export const PART_IDS: string[] = Object.values(GROUPS).flat();

export const GROUP_OF: Record<string, GroupId> = Object.fromEntries(
  (Object.entries(GROUPS) as [GroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Слои стенки снаружи внутрь: id части → номер слоя. */
export const LAYER_IDS = ['serosa', 'muscle-longitudinal', 'muscle-circular', 'muscle-oblique', 'submucosa', 'mucosa'] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** При выборе этих частей стенка «препарируется» ступенчатыми окнами. */
export const LAYER_PARTS = new Set<string>(['g-wall', ...LAYER_IDS]);

/** При выборе этих частей передняя стенка снимается — видна слизистая со складками. */
export const CUT_PARTS = new Set<string>(['g-inside', 'rugae', 'gastric-canal', 'pyloric-sphincter', 'cardia', 'pylorus', 'pyloric-canal']);

/** Части микроскопической железы: при выборе модель сменяется увеличенным срезом слизистой. */
export const GLAND_PARTS = new Set<string>(['g-gland', ...GROUPS['g-gland']]);

/** Цвета срезов слоёв (линии разреза стенки). */
export const LAYER_COLORS: Record<LayerId, string> = {
  serosa: '#d8a99d',
  'muscle-longitudinal': '#b0463e',
  'muscle-circular': '#8f2e30',
  'muscle-oblique': '#c25a4a',
  submucosa: '#f3e2c6',
  mucosa: '#e2766f',
};

/** Какие сущности сцены показывать, когда выбранная часть рассматривается отдельно. */
export function isolatedSet(selected: string): Set<string> {
  const out = new Set<string>([selected]);
  const group = GROUPS[selected as GroupId] as readonly string[] | undefined;
  if (group) group.forEach((id) => out.add(id));
  return out;
}

/** Сущности-«оболочки» самого органа (одна сетка стенки на все отделы и слои). */
export const WALL_PARTS = new Set<string>([
  ...GROUPS['g-regions'],
  ...GROUPS['g-landmarks'],
  ...GROUPS['g-wall'],
  ...GROUPS['g-inside'],
  'duodenum',
]);

/** Сдвиги частей при «разборке» (в единицах модели). */
export const EXPLODE: Record<string, Vec> = {
  esophagus: [-0.9, 1.1, -0.2],
  'left-gastric-artery': [-0.9, 0.5, -1.0],
  'right-gastric-artery': [-0.7, 0.9, -1.0],
  'gastroepiploic-arteries': [0.4, -1.3, 1.1],
  'short-gastric-arteries': [1.3, 0.9, -0.5],
  'gastric-veins': [0.3, -0.9, -1.2],
  'vagus-nerves': [-1.2, 0.2, 1.1],
  'lesser-omentum': [-0.6, 1.2, -0.5],
  'greater-omentum': [0.2, -1.2, 0.9],
};
