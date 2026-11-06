import type { Vector3 } from 'three';

export type Box = { min: [number, number, number]; max: [number, number, number] };

/**
 * Не даёт центру камеры уйти за пределы модели при сдвиге, чтобы её нельзя было «потерять».
 * Камера сдвигается на ту же величину, поэтому вид не прыгает и не поворачивается.
 * Возвращает true, если центр пришлось вернуть.
 */
export function clampTarget(target: Vector3, camera: Vector3, min: Box['min'], max: Box['max']): boolean {
  const x = Math.min(max[0], Math.max(min[0], target.x));
  const y = Math.min(max[1], Math.max(min[1], target.y));
  const z = Math.min(max[2], Math.max(min[2], target.z));
  const dx = x - target.x;
  const dy = y - target.y;
  const dz = z - target.z;
  if (dx === 0 && dy === 0 && dz === 0) return false;
  target.set(x, y, z);
  camera.set(camera.x + dx, camera.y + dy, camera.z + dz);
  return true;
}

/** Границы по умолчанию — куб вокруг начального центра. */
export function defaultBounds(target: [number, number, number], half = 1.5): Box {
  return {
    min: [target[0] - half, target[1] - half, target[2] - half],
    max: [target[0] + half, target[1] + half, target[2] + half],
  };
}
