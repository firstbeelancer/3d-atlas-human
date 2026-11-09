/** Виды камеры для частей, которые регистрируются отдельно (модуль 18+ дописывает сюда свои, когда загружается). */
export const EXTRA_FOCUS: Record<string, { at: [number, number, number]; dir: [number, number, number]; dist: number }> = {};
