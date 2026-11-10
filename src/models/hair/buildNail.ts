import type { BufferGeometry } from 'three';
import { FING, boneBottom, boneHW, boneTop, fingerBottom, fingerHW, fingerTop, nailPlate, plateBottom, plateTop } from './anatomy';
import { blob, heightSlab, lerp, loft, merge, rng, slab, smooth, tube, type V3 } from './geometry';
import type { MatKey, MeshDef, Parts } from './types';

const d = (g: BufferGeometry, m: MatKey, o: Partial<MeshDef> = {}): MeshDef => ({ g, m, ...o });

const P_EXP = 2.4;
/** Поверхность кожи пальца: верх и низ суперэллипса в сечении. */
export const skinTopY = (x: number, z: number): number => {
  const top = fingerTop(x);
  const bot = fingerBottom(x);
  const k = Math.max(0, 1 - (Math.abs(z) / fingerHW(x)) ** P_EXP) ** (1 / P_EXP);
  return (top + bot) / 2 + ((top - bot) / 2) * k;
};
export const skinBottomY = (x: number, z: number): number => {
  const top = fingerTop(x);
  const bot = fingerBottom(x);
  const k = Math.max(0, 1 - (Math.abs(z) / fingerHW(x)) ** P_EXP) ** (1 / P_EXP);
  return (top + bot) / 2 - ((top - bot) / 2) * k;
};

const fingerSec = (inset: number, from = 0) => (x: number) => {
  const top = fingerTop(x) - inset * 1.1;
  const bot = fingerBottom(x) + inset;
  return { cy: (top + bot) / 2 + from, ry: (top - bot) / 2, hw: fingerHW(x) - inset };
};

