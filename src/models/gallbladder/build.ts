import { BufferGeometry, CircleGeometry, LatheGeometry, SphereGeometry, Vector2 } from 'three';
import {
  AMPULLA,
  CBD_PTS,
  CHD_PTS,
  CYSTIC_ARTERY_PTS,
  CYSTIC_LENGTH,
  CYSTIC_VEIN_PTS,
  DUODENUM_PTS,
  DUODENUM_R,
  GB_LENGTH,
  HEPATIC_ARTERY_LEFT_PTS,
  HEPATIC_ARTERY_PTS,
  HEPATIC_ARTERY_RIGHT_PTS,
  LEFT_HEPATIC_PTS,
  LYMPH_NODES,
  NERVE_PTS,
  PANCREAS_BODY,
  PANCREAS_HEAD,
  PANCREAS_UNCINATE,
  PANCREATIC_DUCT_PTS,
  PAPILLA,
  PORTAL_LEFT_PTS,
  PORTAL_PTS,
  PORTAL_RIGHT_PTS,
  RIGHT_HEPATIC_PTS,
  SEGMENTS,
  SEROSA_HALF,
  WALL,
  cysticArteryBranch,
  cysticCurve,
  gbAxis,
  gbPoint,
  offsetScale,
  radiusAt,
  rugaeHeight,
  type V3,
} from './anatomy';
import {
  curtainGeometry,
  curveOf,
  ellipsoid,
  fossaPatch,
  liverGeometry,
  lobulatedBlob,
  merge,
  mulberry32,
  ringAt,
  ringPts,
  shellProxy,
  spiralValve,
  triangleGeo,
  tubeGeo,
  tubePts,
  wallShell,
  type ShellOpts,
} from './geometry';
import { GB_PART_IDS } from './parts';

export type MatKey =
  | 'gbSkin' | 'serosa' | 'subserosa' | 'muscle' | 'propria' | 'mucosa' | 'rugae' | 'sinus' | 'bile' | 'valve'
  | 'ductWall' | 'ductCore' | 'cystWall' | 'pancWall' | 'pancCore' | 'oddi' | 'papilla' | 'hole'
  | 'artery' | 'vein' | 'portal' | 'nerve' | 'node' | 'lymph'
  | 'liver' | 'fossa' | 'curtain' | 'calot' | 'calotEdge' | 'duodenum' | 'duodenumFold' | 'pancreas';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Не принимает клики (тонкие оболочки поверх стенки, просветы). */
  noPick?: boolean;
  /** Лёгкая геометрия для raycast. */
  proxy?: BufferGeometry;
}

export type GbGeometry = Record<string, MeshDef[]>;

const shell = (o: ShellOpts, m: MatKey, pick = true): MeshDef => ({ g: wallShell(o), m, proxy: pick ? shellProxy(o) : undefined, noPick: !pick });

const TAU = Math.PI * 2;

/** Ветвящиеся мелкие сосуды на поверхности пузыря. */
function surfaceTwigs(seed: number, count: number, thetas: number[], off: number, r0: number): BufferGeometry {
  const rand = mulberry32(seed);
  const list: BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const s0 = 0.1 + rand() * 0.78;
    const th0 = thetas[Math.floor(rand() * thetas.length)] + (rand() - 0.5) * 0.3;
    const dir = rand() < 0.5 ? -1 : 1;
    const pts: V3[] = [];
    const steps = 6 + Math.floor(rand() * 3);
    let s = s0;
    let th = th0;
    for (let i = 0; i < steps; i++) {
      pts.push(gbPoint(Math.min(0.97, Math.max(0.03, s)), th, off));
      th += dir * (0.13 + rand() * 0.1);
      s += (rand() - 0.5) * 0.045;
    }
    list.push(tubePts(pts, r0, r0 * 0.4, { radial: 5, segs: 10, capEnd: true }));
  }
  return merge(list);
}

/** Мелкие слепые карманы слизистой, уходящие в мышечный слой: синусы Рокитанского — Ашоффа. */
function sinuses(): BufferGeometry {
  const rand = mulberry32(77);
  const list: BufferGeometry[] = [];
  for (let k = 0; k < 90; k++) {
    const s = 0.14 + rand() * 0.6;
    const th = rand() * TAU;
    const a = gbPoint(s, th, WALL.rugae + 0.01);
    const mid = gbPoint(s, th, -0.15);
    const b = gbPoint(s, th, -0.19 - 0.05 * rand());
    list.push(tubePts([a, mid, b], 0.026 + rand() * 0.012, 0.03 + rand() * 0.014, { radial: 7, segs: 6, capEnd: true }));
    const ball = new SphereGeometry(0.052 + rand() * 0.02, 10, 8);
    ball.translate(...b);
    list.push(ball);
  }
  return merge(list);
}

