import type { V3 } from './geometry';

/** Части модели (id совпадают с пунктами «Из чего состоит») и их группы. */
export const FEMALE_GROUPS = {
  'g-uterus': ['fundus', 'body', 'isthmus', 'cervix'],
  'g-wall': ['perimetrium', 'myometrium', 'endometrium', 'uterine-cavity'],
  'g-cervix': ['cervical-canal', 'internal-os', 'external-os'],
  'g-tubes': ['intramural-tube', 'tube-isthmus', 'ampulla', 'infundibulum', 'fimbriae'],
  'g-ovary': ['ovary', 'follicle-primordial', 'follicle-primary', 'follicle-secondary', 'follicle-antral', 'follicle-graafian', 'oocyte', 'corpus-luteum', 'corpus-albicans'],
  'g-ligaments': ['broad-ligament', 'mesosalpinx', 'mesovarium', 'round-ligament', 'ovarian-ligament', 'suspensory-ligament', 'cardinal-ligament', 'uterosacral-ligament'],
  'g-vagina': ['vagina', 'vaginal-fornix', 'vaginal-rugae'],
  'g-supply': ['uterine-artery', 'ovarian-artery', 'vaginal-artery', 'uterine-veins', 'ovarian-veins', 'pelvic-nerves', 'lymph-nodes'],
  'g-neighbors': ['bladder', 'urethra', 'ureters', 'rectum', 'pubic-symphysis', 'sacrum', 'pelvic-floor'],
} as const;

/** Части 18+: наружные половые органы. Модель и тексты грузятся отдельным куском только при включённом режиме 18+. */
export const VULVA_GROUP = 'g-vulva';
export const VULVA_IDS = ['mons-pubis', 'labia-majora', 'labia-minora', 'clitoris', 'vestibular-bulbs', 'vestibule', 'hymen', 'vestibular-glands', 'perineum'] as const;

export type FemaleGroupId = keyof typeof FEMALE_GROUPS;

export const FEMALE_PART_IDS: string[] = Object.values(FEMALE_GROUPS).flat();

export const GROUP_OF: Record<string, string> = {
  ...Object.fromEntries((Object.entries(FEMALE_GROUPS) as [string, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g]))),
  ...Object.fromEntries(VULVA_IDS.map((id) => [id, VULVA_GROUP])),
};

/** Подписи на модели по умолчанию (остальные появляются при выборе части). */
export const MAIN_LABELS = new Set([
  'fundus', 'body', 'cervix', 'infundibulum', 'ovary', 'vagina', 'bladder', 'rectum',
]);

/** Внутренние части: подпись видна сквозь стенки и не прячется при повороте. */
export const INNER_LABELS = new Set([
  'endometrium', 'uterine-cavity', 'cervical-canal', 'internal-os', 'external-os', 'myometrium', 'oocyte', 'follicle-primordial',
  'follicle-primary', 'follicle-secondary', 'follicle-antral', 'follicle-graafian', 'corpus-luteum', 'corpus-albicans',
  'vaginal-rugae', 'intramural-tube', 'tube-isthmus',
]);

/** Эти части становятся полупрозрачными в режиме «Рентген». */
export const XRAY_IDS = new Set(['fundus', 'body', 'isthmus', 'cervix', 'perimetrium', 'myometrium', 'vagina', 'vaginal-fornix', 'bladder', 'rectum', 'pelvic-floor', 'broad-ligament', 'cardinal-ligament', 'ovary', 'sacrum', 'mons-pubis', 'labia-majora', 'perineum']);

/** Разнос при «Разобрать»: сдвиг части (если не задан — от центра таза пропорционально удалению). */
export const SPREAD: Record<string, { d: V3; k?: number }> = {
  perimetrium: { d: [0, 0, 7.5] },
  fundus: { d: [0, 2.6, 3.6] },
  body: { d: [0, 1.2, 3.6] },
  isthmus: { d: [0, -0.3, 3.6] },
  cervix: { d: [0, -2.0, 3.6] },
  myometrium: { d: [0, 0, 0] },
  endometrium: { d: [0, 0, -3.4] },
  'uterine-cavity': { d: [0, 0, -6.4] },
  'cervical-canal': { d: [0, -3.2, -3.0] },
  'internal-os': { d: [0, -1.6, -3.0] },
  'external-os': { d: [0, -4.0, -3.0] },
  vagina: { d: [0, -3.6, 1.2] },
  'vaginal-fornix': { d: [0, -2.2, 1.8] },
  'vaginal-rugae': { d: [0, -3.6, -3.4] },
};

export const SPREAD_RADIAL = 0.34;