/** Кончик пальца: ногтевой аппарат, кость, сухожилия, сосуды и нервы (миллиметры; ось x — вдоль пальца, y — спинка вверх). */
export function buildNail(): Parts {
  const P: Parts = {};
  const add = (id: string, ...defs: MeshDef[]) => {
    (P[id] ??= []).push(...defs);
  };
  const r = rng(33);
  const { x0, x1, cap } = FING;
  const { hw, rootEnd, lunulaEnd, bodyEnd } = nailPlate;

  // --- ногтевая пластинка: тонкий прозрачный верхний слой, толстая середина из четырёх участков, тонкий нижний слой
  const slabAt = (xa: number, xb: number, top: (x: number, z: number) => number, bot: (x: number, z: number) => number, zh = hw, nz = 28) =>
    heightSlab({ x0: xa, x1: xb, zh, top, bot, nx: Math.max(3, Math.round((xb - xa) * 3.5)), nz });
  const midTop = (x: number, z: number) => plateTop(x, z) - 0.095;
  const midBot = (x: number, z: number) => plateBottom(x, z) + 0.075;
  add('nail-dorsal', d(slabAt(nailPlate.x0, nailPlate.x1, plateTop, (x, z) => plateTop(x, z) - 0.09, hw, 36), 'nailDorsal'));
  add('nail-root', d(slabAt(nailPlate.x0, rootEnd, midTop, midBot), 'nailRoot'));
  add('lunula', d(slabAt(rootEnd, lunulaEnd, midTop, midBot), 'lunula'));
  add('nail-body', d(slabAt(lunulaEnd, bodyEnd, midTop, midBot), 'nailBody'));
  add('free-edge', d(slabAt(bodyEnd, nailPlate.x1, midTop, midBot), 'nailFree'));
  add('nail-ventral', d(slabAt(nailPlate.x0, nailPlate.x1, (x, z) => plateBottom(x, z) + 0.08, plateBottom), 'nailVentral'));
  add('onychodermal-band', d(slabAt(20.3, 21.8, (x, z) => midTop(x, z) + 0.012, (x, z) => midTop(x, z) - 0.02, hw * 0.98, 20), 'nailBand'));
  const ridges: BufferGeometry[] = [];
  for (let z = -4.2; z <= 4.21; z += 0.6) {
    const pts: V3[] = Array.from({ length: 12 }, (_, i) => {
      const x = lerp(6.6, 24.5, i / 11);
      return [x, plateTop(x, z) + 0.012, z];
    });
    ridges.push(tube(pts, 0.026, { n: 40, m: 5 }));
  }
  add('nail-ridges', d(merge(ridges), 'nailRidge'));

  // --- кожа и валики
  add('finger-skin', d(loft(x0, x1, fingerSec(0), { cap0: 'flat', cap1: 'round', roundLen1: cap, n: 100, m: 44 }), 'fingerSkin'));
  const skinAtFold = (x: number, z: number) => skinTopY(Math.min(x, 5.0), z);
  const foldTop = (x: number, z: number) => lerp(skinAtFold(x, z) + 0.03, plateTop(x, z) + 0.17, smooth(5.0, 6.5, x));
  const foldBot = (x: number, z: number) => lerp(skinAtFold(x, z) - 1.0, plateTop(x, z) + 0.04, smooth(4.6, 6.0, x));
  add('proximal-fold', d(heightSlab({ x0: 0.6, x1: 6.5, zh: 5.7, top: foldTop, bot: (x, z) => Math.min(foldBot(x, z), foldTop(x, z) - 0.06), nx: 34, nz: 28 }), 'fold'));
  add('eponychium', d(slabAt(5.7, 7.3, (x, z) => plateTop(x, z) + 0.075 * (1 - smooth(6.0, 7.3, x)) + 0.012, (x, z) => plateTop(x, z) + 0.012, 4.7, 24), 'epony'));
  add('nail-cuticle', d(slabAt(6.9, 8.6, (x, z) => plateTop(x, z) + 0.045, (x, z) => plateTop(x, z) + 0.022, 4.5, 24), 'nailCuticle'));
  const lat = (s: number) =>
    loft(
      1.2,
      21.8,
      (x) => {
        const top = 4.05 - 0.7 * smooth(17, 22, x);
        const bot = 1.3;
        return { cy: (top + bot) / 2, ry: (top - bot) / 2, hw: 0.95, cz: s * 5.8, p: 2.6 };
      },
      { cap0: 'round', cap1: 'round', roundLen0: 0.9, roundLen1: 0.9, n: 50, m: 20 },
    );
  add('lateral-folds', d(merge([lat(1), lat(-1)]), 'latFold'));
  add(
    'hyponychium',
    d(
      heightSlab({
        x0: 21.0,
        x1: 23.6,
        zh: 4.7,
        top: (x, z) => lerp(plateBottom(Math.min(x, 22), z) - 0.03, skinTopY(x, z) + 0.05, smooth(22.0, 23.6, x)),
        bot: (x, z) => skinTopY(x, z) - 0.5,
        nx: 14,
        nz: 22,
      }),
      'hypo',
    ),
  );

  // --- матрикс и ложе
  const bedTopY = (x: number, z: number) => plateBottom(Math.min(x, 22), z);
  const matrixVentral = slabAt(0.9, lunulaEnd + 0.1, (x, z) => plateBottom(x, z) - 0.012, (x, z) => plateBottom(x, z) - 0.55, 4.7, 26);
  const matrixDorsal = slabAt(1.4, 5.2, (x, z) => plateTop(x, z) + 0.2, (x, z) => plateTop(x, z) + 0.012, 4.6, 20);
  add('germinal-matrix', d(merge([matrixVentral, matrixDorsal]), 'matrixNail'));
  add('sterile-matrix', d(slabAt(lunulaEnd + 0.1, bodyEnd, (x, z) => bedTopY(x, z) - 0.012, (x, z) => bedTopY(x, z) - 0.17, 4.9, 30), 'sterile'));
  add('bed-ridges', d(slabAt(lunulaEnd + 0.1, bodyEnd, (x, z) => bedTopY(x, z) - 0.15 + 0.07 * Math.cos(z * 4.4), (x, z) => bedTopY(x, z) - 0.33 + 0.05 * Math.cos(z * 4.4), 4.85, 44), 'bedRidge'));
  add('nail-bed-dermis', d(slabAt(1.0, bodyEnd, (x, z) => bedTopY(x, z) - 0.32 - 0.25 * (1 - smooth(8.8, 9.8, x)), () => 1.55, 4.8, 24), 'bedDermis'));
  const mm: BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const x = lerp(1.6, 8.6, r());
    const z = lerp(-3.8, 3.8, r());
    mm.push(blob([x, plateBottom(x, z) - 0.5, z], [0.09, 0.08, 0.09], { seg: 8, seed: i, amp: 0.25 }));
  }
  add('matrix-melanocytes', d(merge(mm), 'melanocyte'));

  // --- кость и сочленение
  add('distal-phalanx', d(loft(-0.2, 18.2, (x) => ({ cy: (boneTop(x) + boneBottom(x)) / 2, ry: (boneTop(x) - boneBottom(x)) / 2, hw: boneHW(x), p: 2.3 }), { cap0: 'round', roundLen0: 0.9, cap1: 'round', roundLen1: 0.8, n: 70, m: 36 }), 'bone'));
  add(
    'phalanx-tuft',
    d(
      loft(
        17.0,
        21.6,
        (x) => {
          const top = lerp(boneTop(17), 1.15, smooth(17, 21.6, x));
          const bot = lerp(boneBottom(17), 0.1, smooth(17, 21.6, x));
          return { cy: (top + bot) / 2, ry: (top - bot) / 2, hw: lerp(4.2, 4.9, smooth(17, 20, x)) * (1 - 0.2 * smooth(20.5, 21.6, x)), p: 2.1 };
        },
        { cap0: 'round', roundLen0: 0.6, cap1: 'round', roundLen1: 0.8, n: 30, m: 36 },
      ),
      'bone',
    ),
  );
  const headSec = (grow: number) => (x: number) => ({ cy: 0, ry: 2.15 + 0.45 * smooth(-9, -3.6, x) + grow, hw: 3.7 + 1.2 * smooth(-9, -3.6, x) + grow, p: 2.2 });
  add('middle-phalanx-head', d(loft(-13.6, -3.5, headSec(0), { cap0: 'flat', cap1: 'round', roundLen1: 1.6, n: 50, m: 36 }), 'bone'));
  add(
    'joint-cartilage',
    d(loft(-5.5, -3.5, headSec(0.17), { cap0: 'round', roundLen0: 0.01, cap1: 'round', roundLen1: 1.7, n: 20, m: 36 }), 'cartilage'),
    d(loft(-0.15, 0.7, (x) => ({ cy: (boneTop(x) + boneBottom(x)) / 2, ry: (boneTop(x) - boneBottom(x)) / 2 + 0.17, hw: boneHW(x) + 0.17, p: 2.3 }), { cap0: 'round', roundLen0: 0.95, cap1: 'round', roundLen1: 0.05, n: 8, m: 36 }), 'cartilage'),
  );
  add(
    'collateral-ligament',
    d(
      merge(
        [1, -1].map((s) => tube([[-5.2, 0.5, s * 4.95], [-2.0, 0.4, s * 5.2], [1.6, 0.5, s * 5.0]], (u) => 0.42 + 0.12 * Math.sin(u * Math.PI), { n: 40, m: 14, squash: 0.65 })),
      ),
      'ligament',
    ),
  );
  add(
    'extensor-tendon',
    d(loft(-13.5, 0.9, (x) => ({ cy: lerp(3.0, 2.58, smooth(-5, 0.8, x)), ry: 0.24, hw: lerp(2.6, 2.0, smooth(-6, 0.8, x)), p: 3 }), { cap0: 'flat', cap1: 'round', roundLen1: 0.6, n: 40, m: 20 }), 'ligament'),
  );
  add(
    'flexor-tendon',
    d(loft(-13.5, 3.8, (x) => ({ cy: -2.3, ry: 0.42, hw: lerp(2.3, 2.9, smooth(-2, 3.8, x)), p: 3 }), { cap0: 'flat', cap1: 'round', roundLen1: 0.8, n: 40, m: 20 }), 'ligament'),
  );

  // --- мягкие ткани подушечки
  add('finger-pulp', d(loft(x0 - 0.02, x1 + 0.1, fingerSec(0.82), { cap0: 'flat', cap1: 'round', roundLen1: cap - 0.5, n: 90, m: 40 }), 'pulp'));
  const septa: BufferGeometry[] = [];
  for (let x = -10; x <= 20.1; x += 2.6) {
    const yb = Math.min(boneBottom(Math.max(x, 0)) - 0.05, -1.0);
    const y0 = skinBottomY(x, 0) + 0.7;
    const hwx = fingerHW(x) - 1.0;
    septa.push(slab(x - 0.05, x + 0.05, y0, Math.max(y0 + 0.4, yb), -hwx * 0.85, hwx * 0.85));
  }
  add('fat-septa', d(merge(septa), 'septa'));

  // отпечаток: рельеф ложится на подушечку, гребни — настоящая геометрия
  const fpC: [number, number] = [16.8, 0.3];
  const ridgeH = (x: number, z: number) => {
    const dx = (x - fpC[0]) / 6.4;
    const dz = (z - fpC[1]) / 4.3;
    const rho = Math.hypot(dx, dz);
    const th = Math.atan2(dz, dx);
    const phase = 13 * rho + 0.5 * Math.sin(2 * th) * rho + 0.35 * Math.sin(3 * th + 1) * rho * rho;
    const w = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
    const fade = smooth(1.0, 0.82, rho);
    return { h: w ** 1.4 * fade, fade };
  };
  add(
    'fingerprint',
    d(
      heightSlab({
        x0: 10.4,
        x1: 22.4,
        zh: 4.3,
        top: (x, z) => skinBottomY(x, z) + 0.2,
        bot: (x, z) => {
          const { h, fade } = ridgeH(x, z);
          return skinBottomY(x, z) - 0.012 * fade - 0.065 * h;
        },
        nx: 170,
        nz: 120,
      }),
      'fingerprint',
    ),
  );

  const coils: BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const x = 8.2 + i * 1.45;
    const z = lerp(-3.2, 2.2, r());
    const yS = skinBottomY(x, z);
    const yC = yS + 0.95;
    const pts: V3[] = Array.from({ length: 50 }, (_, k) => {
      const t = (k / 49) * Math.PI * 7;
      return [x + Math.cos(t) * 0.3, yC + (k / 49) * 0.55 + Math.sin(t * 0.5) * 0.04, z + Math.sin(t) * 0.3];
    });
    coils.push(tube(pts, 0.065, { n: 100, m: 6 }));
    const duct: V3[] = Array.from({ length: 8 }, (_, k) => {
      const t = k / 7;
      return [x + Math.sin(t * 14) * 0.06, lerp(yC, yS - 0.01, t), z + Math.cos(t * 14) * 0.06];
    });
    coils.push(tube(duct, 0.04, { n: 30, m: 5 }));
  }
  add('eccrine-glands', d(merge(coils), 'eccrine'));

  const pac = (c: V3, s: number, seed: number): MeshDef[] => {
    const out: MeshDef[] = [];
    for (let k = 0; k < 4; k++) out.push(d(blob(c, [0.62 * s * (1 - k * 0.17), 0.36 * s * (1 - k * 0.17), 0.36 * s * (1 - k * 0.17)], { seg: 20, seed, amp: 0.02, rot: [0, 0, 0.35] }), 'pacShell'));
    out.push(d(blob(c, [0.45 * s, 0.1 * s, 0.1 * s], { seg: 10, rot: [0, 0, 0.35] }), 'pacCore'));
    return out;
  };
  add('pacinian', ...pac([8.0, -2.9, -1.7], 1.1, 1), ...pac([13.5, -3.05, -2.5], 0.95, 2), ...pac([18.0, -2.7, -1.2], 0.85, 3));
  const mei: BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const x = lerp(10, 22, r());
    const z = lerp(-3.6, 3.2, r());
    mei.push(blob([x, skinBottomY(x, z) + 0.42, z], [0.07, 0.17, 0.07], { seg: 8, seed: i, amp: 0.12 }));
  }
  add('meissner', d(merge(mei), 'meissner'));

  // --- сосуды и нервы
  const arteries = [1, -1].map((s) => {
    const pts: V3[] = [[-13.8, -1.55, s * 3.5], [-6, -1.6, s * 3.5], [2, -1.5, s * 3.55], [10, -1.2, s * 3.5], [16.5, -1.05, s * 3.2], [19.6, -0.7, s * 2.5], [21.4, -0.3, s * 1.2]];
    return tube(pts, (u) => 0.44 - 0.17 * u, { n: 120 });
  });
  const arch = tube([[21.4, -0.3, 1.2], [21.9, -0.2, 0.4], [21.9, -0.2, -0.4], [21.4, -0.3, -1.2]], 0.22, { n: 30 });
  add('digital-artery', d(merge([...arteries, arch]), 'artery'));
  add(
    'nail-arcade',
    d(
      merge([
        tube([[2.5, -1.5, 3.5], [2.6, 0.5, 4.7], [2.9, 2.3, 3.9], [3.2, 2.75, 2.0], [3.3, 2.8, 0], [3.2, 2.75, -2.0], [2.9, 2.3, -3.9], [2.6, 0.5, -4.7], [2.5, -1.5, -3.5]], 0.23, { n: 120 }),
        tube([[17.0, -0.7, 3.7], [17.0, 1.2, 4.5], [17.2, 2.2, 2.4], [17.3, 2.3, 0], [17.2, 2.2, -2.4], [17.0, 1.2, -4.5], [17.0, -0.7, -3.7]], 0.15, { n: 100 }),
        tube([[2.9, 2.3, 3.9], [6, 2.2, 3.8], [10, 2.2, 3.6], [14, 2.2, 3.5], [17.0, 1.2, 4.5]], 0.09, { n: 50 }),
        tube([[2.9, 2.3, -3.9], [6, 2.2, -3.8], [10, 2.2, -3.6], [14, 2.2, -3.5], [17.0, 1.2, -4.5]], 0.09, { n: 50 }),
      ]),
      'artery',
    ),
  );
  const veins = [1, -1].map((s) => tube([[-13.8, 3.45, s * 2.1], [-8, 3.55, s * 2.3], [-3, 3.5, s * 1.9], [0.4, 3.35, s * 1.3]], (u) => 0.26 - 0.06 * u, { n: 60 }));
  add('digital-vein', d(merge(veins), 'vein'));
  const nerves = [1, -1].map((s) => {
    const trunk = tube([[-13.8, -2.5, s * 3.8], [-6, -2.55, s * 3.8], [3, -2.5, s * 3.8], [10, -2.35, s * 3.6], [14, -2.3, s * 3.3]], 0.36, { n: 80 });
    const fan = [0, 1, 2, 3, 4, 5].map((k) => tube([[14, -2.3, s * 3.3], [16.5, -2.4 + k * 0.08, s * (3.0 - k * 0.8)], [19.5, -2.6 + k * 0.1, s * (2.6 - k * 0.9)]], 0.075, { n: 30, m: 6 }));
    return merge([trunk, ...fan]);
  });
  add('digital-nerve', d(merge(nerves), 'nerve'));
  const caps: BufferGeometry[] = [];
  for (let x = 10.0; x < 21.4; x += 0.85) {
    for (let z = -4.1; z <= 4.11; z += 0.9) {
      const y = bedTopY(x, z) - 0.17;
      caps.push(tube([[x, y, z], [x + 0.4, y + 0.05, z + 0.12], [x + 0.8, y, z]], 0.028, { n: 8, m: 5 }));
    }
  }
  add('nail-capillaries', d(merge(caps), 'capillary'));
  const glom: BufferGeometry[] = [];
  const gp: [number, number][] = [[15.2, -3], [16.4, 1.5], [17.6, -1.2], [18.8, 3.0], [19.6, -2.4], [20.6, 0.6], [21.0, 2.4]];
  gp.forEach(([x, z], i) => {
    const y = bedTopY(x, z) - 1.0;
    glom.push(blob([x, y, z], [0.34, 0.3, 0.34], { seg: 14, amp: 0.1, seed: i }));
    glom.push(tube([[x, y - 0.2, z], [x + 0.1, y - 0.9, z * 0.9], [x + 0.2, y - 1.4, z * 0.8]], 0.06, { n: 10, m: 6 }));
  });
  add('glomus', d(merge(glom), 'glomus'));
  return P;
}