/** Мышечные пучки поверх мышечного слоя: отдельные «верёвки», переплетённые по поверхности. */
function muscleBundles(): BufferGeometry {
  const rand = mulberry32(88);
  const list: BufferGeometry[] = [];
  for (let k = 0; k < 34; k++) {
    const s0 = 0.08 + rand() * 0.8;
    const th0 = rand() * TAU;
    const dir = rand() < 0.5 ? 1 : -1;
    const pts: V3[] = [];
    for (let i = 0; i < 9; i++) pts.push(gbPoint(Math.min(0.97, s0 + dir * i * 0.018), th0 + i * 0.2 * (rand() < 0.2 ? -1 : 1) * 0.5 + i * 0.15, WALL.muscularis + 0.012));
    list.push(tubePts(pts, 0.028, 0.012, { radial: 6, segs: 12, capStart: true, capEnd: true }));
  }
  return merge(list);
}

/** Нервные веточки: тонкие тяжи с узелками. */
function nerveBranches(): BufferGeometry {
  const rand = mulberry32(99);
  const list: BufferGeometry[] = [];
  for (let k = 0; k < 14; k++) {
    const s0 = 0.18 + rand() * 0.7;
    const th0 = (rand() < 0.5 ? 0.9 : 5.2) + rand() * 0.5;
    const pts: V3[] = [];
    for (let i = 0; i < 6; i++) pts.push(gbPoint(Math.min(0.97, s0 - i * 0.03), th0 + i * 0.1 * (rand() - 0.2), 0.04));
    list.push(tubePts(pts, 0.011, 0.006, { radial: 5, segs: 8, capEnd: true }));
  }
  return merge(list);
}

