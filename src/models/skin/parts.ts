/** Части модели (id совпадают с пунктами «Из чего состоит») по группам. */
export const SKIN_GROUPS = {
  'g-layers': [
    'stratum-corneum',
    'stratum-lucidum',
    'stratum-granulosum',
    'stratum-spinosum',
    'stratum-basale',
    'papillary-dermis',
    'reticular-dermis',
    'hypodermis',
    'fat-lobules',
    'collagen',
    'elastin',
  ],
  'g-cells': ['keratinocytes', 'melanocytes', 'melanosomes', 'langerhans', 'merkel-cells'],
  'g-appendages': [
    'hair-shaft',
    'hair-root',
    'hair-bulb',
    'hair-papilla',
    'sebaceous-gland',
    'arrector-pili',
    'eccrine-gland',
    'eccrine-duct',
    'sweat-pore',
    'apocrine-gland',
  ],
  'g-vessels': ['deep-plexus', 'dermal-plexus', 'subpapillary-plexus', 'capillary-loops', 'lymph-capillaries'],
  'g-nerves': ['nerve-plexus', 'meissner', 'pacinian', 'ruffini', 'free-endings'],
  'g-surface': ['skin-microrelief', 'desquamation'],
} as const;

export type SkinGroupId = keyof typeof SKIN_GROUPS;

export const SKIN_PART_IDS: string[] = Object.values(SKIN_GROUPS).flat();

export const GROUP_OF: Record<string, SkinGroupId> = Object.fromEntries(
  (Object.entries(SKIN_GROUPS) as [SkinGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);
