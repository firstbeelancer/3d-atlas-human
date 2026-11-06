/* Части модели лёгких. Оси: +x — левая сторона человека (справа для зрителя), +y — вверх, +z — к зрителю. Вид спереди. */

export type Vec = [number, number, number];

export const LOBE_IDS = ['upper-lobe-right', 'middle-lobe', 'lower-lobe-right', 'upper-lobe-left', 'lower-lobe-left'] as const;

export const LUNG_GROUPS = {
  'g-lobes': ['right-lung', 'left-lung', 'upper-lobe-right', 'middle-lobe', 'lower-lobe-right', 'upper-lobe-left', 'lower-lobe-left', 'fissures'],
  'g-airways': ['trachea', 'carina', 'main-bronchi', 'lobar-bronchi', 'segmental-bronchi', 'bronchioles', 'alveoli'],
  'g-vessels': ['pulmonary-trunk', 'pulmonary-veins', 'bronchial-vessels', 'lymph-nodes', 'nerves'],
  'g-cover': ['pleura', 'pleural-cavity', 'hilum', 'diaphragm', 'surfactant'],
} as const;

export type LungGroupId = keyof typeof LUNG_GROUPS;

export const GROUP_OF: Record<string, LungGroupId> = Object.fromEntries(
  Object.entries(LUNG_GROUPS).flatMap(([g, ids]) => ids.map((id) => [id, g as LungGroupId])),
);

/** Разнос долей при режиме «Разобрать». */
export const EXPLODE: Record<string, Vec> = {
  'upper-lobe-right': [1.15, 0.75, 0.1],
  'middle-lobe': [1.3, -0.05, 0.55],
  'lower-lobe-right': [1.05, -0.85, 0],
  'upper-lobe-left': [-1.15, 0.72, 0.1],
  'lower-lobe-left': [-1.05, -0.85, 0],
  trachea: [0, 0.9, 0],
  'pulmonary-trunk': [0.5, 0.6, 0.4],
  'pulmonary-veins': [-0.4, -0.3, -0.5],
  pleura: [0, 0, 0.9],
  diaphragm: [0, -0.9, 0],
};

/** Части, при выборе которых лёгкие становятся прозрачными и видно дерево. */
export const INNER_PARTS = new Set(['main-bronchi', 'lobar-bronchi', 'segmental-bronchi', 'bronchioles', 'pulmonary-trunk', 'pulmonary-veins', 'bronchial-vessels']);

/** Части микроуровня: вместо органа показываем альвеолу. */
export const ALVEOLUS_PARTS = new Set(['alveoli', 'surfactant']);

const LOBE_OF_PART: Record<string, string[]> = {
  'right-lung': ['upper-lobe-right', 'middle-lobe', 'lower-lobe-right'],
  'left-lung': ['upper-lobe-left', 'lower-lobe-left'],
};

/** Какие геометрии оставить в режиме «Рассмотреть отдельно». */
export function isolatedSet(selected: string): Set<string> | null {
  if (LOBE_OF_PART[selected]) return new Set([...LOBE_OF_PART[selected], 'trachea']);
  if ((LOBE_IDS as readonly string[]).includes(selected)) return new Set([selected]);
  if (selected === 'trachea' || selected === 'carina') return new Set(['trachea', 'carina']);
  if (INNER_PARTS.has(selected)) return new Set([selected, 'upper-lobe-right', 'upper-lobe-left']);
  return new Set([selected]);
}
