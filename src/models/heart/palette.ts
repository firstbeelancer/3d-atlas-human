/* Цвета стенки сердца по частям и поверхностям (запекаются в цвета вершин). */

import type { Surf } from './field';

type Rgb = [number, number, number];

/** Артерии красные, вены синие — по традиции атласов; полости правой половины сердца чуть синеют. */
const OUTER: Record<string, Rgb> = {
  'left-ventricle': [0.72, 0.3, 0.26],
  'right-ventricle': [0.7, 0.3, 0.28],
  septum: [0.72, 0.3, 0.26],
  'papillary-muscles': [0.7, 0.28, 0.25],
  'right-atrium': [0.66, 0.29, 0.3],
  'left-atrium': [0.7, 0.3, 0.28],
  aorta: [0.8, 0.28, 0.24],
  'aortic-arch-branches': [0.8, 0.28, 0.24],
  'pulmonary-veins': [0.82, 0.3, 0.26],
  'pulmonary-trunk': [0.36, 0.4, 0.76],
  'pulmonary-arteries': [0.36, 0.4, 0.76],
  'superior-vena-cava': [0.28, 0.36, 0.7],
  'inferior-vena-cava': [0.28, 0.36, 0.7],
};

const RIGHT = new Set(['right-atrium', 'right-ventricle', 'superior-vena-cava', 'inferior-vena-cava', 'pulmonary-trunk', 'pulmonary-arteries']);
const VESSEL = new Set(['aorta', 'aortic-arch-branches', 'pulmonary-veins', 'pulmonary-trunk', 'pulmonary-arteries', 'superior-vena-cava', 'inferior-vena-cava']);

export function paletteColor(part: string, surf: Surf, _x: number, _y: number, _z: number, _vertexPart: string): Rgb {
  const base = OUTER[part] ?? [0.7, 0.3, 0.27];
  if (surf === 2) return VESSEL.has(part) ? [0.93, 0.76, 0.66] : [0.86, 0.5, 0.45];
  if (surf === 1) {
    if (VESSEL.has(part)) return RIGHT.has(part) ? [0.47, 0.5, 0.8] : [0.86, 0.36, 0.32];
    return RIGHT.has(part) ? [0.62, 0.4, 0.55] : [0.84, 0.38, 0.34];
  }
  return base;
}
