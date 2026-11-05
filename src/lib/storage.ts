/** localStorage, который никогда не бросает исключений (приватный режим, блокировка cookies). */
export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно — значение живёт только в памяти страницы */
  }
}

export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* см. safeSet */
  }
}
