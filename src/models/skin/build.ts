import type { BufferGeometry } from 'three';
import {
  ARRECTOR, AX, ECCRINE, HAIR_UP, LANGERHANS_SPOTS, MELANOCYTE_SPOTS, MEISSNER_SPOTS, MERKEL_SPOTS,
  PACINIAN_SPOTS, PAPILLA, R, RUFFINI_SPOTS, SK, U, APOCRINE, around, epiBase, reliefTop, sweatPores,
} from './anatomy';
import { blob, curveOf, heightSlab, lerp, merge, rng, smooth, sweep, tube, type SweepOpt, type V3 } from './geometry';
import type { MatKey, MeshDef, Parts } from './types';

const d = (g: BufferGeometry, m: MatKey, o: Partial<MeshDef> = {}): MeshDef => ({ g, m, ...o });

/** Трубка вдоль оси фолликула на отрезке [u0, u1]. */
const along = (r: (u: number) => number, u0: number, u1: number, o: SweepOpt = {}): BufferGeometry =>
  sweep(AX, r, { n: Math.round(44 + 130 * (u1 - u0)), m: 36, u0, u1, ...o });

const hairUp = (r: (u: number) => number, u0: number, u1: number, o: SweepOpt = {}): BufferGeometry =>
  sweep(HAIR_UP, r, { n: Math.round(32 + 110 * (u1 - u0)), m: 32, u0, u1, ...o });

/** Всё, что выше поверхности кожи, прижимается к ней: устье воронки получается плоским. */
function clampTop(g: BufferGeometry): BufferGeometry {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (p.getY(i) > -0.004) p.setY(i, -0.004);
  g.computeVertexNormals();
  return g;
}

const SAMPLES = Array.from({ length: 90 }, (_, i) => AX.getPoint(i / 89));
const nearAxis = (x: number, y: number, z: number): number => SAMPLES.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y, p.z - z)), 1e9);

/** Расстояние до клубочков желёз и телец Пачини — чтобы жировые дольки и волокна их не пересекали. */
const nearGlands = (x: number, y: number, z: number): number => {
  let m = 1e9;
  for (const e of ECCRINE) m = Math.min(m, Math.hypot(x - e.c[0], y - e.c[1], z - e.c[2]) - 1.5 * e.k);
  m = Math.min(m, Math.hypot(x - APOCRINE.c[0], y - APOCRINE.c[1], z - APOCRINE.c[2]) - 1.4);
  for (const p of PACINIAN_SPOTS) m = Math.min(m, Math.hypot(x - p[0], y - p[1], z - p[2]) - 1.2);
  return m;
};

/** Слои кожи как плиты с рельефной поверхностью, воронками устья и пор и сосочковым слоем. */
function skinSlabs(): Parts {
  const { x0, x1, hz } = SK;
  const nx = Math.round((x1 - x0) * 4.2);
  const wavy = { x0, x1, zh: hz, nx, nz: 40 };
  const flat = { x0, x1, zh: hz, nx: 12, nz: 10 };
  const cornBot = (x: number, z: number) => SK.corneum + 0.25 * (reliefTop(x, z) - 0.028);
  return {
    'skin-microrelief': [d(heightSlab({ ...wavy, top: (x, z) => reliefTop(x, z), bot: (x, z) => reliefTop(x, z) - 0.05 }), 'corneum')],
    'stratum-corneum': [d(heightSlab({ ...wavy, top: (x, z) => reliefTop(x, z) - 0.04, bot: cornBot }), 'corneum')],
    'stratum-lucidum': [d(heightSlab({ ...wavy, top: (x, z) => cornBot(x, z) + 0.01, bot: () => SK.lucidum }), 'lucidum')],
    'stratum-granulosum': [d(heightSlab({ ...wavy, top: () => SK.lucidum + 0.01, bot: () => SK.granulosum }), 'granulosum')],
    'stratum-spinosum': [d(heightSlab({ ...wavy, top: () => SK.granulosum + 0.01, bot: (x, z) => epiBase(x, z) + 0.03 }), 'spinosum')],
    'stratum-basale': [d(heightSlab({ ...wavy, top: (x, z) => epiBase(x, z) + 0.04, bot: (x, z) => epiBase(x, z) - 0.11 }), 'basal')],
    'papillary-dermis': [d(heightSlab({ ...wavy, top: (x, z) => epiBase(x, z) - 0.09, bot: () => SK.papillary }), 'dermisP')],
    'reticular-dermis': [d(heightSlab({ ...flat, top: () => SK.papillary + 0.02, bot: () => SK.reticular }), 'dermisR')],
    hypodermis: [d(heightSlab({ ...flat, top: () => SK.reticular + 0.02, bot: () => SK.bottom }), 'hypodermis')],
  };
}

