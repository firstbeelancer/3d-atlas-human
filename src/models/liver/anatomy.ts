/*
  Части модели печени (id совпадают с пунктами «Из чего состоит») и их группы.
  Оси: +x — левая сторона человека (справа для зрителя), +y — вверх, +z — к зрителю. Вид спереди.
*/

export type Vec = [number, number, number];

/** Сегменты по Куино: римские цифры в литературе, id в коде. */
export const SEGMENT_IDS = [
  'segment-1',
  'segment-2',
  'segment-3',
  'segment-4a',
  'segment-4b',
  'segment-5',
  'segment-6',
  'segment-7',
  'segment-8',
] as const;
export type SegmentId = (typeof SEGMENT_IDS)[number];

export const LOBE_IDS = ['right-lobe', 'left-lobe', 'caudate-lobe', 'quadrate-lobe'] as const;
export type LobeId = (typeof LOBE_IDS)[number];

/**
 * Классическое деление на доли: серповидная связка отделяет левую долю (сегменты II и III),
 * справа от неё — правая доля (в том числе верхняя часть сегмента IV); на нижней поверхности
 * выделяют квадратную (IVb) и хвостатую (I) доли.
 */
export const LOBE_OF: Record<SegmentId, LobeId> = {
  'segment-1': 'caudate-lobe',
  'segment-2': 'left-lobe',
  'segment-3': 'left-lobe',
  'segment-4a': 'right-lobe',
  'segment-4b': 'quadrate-lobe',
  'segment-5': 'right-lobe',
  'segment-6': 'right-lobe',
  'segment-7': 'right-lobe',
  'segment-8': 'right-lobe',
};

export const LIVER_GROUPS = {
  'g-lobes': [...LOBE_IDS],
  'g-segments': [...SEGMENT_IDS],
  'g-vessels': ['portal-vein', 'hepatic-artery', 'hepatic-veins', 'inferior-vena-cava'],
  'g-bile': ['gallbladder', 'cystic-duct', 'hepatic-ducts', 'common-bile-duct'],
  'g-ligaments': ['falciform-ligament', 'round-ligament', 'venous-ligament', 'coronary-ligament'],
  'g-lobule': [
    'hepatic-lobule',
    'central-vein',
    'portal-triad',
    'hepatocytes',
    'sinusoids',
    'kupffer-cells',
    'bile-canaliculi',
  ],
} as const;

export type LiverGroupId = keyof typeof LIVER_GROUPS;

export const LIVER_PART_IDS: string[] = Object.values(LIVER_GROUPS).flat();

export const GROUP_OF: Record<string, LiverGroupId> = Object.fromEntries(
  (Object.entries(LIVER_GROUPS) as [LiverGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Части микроскопической «дольки»: при выборе модель печени сменяется увеличенной долькой. */
export const LOBULE_PARTS = new Set<string>(['g-lobule', ...LIVER_GROUPS['g-lobule']]);

/** Части, расположенные внутри печени: при выборе паренхима становится прозрачной. */
export const INNER_PARTS = new Set<string>(['portal-vein', 'hepatic-artery', 'hepatic-veins', 'g-vessels']);

export const SEGMENT_PARTS = new Set<string>(['g-segments', ...SEGMENT_IDS]);

/** Цвета сегментов для режима «Сегменты» (атласная раскраска). */
export const SEGMENT_COLORS: Record<SegmentId, string> = {
  'segment-1': '#e3b341',
  'segment-2': '#6fb1d6',
  'segment-3': '#3f83bf',
  'segment-4a': '#9fcb6a',
  'segment-4b': '#5fa653',
  'segment-5': '#e9835f',
  'segment-6': '#cb4f6e',
  'segment-7': '#a574cf',
  'segment-8': '#eba94e',
};

/** Какие сущности сцены показывать, когда выбранная часть рассматривается отдельно. */
export function isolatedSet(selected: string): Set<string> {
  const out = new Set<string>([selected]);
  const group = LIVER_GROUPS[selected as LiverGroupId] as readonly string[] | undefined;
  if (group) group.forEach((id) => out.add(id));
  for (const [seg, lobe] of Object.entries(LOBE_OF)) if (lobe === selected) out.add(seg);
  return out;
}

/** Сдвиги частей при «разборке» (в единицах модели); сегменты и доли смещаются от центра автоматически. */
export const EXPLODE: Record<string, Vec> = {
  gallbladder: [-1.35, -1.05, 1.35],
  'cystic-duct': [-1.0, -1.15, 0.9],
  'hepatic-ducts': [-0.2, -1.5, 1.3],
  'common-bile-duct': [-0.5, -1.7, 1.4],
  'portal-vein': [0.25, -1.1, -0.2],
  'hepatic-artery': [0.9, -1.5, 0.9],
  'hepatic-veins': [0, 0, 0],
  'inferior-vena-cava': [-1.2, 0, -1.1],
  'falciform-ligament': [0.5, 0.95, 1.0],
  'round-ligament': [0.5, -0.9, 1.5],
  'venous-ligament': [1.4, 0.7, -1.4],
  'coronary-ligament': [0, 1.0, -1.4],
};
