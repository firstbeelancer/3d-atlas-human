import { BufferAttribute, type BufferGeometry } from 'three';
import { meshSdf, type Sdf } from '../skeleton/sdf';
import { LOBE_IDS, SEGMENT_IDS, type Vec } from './anatomy';
import {
  GB_PATH,
  LOBE_CELLS,
  SEGMENT_CELLS,
  gallbladderField,
  liverBody,
  onVisceral,
  partField,
  surfaceUnder,
  surfaceZ,
} from './shape';
import { MeshBuilder, rng } from './tubes';

/*
  Сборка всей геометрии печени: паренхима (4 доли, 9 сегментов, прозрачная оболочка), желчный пузырь,
  сосудистые деревья (воротная вена с печёночной артерией и желчными протоками в «триадах», печёночные вены),
  нижняя полая вена, протоки и связки. Всё считается в коде; в браузере — в фоновом потоке.
*/

export type EntityKind = 'liver' | 'shell' | 'gallbladder' | 'bile' | 'portal' | 'artery' | 'vein' | 'duct' | 'ligament';

export interface Entity {
  id: string;
  kind: EntityKind;
  geometry: BufferGeometry;
}

export interface LiverGeometry {
  entities: Entity[];
  /** Точки на поверхности частей для подписей. */
  anchors: Record<string, Vec>;
}

/* ------------------------------ векторы ------------------------------ */
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec): Vec => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

function perp(d: Vec, rand: () => number): Vec {
  const r: Vec = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
  return unit(cross(d, r));
}

function rotate(v: Vec, k: Vec, a: number): Vec {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kv = cross(k, v);
  return add(add(mul(v, c), mul(kv, s)), mul(k, dot(k, v) * (1 - c)));
}

interface Branch {
  pts: Vec[];
  r: number;
  depth: number;
}

/** Ветвящееся дерево: каждая ветка делится надвое, дочерние тоньше и тянутся к цели внутри сегмента. */
function grow(out: Branch[], rand: () => number, f: Sdf, p: Vec, dir: Vec, r: number, len: number, depth: number, target: Vec): void {
  if (r < 0.011 || depth < 0) return;
  let L = len;
  let end: Vec | null = null;
  for (let k = 0; k < 4; k++) {
    const e = add(p, mul(dir, L));
    if (f(e[0], e[1], e[2]) < -0.15) {
      end = e;
      break;
    }
    L *= 0.65;
  }
  if (!end) return;
  const mid = add(add(p, mul(dir, L * 0.5)), mul(perp(dir, rand), L * 0.12 * (rand() - 0.5) * 2));
  out.push({ pts: [p, mid, end], r, depth });
  for (let c = 0; c < 2; c++) {
    const ang = (0.4 + rand() * 0.45) * (c === 0 ? 1 : -1);
    let nd = rotate(dir, perp(dir, rand), ang);
    const tgt = add(target, [(rand() - 0.5) * 0.9, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6]);
    nd = unit(add(mul(nd, 0.72), mul(unit(sub(tgt, end)), 0.28)));
    grow(out, rand, f, end, nd, r * 0.76, len * 0.8, depth - 1, target);
  }
}

/* ------------------------------ окраска паренхимы ------------------------------ */

function noise(x: number, y: number, z: number): number {
  return (Math.sin(x * 2.1 + y * 1.3) * Math.sin(y * 1.7 - z * 2.3) + Math.sin(z * 3.1 + x * 0.7) * Math.sin(x * 2.9 - y * 1.1 + 1.3)) * 0.5;
}

/** Цвет вершин: затенение углублений × лёгкая пятнистость; поверхности среза светлее и теплее. */
function paint(geo: BufferGeometry, body: Sdf, cell: Sdf): void {
  const pos = geo.attributes.position;
  const ao = geo.attributes.color;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = ao ? ao.getX(i) : 1;
    const cut = body(x, y, z) < -0.03 && Math.abs(cell(x, y, z)) < 0.03;
    const m = a * (0.93 + 0.09 * noise(x, y, z));
    const rgb: Vec = cut ? [1, 0.8, 0.68] : [0.97, 0.91, 0.89];
    out[i * 3] = m * rgb[0];
    out[i * 3 + 1] = m * rgb[1];
    out[i * 3 + 2] = m * rgb[2];
  }
  geo.setAttribute('color', new BufferAttribute(out, 3));
}

