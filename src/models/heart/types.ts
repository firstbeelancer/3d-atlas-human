import type { RawMesh } from '../lungs/mesh';

export type Kind =
  | 'wall' | 'fat' | 'leaflet' | 'ring' | 'chorda' | 'coronaryA' | 'coronaryV' | 'conduction' | 'node';

/** Где сетка видна: в целом сердце, при одном из разрезов или всегда. */
export type Variant = 'whole' | 'side' | 'fundus' | 'all';

export type Anim = 'tricuspid' | 'mitral' | 'aortic' | 'pulmonary';

export interface HeartMesh extends RawMesh {
  /** Тип поверхности стенки: 0 снаружи, 1 внутри, 2 срез. */
  surf?: Float32Array;
}

export interface HeartEntity {
  part: string;
  kind: Kind;
  variant: Variant;
  /** Створки и хорды двигаются между закрытым (основная сетка) и открытым положением. */
  anim?: Anim;
  mesh: HeartMesh;
  morph?: { positions: Float32Array; normals: Float32Array };
}
