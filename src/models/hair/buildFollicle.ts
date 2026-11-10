import type { BufferGeometry } from 'three';
import { ARRECTOR, AX, HAIR_UP, PAPILLA, R, SK, U, epiBottom } from './anatomy';
import { blob, curveOf, heightSlab, lerp, merge, rng, smooth, sweep, tube, vnoise, type SweepOpt, type V3 } from './geometry';
import type { MatKey, MeshDef, Parts } from './types';

const d = (g: BufferGeometry, m: MatKey, o: Partial<MeshDef> = {}): MeshDef => ({ g, m, ...o });

/** Трубка вдоль оси фолликула на отрезке [u0, u1]. */
const along = (r: (u: number) => number, u0: number, u1: number, o: SweepOpt = {}): BufferGeometry =>
  sweep(AX, r, { n: Math.round(36 + 110 * (u1 - u0)), m: 30, u0, u1, ...o });

/** Точка на расстоянии rad от оси в плоскости, повёрнутой на угол phi вокруг оси. */
export function around(u: number, rad: number, phi: number): V3 {
  const p = AX.getPoint(u);
  const t = AX.getTangent(u);
  const bx = -t.y;
  const by = t.x;
  const l = Math.hypot(bx, by) || 1;
  return [p.x + (rad * Math.cos(phi) * bx) / l, p.y + (rad * Math.cos(phi) * by) / l, p.z + rad * Math.sin(phi)];
}

/** Всё, что выше поверхности кожи, прижимается к ней: устье воронки получается плоским, без «торчащих» краёв. */
function clampTop(g: BufferGeometry): BufferGeometry {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (p.getY(i) > -0.004) p.setY(i, -0.004);
  g.computeVertexNormals();
  return g;
}

const hairUp = (r: (u: number) => number, u0: number, u1: number, o: SweepOpt = {}): BufferGeometry =>
  sweep(HAIR_UP, r, { n: Math.round(24 + 90 * (u1 - u0)), m: 26, u0, u1, ...o });

const SAMPLES = Array.from({ length: 90 }, (_, i) => AX.getPoint(i / 89));
const nearAxis = (x: number, y: number, z: number): number => SAMPLES.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y, p.z - z)), 1e9);

export interface SlabSet {
  corneum: MeshDef[];
  epidermis: MeshDef[];
  basal: MeshDef[];
  papillary: MeshDef[];
  reticular: MeshDef[];
  hypodermis: MeshDef[];
}

/** Слои кожи как плиты: кожный блок для сцены фолликула и для сцены цикла роста. */
export function skinSlabs(x0: number, x1: number, noPick = false): SlabSet {
  const hz = SK.hz;
  const nx = Math.round((x1 - x0) * 3.4);
  const wavy = { x0, x1, zh: hz, nx, nz: 34 };
  const flat = { x0, x1, zh: hz, nx: 6, nz: 4 };
  const o = { noPick };
  const rough = (x: number, z: number) => 0.022 * (vnoise(x * 3.1, 0, z * 3.1) - 0.5);
  return {
    corneum: [d(heightSlab({ ...wavy, top: (x, z) => rough(x, z), bot: () => SK.corneum }), 'corneum', o)],
    epidermis: [d(heightSlab({ ...wavy, top: () => SK.corneum + 0.012, bot: (x, z) => epiBottom(x, z) }), 'epidermis', o)],
    basal: [d(heightSlab({ ...wavy, top: (x, z) => epiBottom(x, z) + 0.02, bot: (x, z) => epiBottom(x, z) - 0.075 }), 'basal', o)],
    papillary: [d(heightSlab({ ...wavy, top: (x, z) => epiBottom(x, z) - 0.05, bot: () => SK.papillary }), 'dermisP', o)],
    reticular: [d(heightSlab({ ...flat, top: () => SK.papillary + 0.02, bot: () => SK.reticular }), 'dermisR', o)],
    hypodermis: [d(heightSlab({ ...flat, top: () => SK.reticular + 0.02, bot: () => SK.bottom }), 'hypodermis', o)],
  };
}

