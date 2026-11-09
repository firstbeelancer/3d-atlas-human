import type { SystemId, SystemMeta } from './types';
import { systemTitles } from './ru/systems';

/** Порядок систем на главной. */
const ORDER: SystemId[] = [
  'cells',
  'support',
  'overview',
  'nervous',
  'respiratory',
  'circulatory',
  'lymphatic',
  'digestive',
  'urinary',
  'skin',
  'reproductive',
  'endocrine',
];

export const SYSTEMS: SystemMeta[] = ORDER.map((id) => ({ id, title: systemTitles[id] }));

/** CSS-переменная цвета системы (определена в styles/index.css). */
export function systemColor(id: SystemId): string {
  return `var(--color-sys-${id})`;
}
