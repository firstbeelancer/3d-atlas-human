import { ru, type MessageKey } from './ru';

export type Locale = 'ru';
const dictionaries: Record<Locale, Record<MessageKey, string>> = { ru };
let current: Locale = 'ru';

export function t(key: MessageKey): string {
  return dictionaries[current][key];
}

export function locale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  current = next;
}

export type { MessageKey };
