import type { BufferGeometry } from 'three';
import { labelPoint, MUSCLE_DEFS, type MuscleDef } from './anatomy';
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
    const placement = def.label ?? (cz > 0.25 ? 'f' : cz < -0.30 ? 'b' : 'l');
    return { def, geometry, label: labelPoint(geometry, placement), spread };
  });
  return cache;
}
