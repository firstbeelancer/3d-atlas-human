import { mulberry32 } from '../gallbladder/geometry';
import type { V3 } from './anatomy';

/*
  Железа «под микроскопом» (очень сильно увеличена). Слева — долька экзокринной части: соединительнотканная
  перегородка с междольковым протоком, сосудом и нервом, внутридольковый проток, вставочные протоки и гроздья ацинусов;
  один ацинус вскрыт — виден просвет, зимогенные гранулы и центроацинарная клетка. Справа — островок Лангерганса
  в разрезе: четыре типа клеток, капилляры с окнами, нерв; вокруг островка — ацинарные клетки.
*/

export interface Ell {
  p: V3;
  /** Единичное направление длинной оси. */
  dir: V3;
  /** Полудлина вдоль оси и полуширина. */
  rl: number;
  rs: number;
  tint: number;
}

export interface Ball {
  p: V3;
  r: number;
  tint: number;
}

export interface Acinus {
  c: V3;
  R: number;
  hero?: boolean;
  /** Промежуточная точка вставочного протока (чтобы протоки не пересекали соседей). */
  via?: V3;
}

export const ISLET = { c: [4.7, -0.3, 0] as V3, r: 2.1 };

export const ACINI: Acinus[] = [
  { c: [-3.6, 1.2, 0.3], R: 1.55, hero: true },
  { c: [-5.9, -1.9, 0.2], R: 1.0 },
  { c: [-3.0, -2.3, -0.4], R: 1.05 },
  { c: [-0.9, -0.5, 0.1], R: 1.0, via: [-1.4, -0.9, 0.05] },
  { c: [-6.5, 2.8, -0.2], R: 0.95, via: [-6.3, 1.0, 0.0] },
  { c: [-1.1, 3.0, -0.3], R: 0.95, via: [-1.6, 1.2, 0.0] },
  { c: [-0.7, -3.3, -0.5], R: 0.9, via: [-1.5, -2.2, -0.2] },
];

/** Внутридольковый проток: от перегородки к ацинусам. */
export const TRUNK: V3[] = [[-9.2, -0.9, 0], [-6.9, -0.8, 0.05], [-5.0, -0.35, 0.05], [-3.4, -0.7, 0], [-2.0, -1.1, 0]];
export const SEPTUM = { x: -9.2, y0: -4.7, y1: 4.7, z0: -2.5, z1: 2.5, t: 0.36 };
export const SEPTUM_DUCT: V3[] = [[-9.2, -4.6, 0], [-9.2, -0.9, 0], [-9.2, 4.6, 0]];
export const SEPTUM_ARTERY: V3[] = [[-9.15, -4.6, 1.3], [-9.25, -1.0, 1.35], [-9.15, 2.0, 1.25], [-9.2, 4.6, 1.3]];
export const SEPTUM_VEIN: V3[] = [[-9.2, -4.6, -1.3], [-9.15, -1.0, -1.35], [-9.25, 2.0, -1.25], [-9.2, 4.6, -1.3]];
export const SEPTUM_NERVE: V3[] = [[-9.3, -4.6, 0.65], [-9.1, -1.4, 0.75], [-9.3, 1.8, 0.7], [-9.2, 4.6, 0.65]];

type Rand = () => number;
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

function fib(n: number): V3[] {
  const out: V3[] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(g * i) * r, y, Math.sin(g * i) * r]);
  }
  return out;
}

/** Ветвящийся путь с лёгкой кривизной между двумя точками. */
const arc = (a: V3, b: V3, bend: V3, rand: Rand): V3[] => {
  const m = add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], bend, 0.5 + rand() * 0.4);
  return [a, m, b];
};

export interface MicroData {
  cells: Ell[];
  nuclei: Ball[];
  granules: Ball[];
  centro: Ell[];
  intercalated: V3[][];
  capLoops: { c: V3; R: number; tilt: V3 }[];
  capPaths: V3[][];
  islet: Record<'alpha' | 'beta' | 'delta' | 'pp', Ell[]>;
  isletCaps: V3[][];
  isletFeed: { artery: V3[]; vein: V3[] };
  nerve: V3[][];
  nerveBulbs: V3[];
  anchors: Record<string, V3>;
}

