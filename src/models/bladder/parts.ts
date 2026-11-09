import type { V3 } from './anatomy';

/** Части модели пузыря (id совпадают с пунктами «Из чего состоит») и их группы. */
export const BLADDER_GROUPS = {
  'g-shape': ['apex', 'body', 'fundus', 'neck', 'urachus'],
  'g-wall': ['serosa', 'adventitia', 'detrusor', 'submucosa', 'mucosa', 'rugae'],
  'g-inside': ['urine', 'trigone', 'interureteric-ridge', 'ureteric-orifices', 'urethral-orifice', 'uvula'],
  'g-tubes': ['ureters', 'intramural-ureter', 'urethra', 'internal-sphincter', 'external-sphincter'],
  'g-supply': ['arteries', 'veins', 'nerves', 'lymph-nodes'],
  'g-neighbors': ['pelvic-floor', 'pubic-symphysis'],
} as const;

export type BladderGroupId = keyof typeof BLADDER_GROUPS;

export const BLADDER_PART_IDS: string[] = Object.values(BLADDER_GROUPS).flat();

export const GROUP_OF: Record<string, BladderGroupId> = Object.fromEntries(
  (Object.entries(BLADDER_GROUPS) as [BladderGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Точка, на которую смотрит камера при выборе части, направление на камеру и расстояние. */
export interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}

export const OVERVIEW: Focus = { at: [0, 0.16, -0.38], dir: [0.28, 0.12, 0.95], dist: 19.5 };
/** Вид на фронтальный разрез: спереди и чуть сверху, чтобы был виден просвет и треугольник. */
export const CUT_VIEW: Focus = { at: [0, -0.25, -0.5], dir: [0.13, 0.22, 0.96], dist: 17.2 };
/** Вид на поперечный разрез сверху: смотрим внутрь, на дно и треугольник. */
export const FUNDUS_VIEW: Focus = { at: [0, -0.9, -0.3], dir: [0.12, 0.92, 0.38], dist: 15.4 };
/** Вид при разносе на части: чуть сбоку, чтобы слои читались по очереди. */
export const SPREAD_VIEW: Focus = { at: [0, -0.1, 0], dir: [0.62, 0.3, 0.72], dist: 14.5 };

export const FOCUS: Record<string, Focus> = {
  apex: { at: [0, 2.5, 0.2], dir: [0.4, 0.45, 0.8], dist: 6.4 },
  body: { at: [0, 0.2, 0.4], dir: [0.5, 0.25, 0.83], dist: 8.6 },
  fundus: { at: [0, -1.5, -1.7], dir: [0.25, 0.3, -0.92], dist: 7.6 },
  neck: { at: [0, -2.6, 0.3], dir: [0.35, -0.1, 0.93], dist: 6.2 },
  urachus: { at: [0, 3.9, 0.7], dir: [0.3, 0.35, 0.89], dist: 6 },
  serosa: { at: [0, 1.8, 0.6], dir: [0.55, 0.5, 0.67], dist: 8 },
  adventitia: { at: [0, -1.8, -0.9], dir: [0.3, -0.15, -0.94], dist: 7.4 },
  detrusor: { at: [0.8, 0, 0.6], dir: [0.62, 0.2, 0.76], dist: 8.2 },
  submucosa: { at: [0.6, -0.3, 0.4], dir: [0.55, 0.25, 0.8], dist: 7.6 },
  mucosa: { at: [0, -0.4, -0.5], dir: [0.2, 0.35, 0.91], dist: 7.2 },
  rugae: { at: [0, -0.9, -0.4], dir: [0.25, 0.3, 0.92], dist: 7 },
  urine: { at: [0, -0.2, 0], dir: [0.3, 0.35, 0.89], dist: 8 },
  trigone: { at: [0, -1.9, -1.2], dir: [0.1, 0.42, 0.9], dist: 5.6 },
  'interureteric-ridge': { at: [0, -1.5, -1.5], dir: [0.1, 0.4, 0.91], dist: 5.2 },
  'ureteric-orifices': { at: [0, -1.55, -1.5], dir: [0.12, 0.38, 0.92], dist: 5 },
  'urethral-orifice': { at: [0, -2.7, 0.1], dir: [0.15, 0.3, 0.94], dist: 4.6 },
  uvula: { at: [0, -2.55, -0.5], dir: [0.12, 0.4, 0.9], dist: 4.6 },
  ureters: { at: [0, 0.4, -2.2], dir: [0.45, 0.35, -0.82], dist: 10.5 },
  'intramural-ureter': { at: [0, -1.3, -1.7], dir: [0.2, 0.35, 0.91], dist: 5.6 },
  urethra: { at: [0, -3.6, 0.4], dir: [0.4, -0.05, 0.91], dist: 6 },
  'internal-sphincter': { at: [0, -3.2, 0.35], dir: [0.45, 0.1, 0.89], dist: 5 },
  'external-sphincter': { at: [0, -4.05, 0.45], dir: [0.45, -0.05, 0.89], dist: 5 },
  arteries: { at: [0, 0.9, -0.4], dir: [0.6, 0.35, 0.72], dist: 10 },
  veins: { at: [0, -2.2, -0.8], dir: [0.5, 0.1, -0.86], dist: 8.6 },
  nerves: { at: [0, -1.6, -1], dir: [0.45, 0.2, -0.87], dist: 8.6 },
  'lymph-nodes': { at: [0, -2, 0.6], dir: [0.55, 0.15, 0.82], dist: 8.4 },
  'pelvic-floor': { at: [0, -4, 0.3], dir: [0.35, -0.55, 0.76], dist: 9 },
  'pubic-symphysis': { at: [0, -2.5, 3], dir: [0.15, 0.1, 0.98], dist: 6.4 },
  'g-shape': OVERVIEW,
  'g-wall': { at: [0, 0, 0.3], dir: [0.6, 0.25, 0.76], dist: 9 },
  'g-inside': { at: [0, -1.4, -0.8], dir: [0.15, 0.4, 0.9], dist: 7 },
  'g-tubes': { at: [0, -1.8, -0.6], dir: [0.3, 0.2, 0.93], dist: 10.5 },
  'g-supply': { at: [0, -0.6, -0.6], dir: [0.55, 0.3, 0.78], dist: 11 },
  'g-neighbors': { at: [0, -3.2, 0.8], dir: [0.3, -0.3, 0.9], dist: 10.5 },
};

/** Разнос при «Разобрать»: сдвиг части и радиальное расширение слоя. */
export interface Spread {
  d?: V3;
  k?: number;
}

export const SPREAD: Record<string, Spread> = {
  apex: { d: [0, 1.5, 0] },
  body: {},
  fundus: { d: [0, -0.5, -1.5] },
  neck: { d: [0, -1.6, 0.3] },
  urachus: { d: [0, 2.7, 0.5] },
  serosa: { d: [0, 2.3, 0] },
  adventitia: { d: [0, -0.9, -1] },
  detrusor: { k: 0.1 },
  submucosa: { k: -0.04 },
  mucosa: { k: -0.11 },
  rugae: { k: -0.11 },
  urine: { k: -0.2 },
  trigone: { d: [0, -0.35, -0.95] },
  'interureteric-ridge': { d: [0, -0.35, -0.95] },
  'ureteric-orifices': { d: [0, -0.35, -0.95] },
  'urethral-orifice': { d: [0, -0.9, 0.25] },
  uvula: { d: [0, -0.35, -0.95] },
  ureters: { k: 0.16 },
  'intramural-ureter': { d: [0, -0.25, -0.6] },
  urethra: { d: [0, -1.9, 0.35] },
  'internal-sphincter': { d: [0, -1.9, 0.35] },
  'external-sphincter': { d: [0, -2.15, 0.35] },
  arteries: { k: 0.24 },
  veins: { k: 0.22 },
  nerves: { k: 0.27 },
  'lymph-nodes': { k: 0.3 },
  'pelvic-floor': { d: [0, -1.3, 0] },
  'pubic-symphysis': { d: [0, -0.5, 1.7] },
};

/** Якоря подписей на модели (координаты сцены). */
export const LABEL_AT: Record<string, V3> = {
  apex: [0.4, 3.15, 0.5],
  body: [2.6, 0.5, 1.3],
  fundus: [-1.4, -1.7, -2.2],
  neck: [0.75, -2.75, 0.75],
  urachus: [0.12, 4.35, 0.9],
  serosa: [-1.9, 2.1, 1.15],
  detrusor: [2.75, -0.6, 0.9],
  mucosa: [0.9, -0.7, -1.6],
  trigone: [0, -2, -1.75],
  'ureteric-orifices': [1.35, -1.5, -1.6],
  'urethral-orifice': [0.3, -2.8, 0.1],
  ureters: [3.1, 1.1, -2.5],
  urethra: [0.42, -3.9, 0.55],
  'internal-sphincter': [0.55, -3.25, 0.4],
  'external-sphincter': [0.62, -4.05, 0.5],
  arteries: [2.9, 1.85, 0.6],
  veins: [-2.3, -2.5, -1.3],
  nerves: [-2.6, -1.2, -1.7],
  'lymph-nodes': [2.55, -1.5, 1.25],
  'pelvic-floor': [2.9, -3.9, 1.4],
  'pubic-symphysis': [0, -2.45, 3.5],
};

/** Какие части подписаны на модели сразу (остальные — при выборе). */
export const MAIN_LABELS = new Set(['apex', 'body', 'neck', 'ureters', 'urethra', 'trigone']);

/** Подписи внутренних частей видны сквозь стенки и не прячутся при повороте. */
export const INNER_LABELS = new Set([
  'trigone',
  'ureteric-orifices',
  'urethral-orifice',
  'mucosa',
  'fundus',
]);
