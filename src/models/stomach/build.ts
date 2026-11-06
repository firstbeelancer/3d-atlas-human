import { BufferAttribute, BufferGeometry } from 'three';
import { MeshBuilder, rng } from '../liver/tubes';
import { LAYER_COLORS, LAYER_IDS, type Vec } from './anatomy';
import { ESO_INSIDE, esophagusGeometry } from './esophagus';
import { StripBuilder, buildGrid, cutStrips, indexFor, inWin, type GridData, type RGB, type Win } from './grid';
import { CUT_WINDOW, LAYER_WINDOWS } from './windows';
import { LENGTH, TAU, offsets, outerPoint, sAt, smooth, wallPoint, type Row, type V3 } from './shape';

/*
  Сборка геометрии желудка: стенка в нескольких видах (целая, окно разреза, ступенчатая препаровка слоёв),
  пищевод, сосуды с ветвями по стенке, блуждающие нервы и сальники. Всё считается в коде; в браузере — в фоновом потоке.
*/

export type EntityKind =
  | 'serosa'
  | 'muscle-longitudinal'
  | 'muscle-circular'
  | 'muscle-oblique'
  | 'submucosa'
  | 'mucosa'
  | 'cut'
  | 'esophagus'
  | 'omentum'
  | 'lesser-omentum'
  | 'artery'
  | 'vein'
  | 'nerve';

export interface Entity {
  id: string;
  kind: EntityKind;
  geometry: BufferGeometry;
}

export interface StomachGeometry {
  entities: Entity[];
  /** Точки на поверхности частей для подписей. */
  anchors: Record<string, Vec>;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

/** Цвет слизистой, запечённое затенение складок (ложбины темнее) и оттенок по отделам. */
function mucosaColor(h: number, row: Row): RGB {
  const ao = 0.4 + 0.6 * Math.pow(h, 0.7);
  const pale = smooth(6.2, 7.6, row.k) * (1 - row.duo);
  const duo = row.duo;
  const r = 1 - 0.0 * pale + 0.02 * duo;
  const g = 1 - 0.05 * pale - 0.1 * duo;
  const b = 1 - 0.03 * pale - 0.2 * duo;
  return [r * ao, g * ao, b * ao];
}

function attrsOf(g: GridData) {
  return {
    position: new BufferAttribute(g.position, 3),
    normal: new BufferAttribute(g.normal, 3),
    uv: new BufferAttribute(g.uv, 2),
    aSV: new BufferAttribute(g.sv, 2),
    color: g.color ? new BufferAttribute(g.color, 3) : null,
  };
}

function geometryOf(a: ReturnType<typeof attrsOf>, index: Uint32Array): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', a.position);
  g.setAttribute('normal', a.normal);
  g.setAttribute('uv', a.uv);
  g.setAttribute('aSV', a.aSV);
  if (a.color) g.setAttribute('color', a.color);
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function stripGeometry(sb: StripBuilder): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(sb.pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(sb.nrm), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(sb.col), 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const PI = Math.PI;

/** Точка на поверхности слоя k (0..6) по (s, v). */
function layerPoint(k: number, s: number, v: number): V3 {
  const row = rowAt(s);
  const off = new Float64Array(7);
  offsets(row, v, off, k >= 5);
  return wallPoint(row, v, off[k]);
}

import { rows as tableRows, rowIndexAt } from './shape';
const rowAt = (s: number) => tableRows()[rowIndexAt(s)];

/* ------------------------------ сосуды и нервы ------------------------------ */

/** Путь по наружной стенке: v задаётся функцией доли пути. */
function surfaceTrack(s0: number, s1: number, v: (f: number) => number, lift: number, n = 28): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    out.push(outerPoint(s0 + (s1 - s0) * f, v(f), lift));
  }
  return out;
}