export function buildMicroData(): MicroData {
  const rand = mulberry32(2024);
  const cells: Ell[] = [];
  const nuclei: Ball[] = [];
  const granules: Ball[] = [];
  const centro: Ell[] = [];
  const intercalated: V3[][] = [];
  const anchors: Record<string, V3> = {};

  // направление вставочного протока каждого ацинуса — к ближайшей точке внутридольковой трубки
  const trunkAt = (p: V3): V3 => {
    let best = TRUNK[0];
    let bd = Infinity;
    for (let k = 0; k <= 40; k++) {
      const t = (k / 40) * (TRUNK.length - 1);
      const i = Math.min(TRUNK.length - 2, Math.floor(t));
      const f = t - i;
      const q: V3 = [0, 1, 2].map((a) => TRUNK[i][a] + (TRUNK[i + 1][a] - TRUNK[i][a]) * f) as V3;
      const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  };

  ACINI.forEach((ac, ai) => {
    const target = ac.via ?? trunkAt(ac.c);
    const out = norm([target[0] - ac.c[0], target[1] - ac.c[1], target[2] - ac.c[2]]);
    const n = ac.hero ? 14 : 10;
    // у вскрытого ацинуса «окно» к зрителю; протоки выходят в другую сторону
    for (const d of fib(n)) {
      if (ac.hero && d[2] > 0.42) continue;
      // клетки не должны закрывать место выхода протока
      const gap = d[0] * out[0] + d[1] * out[1] + d[2] * out[2];
      if (gap > 0.93) continue;
      const R = ac.R;
      const p = add(ac.c, d, R * 0.64);
      cells.push({ p, dir: d, rl: R * 0.39, rs: R * (ac.hero ? 0.285 : 0.31), tint: rand() });
      nuclei.push({ p: add(ac.c, d, R * 0.86), r: R * 0.11, tint: rand() });
      if (ac.hero) {
        // зимогенные гранулы собраны у просвета (верхушечный полюс клетки)
        for (let g = 0; g < 17; g++) {
          const rr = R * (0.34 + 0.2 * rand());
          const jitter: V3 = [(rand() - 0.5) * 0.7, (rand() - 0.5) * 0.7, (rand() - 0.5) * 0.7];
          const q = norm(add(d, jitter, R * 0.5));
          granules.push({ p: add(ac.c, q, rr), r: 0.062 + rand() * 0.025, tint: rand() });
        }
      }
    }
    // центроацинарная клетка — на выходе просвета во вставочный проток
    centro.push({ p: add(ac.c, out, ac.R * 0.5), dir: out, rl: ac.R * 0.14, rs: ac.R * 0.2, tint: rand() });
    if (ac.hero) centro.push({ p: add(add(ac.c, out, ac.R * 0.36), [0, 0.08, 0.12]), dir: out, rl: ac.R * 0.1, rs: ac.R * 0.15, tint: rand() });
    const start = add(ac.c, out, ac.R * 0.98);
    intercalated.push(ac.via ? [start, ac.via, target === ac.via ? trunkAt(ac.via) : target] : arc(start, target, [0, 0, 0.2 * (ai % 2 ? 1 : -1)], rand));
    if (ac.hero) {
      anchors.acinus = [ac.c[0], ac.c[1] + ac.R * 1.0, ac.c[2] + 0.2];
      anchors['acinar-cell'] = add(ac.c, [-0.3, 0.9, -0.05], ac.R * 0.95);
      anchors.zymogen = add(ac.c, [-0.5, 0.2, 0.84], ac.R * 0.55);
      anchors.centroacinar = add(ac.c, out, ac.R * 0.5);
    }
  });
  anchors['intercalated-duct'] = [-6.6, 0.95, 0.0];
  anchors['intralobular-duct'] = [-7.4, -0.95, 0.15];
  anchors.septum = [-9.2, 3.2, 0.9];
  anchors['acinar-capillary'] = [-3.0, -3.55, 0.4];

  // капилляры: кольцо вокруг каждого малого ацинуса и общий сосуд, огибающий гроздь
  const capLoops = ACINI.filter((a) => !a.hero).map((a) => ({
    c: a.c,
    R: a.R * 1.09,
    tilt: norm([rand() - 0.5, rand() - 0.5, 0.4 + rand() * 0.4]),
  }));
  const capPaths: V3[][] = [
    [[-9.1, -3.4, 0.9], [-6.7, -3.4, 1.2], [-4.3, -3.9, 1.0], [-2.0, -4.1, 0.9], [0.4, -3.4, 0.7]],
    [[-9.1, 3.4, -0.9], [-7.6, 4.0, -1.0], [-5.0, 3.0, -0.9], [-3.0, 3.9, -1.0], [-0.2, 4.2, -0.8]],
  ];

  // островок: точки внутри шара с минимальным расстоянием; передняя часть срезана
  const pts: V3[] = [];
  const R = ISLET.r;
  let guard = 0;
  while (pts.length < 150 && guard++ < 6000) {
    const p: V3 = [(rand() * 2 - 1) * R, (rand() * 2 - 1) * R, (rand() * 2 - 1) * R];
    if (Math.hypot(...p) > R - 0.28) continue;
    if (pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.66)) continue;
    pts.push(p);
  }
  const islet: MicroData['islet'] = { alpha: [], beta: [], delta: [], pp: [] };
  const kinds = ['beta', 'alpha', 'delta', 'pp'] as const;
  for (const p of pts) {
    if (p[2] > 0.5) continue;
    // тонкие кровеносные русла проходят по трём осям — клетки не лезут в капилляры
    const r0 = rand();
    const kind = r0 < 0.56 ? 'beta' : r0 < 0.88 ? 'alpha' : r0 < 0.97 ? 'delta' : 'pp';
    const dir = norm([rand() - 0.5, rand() - 0.5, rand() - 0.5]);
    islet[kind].push({ p: add(ISLET.c, p), dir, rl: 0.3 + rand() * 0.06, rs: 0.27 + rand() * 0.04, tint: rand() });
  }
  const first = (k: (typeof kinds)[number]): V3 => {
    const list = islet[k];
    let best = list[0];
    for (const e of list) if (e.p[2] + e.p[1] * 0.2 > best.p[2] + best.p[1] * 0.2) best = e;
    return best ? best.p : ISLET.c;
  };
  anchors['beta-cell'] = first('beta');
  anchors['alpha-cell'] = first('alpha');
  anchors['delta-cell'] = first('delta');
  anchors['pp-cell'] = first('pp');
  anchors.islet = [ISLET.c[0] + 0.2, ISLET.c[1] + R * 1.02, ISLET.c[2] + 0.4];

  const c = ISLET.c;
  const isletCaps: V3[][] = [
    [[c[0] - 2.1, c[1] - 0.2, -0.2], [c[0] - 1.0, c[1] + 0.5, -0.5], [c[0] + 0.2, c[1] - 0.1, 0.1], [c[0] + 1.2, c[1] + 0.5, -0.3], [c[0] + 2.2, c[1] + 0.9, -0.2]],
    [[c[0] - 1.9, c[1] - 1.0, -0.6], [c[0] - 0.6, c[1] - 0.8, -0.1], [c[0] + 0.5, c[1] - 1.1, -0.6], [c[0] + 1.6, c[1] - 0.6, -0.1], [c[0] + 2.1, c[1] + 0.1, -0.5]],
    [[c[0] - 1.6, c[1] + 1.2, -0.3], [c[0] - 0.5, c[1] + 1.0, 0.2], [c[0] + 0.4, c[1] + 1.4, -0.2], [c[0] + 1.3, c[1] + 1.0, -0.5]],
  ];
  const isletFeed = {
    artery: [[c[0] - 4.6, c[1] - 2.8, -0.5], [c[0] - 3.4, c[1] - 1.6, -0.4], [c[0] - 2.2, c[1] - 0.3, -0.2]] as V3[],
    vein: [[c[0] + 2.2, c[1] + 0.9, -0.2], [c[0] + 3.3, c[1] + 1.8, -0.35], [c[0] + 4.4, c[1] + 2.6, -0.5]] as V3[],
  };
  anchors['islet-capillary'] = [c[0] - 2.9, c[1] - 0.95, -0.3];

  const nerve: V3[][] = [
    [[c[0] + 0.3, c[1] - 4.6, -0.2], [c[0] + 0.2, c[1] - 3.2, -0.1], [c[0] + 0.3, c[1] - 2.0, 0.0]],
    [[c[0] + 0.3, c[1] - 2.0, 0.0], [c[0] - 0.3, c[1] - 1.5, -0.2], [c[0] - 0.7, c[1] - 0.6, -0.1]],
    [[c[0] + 0.3, c[1] - 2.0, 0.0], [c[0] + 0.9, c[1] - 1.4, -0.3], [c[0] + 1.2, c[1] - 0.4, -0.2]],
    [[c[0] + 0.3, c[1] - 2.0, 0.0], [c[0] + 0.5, c[1] - 1.2, 0.1], [c[0] + 0.1, c[1] - 0.2, 0.15]],
  ];
  const nerveBulbs: V3[] = [nerve[1][2], nerve[2][2], nerve[3][2]];
  anchors['islet-nerve'] = [c[0] + 0.5, c[1] - 3.4, -0.1];

  // ацинарные клетки вокруг островка (передняя часть тоже срезана)
  for (const d of fib(30)) {
    if (d[2] > 0.3) continue;
    const dd = Math.hypot(...d);
    cells.push({ p: add(ISLET.c, d, R + 0.5 / dd), dir: d, rl: 0.5, rs: 0.34, tint: rand() });
    nuclei.push({ p: add(ISLET.c, d, R + 0.95), r: 0.13, tint: rand() });
  }

  return { cells, nuclei, granules, centro, intercalated, capLoops, capPaths, islet, isletCaps, isletFeed, nerve, nerveBulbs, anchors };
}
