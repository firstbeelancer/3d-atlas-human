/**
 * Как часто перерисовывать сцену: непрерывно — только пока она видна и анимирована;
 * на паузе — только по требованию (поворот, наведение); вне экрана — никогда.
 */
export function frameloopFor(visible: boolean, paused: boolean): 'always' | 'demand' | 'never' {
  if (!visible) return 'never';
  return paused ? 'demand' : 'always';
}