/** Веточки от дуги кровоснабжения по передней и задней стенке: каждая ветвится ещё раз. */
function wallBranches(
  mb: MeshBuilder,
  rand: () => number,
  s0: number,
  s1: number,
  count: number,
  vArc: number,
  dir: 1 | -1,
  reach: number,
  r0: number,
  phase = 0,
): void {
  for (let i = 0; i < count; i++) {
    const s = s0 + ((i + 0.5 + phase) / count) * (s1 - s0);
    const len = reach * (0.55 + 0.45 * rand());
    const sway = 0.5 + rand();
    const pts: V3[] = [];
    const N = 9;
    for (let j = 0; j <= N; j++) {
      const f = j / N;
      pts.push(outerPoint(s + 0.06 * Math.sin(f * 4 * sway + i), vArc + dir * len * f, 0.012));
    }
    mb.tube(pts, r0, r0 * 0.3, { radial: 8 });
    // два боковых отростка
    for (const side of [-1, 1]) {
      const f0 = 0.35 + 0.25 * rand();
      const base = Math.round(f0 * N);
      const pts2: V3[] = [];
      for (let j = 0; j <= 5; j++) {
        const f = j / 5;
        pts2.push(outerPoint(s + 0.06 * Math.sin((base / N) * 4 * sway + i) + side * 0.2 * f * (0.6 + 0.6 * rand()), vArc + dir * (len * f0 + len * 0.4 * f), 0.011));
      }
      mb.tube(pts2, r0 * 0.55, r0 * 0.2, { radial: 6 });
    }
  }
}

function vessels(): { artery: Record<string, MeshBuilder>; vein: MeshBuilder } {
  const rand = rng(777);
  const s = (k: number) => sAt(k);
  const lg = new MeshBuilder(); // левая желудочная артерия
  const rg = new MeshBuilder(); // правая желудочная артерия
  const ge = new MeshBuilder(); // желудочно-сальниковые артерии
  const sh = new MeshBuilder(); // короткие желудочные артерии
  const vn = new MeshBuilder(); // вены

  // левая желудочная: от чревного ствола вверх к кардии, затем вниз по малой кривизне
  const cardia = outerPoint(s(1.2), PI + 0.35, 0.03);
  lg.tube([[-1.0, 0.05, -0.95], [-0.8, 0.6, -0.8], [-0.55, 1.15, -0.62], [-0.3, 1.45, -0.5], cardia], 0.045, 0.034);
  lg.tube([cardia, ...surfaceTrack(s(1.3), s(4.7), (f) => PI + 0.14 - 0.1 * f, 0.03, 30)], 0.034, 0.024);
  wallBranches(lg, rand, s(1.5), s(4.6), 11, PI + 0.14, 1, 1.15, 0.016);
  wallBranches(lg, rand, s(1.6), s(4.5), 10, PI + 0.0, -1, 1.2, 0.016, 0.4);

  // правая желудочная: от собственной печёночной артерии вдоль привратника, навстречу левой
  rg.tube([[-1.95, 0.35, -0.5], [-1.85, 0.05, -0.35], outerPoint(s(7.6), PI - 0.1, 0.03)], 0.03, 0.026);
  rg.tube(surfaceTrack(s(7.6), s(4.5), (f) => PI - 0.12 + 0.06 * f, 0.03, 26), 0.026, 0.022);
  wallBranches(rg, rand, s(4.8), s(7.4), 8, PI - 0.1, -1, 0.95, 0.013);
  wallBranches(rg, rand, s(4.9), s(7.3), 7, PI + 0.08, 1, 0.9, 0.013, 0.4);

  // правая и левая желудочно-сальниковые: дуга вдоль большой кривизны
  const gStart = outerPoint(s(8.0), -0.1, 0.045);
  ge.tube([[-2.15, -1.25, -0.25], [-2.15, -1.0, -0.12], gStart], 0.036, 0.03);
  ge.tube(surfaceTrack(s(8.0), s(2.4), (f) => -0.09 + 0.02 * Math.sin(f * 9), 0.045, 56), 0.03, 0.022);
  wallBranches(ge, rand, s(2.6), s(7.8), 18, -0.09, -1, 1.3, 0.016);
  wallBranches(ge, rand, s(2.7), s(7.7), 17, 0.09, 1, 1.35, 0.016, 0.45);
  // нисходящие ветви в большой сальник
  for (let i = 0; i < 9; i++) {
    const sPos = s(3 + i * 0.5);
    const p = outerPoint(sPos, 0, 0.06);
    ge.tube([p, [p[0] + 0.05, p[1] - 0.25, p[2] + 0.12], [p[0] + 0.02, p[1] - 0.6 - 0.15 * rand(), p[2] + 0.28]], 0.012, 0.005, { radial: 6 });
  }

  // короткие желудочные артерии от селезёночных сосудов к дну
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const target = outerPoint(s(0.85 + t * 1.15), -0.28 - 0.1 * t + 0.0, 0.025);
    const from: V3 = [2.05, 1.7 - 0.65 * t, -0.8];
    sh.tube([from, [from[0] - 0.12, from[1] - 0.08 * (1 + t), -0.62], target], 0.013, 0.008, { radial: 8 });
    wallBranches(sh, rand, s(0.85 + t * 1.15) - 0.05, s(0.85 + t * 1.15) + 0.05, 1, -0.28, -1, 0.7, 0.01);
  }

  // вены идут рядом с артериями и крупнее
  vn.tube([[-1.15, 0.05, -1.0], [-0.85, 0.7, -0.85], outerPoint(s(1.2), PI + 0.55, 0.035)], 0.04, 0.032);
  vn.tube(surfaceTrack(s(1.2), s(4.6), (f) => PI + 0.3 + 0.1 * f, 0.034, 30), 0.032, 0.024);
  vn.tube(surfaceTrack(s(7.6), s(4.6), (f) => PI + 0.18 - 0.06 * f, 0.034, 26), 0.03, 0.025);
  vn.tube(surfaceTrack(s(8.0), s(2.5), (f) => 0.08 + 0.02 * Math.sin(f * 8), 0.045, 56), 0.033, 0.026);
  vn.tube([[-2.2, -1.2, -0.3], [-2.25, -1.0, -0.15], outerPoint(s(8.0), 0.08, 0.045)], 0.04, 0.034);
  wallBranches(vn, rand, s(1.55), s(4.5), 9, PI + 0.3, 1, 1.0, 0.018, 0.25);
  wallBranches(vn, rand, s(1.65), s(4.45), 8, PI + 0.3, -1, 0.95, 0.018, 0.7);
  wallBranches(vn, rand, s(2.8), s(7.7), 14, 0.08, 1, 1.2, 0.018, 0.2);
  wallBranches(vn, rand, s(2.9), s(7.6), 13, 0.08, -1, 1.2, 0.018, 0.7);
  wallBranches(vn, rand, s(4.9), s(7.4), 6, PI + 0.18, -1, 0.8, 0.014, 0.5);

  return { artery: { 'left-gastric-artery': lg, 'right-gastric-artery': rg, 'gastroepiploic-arteries': ge, 'short-gastric-arteries': sh }, vein: vn };
}

