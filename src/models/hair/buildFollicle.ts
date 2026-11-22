import type { BufferGeometry } from 'three';
import { ARRECTOR, AX, HAIR_UP, PAPILLA, R, SEBACEOUS_DUCT, SK, U, epiBottom, poreDepression } from './anatomy';
import { buildScalp, scalpMargin } from './buildScalp';
import { blob, curveOf, fbm, heightSlab, lerp, merge, rng, smooth, sweep, tube, type SweepOpt, type V3 } from './geometry';
import type { MatKey, MeshDef, Parts } from './types';

const d = (g: BufferGeometry, m: MatKey, o: Partial<MeshDef> = {}): MeshDef => ({ g, m, ...o });

/** Трубка вдоль оси фолликула на отрезке [u0, u1]. */
const along = (r: (u: number) => number, u0: number, u1: number, o: SweepOpt = {}): BufferGeometry =>
  sweep(AX, r, { n: Math.round(44 + 130 * (u1 - u0)), m: 36, u0, u1, ...o });

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
  sweep(HAIR_UP, r, { n: Math.round(32 + 110 * (u1 - u0)), m: 32, u0, u1, ...o });

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

/** Слои кожи как плиты с рельефной поверхностью, воронкой устья и сосочковым слоем. */
export function skinSlabs(x0: number, x1: number, noPick = false, poreX = 4.0): SlabSet {
  const hz = SK.hz;
  const nx = Math.round((x1 - x0) * 4.2);
  const wavy = { x0, x1, zh: hz, nx, nz: 40 };
  const flat = { x0, x1, zh: hz, nx: 12, nz: 10 };
  const o = { noPick };
  const rough = (x: number, z: number) =>
    0.026 * (fbm(x * 2.4, 0, z * 2.4, 3) - 0.5) + (noPick ? 0 : poreDepression(x, z, poreX));
  const cornBot = (x: number, z: number) => SK.corneum + (noPick ? 0 : poreDepression(x, z, poreX) * 0.75);
  return {
    corneum: [d(heightSlab({ ...wavy, top: (x, z) => rough(x, z), bot: cornBot }), 'corneum', o)],
    epidermis: [d(heightSlab({ ...wavy, top: (x, z) => cornBot(x, z) + 0.012, bot: (x, z) => epiBottom(x, z) }), 'epidermis', o)],
    basal: [d(heightSlab({ ...wavy, top: (x, z) => epiBottom(x, z) + 0.02, bot: (x, z) => epiBottom(x, z) - 0.075 }), 'basal', o)],
    papillary: [d(heightSlab({ ...wavy, top: (x, z) => epiBottom(x, z) - 0.05, bot: () => SK.papillary }), 'dermisP', o)],
    reticular: [d(heightSlab({ ...flat, top: () => SK.papillary + 0.02, bot: () => SK.reticular }), 'dermisR', o)],
    hypodermis: [d(heightSlab({ ...flat, top: () => SK.reticular + 0.02, bot: () => SK.bottom }), 'hypodermis', o)],
  };
}

