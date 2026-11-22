import type { V3 } from './sdf';

/*
  Общая раскладка кисти: по ней строятся кости, кожа, нервы и сосуды пальцев, поэтому они всегда совпадают.
  Система кисти до отведения руки: x — к большому пальцу (наружу), y — вверх, z — вперёд (ладонь).
*/

/** Центр лучезапястного сустава. */
export const WRIST: V3 = [2.0, 8.38, -0.15];
/** Щель суставного хряща между соседними костями пальца. */
export const JOINT_GAP = 0.025;

export interface Digit {
  /** Точки суставов: основание пястной кости, головки, кончик. */
  points: V3[];
  /** Радиус каждой кости (дм). */
  radii: number[];
}

const at = (x: number, y: number, z: number): V3 => [WRIST[0] + x, WRIST[1] + y, WRIST[2] + z];

/*
  Пястные кости расходятся веером: основания тесно сидят на запястье (около 4 см),
  головки разнесены примерно на 6 см — иначе пальцы сливаются в «варежку».
  Фаланги продолжают веер слабее.
*/
const FINGERS = [
  { x: 0.12, fan: 0.17, segs: [0.66, 0.42, 0.25, 0.18], r: 0.042 }, // указательный
  { x: 0.035, fan: 0.05, segs: [0.64, 0.45, 0.29, 0.19], r: 0.043 }, // средний
  { x: -0.05, fan: -0.1, segs: [0.58, 0.42, 0.27, 0.19], r: 0.04 }, // безымянный
  { x: -0.125, fan: -0.2, segs: [0.52, 0.34, 0.2, 0.17], r: 0.036 }, // мизинец
];

function walk(start: V3, dirs: V3[], segs: number[]): V3[] {
  let cur = start;
  const pts: V3[] = [cur];
  segs.forEach((len, i) => {
    const [dx, dy, dz] = dirs[i];
    const l = Math.hypot(dx, dy, dz);
    const step = len + (i < segs.length - 1 ? JOINT_GAP : 0);
    cur = [cur[0] + (dx / l) * step, cur[1] + (dy / l) * step, cur[2] + (dz / l) * step];
    pts.push(cur);
  });
  return pts;
}

/** Пальцы: 0 — указательный, 1 — средний, 2 — безымянный, 3 — мизинец, 4 — большой. */
export function handDigits(): Digit[] {
  const digits: Digit[] = FINGERS.map((f) => {
    // лёгкий изгиб пальцев вперёд, к ладони
    const dirs = f.segs.map((_, i): V3 => [i === 0 ? f.fan : f.fan * 0.35, -1, Math.sin(0.1 + i * 0.12) * 0.5]);
    return {
      points: walk(at(f.x, -0.25, 0), dirs, f.segs),
      radii: [f.r, f.r * 0.92, f.r * 0.78, f.r * 0.66],
    };
  });
  // большой палец: от кости-трапеции наружу и вперёд, противопоставлен ладони
  const thumbDirs = [0, 1, 2].map((i): V3 => [0.55 - i * 0.12, -1, 0.62 + i * 0.06]);
  digits.push({ points: walk(at(0.24, -0.19, 0.06), thumbDirs, [0.38, 0.28, 0.21]), radii: [0.05, 0.043, 0.035] });
  return digits;
}
