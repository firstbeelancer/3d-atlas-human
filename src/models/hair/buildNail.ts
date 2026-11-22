import type { BufferGeometry } from 'three';
import { FING, fingerHW, nailPlate, plateBottom, plateHW, plateTop, plateX } from './fingertip';
import { blob, fbm, heightSlab, lerp, loft, merge, rng, smooth, tube, type V3 } from './geometry';
import { buildFingerSurface, colorPlate, proximalEdge, skinBottomY } from './nailSurface';
import type { MatKey, MeshDef, Parts } from './types';

const d = (g: BufferGeometry, m: MatKey, o: Partial<MeshDef> = {}): MeshDef => ({ g, m, ...o });

/** Кость: дистальная фаланга с выраженной талией диафиза и расширенным основанием. */
const boneTop = (x: number): number => lerp(2.2, 1.45, smooth(0, 20, x)) - 0.26 * Math.sin(Math.PI * smooth(3, 16, x));
const boneBottom = (x: number): number => lerp(-2.0, 0.35, smooth(0, 19, x)) + 0.35 * Math.sin(Math.PI * smooth(2, 16, x));
const boneHW = (x: number): number => 5.1 - 2.6 * smooth(0, 9.5, x) + 2.1 * smooth(14, 20.5, x);

/** Жировая подушечка: ладонная половина пальца под кожей и дермой. */
const pulpSection = (x: number) => {
  const top = 0.9 + 0.3 * smooth(8.0, 20.5, x);
  const bottom = skinBottomY(x, 0) + 0.75;
  // на кончике подушечка сужается вместе с кожей
  const s = Math.min(0.98, Math.max(0, x - FING.xc) / FING.tipLen);
  const hw = fingerHW(Math.min(x, FING.xc)) * Math.sqrt(1 - s * s) - 1.0;
  return { cy: (top + bottom) / 2, ry: Math.max(0.2, (top - bottom) / 2), hw: Math.max(0.3, hw), p: 2.2 };
};

