import type { HormoneDetailContent } from './types';
import { HORMONE_DETAILS_PART1 } from '../ru/hormones/detailsPart1';
import { HORMONE_DETAILS_PART2 } from '../ru/hormones/detailsPart2';

/** Весь контент страниц гормонов разом — только для пререндера HTML при сборке. */
export const ALL_HORMONE_CONTENT: Record<string, HormoneDetailContent> = {
  ...HORMONE_DETAILS_PART1,
  ...HORMONE_DETAILS_PART2,
};
