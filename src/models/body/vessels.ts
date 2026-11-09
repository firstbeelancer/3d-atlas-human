import type { BufferGeometry } from 'three';
import { flipX, merge, tint, tube, wave, type V3 } from './geo';
import { armPoint } from './skin';
import { bloodTube, systemicArteries, systemicVeins } from './bloodPaths';
import type { GeometrySet } from './transfer';

/* Кровеносные сосуды и нервы: аорта и её ветви, полые вены, сосуды рук и ног, нервные стволы. */

const arm = (pts: V3[]): V3[] => pts.map((p) => (p[1] < 14.0 ? armPoint(p) : p));
/** Путь руки: точки левой стороны поворачиваются вместе с рукой, для правой отражаются. */
const armSide = (pts: V3[], s: 1 | -1): V3[] => (s === 1 ? arm(pts) : flipX(arm(pts)));

type Radius = number | ((t: number) => number);
const T = (pts: V3[], r: Radius, radial = 10): BufferGeometry => tube(pts, r, { radial });

function taper(a: number, b: number): (t: number) => number {
  return (t) => a + (b - a) * t;
}

export function buildArteries(): BufferGeometry {
  return tint(merge(systemicArteries.map(bloodTube)), (_x, y) => {
    const w = 0.9 + 0.1 * wave(y, 14, 3);
    return [1, w, w];
  });
}

export function buildVeins(): BufferGeometry {
  return tint(merge(systemicVeins.map(bloodTube)), (_x, y) => {
    const w = 0.92 + 0.08 * wave(y, 12, 3);
    return [w, w, 1];
  });
}

export function buildNerves(): BufferGeometry {
  const list: BufferGeometry[] = [];
  // плечевое сплетение и нервы руки
  for (const s of [1, -1] as const) {
    const f = (pts: V3[]) => (s === 1 ? pts : flipX(pts));
    list.push(T(armSide([[0.3, 14.9, -0.38], [0.8, 14.5, -0.25], [1.3, 14.1, -0.15], [1.6, 13.6, -0.18]], s), taper(0.04, 0.03), 7));
    list.push(T(armSide([[1.6, 13.6, -0.18], [1.68, 12.5, -0.2], [1.78, 11.2, -0.28], [1.86, 9.8, -0.3], [2.0, 8.5, -0.2], [2.1, 7.6, 0.0]], s), taper(0.028, 0.012), 7));
    // седалищный нерв и его ветви
    list.push(T(f([[0.5, 9.5, -0.78], [0.78, 9.0, -0.62], [0.82, 8.0, -0.42], [0.72, 6.5, -0.36], [0.62, 5.2, -0.3]]), taper(0.07, 0.045), 9));
    list.push(T(f([[0.62, 5.2, -0.3], [0.62, 4.2, -0.22], [0.66, 3.0, -0.2], [0.84, 1.5, -0.08], [0.92, 0.85, 0.04]]), taper(0.04, 0.014), 7));
    list.push(T(f([[0.62, 5.2, -0.3], [0.9, 4.9, -0.1], [0.95, 4.2, 0.04], [0.82, 2.8, 0.16], [0.7, 1.2, 0.3], [0.6, 0.7, 0.55]]), taper(0.032, 0.012), 7));
    // бедренный нерв
    list.push(T(f([[0.3, 10.6, -0.3], [0.62, 9.6, 0.05], [0.88, 8.8, 0.42], [0.76, 7.0, 0.44], [0.62, 5.2, 0.34]]), taper(0.04, 0.02), 7));
    // блуждающий нерв вдоль сонной артерии и к органам груди
    list.push(T(f([[0.46, 16.0, -0.22], [0.46, 15.4, 0.0], [0.44, 14.6, 0.04], [0.36, 13.9, -0.1], [0.28, 13.2, -0.28], [0.2, 12.5, -0.32]]), 0.018, 6));
  }
  return tint(merge(list), (x, y) => {
    const w = 0.94 + 0.06 * wave(y * 2 + x, 8, 3);
    return [w, w, w * 0.9];
  });
}

export function buildVessels(): GeometrySet {
  return { arteries: buildArteries(), veins: buildVeins(), nerves: buildNerves() };
}

