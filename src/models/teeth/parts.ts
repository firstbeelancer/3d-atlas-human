import { TYPES } from './geometry';

/** Слои, которые видны на разрезе и в списке «Из чего состоит». */
export const LAYER_IDS = ['enamel', 'dentin', 'pulp', 'cementum', 'canal'] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** Все части модели: четыре типа зубов и пять слоёв тканей. */
export const TEETH_PART_IDS: string[] = [...TYPES, ...LAYER_IDS];

export const TEETH_GROUPS = {
  'g-types': [...TYPES],
  'g-tissues': [...LAYER_IDS],
} as const;

export const GROUP_OF: Record<string, string> = Object.fromEntries(
  Object.entries(TEETH_GROUPS).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);