const BULB_END = 1.0;

/** Блок кожи с косым фолликулом: все части сцены «Волос в коже». */
export function buildFollicle(): Parts {
  const P: Parts = {};
  const add = (id: string, ...defs: MeshDef[]) => {
    (P[id] ??= []).push(...defs);
  };
  const r = rng(7);

  // --- волос: стержень, кончик, корень и внутренности
  const shaftR = (u: number) => R.cuticle() * (1 - 0.9 * smooth(0.88, 1, u));
  add('hair-shaft', d(hairUp(shaftR, 0, 0.88, { cap0: null, cap1: null, uvLen: 18 }), 'cuticleHair'));
  add('hair-tip', d(hairUp(shaftR, 0.88, 1, { cap0: null, cap1: 'round', roundLen1: 0.12, uvLen: 3 }), 'cuticleHair'));
  add('hair-root', d(along(() => R.cuticle() + 0.004, 0, U.rootEnd, { cap0: null, cap1: 'round', roundLen1: 0.3, uvLen: 12 }), 'cuticleHair'));
  add(
    'hair-cuticle',
    d(hairUp(() => 0.262, 0, 0.86, { cap0: null, cap1: 'round', roundLen1: 0.2 }), 'cuticleHair'),
    d(along(() => 0.262, 0, U.rootEnd - 0.004, { cap0: null, cap1: 'round', roundLen1: 0.27 }), 'cuticleHair'),
  );
  add(
    'hair-cortex',
    d(hairUp(() => R.cortex(), 0, 0.84, { cap0: null, cap1: 'round', roundLen1: 0.2 }), 'cortex'),
    d(along(() => R.cortex(), 0, U.rootEnd - 0.008, { cap0: null, cap1: 'round', roundLen1: 0.22 }), 'cortex'),
  );
  add(
    'hair-medulla',
    d(hairUp(() => R.medulla(), 0, 0.8, { cap0: null, cap1: 'round', roundLen1: 0.1, m: 12 }), 'medulla'),
    d(along(() => R.medulla(), 0, U.keratogenous, { cap0: null, cap1: 'round', roundLen1: 0.1, m: 12 }), 'medulla'),
  );
  const grains: BufferGeometry[] = [];
  for (let i = 0; i < 520; i++) {
    const inRoot = r() < 0.55;
    const u = inRoot ? lerp(0.45, 0.86, r()) : lerp(0.05, 0.82, r());
    const ang = r() * Math.PI * 2;
    const rad = 0.08 + r() * 0.11;
    const p: V3 = inRoot ? around(u, rad, ang) : (() => {
      const q = HAIR_UP.getPoint(u);
      const t = HAIR_UP.getTangent(u);
      const bx = -t.y;
      const by = t.x;
      return [q.x + rad * Math.cos(ang) * bx, q.y + rad * Math.cos(ang) * by, rad * Math.sin(ang)] as V3;
    })();
    grains.push(blob(p, [0.022, 0.05, 0.022], { seg: 5, seed: i, amp: 0.2, rot: [0, 0, r() * 3] }));
  }
  add('melanin', d(merge(grains), 'melaninG'));

  // --- слои влагалищ: вложенные тела, каждое следующее лежит внутри предыдущего
  add('irs-cuticle', d(along(R.irsCuticle, 0.31, U.irsEnd, { cap0: 'round', roundLen0: 0.25, cap1: 'round', roundLen1: 0.3 }), 'irsCuticle'));
  add('huxley', d(along(R.huxley, 0.3, U.irsEnd, { cap0: 'round', roundLen0: 0.3, cap1: 'round', roundLen1: 0.4 }), 'huxley'));
  add('henle', d(along(R.henle, 0.29, U.irsEnd, { cap0: 'round', roundLen0: 0.3, cap1: 'round', roundLen1: 0.5 }), 'henle'));
  add('companion', d(along(R.companion, 0.28, U.irsEnd, { cap0: 'round', roundLen0: 0.3, cap1: 'round', roundLen1: 0.6 }), 'companion'));
  add('ors', d(clampTop(along(R.ors, 0.1, 0.92, { cap0: 'round', roundLen0: 0.2, cap1: 'round', roundLen1: 1.1 })), 'ors'));
  add('glassy', d(clampTop(along(R.glassy, 0, 0.99, { cap0: 'flat', cap1: 'round', roundLen1: 1.45 })), 'glassy'));
  add('connective-sheath', d(clampTop(along(R.ct, 0, BULB_END, { cap0: 'flat', cap1: 'round', roundLen1: 1.7 })), 'ctSheath'));
  add('infundibulum', d(clampTop(along(R.infundibulum, 0, 0.17, { cap0: 'flat', cap1: 'round', roundLen1: 0.12, m: 36 })), 'infund'));
  add('isthmus', d(along((u) => R.ors(u) + 0.05, 0.15, U.bulgeA + 0.02, { cap0: 'round', roundLen0: 0.12, cap1: 'round', roundLen1: 0.12 }), 'isthmus'));
  add(
    'bulge',
    d(along((u) => R.ors(u) + 0.045 + 0.1 * Math.sin(Math.PI * smooth(U.bulgeA, U.bulgeB, u)) ** 0.7, U.bulgeA, U.bulgeB, { cap0: 'round', roundLen0: 0.06, cap1: 'round', roundLen1: 0.06 }), 'bulge'),
  );
  add('hair-bulb', d(along(R.bulb, 0.78, BULB_END, { cap0: 'round', roundLen0: 0.3, cap1: 'round', roundLen1: 1.15, wob: (_, a) => 1 + 0.02 * Math.sin(a * 5) }), 'bulbCells'));
  add('matrix', d(along(R.matrix, 0.85, BULB_END, { cap0: 'round', roundLen0: 0.3, cap1: 'round', roundLen1: 0.95 }), 'matrixCells'));
  add('papilla', d(blob(PAPILLA.c, PAPILLA.r, { seg: 28, amp: 0.035, seed: 3 }), 'papilla'));
  const mel: BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.3;
    const y = lerp(-6.75, -7.3, r());
    const rad = lerp(0.54, 0.7, r()) * (y < -7.1 ? 0.9 : 1);
    mel.push(blob([PAPILLA.c[0] + Math.cos(a) * rad, y, Math.sin(a) * rad], [0.11, 0.15, 0.11], { seg: 8, seed: i + 5, amp: 0.25 }));
    mel.push(tube([[PAPILLA.c[0] + Math.cos(a) * rad, y, Math.sin(a) * rad], [PAPILLA.c[0] + Math.cos(a) * (rad + 0.18), y + 0.18, Math.sin(a) * (rad + 0.18)]], 0.025, { n: 6, m: 5 }));
  }
  add('bulb-melanocytes', d(merge(mel), 'melanocyte'));

  // --- кожа
  const sk = skinSlabs(SK.x0, SK.x1);
  add('stratum-corneum', ...sk.corneum);
  add('epidermis', ...sk.epidermis);
  add('basal-layer', ...sk.basal);
  add('papillary-dermis', ...sk.papillary);
  add('reticular-dermis', ...sk.reticular);
  add('hypodermis', ...sk.hypodermis);

  const fat: BufferGeometry[] = [];
  for (let i = 0; fat.length < 46 && i < 400; i++) {
    const x = lerp(-8.3, 8.3, r());
    const y = lerp(-9.0, -5.9, r());
    const z = lerp(-4.4, 4.4, r());
    const rad = lerp(0.55, 1.0, r());
    if (nearAxis(x, y, z) < rad + 1.8 || Math.hypot(x - 7.6, y + 6.1, z + 1) < rad + 1.4) continue;
    fat.push(blob([x, y, z], [rad, rad * 0.88, rad], { seg: 16, seed: i, amp: 0.07 }));
  }
  add('fat-lobules', d(merge(fat), 'fat'));

  const col: BufferGeometry[] = [];
  for (let i = 0; col.length < 64 && i < 400; i++) {
    const along_x = r() < 0.55;
    const y0 = lerp(-4.9, -2.2, r());
    const c: V3 = [lerp(-7.5, 7.5, r()), y0, lerp(-4.4, 4.4, r())];
    const len = lerp(3, 5, r());
    const pts: V3[] = Array.from({ length: 6 }, (_, k) => {
      const s = (k / 5 - 0.5) * len;
      const w = Math.sin(k * 1.7 + i) * 0.22;
      return (along_x ? [c[0] + s, y0 + w, c[2] + Math.cos(k + i) * 0.2] : [c[0] + Math.cos(k + i) * 0.2, y0 + w, c[2] + s]) as V3;
    });
    if (pts.some((p) => nearAxis(p[0], p[1], p[2]) < 1.7)) continue;
    col.push(tube(pts, lerp(0.06, 0.13, r()), { n: 30, m: 7, wob: (_, a) => 1 + 0.12 * Math.sin(a * 3 + i) }));
  }
  add('collagen', d(merge(col), 'collagen'));

  // --- сальная железа, протоки, мышца
  const glandCenters: [V3, V3][] = [
    [[0.9, -1.55, 0.0], [0.62, 0.5, 0.55]],
    [[1.55, -1.75, 0.95], [0.45, 0.38, 0.4]],
    [[1.35, -1.6, -1.0], [0.5, 0.42, 0.45]],
    [[0.2, -1.4, -0.6], [0.4, 0.34, 0.4]],
    [[0.35, -1.5, 0.7], [0.38, 0.32, 0.36]],
    [[-0.55, -1.45, 0.0], [0.34, 0.3, 0.34]],
    [[6.35, -1.6, 0.0], [0.5, 0.4, 0.42]],
    [[6.7, -1.45, -0.9], [0.36, 0.32, 0.36]],
    [[6.0, -1.7, 0.8], [0.34, 0.3, 0.34]],
  ];
  const gl: BufferGeometry[] = [];
  glandCenters.forEach(([c, rr], i) => {
    gl.push(blob(c, rr, { seg: 18, amp: 0.16, freq: 2.2, seed: i + 11 }));
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2;
      const b = r() * Math.PI - Math.PI / 2;
      gl.push(blob([c[0] + Math.cos(a) * Math.cos(b) * rr[0] * 0.85, c[1] + Math.sin(b) * rr[1] * 0.85, c[2] + Math.sin(a) * Math.cos(b) * rr[2] * 0.85], [rr[0] * 0.38, rr[1] * 0.38, rr[2] * 0.38], { seg: 8, amp: 0.15, seed: i * 7 + k }));
    }
  });
  add('sebaceous-gland', d(merge(gl), 'gland'));
  const ductL: V3[] = [[0.9, -1.5, 0], [1.7, -1.3, 0.05], [2.45, -1.12, 0.03], [3.0, -1.06, 0]];
  const ductR: V3[] = [[6.3, -1.55, 0], [5.4, -1.3, 0.03], [4.7, -1.12, 0.02], [4.2, -1.04, 0]];
  const ductExtra: V3[] = [[1.35, -1.6, -0.8], [1.95, -1.4, -0.35], [2.5, -1.15, -0.05]];
  add('sebaceous-duct', d(merge([tube(ductL, 0.17), tube(ductR, 0.15), tube(ductExtra, 0.12)]), 'duct'));
  const drops: BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const u = lerp(0.03, 0.135, r());
    const side = i % 2 ? 1 : -1;
    const p = around(u, side * lerp(0.36, 0.5, r()) * (1 + 0.5 * funnelK(u)), r() * 0.8 - 0.4);
    drops.push(blob(p, [0.075, 0.075, 0.075], { seg: 8 }));
  }
  add(
    'sebum',
    d(
      merge([
        tube([[0.9, -1.5, 0], [1.7, -1.3, 0.05], [2.45, -1.12, 0.03], [3.05, -1.06, 0]], 0.085),
        tube([[6.3, -1.55, 0], [5.4, -1.3, 0.03], [4.7, -1.12, 0.02], [4.15, -1.05, 0]], 0.075),
        blob([0.9, -1.55, 0], [0.26, 0.24, 0.26], { seg: 12, amp: 0.1, seed: 4 }),
        blob([6.35, -1.6, 0], [0.2, 0.18, 0.2], { seg: 10, amp: 0.1, seed: 5 }),
        ...drops,
      ]),
      'sebum',
    ),
  );

  const [bx, by] = [ARRECTOR.from[0], ARRECTOR.from[1]];
  const [ex, ey] = [ARRECTOR.to[0], ARRECTOR.to[1]];
  const mus: V3[] = [[bx, by, 0], [lerp(bx, ex, 0.3), lerp(by, ey, 0.3) - 0.28, 0], [lerp(bx, ex, 0.65), lerp(by, ey, 0.65) - 0.2, 0], [ex, ey, 0]];
  add('arrector-pili', d(sweep(curveOf(mus), (u) => 0.05 + 0.2 * Math.sin(Math.PI * u) ** 0.65, { n: 60, m: 18, cap0: 'round', cap1: 'round', wob: (_, a) => 1 + 0.07 * Math.sin(a * 6) }), 'muscle'));
  const brush: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const s = (i / 6 - 0.5) * 1.1;
    brush.push(tube([[ex, ey, 0], [ex - 0.25 + s * 0.4, ey + 0.28, s * 0.35], [ex - 0.35 + s * 0.8, ey + 0.58, s * 0.6]], 0.03, { n: 8, m: 5 }));
  }
  for (let i = 0; i < 4; i++) {
    const s = (i / 3 - 0.5) * 0.9;
    brush.push(tube([[bx, by, 0], [bx + 0.3, by + 0.04, s * 0.3], [bx + 0.62, by + 0.02, s * 0.7]], 0.045, { n: 8, m: 5 }));
  }
  add('arrector-attachment', d(merge(brush), 'tendon'));

  const coil: V3[] = Array.from({ length: 140 }, (_, k) => {
    const t = (k / 139) * Math.PI * 2;
    return [7.6 + 0.9 * Math.sin(9 * t) * 0.7 + 0.35 * Math.sin(3 * t), -6.1 + 0.62 * Math.sin(7 * t + 1), -1.0 + 0.75 * Math.cos(6 * t)] as V3;
  });
  add('apocrine-gland', d(sweep(curveOf(coil), (u) => 0.19 + 0.03 * Math.sin(u * 40), { n: 260, m: 10, cap0: 'round', cap1: 'round' }), 'apocrine'));
  add(
    'apocrine-duct',
    d(tube([[7.5, -5.4, -0.9], [7.1, -4.4, -0.8], [6.4, -3.1, -0.6], [5.7, -2.0, -0.5], [5.0, -1.0, -0.4], [4.4, -0.45, -0.3]], 0.075, { n: 90 }), 'duct'),
  );

  // --- сосуды и нервы
  add(
    'follicular-artery',
    d(
      merge([
        tube([[-8.4, -9.1, -1.1], [-5.2, -8.8, -0.9], [-2.4, -8.3, -0.6], [0.2, -8.15, -0.4], [1.2, -8.1, -0.2], [1.6, -7.9, 0]], (u) => 0.19 - 0.08 * u, { n: 70 }),
        tube([[-4.6, -8.78, -0.9], [-3.9, -7.7, -1.0], [-3.2, -6.3, -0.9], [-2.2, -4.9, -0.9]], 0.07, { n: 40 }),
      ]),
      'artery',
    ),
  );
  add('follicular-vein', d(tube([[2.35, -7.95, -0.1], [3.4, -8.15, -0.3], [5.2, -8.45, -0.5], [7.0, -9.0, -0.8], [8.8, -9.3, -1.0]], (u) => 0.16 + 0.07 * u, { n: 60 }), 'vein'));
  const cap: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const z = lerp(-0.3, 0.15, i / 4);
    const x = PAPILLA.c[0] + (i - 2) * 0.1;
    cap.push(tube([[x - 0.18, -7.95, z], [x - 0.15, -7.2, z], [x - 0.05, -6.8 + (i % 2) * 0.07, z], [x + 0.08, -7.2, z], [x + 0.2, -7.95, z]], 0.04, { n: 28, m: 6 }));
  }
  add('papilla-capillaries', d(merge(cap), 'capillary'));

  const peri: BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const pts: V3[] = Array.from({ length: 70 }, (_, i) => {
      const u = lerp(0.18, 0.88, i / 69);
      return around(u, R.ct(u) + 0.015, i * 0.5 + k * 2.1);
    });
    peri.push(tube(pts, 0.045, { n: 140, m: 6 }));
  }
  for (const phi of [0.9, 2.6, 4.4]) {
    const pts: V3[] = Array.from({ length: 24 }, (_, i) => {
      const u = lerp(0.2, 0.9, i / 23);
      return around(u, R.ct(u) + 0.03, phi + 0.3 * Math.sin(i * 0.9));
    });
    peri.push(tube(pts, 0.05, { n: 60, m: 6 }));
  }
  add('perifollicular-plexus', d(merge(peri), 'capillary'));

  const plex: BufferGeometry[] = [];
  const zs = [-4.1, -2.9, -1.8, 1.9, 3.1, 4.2];
  for (const z of zs) {
    const pts: V3[] = Array.from({ length: 16 }, (_, i) => [lerp(-8.6, 8.6, i / 15), -1.8 + 0.1 * Math.sin(i * 1.3 + z), z + 0.18 * Math.sin(i * 0.9)] as V3);
    plex.push(tube(pts, 0.06, { n: 90, m: 6 }));
  }
  for (let x = -7.6; x < 8; x += 1.7) {
    if (Math.abs(x - 3.4) < 1.5) continue;
    const pts: V3[] = Array.from({ length: 10 }, (_, i) => [x + 0.15 * Math.sin(i), -1.85 + 0.08 * Math.sin(i * 1.7), lerp(-4.8, 4.8, i / 9)] as V3);
    plex.push(tube(pts, 0.055, { n: 60, m: 6 }));
  }
  for (let x = -7.8; x < 8.5; x += 1.15) {
    const z = lerp(-4.4, 4.4, r());
    if (Math.hypot(x - 3.2, z) < 1.9) continue;
    const yb = epiBottom(x, z);
    plex.push(tube([[x - 0.12, -1.8, z], [x - 0.1, -1.2, z], [x, yb + 0.12, z], [x + 0.1, -1.2, z], [x + 0.12, -1.8, z]], 0.032, { n: 18, m: 5 }));
  }
  add('subpapillary-plexus', d(merge(plex), 'capillary'));

  const nv: BufferGeometry[] = [
    tube([[-8.6, -6.7, -1.5], [-6.2, -6.0, -1.4], [-3.8, -5.2, -1.2], [-1.0, -4.6, -1.0], [1.4, -4.2, -0.9], [2.6, -3.9, -0.55]], (u) => 0.13 - 0.05 * u, { n: 70 }),
    tube([[-3.8, -5.2, -1.2], [-3.2, -4.0, -1.5], [-3.5, -2.6, -1.4], [-3.4, -1.5, -1.3]], 0.045, { n: 30, m: 6 }),
  ];
  for (let i = 0; i < 10; i++) {
    const phi = (i / 10) * Math.PI * 2;
    const pts: V3[] = Array.from({ length: 6 }, (_, k) => {
      const u = lerp(0.27, 0.5, k / 5);
      return around(u, R.ct(u) + 0.045, phi);
    });
    nv.push(tube(pts, 0.032, { n: 24, m: 5 }));
  }
  for (const u of [0.34, 0.43]) {
    const pts: V3[] = Array.from({ length: 28 }, (_, k) => around(u, R.ct(u) + 0.06, (k / 28) * Math.PI * 2));
    nv.push(sweep(curveOf(pts, true), () => 0.034, { n: 70, m: 6 }));
  }
  add('nerve-plexus', d(merge(nv), 'nerve'));

  const leaf: BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const u = lerp(0.3, 0.5, r());
    const p = around(u, R.ct(u) + 0.07, (i / 26) * Math.PI * 2 + r() * 0.2);
    const t = AX.getTangent(u);
    leaf.push(blob(p, [0.05, 0.27, 0.07], { seg: 8, seed: i, amp: 0.1, rot: [0, 0, Math.atan2(-t.x, t.y)] }));
  }
  add('lanceolate-endings', d(merge(leaf), 'ending'));

  const mk: BufferGeometry[] = [];
  const spots: [number, number][] = [[5.1, -0.2], [5.9, 0.3], [6.7, -0.8], [0.6, -0.6], [1.5, 0.4], [-1.2, -0.3], [-3.0, 0.9], [7.9, 0.6], [-5.6, -0.7]];
  spots.forEach(([x, z], i) => {
    const yb = epiBottom(x, z) - 0.07;
    mk.push(blob([x, yb, z], [0.19, 0.05, 0.19], { seg: 10, amp: 0.1, seed: i }));
    mk.push(tube([[x, yb - 0.05, z], [x + 0.03, yb - 0.55, z], [x, -1.7, z]], 0.018, { n: 10, m: 5 }));
  });
  add('merkel-discs', d(merge(mk), 'merkel'));
  return P;
}

