import { SHOWCASE, type ToothKind, type ToothSpec } from './anatomy';

export const TYPES: ToothKind[] = ['incisor', 'canine', 'premolar', 'molar'];

/** Ткани зуба: видны на разрезе и в списке «Из чего состоит». */
export const LAYER_IDS = ['enamel', 'dentin', 'pulp', 'cementum', 'canal'] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** Что окружает зуб в челюсти. */
export const AROUND_IDS = ['gingiva', 'pdl', 'bone', 'nerve', 'vessels'] as const;
export type AroundId = (typeof AROUND_IDS)[number];

/** Все части модели: типы зубов, ткани и окружение. */
export const TEETH_PART_IDS: string[] = [...TYPES, ...LAYER_IDS, ...AROUND_IDS];

export const TEETH_GROUPS = {
  'g-types': [...TYPES],
  'g-tissues': [...LAYER_IDS],
  'g-around': [...AROUND_IDS],
} as const;

export const GROUP_OF: Record<string, string> = Object.fromEntries(
  Object.entries(TEETH_GROUPS).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

/**
 * Как поставить эталонный зуб на витрине: поворот вокруг вертикали и плоскость разреза.
 * У многокорневых зубов разрез проходит через оси двух корней (щёчного и нёбного), чтобы на срезе
 * были видны оба канала; у резца и клыка — по середине, губной стороной к зрителю.
 */
export function showcasePose(spec: ToothSpec): { yaw: number; cutZ: number } {
  if (spec.roots.length < 2) return { yaw: 0, cutZ: 0 };
  const mid = (i: number) => {
    const r = spec.roots[i];
    return [(r.sx + r.ax) / 2, (r.sz + r.az) / 2];
  };
  // первый корень — щёчный (или мезиощёчный), последний — нёбный
  const a = mid(0);
  const b = mid(spec.roots.length - 1);
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const yaw = Math.atan2(vz, vx);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const cutZ = -s * a[0] + c * a[1];
  return { yaw, cutZ };
}

export const SHOWCASE_POSES = Object.fromEntries(TYPES.map((k) => [k, showcasePose(SHOWCASE[k])])) as Record<
  ToothKind,
  { yaw: number; cutZ: number }
>;

/** Из локальных координат зуба — в координаты витрины (обратный поворот к сэмплеру). */
export function toDisplay(yaw: number, x: number, y: number, z: number): [number, number, number] {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return [c * x + s * z, y, -s * x + c * z];
}