function nerves(eso: (t: number) => V3): MeshBuilder {
  const rand = rng(4242);
  const mb = new MeshBuilder();
  const s = (k: number) => sAt(k);
  for (const side of [1, -1]) {
    const off = (p: V3): V3 => [p[0], p[1], p[2] + side * 0.205];
    const trunk: V3[] = [0.04, 0.2, 0.4, 0.6, 0.78].map((t) => off(eso(t)));
    const v0 = PI - side * 0.45;
    const start = outerPoint(s(1.25), v0, 0.02);
    mb.tube([...trunk, start], 0.026, 0.02, { radial: 10 });
    // нерв Латарже вдоль малой кривизны
    mb.tube(surfaceTrack(s(1.25), s(4.7), (f) => v0 + side * 0.1 * f, 0.02, 30), 0.02, 0.014, { radial: 8 });
    // веточки к стенке желудка
    wallBranches(mb, rand, s(1.5), s(4.5), 7, v0, side === 1 ? -1 : 1, 0.6, 0.008, side * 0.1);
    // «гусиная лапка» к привратниковой части
    const base = s(4.7);
    for (let i = 0; i < 5; i++) {
      const pts: V3[] = [];
      for (let j = 0; j <= 10; j++) {
        const f = j / 10;
        pts.push(outerPoint(base + f * (0.55 + 0.35 * i), v0 + side * 0.1 - side * 0.45 * f * (i - 2) * 0.4 - side * 0.1 * f, 0.018));
      }
      mb.tube(pts, 0.012, 0.005, { radial: 7 });
    }
  }
  // печёночная и чревная ветви
  mb.tube([[...eso(0.7)] as V3, [-0.75, 1.45, -0.25], [-1.25, 1.3, -0.3]].map((p, i) => (i === 0 ? ([p[0], p[1], p[2] + 0.2] as V3) : (p as V3))), 0.014, 0.009, { radial: 8 });
  mb.tube([[...eso(0.7)] as V3, [-0.7, 0.95, -0.8], [-0.95, 0.45, -0.9]].map((p, i) => (i === 0 ? ([p[0], p[1], p[2] - 0.2] as V3) : (p as V3))), 0.014, 0.009, { radial: 8 });
  return mb;
}

/* ------------------------------ сальники ------------------------------ */

