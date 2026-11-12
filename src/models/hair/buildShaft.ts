import { BufferGeometry, Float32BufferAttribute } from 'three';
import { blob, curveOf, disc, lerp, merge, place, rng, sweep, tube, type V3 } from './geometry';
import type { MatKey, MeshDef, Parts } from './types';

const d = (g: BufferGeometry, m: MatKey, o: Partial<MeshDef> = {}): MeshDef => ({ g, m, ...o });

/** Стержень вдоль оси x: цилиндр с радиусом r на отрезке [xa, xb]. */
const rod = (xa: number, xb: number, r: number | ((u: number) => number), o: Parameters<typeof sweep>[2] = {}): BufferGeometry =>
  sweep(curveOf([[xa, 0, 0], [xb, 0, 0]]), typeof r === 'number' ? () => r : r, { n: Math.max(8, Math.round((xb - xa) * 5)), m: 36, cap0: 'flat', cap1: 'flat', ...o });

export const FIBRE = { x0: -7, cuticleEnd: 2.6, cortexEnd: 9.5, macroEnd: 12.6, microEnd: 15.2, rCuticle: 2.06, rCortex: 1.62, rMedulla: 0.5 };

/**
 * Волос под электронным микроскопом: ступенчатый срез высокого разрешения.
 * Слева — плотная черепица 3D-чешуек кутикулы, далее — многослойная кутикула,
 * пучки 3D веретенообразных корковых клеток, 37 макрофибрилл, спиральные микрофибриллы и 3D-срезы типов волос.
 */