/* ------------------------------ главная функция ------------------------------ */

export function liverGeometry(quality: 'high' | 'low' = 'high'): LiverGeometry {
  const body = liverBody();
  const k = quality === 'high' ? 1 : 2.4;
  const box = { min: [-3.4, -2.0, -1.8] as Vec, max: [3.5, 2.05, 1.8] as Vec };
  const entities: Entity[] = [];
  const anchors: Record<string, Vec> = {};

  /* --- паренхима --- */
  const mesh = (field: Sdf, cell: number, ao?: number) => meshSdf(field, { ...box, cell: cell * k, ao });
  for (const id of LOBE_IDS) {
    const g = mesh(partField(body, LOBE_CELLS[id]), 0.04, 0.07);
    paint(g, body, LOBE_CELLS[id]);
    entities.push({ id, kind: 'liver', geometry: g });
  }
  for (const id of SEGMENT_IDS) {
    const g = mesh(partField(body, SEGMENT_CELLS[id]), 0.04, 0.07);
    paint(g, body, SEGMENT_CELLS[id]);
    entities.push({ id, kind: 'liver', geometry: g });
  }
  entities.push({ id: 'shell', kind: 'shell', geometry: mesh(body, 0.075) });

  /* --- желчный пузырь --- */
  const gb = meshSdf(gallbladderField(), { ...box, cell: 0.03 * k, ao: 0.05 });
  entities.push({ id: 'gallbladder', kind: 'gallbladder', geometry: gb });
  entities.push({ id: 'gallbladder-lumen', kind: 'bile', geometry: meshSdf(gallbladderField(-0.045), { ...box, cell: 0.035 * k }) });

  /* --- воротная вена, артерия и протоки внутри печени --- */
  const vp = (x: number, z: number, depth: number): Vec => onVisceral(x, z, -depth);
  const PV = new MeshBuilder();
  const HA = new MeshBuilder();
  const BD = new MeshBuilder();
  const HV = new MeshBuilder();

  const B = vp(-0.05, -0.12, 0.12);
  const S = onVisceral(0.6, -0.3, 1.7);
  PV.tube([S, onVisceral(0.45, -0.25, 1.0), onVisceral(0.3, -0.2, 0.5), B], 0.165, 0.15);
  const RA = vp(-0.95, -0.2, 0.3);
  PV.tube([B, vp(-0.5, -0.15, 0.17), RA], 0.14, 0.115);
  const LT = vp(0.42, -0.15, 0.2);
  PV.tube([B, vp(0.2, -0.14, 0.15), LT], 0.12, 0.1);
  const LU = vp(0.3, 0.55, 0.22);
  PV.tube([LT, vp(0.38, 0.1, 0.22), LU], 0.1, 0.08);

  const rand = rng(20261107);
  const branches: Branch[] = [];
  const roots: [Vec, Vec, number, number, Vec][] = [
    [RA, [-0.2, 0.55, 0.65], 0.085, 0.55, [-1.3, 0.8, 0.4]],
    [RA, [-0.3, -0.35, 0.75], 0.08, 0.55, [-1.2, -0.7, 0.5]],
    [RA, [-0.85, 0.35, -0.15], 0.08, 0.55, [-2.0, 0.6, -0.5]],
    [RA, [-0.9, -0.55, -0.1], 0.08, 0.55, [-1.9, -0.6, -0.3]],
    [LU, [0.5, 0.7, -0.5], 0.06, 0.5, [1.2, 0.6, -0.2]],
    [LU, [0.6, -0.2, 0.6], 0.06, 0.5, [1.4, -0.1, 0.2]],
    [LU, [-0.5, -0.3, 0.5], 0.05, 0.45, [-0.05, -0.5, 0.7]],
    [LU, [-0.3, 0.8, 0.1], 0.05, 0.45, [0, 0.7, 0.4]],
    [B, [-0.1, 0.4, -0.8], 0.05, 0.4, [-0.1, 0.3, -0.55]],
    [LT, [0.1, 0.5, -0.8], 0.045, 0.4, [-0.05, 0.4, -0.55]],
  ];
  for (const [p, d, r, len, target] of roots) grow(branches, rand, body, p, unit(d), r, len, 4, target);
  for (const b of branches) PV.tube(b.pts, b.r, b.r * 0.8);

  // триады: рядом с крупными ветками воротной вены идут артерия и проток
  for (const b of branches) {
    if (b.r < 0.032) continue;
    const d = unit(sub(b.pts[2], b.pts[0]));
    let o = cross(d, [0, 1, 0]);
    if (Math.hypot(...o) < 0.2) o = cross(d, [1, 0, 0]);
    o = unit(o);
    const shift = b.r * 1.55;
    HA.tube(b.pts.map((p) => add(p, mul(o, shift))), b.r * 0.32, b.r * 0.25);
    BD.tube(b.pts.map((p) => sub(p, mul(o, shift))), b.r * 0.28, b.r * 0.22);
  }

  // печёночная артерия снаружи печени
  const haEnd = vp(0.05, 0.12, 0.1);
  HA.tube([onVisceral(0.75, 0.55, 1.5), onVisceral(0.55, 0.4, 0.9), onVisceral(0.3, 0.25, 0.4), haEnd], 0.058, 0.052);
  const haR = vp(-0.5, 0.08, 0.16);
  HA.tube([haEnd, haR, vp(-0.9, 0.05, 0.28)], 0.042, 0.032);
  HA.tube([haEnd, vp(0.2, 0.1, 0.14), vp(0.4, 0.2, 0.22)], 0.036, 0.028);
  const cystEnd = add(GB_PATH[1], mul(unit([-0.2, -0.85, -0.35]), 0.2));
  HA.tube([haR, onVisceral(-0.5, 0.2, 0.15), cystEnd], 0.02, 0.014);

  // желчные протоки
  const Jh = vp(-0.25, 0.1, 0.05);
  const J = onVisceral(-0.3, 0.35, 0.7);
  BD.tube([Jh, vp(-0.7, 0.0, 0.12), add(RA, [0, 0, 0.14])], 0.052, 0.04);
  BD.tube([Jh, vp(0.1, 0.1, 0.1), add(LU, [0, 0, 0.1])], 0.046, 0.036);
  BD.tube([Jh, onVisceral(-0.3, 0.2, 0.35), J], 0.062, 0.066);
  const CBD = new MeshBuilder();
  CBD.tube([J, onVisceral(-0.22, 0.4, 1.1), [-0.05, -2.1, 0.2], [0.0, -2.5, 0.15]], 0.07, 0.066);
  const CYS = new MeshBuilder();
  CYS.tube([GB_PATH[0], onVisceral(-0.42, 0.1, 0.3), J], 0.042, 0.048, {
    wobble: (t) => 1 + 0.16 * Math.sin(t * 46),
  });

  // нижняя полая вена и печёночные вены
  const IVC = new MeshBuilder();
  IVC.tube([[-0.58, -1.85, -1.03], [-0.55, -0.6, -1.03], [-0.5, 1.0, -1.01], [-0.48, 2.15, -0.97]], 0.27, 0.275);
  const trunks: { pts: Vec[]; r0: number; r1: number; side: Vec; target: number }[] = [
    { pts: [[-0.52, 1.2, -0.95], [-1.0, 0.85, -0.55], [-1.55, 0.4, -0.15], [-2.0, -0.12, 0.12], [-2.3, -0.4, 0.25]], r0: 0.15, r1: 0.06, side: unit([0.54, 0, 0.84]), target: 0.8 },
    { pts: [[-0.5, 1.3, -0.92], [-0.5, 0.8, -0.35], [-0.55, 0.2, 0.1], [-0.62, -0.5, 0.45], [-0.7, -0.95, 0.6]], r0: 0.12, r1: 0.05, side: [1, 0, 0], target: 0.8 },
    { pts: [[-0.4, 1.4, -0.92], [0.15, 1.2, -0.65], [0.9, 0.8, -0.3], [1.6, 0.4, -0.1], [2.0, 0.2, -0.1]], r0: 0.11, r1: 0.04, side: unit([0.35, 0.9, 0.3]), target: 0.7 },
  ];
  const hvBranches: Branch[] = [];
  for (const t of trunks) {
    HV.tube(t.pts, t.r0, t.r1);
    const curve = pointsOnPath(t.pts);
    for (const u of [0.18, 0.32, 0.46, 0.6, 0.74, 0.88]) {
      const p = curve(u);
      const tan = unit(sub(curve(Math.min(1, u + 0.03)), curve(Math.max(0, u - 0.03))));
      const r = (t.r0 + (t.r1 - t.r0) * u) * 0.52;
      for (const s of [1, -1]) {
        const d = unit(add(mul(t.side, 0.85 * s), mul(tan, 0.45)));
        grow(hvBranches, rand, body, p, d, r, 0.42, 3, add(p, mul(t.side, t.target * s)));
      }
    }
  }
  for (const b of hvBranches) HV.tube(b.pts, b.r, b.r * 0.8);

  entities.push({ id: 'portal-vein', kind: 'portal', geometry: PV.build() });
  entities.push({ id: 'hepatic-artery', kind: 'artery', geometry: HA.build() });
  entities.push({ id: 'hepatic-ducts', kind: 'duct', geometry: BD.build() });
  entities.push({ id: 'common-bile-duct', kind: 'duct', geometry: CBD.build() });
  entities.push({ id: 'cystic-duct', kind: 'duct', geometry: CYS.build() });
  entities.push({ id: 'hepatic-veins', kind: 'vein', geometry: HV.build() });
  entities.push({ id: 'inferior-vena-cava', kind: 'vein', geometry: IVC.build() });

  /* --- связки --- */
  const front = (x: number, y: number): Vec => add(surfaceZ(body, x, y, 'front'), [0, 0, -0.03]);
  const falc = new MeshBuilder();
  const ys = [1.3, 1.1, 0.75, 0.35, -0.05, -0.45, -0.85, -1.05];
  const attach = pointsOnPath(ys.map((y, i) => front(0.3 - 0.04 * Math.sin(i * 0.6), y)));
  falc.sheet(
    (u, v) => {
      const a = attach(u);
      const w = 0.1 + 0.72 * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * u)), 0.9);
      const d = unit([0.03 * Math.sin(u * 9), -0.3 - 0.3 * u, 0.94]);
      return add(a, mul(d, v * w + 0.015 * Math.sin(v * 5 + u * 7) * v));
    },
    44,
    8,
  );
  entities.push({ id: 'falciform-ligament', kind: 'ligament', geometry: falc.build() });

  const notch = attach(1);
  const round = new MeshBuilder();
  round.tube(
    [add(notch, [0, 0.05, -0.1]), add(notch, [0.02, -0.22, 0.35]), add(notch, [0.05, -0.6, 0.85]), add(notch, [0.08, -1.0, 1.4])],
    0.046,
    0.034,
  );
  entities.push({ id: 'round-ligament', kind: 'ligament', geometry: round.build() });

  const ven = new MeshBuilder();
  ven.tube(
    [
      [0.42, onVisceral(0.42, -0.35)[1] + 0.05, -0.35],
      [0.5, 0.4, -0.86],
      [0.28, 1.0, -0.99],
      [-0.18, 1.5, -0.97],
    ],
    0.034,
    0.028,
  );
  entities.push({ id: 'venous-ligament', kind: 'ligament', geometry: ven.build() });

  const cor = new MeshBuilder();
  const xy: [number, number][] = [[-2.6, 0.1], [-2.4, 0.65], [-1.8, 1.1], [-1.0, 1.28], [-0.2, 1.25], [0.6, 1.1], [1.5, 0.8], [2.3, 0.4], [2.6, 0.12]];
  const backPt = (x: number, y: number): Vec => {
    for (let dy = 0; dy < 1.2; dy += 0.04) {
      const p = surfaceZ(body, x, y - dy, 'back');
      if (p[2] !== 0) return add(p, [0, 0, 0.03]);
    }
    return [x, y, -0.5];
  };
  const back = pointsOnPath(xy.map(([x, y]) => backPt(x, y)));
  cor.sheet(
    (u, v) => {
      const a = back(u);
      const w = 0.1 + 0.3 * Math.pow(Math.sin(Math.PI * u), 0.7);
      const d = unit([0, 0.25, -0.97]);
      return add(a, mul(d, v * w));
    },
    48,
    8,
  );
  entities.push({ id: 'coronary-ligament', kind: 'ligament', geometry: cor.build() });

  /* --- якоря подписей --- */
  anchors['right-lobe'] = surfaceZ(body, -2.0, 0.55, 'front');
  anchors['left-lobe'] = surfaceZ(body, 1.7, 0.1, 'front');
  anchors['caudate-lobe'] = surfaceZ(body, -0.15, 0.45, 'back');
  anchors['quadrate-lobe'] = surfaceUnder(body, 0.0, 0.55);
  anchors['segment-1'] = anchors['caudate-lobe'];
  anchors['segment-2'] = surfaceZ(body, 1.0, 0.7, 'back');
  anchors['segment-3'] = surfaceZ(body, 1.6, -0.25, 'front');
  anchors['segment-4a'] = surfaceZ(body, 0.0, 0.8, 'front');
  anchors['segment-4b'] = surfaceUnder(body, -0.05, 0.75);
  anchors['segment-5'] = surfaceZ(body, -1.35, -0.75, 'front');
  anchors['segment-6'] = surfaceUnder(body, -2.0, -0.2);
  anchors['segment-7'] = surfaceZ(body, -2.1, 0.7, 'back');
  anchors['segment-8'] = surfaceZ(body, -1.3, 0.85, 'front');
  const at = (pts: Vec[], u: number) => pointsOnPath(pts)(u);
  anchors['portal-vein'] = at([S, onVisceral(0.45, -0.25, 1.0), B], 0.3);
  anchors['hepatic-artery'] = onVisceral(0.7, 0.5, 1.2);
  anchors['hepatic-veins'] = at(trunks[0].pts, 0.35);
  anchors['inferior-vena-cava'] = [-0.56, -1.6, -1.03];
  anchors['gallbladder'] = add(GB_PATH[3], [-0.1, -0.3, 0.2]);
  anchors['cystic-duct'] = onVisceral(-0.42, 0.1, 0.3);
  anchors['hepatic-ducts'] = vp(-0.5, 0.0, 0.15);
  anchors['common-bile-duct'] = [-0.12, -2.0, 0.2];
  anchors['falciform-ligament'] = add(attach(0.5), [0, 0, 0.5]);
  anchors['round-ligament'] = add(notch, [0.05, -0.6, 0.85]);
  anchors['venous-ligament'] = [0.28, 1.0, -0.99];
  anchors['coronary-ligament'] = add(back(0.45), [0, 0.35, -0.5]);

  return { entities, anchors };
}

/** Точка на ломаной по доле длины (сглаженная кривая не нужна — для якорей и поросли достаточно). */
function pointsOnPath(pts: Vec[]): (u: number) => Vec {
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
  const total = lens[lens.length - 1] || 1;
  return (u: number) => {
    const d = Math.min(1, Math.max(0, u)) * total;
    let i = 1;
    while (i < pts.length - 1 && lens[i] < d) i++;
    const t = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    return add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), t));
  };
}