/** Блок кожи с косым фолликулом: все части сцены «Волос в коже». */
export function buildFollicle(): Parts {
  const P: Parts = {};
  const add = (id: string, ...defs: MeshDef[]) => {
    (P[id] ??= []).push(...defs);
  };
  const r = rng(7);

  // --- волос: стержень с рельефом чешуек кутикулы, кончик, корень и внутренности
  const scaleWob = (u: number, a: number) => 1 + 0.055 * Math.cos(2 * a) + 0.008 * Math.sin(u * 190 + Math.sin(a * 4) * 0.6);
  const taper = (u: number) => 1 - 0.11 * smooth(0.18, 0.86, u) - 0.78 * smooth(0.86, 1, u);
  const shaftR = (u: number) => R.cuticle() * taper(u);
  const cortexR = (u: number) => R.cortex() * taper(u);
  add('hair-shaft', d(hairUp(shaftR, 0.12, 0.87, { uvLen: 6.5, wob: scaleWob }), 'cuticleHair'));
  add('hair-tip', d(hairUp(shaftR, 0.87, 1, { cap1: 'round', roundLen1: 0.04, uvLen: 1, wob: scaleWob }), 'cuticleHair'));
  add('hair-root', d(along(R.cuticle, 0, U.rootEnd, { innerRadius: R.cortex, uvLen: 4.1, wob: scaleWob }), 'cuticleHair'));
  add('hair-cuticle', d(hairUp(shaftR, 0, 0.12, { innerRadius: cortexR, uvLen: 1, wob: scaleWob }), 'cuticleHair'));
  add(
    'hair-cortex',
    d(hairUp(cortexR, 0, 0.985, { cap0: null, cap1: 'round', roundLen1: 0.03, wob: scaleWob }), 'cortex'),
    d(along(() => R.cortex(), 0, U.rootEnd - 0.008, { cap0: null, cap1: 'round', roundLen1: 0.22 }), 'cortex'),
  );
  add(
    'hair-medulla',
    d(hairUp((u) => R.medulla() * taper(u), 0, 0.84, { cap0: null, cap1: 'round', roundLen1: 0.1, m: 16 }), 'medulla'),
    d(along(() => R.medulla(), 0, U.keratogenous, { cap0: null, cap1: 'round', roundLen1: 0.1, m: 16 }), 'medulla'),
  );

  // гранулы меланина в кортексе стержня и корня
  const grains: BufferGeometry[] = [];
  for (let i = 0; i < 480; i++) {
    const inRoot = r() < 0.55;
    const u = inRoot ? lerp(0.42, 0.86, r()) : lerp(0.04, 0.84, r());
    const ang = r() * Math.PI * 2;
    const rad = 0.045 + r() * 0.073;
    const p: V3 = inRoot ? around(u, rad, ang) : (() => {
      const q = HAIR_UP.getPoint(u);
      const t = HAIR_UP.getTangent(u);
      const b = t.clone().set(-t.y, t.x, 0).normalize();
      const n = t.clone().cross(b);
      q.addScaledVector(b, taper(u) * rad * Math.cos(ang));
      q.addScaledVector(n, taper(u) * rad * Math.sin(ang));
      return [q.x, q.y, q.z] as V3;
    })();
    grains.push(blob(p, [0.012, 0.028, 0.012], { seg: 7, seed: i, amp: 0.2, rot: [0, 0, r() * 3] }));
  }
  add('melanin', d(merge(grains), 'melaninG'));

  const wallWob = (u: number, a: number) =>
    1 + (0.013 + 0.012 * u) * Math.cos(a * 3 - 4 * u) + 0.012 * Math.sin(17 * u + a * 2);
  const wall = (outer: (u: number) => number, inner: (u: number) => number, u0: number, u1: number, material: MatKey) =>
    d(clampTop(along(outer, u0, u1, { innerRadius: inner, m: 42, wob: wallWob })), material);
  add('irs-cuticle', wall(R.irsCuticle, (u) => R.cuticle() + 0.055 * smooth(0.75, 0.9, u), 0.30, U.irsEnd, 'irsCuticle'));
  add('huxley', wall(R.huxley, R.irsCuticle, 0.29, U.irsEnd, 'huxley'));
  add('henle', wall(R.henle, R.huxley, 0.28, U.irsEnd, 'henle'));
  add('companion', wall(R.companion, R.henle, 0.275, U.irsEnd, 'companion'));
  add('ors', wall(R.ors, (u) => lerp(0.245, R.companion(u), smooth(0.24, 0.30, u)), 0.17, 0.97, 'ors'));
  add('glassy', wall(R.glassy, R.ors, 0.17, 0.99, 'glassy'));
  add('connective-sheath', wall(R.ct, R.glassy, 0.105, 1, 'ctSheath'));
  add('infundibulum', wall(R.infundibulum, (u) => 0.36 - 0.125 * smooth(0, 0.17, u), 0, 0.172, 'infund'));
  add('isthmus', wall((u) => R.ors(u) + 0.028, R.ors, 0.17, U.bulgeA + 0.01, 'isthmus'));
  add('bulge', wall((u) => R.ct(u) + 0.036 + 0.098 * Math.sin(Math.PI * smooth(U.bulgeA, U.bulgeB, u)) ** 0.7, R.ct, U.bulgeA, U.bulgeB, 'bulge'));

  const baseAxis = curveOf([[2.01, -5.98, 0], [1.84, -6.43, 0], [1.72, -7.07, 0], [1.67, -7.8, 0], [1.66, -8.48, 0]]);
  const bulbR = (u: number) => 0.53 + 0.56 * smooth(0, 0.56, u) - 0.58 * smooth(0.68, 1, u);
  const matrixR = (u: number) => bulbR(u) - 0.11 - 0.07 * (1 - smooth(0.15, 0.7, u));
  const papillaR = (u: number) => 0.07 + 0.43 * smooth(0.22, 0.69, u) - 0.22 * smooth(0.72, 1, u);
  add('hair-bulb', d(sweep(baseAxis, bulbR, { n: 88, m: 44, innerRadius: matrixR, wob: wallWob }), 'bulbCells'));
  add('matrix', d(sweep(baseAxis, matrixR, { u0: 0.13, n: 82, m: 40, innerRadius: papillaR, wob: wallWob }), 'matrixCells'));
  add('papilla', d(sweep(baseAxis, (u) => papillaR(u) - 0.011, {
    u0: 0.28, n: 80, m: 40, cap0: 'round', cap1: 'round', roundLen0: 0.21, roundLen1: 0.29, wob: wallWob,
  }), 'papilla'));

  // дендритные меланоциты в матриксе над сосочком
  const mel: BufferGeometry[] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.25;
    const y = lerp(-6.7, -7.35, r());
    const rad = lerp(0.52, 0.72, r()) * (y < -7.1 ? 0.9 : 1);
    const cx = PAPILLA.c[0] + Math.cos(a) * rad;
    const cz = Math.sin(a) * rad;
    mel.push(blob([cx, y, cz], [0.1, 0.14, 0.1], { seg: 10, seed: i + 5, amp: 0.28 }));
    for (let br = -1; br <= 1; br += 2) {
      mel.push(
        tube(
          [
            [cx, y, cz],
            [cx + Math.cos(a + br * 0.3) * 0.12, y + 0.12, cz + Math.sin(a + br * 0.3) * 0.12],
            [cx + Math.cos(a + br * 0.5) * 0.22, y + 0.26, cz + Math.sin(a + br * 0.5) * 0.22],
          ],
          (u) => 0.028 * (1 - 0.65 * u),
          { n: 10, m: 7 },
        ),
      );
    }
  }
  add('bulb-melanocytes', d(merge(mel), 'melanocyte'));

  // --- кожа
  const sk = buildScalp();
  add('stratum-corneum', d(sk.corneum, 'corneum'));
  add('epidermis', d(sk.epidermis, 'epidermis'));
  add('basal-layer', d(sk.basal, 'basal'));
  add('papillary-dermis', d(sk.papillary, 'dermisP'));
  add('reticular-dermis', d(sk.reticular, 'dermisR'));
  add('hypodermis', d(sk.hypodermis, 'hypodermis'));

  // плотные дольки адипоцитов в гиподерме
  const fat: BufferGeometry[] = [];
  for (let i = 0; i < 35; i++) {
    const cx = lerp(-7.5, 7.4, r());
    const cy = lerp(-8.9, -6.06, r());
    const cz = lerp(-3.3, 3.4, r());
    if (nearAxis(cx, cy, cz) < 2.12 || scalpMargin(cx, cy, cz) > -0.29) continue;
    for (let j = 0; j < 10; j++) {
      const x = cx + lerp(-0.75, 0.75, r());
      const y = cy + lerp(-0.57, 0.57, r());
      const z = cz + lerp(-0.67, 0.67, r());
      const rad = lerp(0.16, 0.43, r());
      if (scalpMargin(x, y, z) > -0.17) continue;
      fat.push(blob([x, y, z], [rad, rad * 0.79, rad * (0.81 + 0.26 * r())], { seg: 15, seed: i * 10 + j, amp: 0.14 }));
    }
  }
  add('fat-lobules', d(merge(fat), 'fat'));

  // трёхмерная сеть коллагеновых волокон сетчатой дермы
  const col: BufferGeometry[] = [];
  for (let i = 0; col.length < 66 && i < 410; i++) {
    const alongX = r() < 0.55;
    const y0 = lerp(-4.95, -2.15, r());
    const c: V3 = [lerp(-7.6, 7.6, r()), y0, lerp(-4.5, 4.5, r())];
    const len = lerp(1.5, 3.8, r());
    const pts: V3[] = Array.from({ length: 7 }, (_, k) => {
      const s = (k / 6 - 0.5) * len;
      const w = Math.sin(k * 1.6 + i) * 0.24;
      return (alongX ? [c[0] + s, y0 + w, c[2] + Math.cos(k + i) * 0.22] : [c[0] + Math.cos(k + i) * 0.22, y0 + w, c[2] + s]) as V3;
    });
    if (pts.some((p) => nearAxis(p[0], p[1], p[2]) < 1.36 || scalpMargin(...p) > -0.13)) continue;
    col.push(tube(pts, lerp(0.023, 0.054, r()), { n: 34, m: 10, wob: (_, a) => 1 + 0.14 * Math.sin(a * 3 + i) }));
  }
  add('collagen', d(merge(col), 'collagen'));

  // --- альвеолярная многодольчатая сальная железа, протоки, секрет
  const glandCenters: [V3, V3][] = [
    [[0.9, -1.55, 0.0], [0.58, 0.48, 0.52]],
    [[1.55, -1.75, 0.95], [0.44, 0.36, 0.4]],
    [[1.35, -1.6, -1.0], [0.48, 0.4, 0.44]],
    [[0.2, -1.4, -0.6], [0.38, 0.34, 0.38]],
    [[0.35, -1.5, 0.7], [0.38, 0.32, 0.36]],
    [[-0.55, -1.45, 0.0], [0.34, 0.3, 0.34]],
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
  add('sebaceous-gland', d(merge(gl), 'gland'));
  const ductExtra: V3[] = [[1.35, -1.6, -0.8], [1.95, -1.4, -0.35], [2.5, -1.15, -0.05]];
  const ductExtraF: V3[] = [[1.55, -1.75, 0.8], [2.1, -1.45, 0.35], [2.6, -1.16, 0.06]];
  add('sebaceous-duct', d(merge([tube(SEBACEOUS_DUCT, 0.143, { m: 16 }), tube(ductExtra, 0.102, { m: 14 }), tube(ductExtraF, 0.096, { m: 14 })]), 'duct'));

  const drops: BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const u = lerp(0.025, 0.14, r());
    const side = i % 2 ? 1 : -1;
    const p = around(u, side * lerp(0.19, 0.27, r()), r() * 0.9 - 0.45);
    drops.push(blob(p, [0.035, 0.049, 0.035], { seg: 10 }));
  }
  add(
    'sebum',
    d(
      merge([
        tube(SEBACEOUS_DUCT, 0.07, { m: 14 }),
        blob([1.0, -1.52, -0.13], [0.18, 0.19, 0.15], { seg: 14, amp: 0.1, seed: 4 }),
        ...drops,
      ]),
      'sebum',
    ),
  );

  // --- многопучковая мышца, поднимающая волос, и сухожильные прикрепления
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
  add('arrector-pili', d(merge(fascicles), 'muscle'));

  const brush: BufferGeometry[] = [];
  for (let i = 0; i < 11; i++) {
    const s = (i / 10 - 0.5) * 1.25;
    brush.push(tube([[ex, ey, 0], [ex - 0.25 + s * 0.4, ey + 0.28, s * 0.35], [ex - 0.38 + s * 0.85, ey + 0.62, s * 0.65]], 0.028, { n: 12, m: 8 }));
  }
  for (let i = 0; i < 6; i++) {
    const s = (i / 5 - 0.5) * 1.0;
    brush.push(tube([[bx, by, 0], [bx + 0.32, by + 0.04, s * 0.35], [bx + 0.66, by + 0.02, s * 0.72]], 0.04, { n: 12, m: 8 }));
  }
  add('arrector-attachment', d(merge(brush), 'tendon'));

  // --- клубок апокриновой железы и проток
  const coil: V3[] = Array.from({ length: 180 }, (_, k) => {
    const t = (k / 179) * Math.PI * 2;
    return [7.6 + 0.92 * Math.sin(9 * t) * 0.72 + 0.35 * Math.sin(3 * t), -6.1 + 0.64 * Math.sin(7 * t + 1), -1.0 + 0.78 * Math.cos(6 * t)] as V3;
  });
  add('apocrine-gland', d(sweep(curveOf(coil), (u) => 0.19 + 0.03 * Math.sin(u * 46), { n: 320, m: 16, cap0: 'round', cap1: 'round' }), 'apocrine'));
  add(
    'apocrine-duct',
    d(tube([[7.5, -5.4, -0.9], [7.1, -4.4, -0.8], [6.4, -3.1, -0.6], [5.7, -2.0, -0.5], [5.0, -1.0, -0.4], [4.4, -0.45, -0.3]], 0.075, { n: 96, m: 14 }), 'duct'),
  );

  // --- сосуды и нервы (сглаженные высокополигональные ветви)
  add(
    'follicular-artery',
    d(
      merge([
        tube([[-8.4, -9.1, -1.1], [-5.2, -8.8, -0.9], [-2.4, -8.3, -0.6], [0.2, -8.15, -0.4], [1.2, -8.1, -0.2], [1.6, -7.9, 0]], (u) => 0.19 - 0.08 * u, { n: 80, m: 16 }),
        tube([[-4.6, -8.78, -0.9], [-3.9, -7.7, -1.0], [-3.2, -6.3, -0.9], [-2.2, -4.9, -0.9]], 0.07, { n: 46, m: 12 }),
      ]),
      'artery',
    ),
  );
  add('follicular-vein', d(tube([[2.35, -7.95, -0.1], [3.4, -8.15, -0.3], [5.2, -8.45, -0.5], [7.0, -9.0, -0.8], [8.8, -9.3, -1.0]], (u) => 0.16 + 0.07 * u, { n: 70, m: 16 }), 'vein'));

  const cap: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const z = lerp(-0.32, 0.22, i / 6);
    const x = PAPILLA.c[0] + (i - 3) * 0.085;
    cap.push(tube([[x - 0.18, -7.95, z], [x - 0.14, -7.2, z], [x - 0.04, -6.78 + (i % 2) * 0.07, z], [x + 0.08, -7.2, z], [x + 0.2, -7.95, z]], 0.036, { n: 32, m: 10 }));
  }
  add('papilla-capillaries', d(merge(cap), 'capillary'));

  const peri: BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const pts: V3[] = Array.from({ length: 80 }, (_, i) => {
      const u = lerp(0.16, 0.88, i / 79);
      return around(u, R.ct(u) + 0.015, i * 0.45 + k * 1.57);
    });
    peri.push(tube(pts, 0.042, { n: 160, m: 10 }));
  }
  for (const phi of [0.6, 2.0, 3.5, 5.0]) {
    const pts: V3[] = Array.from({ length: 28 }, (_, i) => {
      const u = lerp(0.2, 0.9, i / 27);
      return around(u, R.ct(u) + 0.03, phi + 0.3 * Math.sin(i * 0.9));
    });
    peri.push(tube(pts, 0.048, { n: 64, m: 10 }));
  }
  add('perifollicular-plexus', d(merge(peri), 'capillary'));

  const plex: BufferGeometry[] = [];
  const zs = [-4.1, -2.9, -1.8, 1.9, 3.1, 4.2];
  for (const z of zs) {
    const pts: V3[] = Array.from({ length: 18 }, (_, i) => [lerp(-8.6, 8.6, i / 17), -1.8 + 0.1 * Math.sin(i * 1.3 + z), z + 0.18 * Math.sin(i * 0.9)] as V3);
    plex.push(tube(pts, 0.058, { n: 96, m: 10 }));
  }
  for (let x = -7.6; x < 8; x += 1.65) {
    if (Math.abs(x - 3.4) < 1.5) continue;
    const pts: V3[] = Array.from({ length: 12 }, (_, i) => [x + 0.15 * Math.sin(i), -1.85 + 0.08 * Math.sin(i * 1.7), lerp(-4.8, 4.8, i / 11)] as V3);
    plex.push(tube(pts, 0.052, { n: 64, m: 10 }));
  }
  for (let x = -7.8; x < 8.5; x += 1.05) {
    const z = lerp(-4.4, 4.4, r());
    if (Math.hypot(x - 3.2, z) < 1.9) continue;
    const yb = epiBottom(x, z);
    plex.push(tube([[x - 0.12, -1.8, z], [x - 0.1, -1.2, z], [x, yb + 0.12, z], [x + 0.1, -1.2, z], [x + 0.12, -1.8, z]], 0.032, { n: 22, m: 8 }));
  }
  add('subpapillary-plexus', d(merge(plex), 'capillary'));

  const nv: BufferGeometry[] = [
    tube([[-8.6, -6.7, -1.5], [-6.2, -6.0, -1.4], [-3.8, -5.2, -1.2], [-1.0, -4.6, -1.0], [1.4, -4.2, -0.9], [2.6, -3.9, -0.55]], (u) => 0.13 - 0.05 * u, { n: 80, m: 14 }),
    tube([[-3.8, -5.2, -1.2], [-3.2, -4.0, -1.5], [-3.5, -2.6, -1.4], [-3.4, -1.5, -1.3]], 0.045, { n: 36, m: 10 }),
  ];
  for (let i = 0; i < 14; i++) {
    const phi = (i / 14) * Math.PI * 2;
    const pts: V3[] = Array.from({ length: 7 }, (_, k) => {
      const u = lerp(0.27, 0.5, k / 6);
      return around(u, R.ct(u) + 0.045, phi);
    });
    nv.push(tube(pts, 0.032, { n: 28, m: 8 }));
  }
  for (const u of [0.32, 0.39, 0.46]) {
    const pts: V3[] = Array.from({ length: 32 }, (_, k) => around(u, R.ct(u) + 0.06, (k / 32) * Math.PI * 2));
    nv.push(sweep(curveOf(pts, true), () => 0.034, { n: 80, m: 10 }));
  }
  add('nerve-plexus', d(merge(nv), 'nerve'));

  // частокол ланцетовидных окончаний вокруг перешейка
  const leaf: BufferGeometry[] = [];
  for (let i = 0; i < 32; i++) {
    const u = lerp(0.3, 0.49, r());
    const p = around(u, R.ct(u) + 0.072, (i / 32) * Math.PI * 2 + r() * 0.15);
    const t = AX.getTangent(u);
    leaf.push(blob(p, [0.048, 0.29, 0.07], { seg: 12, seed: i, amp: 0.1, rot: [0, 0, Math.atan2(-t.x, t.y)] }));
  }
  add('lanceolate-endings', d(merge(leaf), 'ending'));

  const mk: BufferGeometry[] = [];
  const spots: [number, number][] = [[5.1, -0.2], [5.9, 0.3], [6.7, -0.8], [0.6, -0.6], [1.5, 0.4], [-1.2, -0.3], [-3.0, 0.9], [7.9, 0.6], [-5.6, -0.7]];
  spots.forEach(([x, z], i) => {
    const yb = epiBottom(x, z) - 0.07;
    mk.push(blob([x, yb, z], [0.2, 0.055, 0.2], { seg: 14, amp: 0.1, seed: i }));
    mk.push(tube([[x, yb - 0.05, z], [x + 0.03, yb - 0.55, z], [x, -1.7, z]], 0.02, { n: 12, m: 8 }));
  });
  add('merkel-discs', d(merge(mk), 'merkel'));
  return P;
}