export function buildShaft(): Parts {
  const P: Parts = {};
  const add = (id: string, ...defs: MeshDef[]) => {
    (P[id] ??= []).push(...defs);
  };
  const r = rng(21);
  const { x0, cuticleEnd, cortexEnd, macroEnd, microEnd } = FIBRE;

  // слои кутикулы: вложенные стержни; торцы смещены ступенями для читаемости колец
  add(
    's-cuticle-layers',
    d(rod(x0, cuticleEnd, 2.06, { cap0: 'flat', cap1: 'flat' }), 'cuticleA'),
    d(rod(x0 - 0.015, cuticleEnd - 0.01, 2.0, { cap0: 'flat', cap1: 'flat' }), 'cuticleB'),
    d(rod(x0 - 0.03, cuticleEnd - 0.02, 1.9, { cap0: 'flat', cap1: 'flat' }), 'cuticleC'),
    d(rod(x0 - 0.045, cuticleEnd - 0.03, 1.76, { cap0: 'flat', cap1: 'flat' }), 'cuticleD'),
  );

  // кора: центральное тело + рельефные 3D веретенообразные корковые клетки, выступающие на срезе
  const corticalCells: BufferGeometry[] = [rod(x0 - 0.06, cortexEnd - 0.45, 1.62, { cap0: 'flat', cap1: 'flat', uvLen: 7, n: 64 })];
  for (let ring = 0; ring < 2; ring++) {
    const rad = ring === 0 ? 1.38 : 0.96;
    const cnt = ring === 0 ? 18 : 12;
    for (let i = 0; i < cnt; i++) {
      const a = ((i + ring * 0.5) / cnt) * Math.PI * 2;
      const stagger = lerp(0.1, 0.55, r());
      const xStart = cortexEnd - 1.4;
      const xEnd = cortexEnd + stagger - 0.1;
      const cy = Math.cos(a) * rad;
      const cz = Math.sin(a) * rad;
      corticalCells.push(
        sweep(curveOf([[xStart, cy, cz], [xEnd, cy, cz]]), (u) => 0.22 * (1 - 0.35 * u * u), {
          n: 12,
          m: 12,
          cap0: 'flat',
          cap1: 'round',
          roundLen1: 0.14,
        }),
      );
    }
  }
  add('s-cortical-cells', d(merge(corticalCells), 'cortex'));
  add('s-cmc', d(rod(cuticleEnd + 0.02, cortexEnd - 0.02, 1.665, { cap0: null, cap1: null, uvLen: 4 }), 'cmc'));

  // чешуйки кутикулы: плотная многорядная черепица с зазубренным/волнистым свободным краем (SEM-реализм)
  const scales: BufferGeometry[] = [];
  const perRing = 15;
  const step = 0.24;
  const sc = 7;
  for (let ring = 0, x = x0 + 0.06; x < cuticleEnd - 0.45; ring++, x += step) {
    for (let k = 0; k < perRing; k++) {
      const a0 = ((k + (ring % 2) * 0.5) / perRing) * Math.PI * 2;
      const wid = ((Math.PI * 2) / perRing) * 1.15;
      const len = 0.52;
      const rows = 7;
      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= rows; i++) {
        const s = i / rows;
        const rr = 2.065 + 0.15 * s ** 1.55;
        for (let j = 0; j <= sc; j++) {
          const t = j / sc - 0.5;
          const edge = 1 - 0.52 * smoothEdge(Math.abs(t) * 2) * s;
          const a = a0 + t * wid;
          const serration = s > 0.75 ? 0.025 * Math.sin(j * 3.1 + ring + k) : 0;
          const shrink = s > 0.8 ? Math.sqrt(Math.max(0, 1 - (Math.abs(t) * 2) ** 2 * 0.88)) : 1;
          const xx = x + len * s * (0.86 + 0.14 * shrink) + serration;
          pos.push(xx, Math.cos(a) * rr * edge, Math.sin(a) * rr * edge);
          const shade = 0.76 + 0.24 * s - (s > 0.9 ? 0.2 : 0);
          col.push(shade, shade, shade);
        }
      }
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < sc; j++) {
          const a = i * (sc + 1) + j;
          idx.push(a, a + 1, a + sc + 1, a + 1, a + sc + 2, a + sc + 1);
        }
      }
      scales.push(patch(pos, col, idx));
    }
  }
  add('s-cuticle-scales', d(merge(scales), 'scale', { open: true }));

  // медулла: пористое губчатое ядро с воздушными полостями
  add('s-medulla', d(rod(x0 - 2.5, 8.2, 0.5, { cap0: 'round', cap1: 'round', roundLen0: 0.5, roundLen1: 0.5, n: 64, wob: (u, a) => 1 + 0.05 * Math.sin(u * 60 + a * 3) }), 'medulla'));
  const bubbles: BufferGeometry[] = [];
  for (let i = 0; i < 95; i++) {
    const x = lerp(x0 - 2.4, x0 - 0.15, r() ** 0.85);
    const a = r() * Math.PI * 2;
    const rad = r() * 0.35;
    const s = lerp(0.06, 0.16, r());
    bubbles.push(blob([x, Math.cos(a) * rad, Math.sin(a) * rad], [s * 1.2, s, s], { seg: 10, amp: 0.12, seed: i }));
  }
  for (let i = 0; i < 36; i++) {
    const x = lerp(x0 + 0.2, 8, r());
    bubbles.push(blob([x, (r() - 0.5) * 0.15, (r() - 0.5) * 0.15], [0.09, 0.08, 0.08], { seg: 8 }));
  }
  add('s-air', d(merge(bubbles), 'air'));

  // макрофибриллы: плотный пучок из 37 жгутов (центр + 6 + 12 + 18)
  const macroAxes: [number, number][] = [[0, 0]];
  for (let i = 0; i < 6; i++) macroAxes.push([Math.cos((i / 6) * Math.PI * 2) * 0.36, Math.sin((i / 6) * Math.PI * 2) * 0.36]);
  for (let i = 0; i < 12; i++) macroAxes.push([Math.cos(((i + 0.5) / 12) * Math.PI * 2) * 0.72, Math.sin(((i + 0.5) / 12) * Math.PI * 2) * 0.72]);
  for (let i = 0; i < 18; i++) macroAxes.push([Math.cos((i / 18) * Math.PI * 2) * 1.06, Math.sin((i / 18) * Math.PI * 2) * 1.06]);
  add(
    's-macrofibril',
    d(
      merge(
        macroAxes.map(([y, z], i) => {
          const tilt = Math.min(1, Math.hypot(y, z)) * 0.11;
          return tube(
            [[cortexEnd - 0.15, y, z], [lerp(cortexEnd, macroEnd, 0.5), y * (1 + tilt), z * (1 + tilt)], [macroEnd, y * (1 + tilt * 2), z * (1 + tilt * 2)]],
            0.135,
            { n: 26, m: 12, wob: (_, a) => 1 + 0.06 * Math.sin(a * 5 + i) },
          );
        }),
      ),
      'macro',
    ),
  );

  // микрофибриллы (промежуточные филаменты): спиральные пучки из каждого жгута
  const micro: BufferGeometry[] = [];
  macroAxes.forEach(([y, z], i) => {
    const tilt = Math.min(1, Math.hypot(y, z)) * 0.11;
    const cy = y * (1 + tilt * 2.4);
    const cz = z * (1 + tilt * 2.4);
    for (let s = 0; s < 7; s++) {
      const ph = (s / 7) * Math.PI * 2 + i;
      const pts: V3[] = Array.from({ length: 18 }, (_, k) => {
        const t = k / 17;
        const rad = (s === 0 ? 0 : 0.085 + 0.045 * t) * (1 + t * 0.65);
        const sp = s === 0 ? 0 : 1;
        return [
          lerp(macroEnd - 0.05, microEnd - (i % 4) * 0.16, t),
          cy * (1 + t * 0.1) + Math.cos(ph + t * 7.2) * rad * sp,
          cz * (1 + t * 0.1) + Math.sin(ph + t * 7.2) * rad * sp,
        ];
      });
      micro.push(tube(pts, 0.028, { n: 24, m: 8 }));
    }
  });
  add('s-microfibril', d(merge(micro), 'micro'));

  // меланосомы: овальные зёрна эу- и феомеланина между фибриллами
  const gr: BufferGeometry[] = [];
  for (let i = 0; i < 420; i++) {
    const x = lerp(cuticleEnd + 0.2, cortexEnd - 0.2, r());
    const a = r() * Math.PI * 2;
    gr.push(blob([x, Math.cos(a) * 1.605, Math.sin(a) * 1.605], [0.11, 0.048, 0.048], { seg: 8, seed: i, amp: 0.1, rot: [r() * 3, r() * 3, r() * 3] }));
  }
  for (let i = 0; i < 120; i++) {
    const x = lerp(cortexEnd + 0.1, macroEnd - 0.2, r());
    const a = r() * Math.PI * 2;
    const rad = lerp(0.2, 1.15, r());
    gr.push(blob([x, Math.cos(a) * rad, Math.sin(a) * rad], [0.1, 0.045, 0.045], { seg: 8, rot: [r() * 3, r() * 3, r() * 3] }));
  }
  add('s-melanosomes', d(merge(gr), 'melanosome'));

  // объёмные 3D-срезы трёх типов волос (вместо плоских дисков — полноценные 3D-сегменты стержня)
  const bean = (a: number) => 1 - 0.26 * Math.exp(-(Math.min(a, Math.PI * 2 - a) ** 2) / 0.3);
  const kinds: { id: string; x: number; ry: number; rz: number; shape?: (a: number) => number; medulla: number }[] = [
    { id: 't-round', x: -4.6, ry: 1.7, rz: 1.7, medulla: 0.36 },
    { id: 't-oval', x: 0.4, ry: 1.2, rz: 1.85, medulla: 0.3 },
    { id: 't-flat', x: 5.6, ry: 0.72, rz: 2.15, shape: bean, medulla: 0 },
  ];
  for (const k of kinds) {
    const segLen = 0.72;
    const at = (ry: number, rz: number, off: number, thick: number, m: MatKey, shape?: (a: number) => number) =>
      d(place(disc(off, ry, rz, { shape, m: 64, thick }), [k.x, -5.8, 0], [0, Math.PI / 2, 0]), m);
    const defs = [
      at(k.ry, k.rz, -segLen * 0.5, segLen, 'cuticleHair', k.shape),
      at(k.ry * 0.89, k.rz * 0.89, -segLen * 0.5 - 0.04, segLen + 0.02, 'cortex', k.shape),
    ];
    if (k.medulla) defs.push(at(k.medulla, k.medulla * (k.rz / k.ry), -segLen * 0.5 - 0.08, segLen + 0.04, 'medulla'));
    const dots: BufferGeometry[] = [];
    for (let i = 0; i < 64; i++) {
      const a = r() * Math.PI * 2;
      const rr = lerp(0.32, 0.83, Math.sqrt(r()));
      const sh = k.shape ? k.shape(a) : 1;
      dots.push(blob([-segLen * 0.5 - 0.05, Math.cos(a) * k.ry * rr * sh * 0.88, Math.sin(a) * k.rz * rr * sh * 0.88], [0.05, 0.05, 0.05], { seg: 7 }));
    }
    defs.push(d(place(merge(dots), [k.x, -5.8, 0], [0, Math.PI / 2, 0]), 'melaninG'));
    add(k.id, ...defs);
  }
  return P;
}

const smoothEdge = (t: number): number => t * t;

function patch(pos: number[], col: number[], idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
