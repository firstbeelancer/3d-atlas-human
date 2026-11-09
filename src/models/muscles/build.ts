import type { BufferGeometry } from 'three';
import { labelPoint, MUSCLE_DEFS, type MuscleDef, type Placement } from './anatomy';
import type { V3 } from './geometry';

export interface BuiltMuscle {
  def: MuscleDef;
  geometry: BufferGeometry;
  /** Точка подписи на поверхности. */
  label: V3;
  /** Направление разноса (единичное, в плоскости xz). */
  spread: V3;
}

let cache: BuiltMuscle[] | null = null;

function autoPlacement(g: BufferGeometry): Placement {
  const c = g.boundingBox!.getCenter({ x: 0, y: 0, z: 0 } as never) as unknown as { x: number; y: number; z: number };
  if (c.z > 0.25) return 'f';
  if (c.z < -0.3) return 'b';
  return 'l';
}

/** Строит геометрию всех мышц один раз за сессию (около сотни тысяч вершин, быстро). */
export function buildMuscles(): BuiltMuscle[] {
  if (cache) return cache;
  cache = MUSCLE_DEFS.map((def) => {
    const geometry = def.build();
    const bb = geometry.boundingBox!;
    const cx = (bb.min.x + bb.max.x) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    const dx = cx;
    const dz = cz + 0.1;
    const l = Math.hypot(dx, dz) || 1;
    const spread: V3 = [dx / l, 0, dz / l];
    return { def, geometry, label: labelPoint(geometry, def.label ?? autoPlacement(geometry)), spread };
  });
  return cache;
}