const funnelK = (u: number): number => (u < 0.15 ? (1 - u / 0.15) ** 2 : 0);

/* ───────────────────────────── Цикл роста ───────────────────────────── */

const hairAbove = (x: number, sx: number): V3[] => [[x, 0, 0], [x + 0.3 * sx, 1.5, 0], [x + 1.1 * sx, 3.0, 0], [x + 2.9 * sx, 4.2, 0], [x + 5 * sx, 4.5, 0]];

/** Три фолликула в разных фазах и выпавший волос; кожа вокруг — фон. */
export function buildCycle(): { parts: Parts; context: MeshDef[] } {
  const P: Parts = {};
  const add = (id: string, ...defs: MeshDef[]) => {
    (P[id] ??= []).push(...defs);
  };
  const sk = skinSlabs(-10.5, 10.5, true);
  const context = [...sk.corneum, ...sk.epidermis, ...sk.basal, ...sk.papillary, ...sk.reticular, ...sk.hypodermis];
  const vert = (x: number, depth: number, wob = 0.18) => curveOf([[x, 0, 0], [x - wob * 0.4, -depth * 0.3, 0], [x + wob * 0.6, -depth * 0.62, 0], [x, -depth, 0]]);
  const sheath = (x: number, depth: number, rad: number, m: MatKey, cap = 0.9, wob = 0.18): MeshDef =>
    d(clampTop(sweep(vert(x, depth, wob), (u) => rad * (1 + 0.55 * smooth(0.84, 0.98, u)), { n: 80, m: 26, cap0: 'flat', cap1: 'round', roundLen1: cap })), m);
  const hair = (x: number, sx: number, depth: number, rad: number, m: MatKey = 'cuticleHair'): MeshDef[] => {
    const root = sweep(vert(x, depth, 0.18), () => rad, { n: 70, m: 16, cap0: null, cap1: 'round', roundLen1: rad, u0: 0, u1: 0.97 });
    const top = sweep(curveOf(hairAbove(x, sx)), (u) => rad * (1 - 0.88 * smooth(0.86, 1, u)), { n: 80, m: 16, cap0: null, cap1: 'round', roundLen1: 0.08 });
    return [d(root, m), d(top, m)];
  };

  // анаген: глубокий фолликул, активная луковица
  const xa = -6.2;
  add(
    'anagen',
    sheath(xa, 7.2, 0.98, 'ctSheath', 1.5),
    sheath(xa, 7.1, 0.72, 'ors', 1.2),
    sheath(xa, 6.9, 0.42, 'huxley', 0.55),
    d(blob([xa, -7.35, 0], [1.05, 1.0, 1.05], { seg: 26, amp: 0.02 }), 'bulbCells'),
    d(blob([xa, -7.65, 0], [0.5, 0.78, 0.5], { seg: 20 }), 'papilla'),
    ...hair(xa, 1, 6.6, 0.26),
  );
  // катаген: нижняя часть сморщивается, остаётся тяж с сосочком на конце
  const xc = 0;
  add(
    'catagen',
    sheath(xc, 4.5, 0.78, 'ctSheath', 0.75, 0.1),
    sheath(xc, 4.4, 0.56, 'ors', 0.6, 0.1),
    d(blob([xc, -3.95, 0], [0.44, 0.55, 0.44], { seg: 16, amp: 0.05 }), 'club'),
    ...hair(xc, 1, 4.0, 0.25),
  );
  add(
    'epithelial-strand',
    d(sweep(curveOf([[xc, -4.4, 0], [xc - 0.15, -5.2, 0], [xc + 0.12, -5.9, 0], [xc, -6.5, 0]]), (u) => 0.2 - 0.12 * u, { n: 50, m: 12, cap0: 'round', cap1: 'round' }), 'strand'),
    d(blob([xc, -6.75, 0], [0.34, 0.42, 0.34], { seg: 16 }), 'papilla'),
  );
  // телоген: короткий мешок с колбовидным волосом
  const xt = 6.2;
  add('telogen', sheath(xt, 2.7, 0.7, 'ctSheath', 0.6, 0.06), sheath(xt, 2.6, 0.48, 'ors', 0.5, 0.06));
  add(
    'club-hair',
    ...hair(xt, 1, 2.0, 0.24, 'club'),
    d(blob([xt, -2.1, 0], [0.38, 0.5, 0.38], { seg: 18, amp: 0.05 }), 'club'),
    d(merge(Array.from({ length: 9 }, (_, i) => tube([[xt + (i - 4) * 0.07, -2.35, 0], [xt + (i - 4) * 0.12, -2.65, 0.02 * (i - 4)]], 0.02, { n: 6, m: 5 }))), 'club'),
  );
  add(
    'secondary-germ',
    d(merge([[0, 0, 0], [0.22, -0.12, 0.1], [-0.2, -0.2, -0.08], [0.1, -0.38, 0.12], [-0.12, -0.5, 0]].map(([dx, dy, dz], i) => blob([xt + dx, -3.0 + dy, dz], [0.17, 0.15, 0.17], { seg: 9, amp: 0.1, seed: i }))), 'germ'),
  );
  add(
    'resting-papilla',
    d(blob([xt, -4.5, 0], [0.38, 0.5, 0.38], { seg: 18, amp: 0.04 }), 'papilla'),
    d(tube([[xt, -4.0, 0], [xt + 0.04, -3.6, 0], [xt, -3.4, 0]], 0.06, { n: 14, m: 6 }), 'strand'),
  );
  const shed: V3[] = [[7.9, 0.2, -0.7], [8.4, 0.17, -0.55], [9.1, 0.19, -0.7], [9.8, 0.16, -0.5], [10.35, 0.18, -0.6]];
  add(
    'shedding-hair',
    d(sweep(curveOf(shed), (u) => 0.13 * (1 - 0.8 * smooth(0.7, 1, u)), { n: 50, m: 14, cap0: 'round', cap1: 'round', roundLen1: 0.05 }), 'shed'),
    d(blob([7.85, 0.2, -0.7], [0.27, 0.2, 0.2], { seg: 14, amp: 0.05 }), 'shed'),
  );
  return { parts: P, context };
}