function omenta(): { greater: BufferGeometry; lesser: BufferGeometry } {
  const g = new MeshBuilder();
  const sA = sAt(2.3);
  const sB = sAt(7.9);
  g.sheet(
    (u, v) => {
      const s = sA + (sB - sA) * u;
      const top = outerPoint(s, -0.06, 0.012);
      const row = rowAt(s);
      const drop = 1.55 + 0.5 * Math.sin(u * 5.3 + 1) + 0.3 * Math.sin(u * 13) - 0.7 * smooth(0.8, 1, u);
      const ruffle = 0.07 * Math.sin(u * 46 + v * 6) * v;
      const e = v * v * 0.35 + v * 0.1;
      return [top[0] + row.N[0] * e + ruffle * 0.5, top[1] - drop * v + row.N[1] * e * 0.6, top[2] + 0.34 * v + 0.05 * Math.sin(u * 20) * v + ruffle];
    },
    120,
    28,
  );
  const l = new MeshBuilder();
  const lA = sAt(1.3);
  const lB = sAt(7.6);
  l.sheet(
    (u, w) => {
      const s = lA + (lB - lA) * u;
      const base = outerPoint(s, PI, 0.01);
      const top: V3 = lerp3([-0.4, 2.35, -0.78], [-1.85, 0.2, -0.6], u);
      const p = lerp3(base, top, w);
      const wave = 0.04 * Math.sin(u * 30 + w * 4) * w;
      return [p[0] + wave, p[1] - 0.18 * Math.sin(w * PI) * (1 - u * 0.5), p[2] + wave];
    },
    90,
    14,
  );
  return { greater: g.build(), lesser: l.build() };
}

/* ------------------------------ главная функция ------------------------------ */

