/** Части модели скелета (id совпадают с пунктами «Из чего состоит») и их группы. */
export const SKELETON_GROUPS = {
  'g-skull': ['skull', 'mandible'],
  'g-spine': ['cervical-vertebrae', 'thoracic-vertebrae', 'lumbar-vertebrae', 'sacrum', 'coccyx'],
  'g-chest': ['sternum', 'ribs'],
  'g-arm': ['clavicle', 'scapula', 'humerus', 'radius', 'ulna', 'hand-bones'],
  'g-pelvis': ['hip-bone'],
  'g-leg': ['femur', 'patella', 'tibia', 'fibula', 'foot-bones'],
  'g-cut': ['articular-cartilage', 'periosteum', 'compact-bone', 'spongy-bone', 'red-marrow', 'yellow-marrow'],
} as const;

export type SkeletonGroupId = keyof typeof SKELETON_GROUPS;

export const SKELETON_PART_IDS: string[] = Object.values(SKELETON_GROUPS).flat();

export const GROUP_OF: Record<string, SkeletonGroupId> = Object.fromEntries(
  (Object.entries(SKELETON_GROUPS) as [SkeletonGroupId, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/** Части, которые видны только в режиме «Разрез». */
export const CUT_PARTS = new Set<string>([...SKELETON_GROUPS['g-cut'], 'g-cut']);
