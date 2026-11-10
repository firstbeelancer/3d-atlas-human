import { BufferGeometry, Float32BufferAttribute } from 'three';
import { blob, curveOf, disc, lerp, merge, place, rng, sweep, tube, type V3 } from './geometry';
import type { MatKey, MeshDef, Parts } from './types';

const d = (g: BufferGeometry, m: MatKey, o: Partial<MeshDef> = {}): MeshDef => ({ g, m, ...o });

/** Стержень вдоль оси x: цилиндр с радиусом r на отрезке [xa, xb]. */
const rod = (xa: number, xb: number, r: number | ((u: number) => number), o: Parameters<typeof sweep>[2] = {}): BufferGeometry =>
  sweep(curveOf([[xa, 0, 0], [xb, 0, 0]]), typeof r === 'number' ? () => r : r, { n: Math.max(4, Math.round((xb - xa) * 3)), m: 40, ...o });

export const FIBRE = { x0: -7, cuticleEnd: 2.6, cortexEnd: 9.5, macroEnd: 12.6, microEnd: 15.2, rCuticle: 2.06, rCortex: 1.62 };

/** Волос под микроскопом: ступенчатый срез. Слева — кутикула с чешуйками, дальше кора из клеток, макрофибриллы, филаменты. */
export function buildShaft(): Parts {
  const P: Parts = {};
  const add = (id: string, ...defs: MeshDef[]) => {
    (P[id] ??= []).push(...defs);
  };
  const r = rng(21);
  const { x0, cuticleEnd, cortexEnd, macroEnd, microEnd } = FIBRE;

  // слои кутикулы: вложенные стержни; торцы смещены на сотые доли, чтобы на срезе были видны кольца
  add(
    's-cuticle-layers',
    d(rod(x0, cuticleEnd, 2.06, { cap0: 'flat', cap1: 'flat' }), 'cuticleA'),
    d(rod(x0 - 0.015, cuticleEnd - 0.01, 2.0, { cap0: 'flat', cap1: 'flat' }), 'cuticleB'),
    d(rod(x0 - 0.03, cuticleEnd - 0.02, 1.9, { cap0: 'flat', cap1: 'flat' }), 'cuticleC'),
    d(rod(x0 - 0.045, cuticleEnd - 0.03, 1.76, { cap0: 'flat', cap1: 'flat' }), 'cuticleD'),
  );

  // кора: плотное тело из клеток; рисунок клеток — на текстуре
  add('s-cortical-cells', d(rod(x0 - 0.06, cortexEnd, 1.62, { cap0: 'flat', cap1: 'flat', uvLen: 7, n: 60 }), 'cortexCells'));
  add('s-cmc', d(rod(cuticleEnd + 0.02, cortexEnd - 0.02, 1.665, { cap0: null, cap1: null, uvLen: 4 }), 'cmc'));

  // чешуйки: черепица из изогнутых лепестков; свободный край смотрит к кончику волоса (+x)
  const scales: BufferGeometry[] = [];
  const perRing = 11;
  const step = 0.3;
  const sc = 5;
  for (let ring = 0, x = x0 + 0.08; x < cuticleEnd - 0.55; ring++, x += step) {
    for (let k = 0; k < perRing; k++) {
      const a0 = ((k + (ring % 2) * 0.5) / perRing) * Math.PI * 2;
      const wid = (Math.PI * 2 / perRing) * 1.12;
      const len = 0.56;
      const rows = 5;
      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= rows; i++) {
        const s = i / rows;
        const rr = 2.065 + 0.14 * s ** 1.6;
        for (let j = 0; j <= sc; j++) {
          const t = j / sc - 0.5;
          const edge = 1 - 0.55 * smoothEdge(Math.abs(t) * 2) * s;
          const a = a0 + t * wid;
          // край чешуйки закруглён: к кончику лепесток сужается по полуокружности
          const shrink = s > 0.82 ? Math.sqrt(Math.max(0, 1 - ((Math.abs(t) * 2) ** 2) * 0.9)) : 1;
          const xx = x + len * s * (0.85 + 0.15 * shrink);
          pos.push(xx, Math.cos(a) * rr * edge, Math.sin(a) * rr * edge);
          const shade = 0.78 + 0.22 * s - (s > 0.92 ? 0.18 : 0);
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

  // медулла: пористое ядро, торчащее из торца
  add('s-medulla', d(rod(x0 - 2.5, 8.2, 0.5, { cap0: 'round', cap1: 'round', roundLen0: 0.5, roundLen1: 0.5, n: 60, m: 20, uvLen: 5, wob: (u, a) => 1 + 0.08 * Math.sin(u * 60 + a * 3) }), 'medullaFoam'));
  const bubbles: BufferGeometry[] = [];
  for (let i = 0; i < 70; i++) {
    const x = lerp(x0 - 2.4, x0 - 0.2, r() ** 0.85);
    const a = r() * Math.PI * 2;
    const rad = r() * 0.34;
    const s = lerp(0.07, 0.17, r());
    bubbles.push(blob([x, Math.cos(a) * rad, Math.sin(a) * rad], [s, s, s], { seg: 9 }));
  }
  for (let i = 0; i < 26; i++) {
    const x = lerp(x0 + 0.2, 8, r());
    bubbles.push(blob([x, 0, 0], [0.08, 0.08, 0.08], { seg: 6 }));
  }
  add('s-air', d(merge(bubbles), 'air'));

  // макрофибриллы: пучок из 19 жгутов, выходящих из среза коры
  const macroAxes: [number, number][] = [[0, 0]];
  for (let i = 0; i < 6; i++) macroAxes.push([Math.cos((i / 6) * Math.PI * 2) * 0.46, Math.sin((i / 6) * Math.PI * 2) * 0.46]);
  for (let i = 0; i < 12; i++) macroAxes.push([Math.cos(((i + 0.5) / 12) * Math.PI * 2) * 0.9, Math.sin(((i + 0.5) / 12) * Math.PI * 2) * 0.9]);
  add(
    's-macrofibril',
    d(
      merge(
        macroAxes.map(([y, z], i) => {
          const tilt = Math.min(1, Math.hypot(y, z)) * 0.12;
          return tube([[cortexEnd - 0.1, y, z], [lerp(cortexEnd, macroEnd, 0.5), y * (1 + tilt), z * (1 + tilt)], [macroEnd, y * (1 + tilt * 2.5), z * (1 + tilt * 2.5)]], 0.205 - (i % 3) * 0.006, { n: 12, m: 14 });
        }),
      ),
      'macro',
    ),
  );
  // микрофибриллы: каждый жгут распускается на 7 спиральных нитей
  const micro: BufferGeometry[] = [];
  macroAxes.forEach(([y, z], i) => {
    const tilt = Math.min(1, Math.hypot(y, z)) * 0.12;
    const cy = y * (1 + tilt * 2.5);
    const cz = z * (1 + tilt * 2.5);
    for (let s = 0; s < 7; s++) {
      const ph = (s / 7) * Math.PI * 2 + i;
      const pts: V3[] = Array.from({ length: 16 }, (_, k) => {
        const t = k / 15;
        const rad = (s === 0 ? 0 : 0.11 + 0.05 * t) * (1 + t * 0.6);
        const sp = s === 0 ? 0 : 1;
        return [lerp(macroEnd - 0.05, microEnd - (i % 4) * 0.15, t), cy * (1 + t * 0.12) + Math.cos(ph + t * 6.5) * rad * sp, cz * (1 + t * 0.12) + Math.sin(ph + t * 6.5) * rad * sp];
      });
      micro.push(tube(pts, 0.036, { n: 22, m: 5 }));
    }
  });
  add('s-microfibril', d(merge(micro), 'micro'));

  // меланосомы: зёрна пигмента на поверхности клеток коры и между жгутами
  const gr: BufferGeometry[] = [];
  for (let i = 0; i < 360; i++) {
    const x = lerp(cuticleEnd + 0.2, cortexEnd - 0.2, r());
    const a = r() * Math.PI * 2;
    gr.push(blob([x, Math.cos(a) * 1.605, Math.sin(a) * 1.605], [0.12, 0.05, 0.05], { seg: 6, seed: i, amp: 0.1, rot: [r() * 3, r() * 3, r() * 3] }));
  }
  for (let i = 0; i < 90; i++) {
    const x = lerp(cortexEnd + 0.1, macroEnd - 0.2, r());
    const a = r() * Math.PI * 2;
    const rad = lerp(0.2, 1.15, r());
    gr.push(blob([x, Math.cos(a) * rad, Math.sin(a) * rad], [0.1, 0.045, 0.045], { seg: 6, rot: [r() * 3, r() * 3, r() * 3] }));
  }
  add('s-melanosomes', d(merge(gr), 'melanosome'));

  // сечения трёх типов волос лицом к зрителю
  const bean = (a: number) => 1 - 0.26 * Math.exp(-(Math.min(a, Math.PI * 2 - a) ** 2) / 0.3);
  const kinds: { id: string; x: number; ry: number; rz: number; shape?: (a: number) => number; medulla: number }[] = [
    { id: 't-round', x: -4.6, ry: 1.7, rz: 1.7, medulla: 0.34 },
    { id: 't-oval', x: 0.4, ry: 1.2, rz: 1.85, medulla: 0.3 },
    { id: 't-flat', x: 5.6, ry: 0.72, rz: 2.15, shape: bean, medulla: 0 },
  ];
  for (const k of kinds) {
    const at = (_rot: number, ry: number, rz: number, off: number, m: MatKey, shape?: (a: number) => number) =>
      d(place(disc(off, ry, rz, { shape, m: 56, thick: 0.18 }), [k.x, -5.8, 0], [0, Math.PI / 2, 0]), m);
    const defs = [at(0, k.ry, k.rz, 0, 'cuticleHair', k.shape), at(0, k.ry * 0.88, k.rz * 0.88, -0.03, 'cortex', k.shape)];
    if (k.medulla) defs.push(at(0, k.medulla, k.medulla * (k.rz / k.ry), -0.06, 'medulla'));
    // меланин: тёмные зёрна в коре
    const dots: BufferGeometry[] = [];
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const rr = lerp(0.35, 0.82, Math.sqrt(r()));
      const sh = k.shape ? k.shape(a) : 1;
      dots.push(blob([-0.04, Math.cos(a) * k.ry * rr * sh * 0.88, Math.sin(a) * k.rz * rr * sh * 0.88], [0.045, 0.045, 0.045], { seg: 5 }));
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