export function stomachGeometry(): StomachGeometry {
  const entities: Entity[] = [];
  const anchors: Record<string, Vec> = {};
  const push = (id: string, kind: EntityKind, geometry: BufferGeometry) => entities.push({ id, kind, geometry });

  /* --- стенка --- */
  const grids: GridData[] = [];
  const uvScale: [number, number][] = [
    [1.0, 4],
    [0.55, 3],
    [0.55, 3],
    [0.55, 3],
    [0.8, 4],
  ];
  for (let k = 0; k < 5; k++) grids.push(buildGrid(k, 2, { uv: uvScale[k] }));
  grids.push(buildGrid(5, 3, { uv: [1.0, 6], color: (h, row) => mucosaColor(h, row) }));
  grids.push(buildGrid(6, 3, { uv: [1.0, 6], color: (h, row) => mucosaColor(h, row), inward: true }));
  const A = grids.map(attrsOf);
  const cutGone = (rb: number, cb: number) => inWin(CUT_WINDOW, rb, cb);

  push('wall-closed', 'serosa', geometryOf(A[0], indexFor(grids[0], null)));
  push('wall-cut', 'serosa', geometryOf(A[0], indexFor(grids[0], cutGone)));
  push('lumen-cut', 'mucosa', geometryOf(A[6], indexFor(grids[6], cutGone, true)));

  const colors = LAYER_IDS.map((id) => hex(LAYER_COLORS[id]));
  const cutSb = new StripBuilder();
  cutStrips(cutSb, Array<Win>(6).fill(CUT_WINDOW), colors, true);
  push('cut-window', 'cut', stripGeometry(cutSb));

  const layerKinds: EntityKind[] = ['serosa', 'muscle-longitudinal', 'muscle-circular', 'muscle-oblique', 'submucosa'];
  for (let k = 0; k < 5; k++) {
    const w = LAYER_WINDOWS[k];
    push(`layer-${k}`, layerKinds[k], geometryOf(A[k], indexFor(grids[k], (rb, cb) => inWin(w, rb, cb))));
  }
  push('layer-mucosa', 'mucosa', geometryOf(A[5], indexFor(grids[5], null)));
  const layerSb = new StripBuilder();
  cutStrips(layerSb, [...LAYER_WINDOWS, null as unknown as Win], colors, true);
  push('cut-layers', 'cut', stripGeometry(layerSb));

  /* --- лёгкие невидимые сетки для выбора мышью: высокодетальную стенку не перебираем при каждом движении --- */
  const pick = (id: string, surface: number, mask: Win | null) => {
    const g = buildGrid(surface, 1, { uv: [1, 1] });
    push(id, 'serosa', geometryOf(attrsOf(g), indexFor(g, mask ? (rb, cb) => inWin(mask, rb, cb) : null)));
  };
  pick('pick-closed', 0, null);
  pick('pick-cut', 0, CUT_WINDOW);
  for (let k = 0; k < 5; k++) pick(`pick-layer-${k}`, k, LAYER_WINDOWS[k]);
  pick('pick-mucosa', 5, null);

  /* --- пищевод --- */
  const eso = esophagusGeometry();
  push('esophagus', 'esophagus', eso.outer);
  push('esophagus-lumen', 'esophagus', eso.lumen);
  push('esophagus-cut', 'cut', eso.cut);

  /* --- сосуды, нервы, сальники --- */
  const v = vessels();
  for (const [id, mb] of Object.entries(v.artery)) push(id, 'artery', mb.build());
  push('gastric-veins', 'vein', v.vein.build());
  push('vagus-nerves', 'nerve', nerves(eso.at).build());
  const om = omenta();
  push('greater-omentum', 'omentum', om.greater);
  push('lesser-omentum', 'lesser-omentum', om.lesser);

  /* --- якоря подписей --- */
  const s = (k: number) => sAt(k);
  const front = (k: number, dv = 0, lift = 0.02): Vec => outerPoint(s(k), PI / 2 + dv, lift);
  anchors.fundus = front(0.55, 0.15);
  anchors.body = front(2.6, 0.2);
  anchors.cardia = outerPoint(s(1.12), PI + 0.15, 0.02);
  anchors.antrum = front(5.3, 0.1);
  anchors['pyloric-canal'] = front(7.3, 0);
  anchors.pylorus = front(8.0, -0.2);
  anchors.duodenum = outerPoint(s(10.3), PI / 2 + 0.2, 0.02);
  anchors['lesser-curvature'] = outerPoint(s(3.4), PI, 0.02);
  anchors['greater-curvature'] = outerPoint(s(3.2), 0, 0.02);
  anchors['angular-notch'] = outerPoint(s(4.65), PI, 0.02);
  anchors['cardiac-notch'] = outerPoint(s(0.95), PI - 0.1, 0.02);
  anchors.esophagus = eso.at(0.35);
  anchors['left-gastric-artery'] = outerPoint(s(2.3), PI + 0.14, 0.04);
  anchors['right-gastric-artery'] = outerPoint(s(6.6), PI - 0.12, 0.04);
  anchors['gastroepiploic-arteries'] = outerPoint(s(5.6), -0.09, 0.05);
  anchors['short-gastric-arteries'] = outerPoint(s(1.5), -0.38, 0.03);
  anchors['gastric-veins'] = outerPoint(s(3.8), 0.08, 0.05);
  anchors['vagus-nerves'] = [eso.at(0.5)[0], eso.at(0.5)[1], eso.at(0.5)[2] + 0.22];
  anchors['greater-omentum'] = [anchors['gastroepiploic-arteries'][0] - 0.1, anchors['gastroepiploic-arteries'][1] - 0.95, anchors['gastroepiploic-arteries'][2] + 0.3];
  anchors['lesser-omentum'] = lerp3(outerPoint(s(3.4), PI, 0.01), [-1.0, 1.1, -0.7], 0.5);
  // внутри: на задней стенке просвета
  const lumen = (k: number, vv: number): Vec => layerPoint(6, s(k), vv);
  anchors.rugae = lumen(3.3, (3 * PI) / 2 - 0.45);
  anchors['gastric-canal'] = lumen(3.0, PI + 0.08);
  anchors['pyloric-sphincter'] = lumen(8.0, (3 * PI) / 2 + 0.0);
  anchors.mucosa = lumen(2.0, (3 * PI) / 2 + 0.7);
  // на ступенях препаровки
  // подписи слоёв разведены по высоте вдоль ступеней: у каждого слоя своя полоска, видимая между окнами
  const cols = [3, 7, 9, 11, 13];
  const heights = [1.2, 1.75, 2.25, 2.7, 3.15];
  LAYER_IDS.slice(0, 5).forEach((id, k) => (anchors[`layer:${id}`] = layerPoint(k, s(heights[k]), (cols[k] / 72) * TAU)));
  anchors['layer:mucosa'] = layerPoint(5, s(2.6), (19 / 72) * TAU);
  anchors['esophagus-inside'] = eso.at(ESO_INSIDE + 0.05);
  void LENGTH;
  return { entities, anchors };
}