/** Кончик пальца: ногтевой аппарат, кость с мыщелками и бугристостью, сухожилия, сосуды и нервы. */
export function buildNail(): Parts {
  const P: Parts = {};
  const add = (id: string, ...defs: MeshDef[]) => {
    (P[id] ??= []).push(...defs);
  };
  const r = rng(33);
  const { x0, xc } = FING;
  const { rootEnd, lunulaEnd, bodyEnd } = nailPlate;

  // --- ногтевая пластинка: анатомическое скругление контура plateHW(x) и высокое разрешение
  const slabAt = (xa: number, xb: number, top: (x: number, z: number) => number, bot: (x: number, z: number) => number, zh: number | ((x: number) => number) = plateHW, nz = 40) =>
    heightSlab({ x0: xa, x1: xb, zh, xAt: plateX, top, bot, nx: Math.max(6, Math.round((xb - xa) * 4.2)), nz });
  const midTop = (x: number, z: number) => plateTop(x, z) - 0.095;
  const midBot = (x: number, z: number) => plateBottom(x, z) + 0.075;

  const plate = slabAt(nailPlate.x0, nailPlate.x1, plateTop, (x, z) => plateTop(x, z) - 0.09, plateHW, 60);
  add('nail-dorsal', d(colorPlate(plate), 'nailDorsal', { noPick: true }));
  add('nail-root', d(slabAt(nailPlate.x0, rootEnd, midTop, midBot), 'nailRoot'));
  add('lunula', d(slabAt(rootEnd, lunulaEnd, midTop, midBot), 'lunula'));
  add('nail-body', d(slabAt(lunulaEnd, bodyEnd, midTop, midBot), 'nailBody'));
  add('free-edge', d(slabAt(bodyEnd, nailPlate.x1, midTop, midBot), 'nailFree'));
  add('nail-ventral', d(slabAt(nailPlate.x0, nailPlate.x1, (x, z) => plateBottom(x, z) + 0.08, plateBottom), 'nailVentral'));
  add('onychodermal-band', d(slabAt(nailPlate.bodyEnd - 0.75, nailPlate.bodyEnd + 0.05, (x, z) => midTop(x, z) + 0.012, (x, z) => midTop(x, z) - 0.02, (x) => plateHW(x) * 0.98, 28), 'nailBand'));

  const ridges: BufferGeometry[] = [];
  for (let across = -0.88; across <= 0.89; across += 0.11) {
    const pts: V3[] = Array.from({ length: 16 }, (_, i) => {
      const u = lerp(proximalEdge(across * 5) + 0.6, nailPlate.x1 - 0.6, i / 15);
      const z = across * plateHW(u);
      const x = plateX(u, across);
      return [x, plateTop(x, z) + 0.006, z];
    });
    ridges.push(tube(pts, (u) => 0.003 + 0.005 * Math.sin(Math.PI * u), { n: 58, m: 8 }));
  }
  add('nail-ridges', d(merge(ridges), 'nailRidge'));

  // Валик, боковые складки и отпечаток — части одной поверхности, а не накладные объёмы.
  const surface = buildFingerSurface();
  for (const [id, geometry] of Object.entries(surface)) add(id, d(geometry, 'fingerSkin', { open: true }));
  const lip = proximalEdge(0);
  const curvedRoot = (x: number, across: number) => x + proximalEdge(across * 4.9) - lip;
  add('eponychium', d(heightSlab({
    x0: lip - 0.56, x1: lip + 0.18, zh: 4.9, xAt: curvedRoot,
    top: (x, z) => plateTop(x, z) + 0.11 * (1 - smooth(proximalEdge(z) - 0.5, proximalEdge(z) + 0.25, x)),
    bot: (x, z) => plateTop(x, z) - 0.09, nx: 14, nz: 48,
  }), 'epony'));
  add('nail-cuticle', d(heightSlab({
    x0: lip + 0.03, x1: lip + 0.69, zh: (x) => 4.85 - 0.65 * smooth(lip + 0.03, lip + 0.69, x), xAt: curvedRoot,
    top: (x, z) => plateTop(x, z) + 0.043 + 0.017 * fbm(x * 4, 0, z * 2.5, 2),
    bot: (x, z) => plateTop(x, z) + 0.012, nx: 14, nz: 40,
  }), 'nailCuticle'));
  add(
    'hyponychium',
    d(
      heightSlab({
        x0: nailPlate.bodyEnd - 0.25,
        x1: nailPlate.bodyEnd + 1.4,
        zh: (x) => plateHW(x) - 0.9 - 1.6 * smooth(nailPlate.bodyEnd, nailPlate.bodyEnd + 1.4, x),
        xAt: (x, across) => x - 0.75 * across * across,
        top: (x, z) => plateBottom(x, z) - 0.05,
        bot: (x, z) => plateBottom(x, z) - 0.5 - 0.5 * smooth(nailPlate.bodyEnd, nailPlate.bodyEnd + 1.4, x),
        nx: 18,
        nz: 26,
      }),
      'hypo',
    ),
  );

  // --- матрикс и ногтевое ложе с гребнями Генле
  const bedTopY = (x: number, z: number) => plateBottom(Math.min(x, bodyEnd), z);
  const matrixVentral = slabAt(nailPlate.x0 - 0.08, lunulaEnd + 0.1, (x, z) => plateBottom(x, z) - 0.012, (x, z) => plateBottom(x, z) - lerp(0.42, 0.78, 1 - smooth(nailPlate.x0 + 0.7, lunulaEnd - 0.8, x)), (x) => plateHW(x) - 0.23, 40);
  const matrixDorsal = slabAt(nailPlate.x0 - 0.05, nailPlate.x0 + 1.7, (x, z) => plateTop(x, z) + 0.15, (x, z) => plateTop(x, z) + 0.015, 3.72, 24);
  add('germinal-matrix', d(merge([matrixVentral, matrixDorsal]), 'matrixNail'));
  add('sterile-matrix', d(slabAt(lunulaEnd + 0.1, bodyEnd, (x, z) => bedTopY(x, z) - 0.012, (x, z) => bedTopY(x, z) - 0.17, 4.9, 36), 'sterile'));
  add('bed-ridges', d(slabAt(lunulaEnd + 0.1, bodyEnd, (x, z) => bedTopY(x, z) - 0.15 + 0.07 * Math.cos(z * 4.8), (x, z) => bedTopY(x, z) - 0.33 + 0.05 * Math.cos(z * 4.8), 4.85, 56), 'bedRidge'));
  add('nail-bed-dermis', d(slabAt(nailPlate.x0 - 1.4, bodyEnd, (x, z) => bedTopY(x, z) - 0.32 - 0.25 * (1 - smooth(lunulaEnd - 1, lunulaEnd, x)), () => 1.55, 4.8, 28), 'bedDermis'));
  const mm: BufferGeometry[] = [];
  for (let i = 0; i < 20; i++) {
    const x = lerp(nailPlate.x0 - 0.8, lunulaEnd - 1.0, r());
    const z = lerp(-3.8, 3.8, r());
    mm.push(blob([x, plateBottom(x, z) - 0.5, z], [0.09, 0.08, 0.09], { seg: 10, seed: i, amp: 0.25 }));
  }
  add('matrix-melanocytes', d(merge(mm), 'melanocyte'));

  // --- кость и сочленение (с мыщелковой головкой средней фаланги и подковообразной бугристостью)
  add(
    'distal-phalanx',
    d(
      loft(
        -0.2,
        18.2,
        (x) => {
          const baseCondyle = Math.exp(-((x - 0.6) ** 2) / 1.4);
          return {
            cy: (boneTop(x) + boneBottom(x)) / 2,
            ry: (boneTop(x) - boneBottom(x)) / 2,
            hw: boneHW(x),
            p: 2.3,
            mod: (a) => 1 - 0.08 * baseCondyle * Math.cos(a) ** 2,
          };
        },
        { cap0: 'round', roundLen0: 0.9, cap1: 'round', roundLen1: 0.8, n: 84, m: 44 },
      ),
      'bone',
    ),
  );
  add(
    'phalanx-tuft',
    d(
      loft(
        17.0,
        21.0,
        (x) => {
          const top = lerp(boneTop(17), 1.15, smooth(17, 21.0, x));
          const bot = lerp(boneBottom(17), 0.1, smooth(17, 21.0, x));
          return {
            cy: (top + bot) / 2,
            ry: (top - bot) / 2,
            hw: lerp(4.2, 5.0, smooth(17, 19.6, x)) * (1 - 0.22 * smooth(19.9, 21.0, x)),
            p: 2.1,
            mod: (a) => 1 + 0.04 * (fbm(x * 1.4, Math.cos(a) * 2, Math.sin(a) * 2, 2) - 0.5),
          };
        },
        { cap0: 'round', roundLen0: 0.6, cap1: 'round', roundLen1: 0.8, n: 36, m: 42 },
      ),
      'bone',
    ),
  );
  const headSec = (grow: number) => (x: number) => {
    const condyle = smooth(-8, -3.6, x);
    return {
      cy: 0,
      ry: 2.15 + 0.45 * smooth(-9, -3.6, x) + grow,
      hw: 3.7 + 1.25 * smooth(-9, -3.6, x) + grow,
      p: 2.2,
      mod: (a: number) => 1 - 0.11 * condyle * Math.cos(a) ** 2,
    };
  };
  add('middle-phalanx-head', d(loft(-13.6, -3.5, headSec(0), { cap0: 'flat', cap1: 'round', roundLen1: 1.6, n: 60, m: 44 }), 'bone'));
  add(
    'joint-cartilage',
    d(loft(-5.5, -3.5, headSec(0.17), { cap0: 'round', roundLen0: 0.01, cap1: 'round', roundLen1: 1.7, n: 24, m: 42 }), 'cartilage'),
    d(loft(-0.15, 0.7, (x) => ({ cy: (boneTop(x) + boneBottom(x)) / 2, ry: (boneTop(x) - boneBottom(x)) / 2 + 0.17, hw: boneHW(x) + 0.17, p: 2.3 }), { cap0: 'round', roundLen0: 0.95, cap1: 'round', roundLen1: 0.05, n: 10, m: 42 }), 'cartilage'),
  );
  add(
    'collateral-ligament',
    d(
      merge(
        [1, -1].map((s) =>
          tube([[-5.2, 0.5, s * 4.95], [-2.0, 0.4, s * 5.2], [1.6, 0.5, s * 5.0]], (u) => 0.42 + 0.12 * Math.sin(u * Math.PI), { n: 48, m: 18, squash: 0.65 }),
        ),
      ),
      'ligament',
    ),
  );
  add(
    'extensor-tendon',
    d(loft(-13.5, 0.9, (x) => ({ cy: lerp(3.0, 2.58, smooth(-5, 0.8, x)), ry: 0.24, hw: lerp(2.6, 2.0, smooth(-6, 0.8, x)), p: 3 }), { cap0: 'flat', cap1: 'round', roundLen1: 0.6, n: 48, m: 24 }), 'ligament'),
  );
  add(
    'flexor-tendon',
    d(loft(-13.5, 3.8, (x) => ({ cy: -2.3, ry: 0.42, hw: lerp(2.3, 2.9, smooth(-2, 3.8, x)), p: 3 }), { cap0: 'flat', cap1: 'round', roundLen1: 0.8, n: 48, m: 24 }), 'ligament'),
  );

  // --- мягкие ткани подушечки, фиброзные перегородки и папиллярные узоры (петля/завиток)
  add('finger-pulp', d(loft(x0 + 0.06, xc + 3.4, pulpSection, { cap0: 'flat', cap1: 'round', roundLen1: 1.8, n: 118, m: 52 }), 'pulp'));

  const septa: BufferGeometry[] = [];
  for (let x = -10; x <= 20.1; x += 2.3) {
    const yb = Math.min(boneBottom(Math.max(x, 0)) - 0.05, -1.0);
    const hwx = fingerHW(x) - 1.6;
    septa.push(heightSlab({
      x0: x - 0.09, x1: x + 0.09, zh: hwx,
      top: () => yb, bot: (x, z) => skinBottomY(x, z) + 0.65, nx: 2, nz: 18,
    }));
  }
  add('fat-septa', d(merge(septa), 'septa'));

  const coils: BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const x = 7.2 + i * 1.3;
    const z = lerp(-3.2, 2.2, r());
    const yS = skinBottomY(x, z);
    const yC = yS + 0.95;
    const pts: V3[] = Array.from({ length: 60 }, (_, k) => {
      const t = (k / 59) * Math.PI * 7;
      return [x + Math.cos(t) * 0.3, yC + (k / 59) * 0.55 + Math.sin(t * 0.5) * 0.04, z + Math.sin(t) * 0.3];
    });
    coils.push(tube(pts, 0.065, { n: 110, m: 10 }));
    const duct: V3[] = Array.from({ length: 10 }, (_, k) => {
      const t = k / 9;
      return [x + Math.sin(t * 14) * 0.06, lerp(yC, yS + 0.08, t), z + Math.cos(t * 14) * 0.06];
    });
    coils.push(tube(duct, 0.04, { n: 36, m: 8 }));
  }
  add('eccrine-glands', d(merge(coils), 'eccrine'));

  const pac = (c: V3, s: number, seed: number): MeshDef[] => {
    const out: MeshDef[] = [];
    for (let k = 0; k < 5; k++) {
      const scale = 1 - k * 0.15;
      out.push(d(blob(c, [0.64 * s * scale, 0.38 * s * scale, 0.38 * s * scale], { seg: 24, seed, amp: 0.02, rot: [0, 0, 0.35] }), 'pacShell'));
    }
    out.push(d(blob(c, [0.46 * s, 0.09 * s, 0.09 * s], { seg: 14, rot: [0, 0, 0.35] }), 'pacCore'));
    return out;
  };
  add('pacinian', ...pac([8.0, -2.9, -1.7], 1.1, 1), ...pac([13.5, -3.05, -2.5], 0.95, 2), ...pac([18.0, -2.7, -1.2], 0.85, 3));

  const mei: BufferGeometry[] = [];
  for (let i = 0; i < 30; i++) {
    const x = lerp(9.5, 20.2, r());
    const z = lerp(-3.6, 3.2, r());
    mei.push(blob([x, skinBottomY(x, z) + 0.42, z], [0.075, 0.18, 0.075], { seg: 12, seed: i, amp: 0.14 }));
  }
  add('meissner', d(merge(mei), 'meissner'));

  // --- сосуды и нервы (высокая детализация трубок)
  const arteries = [1, -1].map((s) => {
    const pts: V3[] = [[-13.8, -1.55, s * 3.5], [-6, -1.6, s * 3.5], [2, -1.5, s * 3.55], [10, -1.2, s * 3.5], [16.5, -1.05, s * 3.2], [19.6, -0.7, s * 2.5], [21.4, -0.3, s * 1.2]];
    return tube(pts, (u) => 0.44 - 0.17 * u, { n: 130, m: 16 });
  });
  const arch = tube([[21.4, -0.3, 1.2], [21.9, -0.2, 0.4], [21.9, -0.2, -0.4], [21.4, -0.3, -1.2]], 0.22, { n: 36, m: 14 });
  add('digital-artery', d(merge([...arteries, arch]), 'artery'));
  add(
    'nail-arcade',
    d(
      merge([
        tube([[5.5, -1.5, 3.5], [5.6, 0.5, 4.9], [5.9, 2.2, 4.1], [6.2, 2.6, 2.0], [6.3, 2.65, 0], [6.2, 2.6, -2.0], [5.9, 2.2, -4.1], [5.6, 0.5, -4.9], [5.5, -1.5, -3.5]], 0.23, { n: 130, m: 14 }),
        tube([[18.0, -0.7, 3.7], [18.0, 1.2, 4.6], [18.2, 2.3, 2.4], [18.3, 2.4, 0], [18.2, 2.3, -2.4], [18.0, 1.2, -4.6], [18.0, -0.7, -3.7]], 0.15, { n: 110, m: 12 }),
        tube([[5.9, 2.2, 4.1], [9, 2.2, 3.9], [12, 2.3, 3.7], [15, 2.3, 3.6], [18.0, 1.2, 4.6]], 0.09, { n: 56, m: 10 }),
        tube([[5.9, 2.2, -4.1], [9, 2.2, -3.9], [12, 2.3, -3.7], [15, 2.3, -3.6], [18.0, 1.2, -4.6]], 0.09, { n: 56, m: 10 }),
      ]),
      'artery',
    ),
  );
  const veins = [1, -1].map((s) => tube([[-13.8, 3.2, s * 2.1], [-8, 3.3, s * 2.3], [-3, 3.35, s * 1.9], [0.4, 3.1, s * 1.3]], (u) => 0.26 - 0.06 * u, { n: 70, m: 14 }));
  add('digital-vein', d(merge(veins), 'vein'));
  const nerves = [1, -1].map((s) => {
    const trunk = tube([[-13.8, -2.5, s * 3.8], [-6, -2.55, s * 3.8], [3, -2.5, s * 3.8], [10, -2.35, s * 3.6], [14, -2.3, s * 3.3]], 0.36, { n: 90, m: 14 });
    const fan = [0, 1, 2, 3, 4, 5].map((k) => tube([[14, -2.3, s * 3.3], [16.5, -2.4 + k * 0.08, s * (3.0 - k * 0.8)], [19.5, -2.6 + k * 0.1, s * (2.6 - k * 0.9)]], 0.075, { n: 36, m: 10 }));
    return merge([trunk, ...fan]);
  });
  add('digital-nerve', d(merge(nerves), 'nerve'));

  const caps: BufferGeometry[] = [];
  for (let x = lunulaEnd + 0.4; x < nailPlate.bodyEnd - 2.0; x += 0.8) {
    for (let z = -4.1; z <= 4.11; z += 0.85) {
      const y = bedTopY(x, z) - 0.17;
      caps.push(tube([[x, y, z], [x + 0.4, y + 0.05, z + 0.12], [x + 0.8, y, z]], 0.028, { n: 10, m: 8 }));
    }
  }
  add('nail-capillaries', d(merge(caps), 'capillary'));

  const glom: BufferGeometry[] = [];
  const gp: [number, number][] = [[15.6, -3], [16.8, 1.5], [18.0, -1.2], [19.2, 3.0], [20.2, -2.4], [21.2, 0.6], [21.8, 2.2]];
  gp.forEach(([x, z], i) => {
    const y = bedTopY(x, z) - 1.0;
    glom.push(blob([x, y, z], [0.34, 0.3, 0.34], { seg: 16, amp: 0.12, seed: i }));
    glom.push(tube([[x, y, z], [x - 0.2, y - 0.4, z], [x + 0.1, y - 0.9, z * 0.9], [x + 0.2, y - 1.4, z * 0.8]], 0.06, { n: 12, m: 8 }));
  });
  add('glomus', d(merge(glom), 'glomus'));
  return P;
}