/* -------------------------------------------------------------------------- */
/*                                 Цикл роста                                 */
/* -------------------------------------------------------------------------- */

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
  const sheath = (x: number, depth: number, rad: number, m: MatKey, cap = 0.9, wob = 0.18, corr = false): MeshDef =>
    d(
      clampTop(
        sweep(vert(x, depth, wob), (u) => rad * (1 + 0.55 * smooth(0.84, 0.98, u)), {
          n: 90,
          m: 32,
          cap0: 'flat',
          cap1: 'round',
          roundLen1: cap,
          wob: corr ? (u) => 1 + 0.06 * Math.sin(u * 40) : undefined,
        }),
      ),
      m,
    );
  const hair = (x: number, sx: number, depth: number, rad: number, m: MatKey = 'cuticleHair'): MeshDef[] => {
    const scaleW = (u: number, a: number) => 1 + 0.02 * Math.sin(u * 160 + a);
    const root = sweep(vert(x, depth, 0.18), () => rad, { n: 80, m: 24, cap0: null, cap1: 'round', roundLen1: rad, u0: 0, u1: 0.97, wob: scaleW });
    const top = sweep(curveOf(hairAbove(x, sx)), (u) => rad * (1 - 0.88 * smooth(0.86, 1, u)), { n: 90, m: 24, cap0: null, cap1: 'round', roundLen1: 0.08, wob: scaleW });
    return [d(root, m), d(top, m)];
  };

  // анаген: глубокий фолликул, активная луковица и сосочек
  const xa = -6.2;
  add(
    'anagen',
    sheath(xa, 7.2, 0.98, 'ctSheath', 1.5),
    sheath(xa, 7.1, 0.72, 'ors', 1.2),
    sheath(xa, 6.9, 0.42, 'huxley', 0.55),
    d(blob([xa, -7.35, 0], [1.05, 1.0, 1.05], { seg: 30, amp: 0.03 }), 'bulbCells'),
    d(blob([xa, -7.65, 0], [0.5, 0.78, 0.5], { seg: 24, amp: 0.03 }), 'papilla'),
    ...hair(xa, 1, 6.6, 0.26),
  );

  // катаген: гофрированная мембрана сморщивается, тянется эпителиальный тяж
  const xc = 0;
  add(
    'catagen',
    sheath(xc, 4.5, 0.78, 'ctSheath', 0.75, 0.1, true),
    sheath(xc, 4.4, 0.56, 'ors', 0.6, 0.1, true),
    d(blob([xc, -3.95, 0], [0.44, 0.55, 0.44], { seg: 20, amp: 0.06 }), 'club'),
    ...hair(xc, 1, 4.0, 0.25),
  );
  add(
    'epithelial-strand',
    d(sweep(curveOf([[xc, -4.4, 0], [xc - 0.15, -5.2, 0], [xc + 0.12, -5.9, 0], [xc, -6.5, 0]]), (u) => 0.2 - 0.12 * u, { n: 60, m: 16, cap0: 'round', cap1: 'round' }), 'strand'),
    d(blob([xc, -6.75, 0], [0.34, 0.42, 0.34], { seg: 20 }), 'papilla'),
  );

  // телоген: короткий мешок с колбовидным волосом и «метёлкой» кератиновых корешков
  const xt = 6.2;
  add('telogen', sheath(xt, 2.7, 0.7, 'ctSheath', 0.6, 0.06), sheath(xt, 2.6, 0.48, 'ors', 0.5, 0.06));
  add(
    'club-hair',
    ...hair(xt, 1, 2.0, 0.24, 'club'),
    d(blob([xt, -2.1, 0], [0.38, 0.5, 0.38], { seg: 22, amp: 0.06 }), 'club'),
    d(
      merge(
        Array.from({ length: 14 }, (_, i) => {
          const ang = (i / 14) * Math.PI * 2;
          return tube([[xt + Math.cos(ang) * 0.12, -2.35, Math.sin(ang) * 0.12], [xt + Math.cos(ang) * 0.32, -2.68, Math.sin(ang) * 0.32]], 0.022, { n: 8, m: 7 });
        }),
      ),
      'club',
    ),
  );
  add(
    'secondary-germ',
    d(merge([[0, 0, 0], [0.22, -0.12, 0.1], [-0.2, -0.2, -0.08], [0.1, -0.38, 0.12], [-0.12, -0.5, 0], [0.04, -0.25, -0.14]].map(([dx, dy, dz], i) => blob([xt + dx, -3.0 + dy, dz], [0.17, 0.15, 0.17], { seg: 12, amp: 0.1, seed: i }))), 'germ'),
  );
  add(
    'resting-papilla',
    d(blob([xt, -4.5, 0], [0.38, 0.5, 0.38], { seg: 22, amp: 0.04 }), 'papilla'),
    d(tube([[xt, -4.0, 0], [xt + 0.04, -3.6, 0], [xt, -3.4, 0]], 0.06, { n: 16, m: 10 }), 'strand'),
  );

  // выпавший волос с колбовидным корнем
  const shed: V3[] = [[7.9, 0.2, -0.7], [8.4, 0.17, -0.55], [9.1, 0.19, -0.7], [9.8, 0.16, -0.5], [10.35, 0.18, -0.6]];
  add(
    'shedding-hair',
    d(sweep(curveOf(shed), (u) => 0.13 * (1 - 0.8 * smooth(0.7, 1, u)), { n: 64, m: 20, cap0: 'round', cap1: 'round', roundLen1: 0.05 }), 'shed'),
    d(blob([7.85, 0.2, -0.7], [0.27, 0.2, 0.2], { seg: 18, amp: 0.05 }), 'shed'),
  );
  return { parts: P, context };
}