/** Блок кожи со всеми структурами: слои, клетки, придатки, сосуды, лимфа, нервы и рецепторы. */
export function buildSkin(): Parts {
  const P: Parts = skinSlabs();
  const add = (id: string, ...defs: MeshDef[]) => {
    (P[id] ??= []).push(...defs);
  };
  const r = rng(20261113);

  /* ------------------------------ Жировые дольки ------------------------------ */
  const fat: BufferGeometry[] = [];
  for (let i = 0; fat.length < 105 && i < 700; i++) {
    const x = lerp(-9.3, 9.3, r());
    const y = lerp(-10.0, -6.7, r());
    const z = lerp(-5.3, 5.3, r());
    const rad = lerp(0.38, 0.88, r());
    if (nearAxis(x, y, z) < rad + 1.7 || nearGlands(x, y, z) < rad) continue;
    fat.push(blob([x, y, z], [rad * (0.9 + 0.2 * r()), rad * 0.84, rad * (0.9 + 0.2 * r())], { seg: 18, seed: i, amp: 0.09 }));
  }
  add('fat-lobules', d(merge(fat), 'fat'));

  /* --------------------------- Коллаген и эластин --------------------------- */
  const col: BufferGeometry[] = [];
  for (let i = 0; col.length < 84 && i < 520; i++) {
    const alongX = r() < 0.55;
    const y0 = lerp(-6.1, -2.7, r());
    const c: V3 = [lerp(-8.6, 8.6, r()), y0, lerp(-5.2, 5.2, r())];
    const len = lerp(2.8, 5.2, r());
    const pts: V3[] = Array.from({ length: 7 }, (_, k) => {
      const s = (k / 6 - 0.5) * len;
      const w = Math.sin(k * 1.6 + i) * 0.24;
      return (alongX ? [c[0] + s, y0 + w, c[2] + Math.cos(k + i) * 0.22] : [c[0] + Math.cos(k + i) * 0.22, y0 + w, c[2] + s]) as V3;
    });
    if (pts.some((p) => nearAxis(p[0], p[1], p[2]) < 1.6)) continue;
    col.push(tube(pts, lerp(0.055, 0.12, r()), { n: 34, m: 10, wob: (_, a) => 1 + 0.14 * Math.sin(a * 3 + i) }));
  }
  // соединительнотканные перегородки гиподермы между жировыми дольками
  for (let i = 0; i < 9; i++) {
    const x = lerp(-8.8, 8.8, r());
    const z = lerp(-4.8, 4.8, r());
    if (nearAxis(x, -8, z) < 2 || nearGlands(x, -8, z) < 0.6) continue;
    const pts: V3[] = Array.from({ length: 6 }, (_, k) => [x + Math.sin(k * 1.3 + i) * 0.3, lerp(-6.6, -10.2, k / 5), z + Math.cos(k * 1.1 + i) * 0.3] as V3);
    col.push(tube(pts, lerp(0.07, 0.12, r()), { n: 26, m: 9 }));
  }
  add('collagen', d(merge(col), 'collagen'));

  const ela: BufferGeometry[] = [];
  for (let i = 0; ela.length < 56 && i < 400; i++) {
    const alongX = r() < 0.5;
    const y0 = lerp(-5.9, -2.8, r());
    const c: V3 = [lerp(-8.6, 8.6, r()), y0, lerp(-5.2, 5.2, r())];
    const len = lerp(2.2, 4.2, r());
    const pts: V3[] = Array.from({ length: 9 }, (_, k) => {
      const s = (k / 8 - 0.5) * len;
      const w = Math.sin(k * 2.4 + i * 1.7) * 0.3;
      return (alongX ? [c[0] + s, y0 + w, c[2] + Math.cos(k * 1.9 + i) * 0.3] : [c[0] + Math.cos(k * 1.9 + i) * 0.3, y0 + w, c[2] + s]) as V3;
    });
    if (pts.some((p) => nearAxis(p[0], p[1], p[2]) < 1.5)) continue;
    ela.push(tube(pts, lerp(0.022, 0.04, r()), { n: 40, m: 7 }));
  }
  add('elastin', d(merge(ela), 'elastin'));

  /* ------------------------- Волос: стержень и корень ------------------------- */
  const scaleWob = (u: number, a: number) => 1 + 0.022 * Math.sin(u * 190 + Math.sin(a * 4) * 0.6);
  const shaftR = (u: number) => R.root() * (1 - 0.9 * smooth(0.88, 1, u));
  add(
    'hair-shaft',
    d(hairUp(shaftR, 0, 1, { cap0: null, cap1: 'round', roundLen1: 0.14, uvLen: 20, wob: scaleWob }), 'cuticleHair'),
    d(hairUp(() => R.cortex(), 0, 0.86, { cap0: null, cap1: 'round', roundLen1: 0.2 }), 'cortex'),
    d(hairUp(() => R.medulla(), 0, 0.8, { cap0: null, cap1: 'round', roundLen1: 0.1, m: 16 }), 'medulla'),
  );
  add(
    'hair-root',
    d(clampTop(along(R.ct, 0, 1, { cap0: 'flat', cap1: 'round', roundLen1: 1.7 })), 'ctSheath'),
    d(clampTop(along(R.glassy, 0, 0.99, { cap0: 'flat', cap1: 'round', roundLen1: 1.45 })), 'glassy'),
    d(clampTop(along(R.ors, 0.06, 0.94, { cap0: 'round', roundLen0: 0.2, cap1: 'round', roundLen1: 1.1 })), 'ors'),
    d(along(R.irs, U.irsStart, U.irsEnd, { cap0: 'round', roundLen0: 0.3, cap1: 'round', roundLen1: 0.4 }), 'irs'),
    d(clampTop(along(() => R.root() + 0.004, 0, U.rootEnd, { cap0: null, cap1: 'round', roundLen1: 0.3, uvLen: 14, wob: scaleWob })), 'cuticleHair'),
    d(along(() => R.cortex(), 0, U.rootEnd - 0.008, { cap0: null, cap1: 'round', roundLen1: 0.22 }), 'cortex'),
    d(along(() => R.medulla(), 0, 0.8, { cap0: null, cap1: 'round', roundLen1: 0.1, m: 16 }), 'medulla'),
  );
  add(
    'hair-bulb',
    d(along(R.bulb, 0.8, 1, { cap0: 'round', roundLen0: 0.3, cap1: 'round', roundLen1: 1.15, wob: (_, a) => 1 + 0.025 * Math.sin(a * 6) }), 'bulbCells'),
    d(along(R.matrix, 0.86, 1, { cap0: 'round', roundLen0: 0.3, cap1: 'round', roundLen1: 0.95 }), 'matrixCells'),
  );
  const papCap: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const z = lerp(-0.24, 0.24, i / 4);
    const x = PAPILLA.c[0] + (i - 2) * 0.09;
    papCap.push(tube([[x - 0.14, -8.0, z], [x - 0.1, -7.5, z], [x, -7.15 + (i % 2) * 0.06, z], [x + 0.1, -7.5, z], [x + 0.14, -8.0, z]], 0.032, { n: 26, m: 9 }));
  }
  add('hair-papilla', d(blob(PAPILLA.c, PAPILLA.r, { seg: 32, amp: 0.045, freq: 2.2, seed: 3 }), 'papilla'), d(merge(papCap), 'capillary'));

  /* ------------------------------ Сальная железа ------------------------------ */
  const glandCenters: [V3, V3][] = [
    [[1.3, -1.95, 0.0], [0.55, 0.46, 0.5]],
    [[1.9, -2.15, 0.9], [0.42, 0.34, 0.38]],
    [[1.7, -2.0, -0.95], [0.45, 0.38, 0.42]],
    [[0.5, -1.8, -0.5], [0.36, 0.32, 0.36]],
    [[0.7, -1.9, 0.7], [0.36, 0.3, 0.34]],
    [[5.9, -2.0, 0.0], [0.46, 0.38, 0.4]],
    [[6.3, -1.85, -0.85], [0.34, 0.3, 0.34]],
    [[5.6, -2.15, 0.75], [0.32, 0.28, 0.32]],
  ];
  const gl: BufferGeometry[] = [];
  glandCenters.forEach(([c, rr], i) => {
    gl.push(blob(c, rr, { seg: 20, amp: 0.14, freq: 2.4, seed: i + 11 }));
    for (let k = 0; k < 9; k++) {
      const a = r() * Math.PI * 2;
      const b = r() * Math.PI - Math.PI / 2;
      const acScale = lerp(0.28, 0.44, r());
      gl.push(
        blob(
          [c[0] + Math.cos(a) * Math.cos(b) * rr[0] * 0.88, c[1] + Math.sin(b) * rr[1] * 0.88, c[2] + Math.sin(a) * Math.cos(b) * rr[2] * 0.88],
          [rr[0] * acScale, rr[1] * acScale, rr[2] * acScale],
          { seg: 12, amp: 0.14, seed: i * 11 + k },
        ),
      );
    }
  });
  const ductL: V3[] = [[1.3, -1.9, 0], [2.1, -1.6, 0.04], [2.6, -1.3, 0.02], [2.95, -1.12, 0]];
  const ductR: V3[] = [[5.9, -1.95, 0], [5.3, -1.6, 0.03], [5.0, -1.3, 0.02], [4.7, -1.12, 0]];
  const ductLF: V3[] = [[1.9, -2.1, 0.8], [2.4, -1.7, 0.4], [2.8, -1.3, 0.08]];
  const ductRF: V3[] = [[6.3, -1.85, -0.75], [5.6, -1.55, -0.35], [4.9, -1.2, -0.06]];
  add(
    'sebaceous-gland',
    d(merge(gl), 'gland'),
    d(merge([tube(ductL, 0.16, { m: 16 }), tube(ductR, 0.14, { m: 16 }), tube(ductLF, 0.11, { m: 14 }), tube(ductRF, 0.1, { m: 14 })]), 'duct'),
    d(merge([tube(ductL, 0.075, { m: 12 }), tube(ductR, 0.065, { m: 12 }), blob([1.3, -1.95, 0], [0.24, 0.22, 0.24], { seg: 14, amp: 0.1, seed: 4 }), blob([5.9, -2.0, 0], [0.19, 0.17, 0.19], { seg: 12, amp: 0.1, seed: 5 })]), 'sebum'),
  );

  /* --------------------------- Мышца, поднимающая волос --------------------------- */
  const [bx, by] = [ARRECTOR.from[0], ARRECTOR.from[1]];
  const [ex, ey] = [ARRECTOR.to[0], ARRECTOR.to[1]];
  const fascicles: BufferGeometry[] = [];
  const fascOffsets: [number, number][] = [[0, 0], [0, 0.13], [0, -0.13], [0.09, 0.07], [-0.09, -0.07]];
  fascOffsets.forEach(([dy, dz], fi) => {
    const mus: V3[] = [
      [bx, by + dy * 0.5, dz * 0.5],
      [lerp(bx, ex, 0.3), lerp(by, ey, 0.3) - 0.28 + dy, dz],
      [lerp(bx, ex, 0.65), lerp(by, ey, 0.65) - 0.2 + dy, dz],
      [ex, ey + dy * 0.4, dz * 0.5],
    ];
    fascicles.push(
      sweep(curveOf(mus), (u) => (0.04 + 0.11 * Math.sin(Math.PI * u) ** 0.65) * (fi === 0 ? 1.15 : 0.85), {
        n: 64,
        m: 16,
        cap0: 'round',
        cap1: 'round',
        wob: (_, a) => 1 + 0.08 * Math.sin(a * 6 + fi),
      }),
    );
  });
  const brush: BufferGeometry[] = [];
  for (let i = 0; i < 11; i++) {
    const s = (i / 10 - 0.5) * 1.25;
    brush.push(tube([[ex, ey, 0], [ex - 0.25 + s * 0.4, ey + 0.28, s * 0.35], [ex - 0.38 + s * 0.85, ey + 0.62, s * 0.65]], 0.028, { n: 12, m: 8 }));
  }
  for (let i = 0; i < 6; i++) {
    const s = (i / 5 - 0.5) * 1.0;
    brush.push(tube([[bx, by, 0], [bx + 0.32, by + 0.04, s * 0.35], [bx + 0.66, by + 0.02, s * 0.72]], 0.04, { n: 12, m: 8 }));
  }
  add('arrector-pili', d(merge(fascicles), 'muscle'), d(merge(brush), 'tendon'));

  /* ------------------------- Эккриновые потовые железы ------------------------- */
  const coils: BufferGeometry[] = [];
  const ducts: BufferGeometry[] = [];
  ECCRINE.forEach((e, gi) => {
    const [cx, cy, cz] = e.c;
    const k = e.k;
    const coil: V3[] = Array.from({ length: 180 }, (_, q) => {
      const t = (q / 179) * Math.PI * 2;
      return [cx + k * (0.95 * Math.sin(9 * t) * 0.72 + 0.35 * Math.sin(3 * t)), cy + k * 0.64 * Math.sin(7 * t + 1), cz + k * 0.78 * Math.cos(6 * t)] as V3;
    });
    coils.push(sweep(curveOf(coil), (u) => k * (0.16 + 0.03 * Math.sin(u * 46)), { n: 320, m: 16, cap0: 'round', cap1: 'round' }));
    const pore = sweatPores[gi];
    const ductPts: V3[] = [
      [cx, cy + 0.9 * k, cz],
      [cx + 0.18, -5.4, cz + 0.1],
      [cx - 0.12, -3.6, cz - 0.05],
      [cx + 0.05, -2.5, cz],
    ];
    ducts.push(tube(ductPts, 0.055, { n: 70, m: 12 }));
    // спиральный проток сквозь эпидермис (акросирингиум) к поре
    const spiral: V3[] = Array.from({ length: 44 }, (_, j) => {
      const t = j / 43;
      const ang = t * 2.5 * Math.PI * 2;
      const rad = 0.14 * (1 - t * 0.75);
      return [lerp(cx, pore[0], t) + rad * Math.cos(ang), lerp(-2.5, 0.02, t), lerp(cz, pore[2], t) + rad * Math.sin(ang)] as V3;
    });
    ducts.push(sweep(curveOf(spiral), () => 0.045, { n: 120, m: 10, cap0: 'round', cap1: 'round' }));
  });
  add('eccrine-gland', d(merge(coils), 'eccrine'));
  add('eccrine-duct', d(merge(ducts), 'eccrineDuct'));

  const rims: BufferGeometry[] = [];
  for (const pore of sweatPores) {
    const py = reliefTop(pore[0], pore[2]);
    const ring: V3[] = Array.from({ length: 33 }, (_, j) => {
      const a = (j / 32) * Math.PI * 2;
      return [pore[0] + 0.17 * Math.cos(a), py + 0.02, pore[2] + 0.17 * Math.sin(a)] as V3;
    });
    rims.push(sweep(curveOf(ring, true), () => 0.05, { n: 48, m: 10 }));
    rims.push(blob([pore[0], py - 0.02, pore[2]], [0.1, 0.05, 0.1], { seg: 12 }));
  }
  add('sweat-pore', d(merge(rims), 'pore'));

  /* ------------------------------ Апокриновая железа ------------------------------ */
  const apCoil: V3[] = Array.from({ length: 180 }, (_, q) => {
    const t = (q / 179) * Math.PI * 2;
    return [APOCRINE.c[0] + 0.92 * Math.sin(9 * t) * 0.72 + 0.35 * Math.sin(3 * t), APOCRINE.c[1] + 0.64 * Math.sin(7 * t + 1), APOCRINE.c[2] + 0.78 * Math.cos(6 * t)] as V3;
  });
  add(
    'apocrine-gland',
    d(sweep(curveOf(apCoil), (u) => 0.19 + 0.03 * Math.sin(u * 46), { n: 320, m: 16, cap0: 'round', cap1: 'round' }), 'apocrine'),
    d(tube([[7.4, -5.9, -1.7], [6.8, -4.6, -1.4], [6.0, -3.2, -1.0], [5.3, -1.9, -0.6], [4.8, -1.0, -0.3], APOCRINE.ductTo], 0.07, { n: 96, m: 14 }), 'duct'),
  );

  /* ------------------------------ Сосуды: три сплетения ------------------------------ */
  const wave = (y: number, z: number, amp = 0.12): V3[] =>
    Array.from({ length: 16 }, (_, i) => [lerp(-9.4, 9.4, i / 15), y + amp * Math.sin(i * 1.1 + z), z + amp * Math.sin(i * 0.7)] as V3);
  const deepArt: BufferGeometry[] = [];
  for (const z of [-4.2, -0.5, 3.2]) deepArt.push(tube(wave(-6.7, z), (u) => 0.16 - 0.06 * u, { n: 90, m: 14 }));
  for (const x of [-6, -1, 4, 8]) deepArt.push(tube([[x, -6.7, -4.2], [x + 0.2, -6.75, -0.5], [x - 0.1, -6.7, 3.2]], 0.09, { n: 40, m: 11 }));
  for (const x of [-4, 2, 7]) deepArt.push(tube([[x, -6.7, -0.5], [x + 0.3, -5.2, -0.8], [x + 0.1, -3.8, -0.6]], 0.07, { n: 36, m: 10 }));
  const deepVein: BufferGeometry[] = [];
  for (const z of [-2.4, 1.4]) deepVein.push(tube(wave(-6.95, z, 0.1), (u) => 0.15 + 0.05 * u, { n: 90, m: 14 }));
  add('deep-plexus', d(merge(deepArt), 'artery'), d(merge(deepVein), 'vein'));

  const dermArt: BufferGeometry[] = [];
  for (const z of [-3, 2]) dermArt.push(tube(wave(-3.8, z, 0.1), 0.09, { n: 80, m: 12 }));
  for (const x of [-5, 0, 5]) dermArt.push(tube([[x, -3.8, -3], [x + 0.15, -3.85, 2]], 0.06, { n: 30, m: 9 }));
  for (const x of [-6, -2, 3, 7]) dermArt.push(tube([[x, -3.8, 0], [x + 0.2, -2.9, 0.3], [x, -2.15, 0.2]], 0.05, { n: 30, m: 9 }));
  const dermVein = [tube(wave(-3.95, -0.5, 0.09), 0.1, { n: 80, m: 12 })];
  add('dermal-plexus', d(merge(dermArt), 'artery'), d(merge(dermVein), 'vein'));

  const sub: BufferGeometry[] = [];
  for (const z of [-4.5, -2.5, 0.5, 2.5, 4.5]) sub.push(tube(wave(-2.15, z, 0.07), 0.05, { n: 80, m: 10 }));
  for (let x = -8.8; x < 9; x += 2.2) sub.push(tube([[x, -2.15, -4.5], [x + 0.1, -2.2, 0.5], [x - 0.1, -2.15, 4.5]], 0.045, { n: 40, m: 9 }));
  add('subpapillary-plexus', d(merge(sub), 'capillary'));

  /* ------------------------------ Капиллярные петли ------------------------------ */
  const loops: BufferGeometry[] = [];
  for (let x = -9; x <= 9; x += 1.15) {
    for (let z = -5; z <= 5; z += 1.35) {
      if (nearAxis(x, -1.5, z) < 1.4 || nearGlands(x, -1.5, z) < 0.4) continue;
      const apex = epiBase(x, z) - 0.1;
      loops.push(tube([[x - 0.1, -2.15, z], [x - 0.08, -1.5, z], [x, apex, z], [x + 0.08, -1.5, z], [x + 0.1, -2.15, z]], 0.03, { n: 24, m: 8 }));
    }
  }
  // перифолликулярное сплетение вокруг корня
  for (let k = 0; k < 3; k++) {
    const pts: V3[] = Array.from({ length: 60 }, (_, i) => {
      const u = lerp(0.16, 0.88, i / 59);
      return around(u, R.ct(u) + 0.03, i * 0.5 + k * 2.1);
    });
    loops.push(tube(pts, 0.035, { n: 130, m: 9 }));
  }
  add('capillary-loops', d(merge(loops), 'capillary'));

  /* ------------------------------ Лимфатические капилляры ------------------------------ */
  const lymph: BufferGeometry[] = [];
  const lymphSpots: [number, number][] = [[-8.2, 2.2], [-4.6, -1.8], [-1.2, 3.4], [1.8, -2.6], [4.4, 3.0], [7.2, -1.2], [8.8, 2.6], [-6.4, 4.2]];
  for (const [x, z] of lymphSpots) {
    const apex = epiBase(x, z) - 0.15;
    lymph.push(tube([[x - 0.16, -2.0, z], [x - 0.14, apex - 0.2, z], [x, apex, z], [x + 0.14, apex - 0.2, z], [x + 0.16, -2.0, z]], 0.06, { n: 26, m: 9 }));
  }
  lymph.push(tube([[-9.2, -7.4, -4.6], [-4, -7.5, -4.3], [1, -7.45, -4.5], [6, -7.5, -4.2], [9.2, -7.4, -4.4]], 0.12, { n: 70, m: 12 }));
  lymph.push(blob([-2, -7.47, -4.4], [0.2, 0.16, 0.2], { seg: 12 }));
  lymph.push(blob([4, -7.48, -4.3], [0.2, 0.16, 0.2], { seg: 12 }));
  add('lymph-capillaries', d(merge(lymph), 'lymph'));

  /* ------------------------------ Нервное сплетение ------------------------------ */
  const nv: BufferGeometry[] = [
    tube([[-9.8, -9.2, -3.2], [-6, -7.4, -2.4], [-2, -6.2, -1.6], [2, -5.6, -1.0], [6, -5.4, -0.6], [9.4, -5.5, -0.4]], (u) => 0.14 - 0.07 * u, { n: 90, m: 14 }),
    tube([[-8, -5.3, 2.8], [-3, -5.2, 2.4], [2, -5.3, 2.6], [7, -5.2, 2.2]], 0.06, { n: 70, m: 11 }),
  ];
  for (const x of [-7, -3, 1, 5, 8]) nv.push(tube([[x, -5.5, -1.0], [x + 0.2, -4.0, -0.6], [x - 0.1, -2.4, -0.3]], 0.04, { n: 34, m: 9 }));
  add('nerve-plexus', d(merge(nv), 'nerve'));

  /* ------------------------------ Тельца Мейснера ------------------------------ */
  const mei: BufferGeometry[] = [];
  const meiCap: BufferGeometry[] = [];
  const meiNerve: BufferGeometry[] = [];
  MEISSNER_SPOTS.forEach(([x, z], i) => {
    const y = epiBase(x, z) - 0.45;
    meiCap.push(blob([x, y, z], [0.3, 0.44, 0.3], { seg: 18, amp: 0.04, seed: i + 40 }));
    for (let k = 0; k < 6; k++) {
      mei.push(blob([x, y - 0.3 + k * 0.12, z], [0.22, 0.05, 0.22], { seg: 12, amp: 0.08, seed: i * 7 + k }));
    }
    meiNerve.push(tube([[x, y - 0.44, z], [x + 0.05, y - 0.9, z], [x, -2.3, z]], 0.025, { n: 18, m: 8 }));
  });
  add('meissner', d(merge(meiCap), 'meissnerCapsule'), d(merge(mei), 'meissner'), d(merge(meiNerve), 'nerve'));

  /* ------------------------------ Тельца Пачини ------------------------------ */
  const pacShell: BufferGeometry[] = [];
  const pacCore: BufferGeometry[] = [];
  const pacNerve: BufferGeometry[] = [];
  PACINIAN_SPOTS.forEach(([x, y, z], i) => {
    for (let k = 0; k < 9; k++) {
      const s = 1 - k * 0.075;
      pacShell.push(blob([x, y, z], [0.55 * s, 0.85 * s, 0.55 * s], { seg: 18, amp: 0.02, seed: i * 13 + k }));
    }
    pacCore.push(blob([x, y, z], [0.16, 0.5, 0.16], { seg: 14, amp: 0.04, seed: i + 60 }));
    pacNerve.push(tube([[x, y - 0.85, z], [x + 0.1, y - 1.4, z], [x, -6.0, z]], 0.035, { n: 24, m: 9 }));
  });
  add('pacinian', d(merge(pacShell), 'pacShell'), d(merge(pacCore), 'pacCore'), d(merge(pacNerve), 'nerve'));

  /* ------------------------------ Окончания Руффини ------------------------------ */
  const ruf: BufferGeometry[] = [];
  RUFFINI_SPOTS.forEach(([x, y, z], i) => {
    ruf.push(tube([[x, y - 1.2, z], [x, y - 0.4, z], [x, y, z]], 0.03, { n: 16, m: 8 }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + i;
      const dx = Math.cos(a) * 0.5;
      const dz = Math.sin(a) * 0.5;
      ruf.push(tube([[x, y, z], [x + dx * 0.5, y + 0.15, z + dz * 0.5], [x + dx, y + 0.3, z + dz]], 0.02, { n: 14, m: 7 }));
      ruf.push(blob([x + dx, y + 0.3, z + dz], [0.05, 0.07, 0.05], { seg: 9, seed: i * 9 + k }));
    }
  });
  add('ruffini', d(merge(ruf), 'ruffini'));

  /* ------------------------------ Свободные нервные окончания ------------------------------ */
  const free: BufferGeometry[] = [];
  const freeSpots: [number, number][] = [[-8.6, 1.6], [-7.0, -0.4], [-4.2, 2.0], [-2.6, -1.4], [-0.8, 1.2], [1.6, -2.0], [5.0, 1.8], [6.6, -1.0], [8.2, 1.4], [9.0, -0.6]];
  for (const [x, z] of freeSpots) {
    const top = epiBase(x, z) + 0.5;
    free.push(tube([[x, -2.3, z], [x + 0.05, -1.5, z], [x, epiBase(x, z) + 0.1, z], [x + 0.03, top, z]], 0.018, { n: 26, m: 7 }));
    free.push(tube([[x, epiBase(x, z) + 0.15, z], [x + 0.18, epiBase(x, z) + 0.3, z + 0.1], [x + 0.3, top - 0.05, z + 0.15]], 0.014, { n: 16, m: 6 }));
    free.push(tube([[x, epiBase(x, z) + 0.2, z], [x - 0.16, epiBase(x, z) + 0.35, z - 0.08], [x - 0.26, top - 0.08, z - 0.12]], 0.014, { n: 16, m: 6 }));
  }
  add('free-endings', d(merge(free), 'ending'));

  /* ------------------------------ Кератиноциты ------------------------------ */
  const ker: BufferGeometry[] = [];
  const desmo: BufferGeometry[] = [];
  const rowsY = [-0.52, -0.7, -0.88];
  const xs: number[] = [];
  for (let x = -9; x <= -1; x += 0.62) xs.push(x);
  for (let x = 6; x <= 9; x += 0.62) xs.push(x);
  rowsY.forEach((y, ri) => {
    xs.forEach((x, ci) => {
      const z = -0.05 + (r() - 0.5) * 0.16;
      const yy = y + (r() - 0.5) * 0.05;
      ker.push(blob([x, yy, z], [0.24, 0.12, 0.2], { seg: 12, amp: 0.12, seed: ri * 100 + ci }));
      if (ci < xs.length - 1 && xs[ci + 1] - x < 0.7) {
        desmo.push(tube([[x + 0.2, yy, z], [x + 0.31, yy + 0.02, z], [x + 0.42, yy, z]], 0.014, { n: 8, m: 6 }));
      }
    });
  });
  add('keratinocytes', d(merge(ker), 'keratinocyte'), d(merge(desmo), 'keratinocyte'));

  /* ------------------------------ Меланоциты и меланосомы ------------------------------ */
  const mel: BufferGeometry[] = [];
  const melGran: BufferGeometry[] = [];
  MELANOCYTE_SPOTS.forEach(([x, z], i) => {
    const y = epiBase(x, z) + 0.02;
    mel.push(blob([x, y, z], [0.16, 0.12, 0.16], { seg: 12, amp: 0.15, seed: i + 80 }));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + i;
      const dx = Math.cos(a) * 0.3;
      const dz = Math.sin(a) * 0.22;
      mel.push(tube([[x, y, z], [x + dx * 0.5, y + 0.18, z + dz * 0.5], [x + dx, y + 0.34, z + dz]], (u) => 0.026 * (1 - 0.6 * u), { n: 12, m: 7 }));
    }
    for (let k = 0; k < 22; k++) {
      const gx = x + (r() - 0.5) * 0.8;
      const gz = z + (r() - 0.5) * 0.4;
      const gy = Math.min(epiBase(x, z) + 0.15 + r() * 0.4, -0.46);
      melGran.push(blob([gx, gy, gz], [0.03, 0.03, 0.03], { seg: 7, seed: i * 30 + k }));
    }
  });
  add('melanocytes', d(merge(mel), 'melanocyte'));
  add('melanosomes', d(merge(melGran), 'melanosome'));

  /* ------------------------------ Клетки Лангерганса ------------------------------ */
  const lang: BufferGeometry[] = [];
  LANGERHANS_SPOTS.forEach(([x, z], i) => {
    const y = -0.6;
    lang.push(blob([x, y, z], [0.18, 0.14, 0.18], { seg: 12, amp: 0.12, seed: i + 90 }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + i * 0.5;
      const dx = Math.cos(a) * 0.32;
      const dz = Math.sin(a) * 0.24;
      lang.push(tube([[x, y, z], [x + dx * 0.5, y + 0.06, z + dz * 0.5], [x + dx, y + 0.1, z + dz]], (u) => 0.022 * (1 - 0.55 * u), { n: 12, m: 7 }));
    }
  });
  add('langerhans', d(merge(lang), 'langerhans'));

  /* ------------------------------ Клетки Меркеля ------------------------------ */
  const mk: BufferGeometry[] = [];
  MERKEL_SPOTS.forEach(([x, z], i) => {
    const yb = epiBase(x, z) - 0.06;
    mk.push(blob([x, yb, z], [0.18, 0.055, 0.18], { seg: 14, amp: 0.1, seed: i + 100 }));
    mk.push(tube([[x, yb - 0.05, z], [x + 0.03, yb - 0.6, z], [x, -2.2, z]], 0.02, { n: 14, m: 8 }));
  });
  add('merkel-cells', d(merge(mk), 'merkel'));

  /* ------------------------------ Отшелушивание ------------------------------ */
  const flakes: BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const x = lerp(-8.5, 8.5, r());
    const z = lerp(-4.5, 4.5, r());
    if (nearAxis(x, 0, z) < 1.2) continue;
    const lift = 0.04 + r() * 0.3;
    const curl = 0.1 + r() * 0.25;
    const y0 = reliefTop(x, z) + lift;
    const fl = curveOf([[x - 0.25, y0, z], [x, y0 + curl * 0.4, z + 0.05], [x + 0.25, y0 + curl, z]]);
    flakes.push(sweep(fl, () => 0.22, { n: 16, m: 10, squash: 0.07, cap0: 'round', cap1: 'round' }));
  }
  add('desquamation', d(merge(flakes), 'flake', { open: true }));

  return P;
}