export function buildGallbladder(): GbGeometry {
  const out: GbGeometry = {};
  const put = (id: string, defs: MeshDef[]) => {
    out[id] = defs;
  };

  /* ---------- Отделы пузыря: наружная поверхность ---------- */
  const seg = (a: readonly [number, number], n: number, seed: number, extraS = 0): ShellOpts => ({
    s0: Math.max(0, a[0] - extraS),
    s1: Math.min(1, a[1] + extraS),
    off: WALL.surface,
    sSegs: n,
    tSegs: 112,
    wobble: 0.016,
    seed: 3,
    uvRep: 2 + seed * 0,
  });
  put('fundus', [shell(seg(SEGMENTS.fundus, 52, 1), 'gbSkin')]);
  put('body', [shell(seg(SEGMENTS.body, 44, 2), 'gbSkin')]);
  put('infundibulum', [shell(seg(SEGMENTS.infundibulum, 34, 3), 'gbSkin')]);
  put('neck', [shell(seg(SEGMENTS.neck, 26, 4), 'gbSkin')]);

  /* ---------- Слои стенки ---------- */
  put('serosa', [
    shell({ s0: 0.025, s1: 0.985, off: WALL.serosa, th0: -SEROSA_HALF, th1: SEROSA_HALF, sSegs: 90, tSegs: 80, wobble: 0.016, seed: 3 }, 'serosa', false),
  ]);
  put('subserosa', [
    shell({ s0: 0, s1: 1, off: WALL.subserosa, sSegs: 90, tSegs: 96, wobble: 0.015, seed: 3, uvRep: 2 }, 'subserosa'),
    { g: surfaceTwigs(5, 40, [0.4, 2.7, 3.6, 5.6], WALL.subserosa + 0.012, 0.012), m: 'vein', noPick: true },
  ]);
  put('muscularis', [
    shell({ s0: 0, s1: 1, off: WALL.muscularis, sSegs: 90, tSegs: 96, wobble: 0.01, seed: 3, uvRep: 3 }, 'muscle'),
    { g: muscleBundles(), m: 'muscle', noPick: true },
  ]);
  put('propria', [shell({ s0: 0, s1: 1, off: WALL.propria, sSegs: 80, tSegs: 96, wobble: 0.006, seed: 3, uvRep: 2 }, 'propria')]);
  put('mucosa', [shell({ s0: 0, s1: 1, off: WALL.mucosa, sSegs: 80, tSegs: 96, wobble: 0.004, seed: 3, uvRep: 3 }, 'mucosa')]);
  put('rugae', [
    shell(
      {
        s0: 0,
        s1: 1,
        off: WALL.rugae,
        sSegs: 300,
        tSegs: 176,
        wobble: 0.003,
        seed: 3,
        uvRep: 3,
        extra: (s, th) => -0.082 * rugaeHeight(s, th) * offsetScale(s),
      },
      'rugae',
    ),
  ]);
  put('rokitansky', [{ g: sinuses(), m: 'sinus' }]);

  /* ---------- Внутри ---------- */
  put('bile', [{ g: wallShell({ s0: 0.002, s1: 1, off: WALL.lumen, sSegs: 70, tSegs: 72, seed: 3 }), m: 'bile', noPick: false }]);

  // винтовая складка Хейстера: от конца воронки через шейку и по всему пузырному протоку
  {
    const s0 = 0.8;
    const neckPts: V3[] = [];
    for (let i = 0; i <= 14; i++) neckPts.push(gbAxis(s0 + ((1 - s0) * i) / 14));
    const ductPts: V3[] = [];
    for (let i = 1; i <= 12; i++) {
      const p = cysticCurve.getPointAt(i / 12);
      ductPts.push([p.x, p.y, p.z]);
    }
    const path = curveOf([...neckPts, ...ductPts]);
    const lNeck = (1 - s0) * GB_LENGTH;
    const uk = lNeck / (lNeck + CYSTIC_LENGTH);
    const inner = (t: number) => {
      if (t < uk) {
        const s = s0 + (1 - s0) * (t / uk);
        return Math.max(0.15, radiusAt(s) + WALL.lumen * offsetScale(s)) * 0.98;
      }
      return 0.205;
    };
    put('spiral-valve', [{ g: spiralValve(path, inner, 5, 0.52), m: 'valve' }]);
  }

  /* ---------- Протоки ---------- */
  const duct = (pts: V3[], r: number, r1 = r, core = 0.7): MeshDef[] => [
    { g: tubePts(pts, r, r1, { radial: 22, capStart: true }), m: 'ductWall', noPick: false },
    { g: tubePts(pts, r * core, r1 * core, { radial: 14 }), m: 'ductCore', noPick: true },
  ];
  put('right-hepatic-duct', duct(RIGHT_HEPATIC_PTS, 0.17, 0.2));
  put('left-hepatic-duct', duct(LEFT_HEPATIC_PTS, 0.17, 0.2));
  put('common-hepatic-duct', duct(CHD_PTS, 0.24, 0.27));
  // пузырный проток: стенка прозрачная, внутри видна спиральная складка
  put('cystic-duct', [{ g: tubePts([[0.58, 2.4, -0.62], ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => { const p = cysticCurve.getPointAt(i / 10); return [p.x, p.y, p.z] as V3; })], 0.3, 0.27, { radial: 24 }), m: 'cystWall' }]);
  put('common-bile-duct', duct(CBD_PTS, 0.29, 0.26));
  put('pancreatic-duct', [
    { g: tubePts(PANCREATIC_DUCT_PTS, 0.11, 0.15, { radial: 14, capStart: true }), m: 'pancWall' },
    { g: tubePts(PANCREATIC_DUCT_PTS, 0.075, 0.1, { radial: 10 }), m: 'pancCore', noPick: true },
  ]);
  put('ampulla', [
    { g: ellipsoid(AMPULLA, [0.37, 0.43, 0.37], 28), m: 'ductWall' },
    { g: ellipsoid(AMPULLA, [0.26, 0.31, 0.26], 22), m: 'ductCore', noPick: true },
  ]);
  {
    const cbd = curveOf(CBD_PTS);
    const pd = curveOf(PANCREATIC_DUCT_PTS);
    put('sphincter-oddi', [
      { g: ringAt(cbd, 0.9, 0.35, 0.075), m: 'oddi' },
      { g: ringAt(cbd, 0.76, 0.34, 0.05), m: 'oddi' },
      { g: ringAt(pd, 0.92, 0.2, 0.05), m: 'oddi' },
      { g: ringPts([2.6, -4.53, -1.78], [-1, 0, 0], 0.43, 0.09), m: 'oddi' },
      { g: ringPts([2.54, -4.54, -1.76], [-1, 0, 0], 0.37, 0.065), m: 'oddi' },
    ]);
  }
  {
    const pts: Vector2[] = [
      new Vector2(0.36, 0),
      new Vector2(0.33, 0.05),
      new Vector2(0.27, 0.13),
      new Vector2(0.2, 0.21),
      new Vector2(0.12, 0.27),
      new Vector2(0.05, 0.3),
      new Vector2(0.0, 0.31),
    ];
    const cone = new LatheGeometry(pts, 28);
    cone.rotateZ(Math.PI / 2);
    cone.translate(PAPILLA[0] + 0.07, PAPILLA[1], PAPILLA[2]);
    const hole = new CircleGeometry(0.065, 16);
    hole.rotateY(-Math.PI / 2);
    hole.translate(PAPILLA[0] + 0.07 - 0.312, PAPILLA[1], PAPILLA[2]);
    // продольная складка над сосочком
    const frenulum = tubePts([[PAPILLA[0] + 0.05, PAPILLA[1] + 0.9, PAPILLA[2] + 0.05], [PAPILLA[0] + 0.0, PAPILLA[1] + 0.35, PAPILLA[2]], [PAPILLA[0] - 0.12, PAPILLA[1] + 0.12, PAPILLA[2]]], 0.04, 0.055, { radial: 8, capStart: true });
    put('papilla', [
      { g: cone, m: 'papilla' },
      { g: hole, m: 'hole', noPick: true },
      { g: frenulum, m: 'papilla', noPick: true },
    ]);
  }

  /* ---------- Сосуды, нервы, лимфа ---------- */
  const brFree = cysticArteryBranch('free');
  const brLiver = cysticArteryBranch('liver');
  put('cystic-artery', [
    { g: tubePts(CYSTIC_ARTERY_PTS, 0.055, 0.04, { radial: 12, capStart: true }), m: 'artery' },
    { g: tubePts(brFree, 0.036, 0.016, { radial: 10, capEnd: true }), m: 'artery' },
    { g: tubePts(brLiver, 0.036, 0.016, { radial: 10, capEnd: true }), m: 'artery' },
    { g: surfaceTwigs(7, 34, [0.3, 0.55, 5.9, 5.7], 0.045, 0.014), m: 'artery', noPick: false },
    { g: surfaceTwigs(8, 26, [2.9, 3.2, 3.5], 0.045, 0.012), m: 'artery', noPick: false },
  ]);
  put('hepatic-artery', [
    { g: tubePts(HEPATIC_ARTERY_PTS, 0.1, 0.095, { radial: 14, capStart: true }), m: 'artery' },
    { g: tubePts(HEPATIC_ARTERY_LEFT_PTS, 0.075, 0.06, { radial: 12, capEnd: true }), m: 'artery' },
    { g: tubePts(HEPATIC_ARTERY_RIGHT_PTS, 0.078, 0.06, { radial: 12 }), m: 'artery' },
  ]);
  put('portal-vein', [
    { g: tubePts(PORTAL_PTS, 0.42, 0.36, { radial: 24, capStart: true }), m: 'portal' },
    { g: tubePts(PORTAL_RIGHT_PTS, 0.3, 0.2, { radial: 20, capEnd: true }), m: 'portal' },
    { g: tubePts(PORTAL_LEFT_PTS, 0.27, 0.17, { radial: 20, capEnd: true }), m: 'portal' },
  ]);
  put('cystic-vein', [
    { g: tubePts(CYSTIC_VEIN_PTS, 0.05, 0.075, { radial: 12, capStart: true }), m: 'vein' },
    { g: tubePts([gbPoint(0.84, 5.0, 0.05), gbPoint(0.62, 5.2, 0.05), gbPoint(0.4, 5.3, 0.05), gbPoint(0.2, 5.1, 0.05)], 0.034, 0.015, { radial: 10, capEnd: true }), m: 'vein' },
    { g: tubePts([gbPoint(0.84, 1.5, 0.05), gbPoint(0.6, 1.4, 0.05), gbPoint(0.36, 1.45, 0.05), gbPoint(0.16, 1.5, 0.05)], 0.03, 0.014, { radial: 10, capEnd: true }), m: 'vein' },
    { g: surfaceTwigs(9, 30, [1.2, 1.7, 4.9, 5.4], 0.045, 0.011), m: 'vein', noPick: false },
  ]);
  {
    const strand = (dx: number, dy: number, dz: number): V3[] => NERVE_PTS.map((p, i) => [p[0] + dx * (1 - i * 0.1), p[1] + dy, p[2] + dz * (1 - i * 0.1)] as V3);
    const nodes: BufferGeometry[] = [];
    for (const i of [1, 3]) {
      const p = NERVE_PTS[i];
      nodes.push(ellipsoid([p[0] + 0.02, p[1], p[2] + 0.04], [0.1, 0.17, 0.09], 14));
    }
    put('nerves', [
      { g: tubePts(NERVE_PTS, 0.032, 0.02, { radial: 8, capStart: true, capEnd: true }), m: 'nerve' },
      { g: tubePts(strand(0.09, 0.02, 0.07), 0.024, 0.015, { radial: 8, capStart: true, capEnd: true }), m: 'nerve' },
      { g: tubePts(strand(-0.08, -0.01, 0.08), 0.02, 0.012, { radial: 8, capStart: true, capEnd: true }), m: 'nerve' },
      { g: merge(nodes), m: 'node' },
      { g: nerveBranches(), m: 'nerve', noPick: true },
    ]);
  }
  {
    const nodeGeo: BufferGeometry[] = [];
    const vess: BufferGeometry[] = [];
    LYMPH_NODES.forEach((n, i) => {
      nodeGeo.push(ellipsoid(n.at, [n.r * 0.9, n.r * 1.4, n.r * 0.8], 18));
      const nx = n.at[0] + 0.5 + i * 0.05;
      vess.push(tubePts([[n.at[0] - 0.45, n.at[1] + 0.35, n.at[2] + 0.2], [n.at[0] - 0.2, n.at[1] + 0.1, n.at[2] + 0.1], n.at], 0.02, 0.03, { radial: 6, capStart: true }));
      vess.push(tubePts([n.at, [n.at[0] + 0.2, n.at[1] - 0.2, n.at[2] - 0.05], [nx, n.at[1] - 0.5, n.at[2] - 0.15]], 0.026, 0.016, { radial: 6, capEnd: true }));
    });
    put('lymph-nodes', [
      { g: merge(nodeGeo), m: 'node' },
      { g: merge(vess), m: 'lymph' },
    ]);
  }

  /* ---------- Соседи ---------- */
  const liverGeo = liverGeometry();
  put('liver', [{ g: liverGeo, m: 'liver', proxy: liverGeometry(18, 48) }]);
  put('gb-fossa', [{ g: fossaPatch(), m: 'fossa' }]);
  put('ligament', [{ g: curtainGeometry(), m: 'curtain', noPick: true }]);
  {
    const a: V3 = [0.62, 2.5, -0.72];
    const b: V3 = [2.46, 1.62, -1.62];
    const c: V3 = [2.4, 3.55, -1.72];
    put('calot-triangle', [
      { g: triangleGeo(a, b, c), m: 'calot', noPick: true },
      { g: tubePts([a, b], 0.03, 0.03, { radial: 6, capStart: true, capEnd: true }), m: 'calotEdge', noPick: true },
      { g: tubePts([b, c], 0.03, 0.03, { radial: 6, capStart: true, capEnd: true }), m: 'calotEdge', noPick: true },
      { g: tubePts([a, [1.5, 3.05, -1.2], c], 0.03, 0.03, { radial: 6, capStart: true, capEnd: true }), m: 'calotEdge', noPick: true },
    ]);
  }
  {
    const curve = curveOf(DUODENUM_PTS);
    const folds: BufferGeometry[] = [];
    const N = 30;
    for (let i = 0; i < N; i++) {
      const t = 0.03 + (0.94 * i) / (N - 1);
      folds.push(ringAt(curve, t, DUODENUM_R * (0.9 - 0.04 * Math.sin(i * 1.9)), 0.05 + 0.012 * Math.sin(i * 2.3), 0.8, [8, 32]));
    }
    put('duodenum', [
      { g: tubeGeo(curve, (t) => DUODENUM_R * (1 + 0.025 * Math.sin(t * 70)), { radial: 44, segs: 240 }), m: 'duodenum' },
      { g: merge(folds), m: 'duodenumFold', noPick: true },
    ]);
  }
  put('pancreas', [
    {
      g: merge([
        lobulatedBlob(PANCREAS_HEAD.c, PANCREAS_HEAD.r, 4),
        lobulatedBlob(PANCREAS_BODY.c, PANCREAS_BODY.r, 9),
        lobulatedBlob(PANCREAS_UNCINATE.c, PANCREAS_UNCINATE.r, 14),
        lobulatedBlob([6.1, -3.6, -2.35], [1.6, 1.0, 0.85], 21),
      ]),
      m: 'pancreas',
    },
  ]);

  // защита от забытых частей
  for (const id of GB_PART_IDS) if (!out[id]) throw new Error(`No geometry for part ${id}`);
  return out;
}
