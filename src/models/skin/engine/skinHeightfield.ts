import * as THREE from 'three';
import { createSeededRandom, fbm2D, voronoi2D } from './mathNoise';

export const BLOCK_HALF_W = 4.8; // Total width = 9.6 units
export const BLOCK_HALF_D = 4.8; // Total depth = 9.6 units

export interface TerminalFollicleSpec {
  id: number;
  phase: 'anagen' | 'catagen' | 'telogen';
  ostiumX: number;
  ostiumZ: number;
  bulbX: number;
  bulbY: number;
  bulbZ: number;
  tipX: number;
  tipY: number;
  tipZ: number;
  shaftRadius: number;
  sheathRadius: number;
  sebaceousAngle: number; // Direction in XZ plane where sebaceous gland & arrector pili sit (obtuse side of slant)
}

export interface VellusFollicleSpec {
  ostiumX: number;
  ostiumZ: number;
  slantX: number;
  slantZ: number;
  depth: number;
  heightAbove: number;
}

export interface SweatGlandSpec {
  id: number;
  poreX: number;
  poreZ: number;
  coilX: number;
  coilY: number;
  coilZ: number;
  coilRadius: number;
}

export interface DermalPapillaSpec {
  x: number;
  z: number;
  amplitude: number;
  radius: number;
  hasMeissner: boolean;
  hasCapillary: boolean;
}

export interface SkinStrataHeights {
  ySurface: number;
  yCorneumBottom: number;
  yGranulosumBottom: number;
  ySpinosumBottom: number;
  yBasaleBottom: number; // Dermal-Epidermal Junction (DEJ)
  yPapillaryBottom: number;
  yReticularBottom: number;
  yHypodermisBottom: number;
}

// 3 Terminal follicles in Anagen, Catagen, and Telogen phases
export const TERMINAL_FOLLICLES: TerminalFollicleSpec[] = [
  {
    id: 0,
    phase: 'anagen',
    ostiumX: -0.52,
    ostiumZ: 0.05,
    bulbX: -1.28,
    bulbY: -3.38,
    bulbZ: -0.75,
    tipX: 0.35,
    tipY: 5.35,
    tipZ: 0.88,
    shaftRadius: 0.068,
    sheathRadius: 0.195,
    sebaceousAngle: Math.atan2(0.83, 0.76) // Obtuse angle side (towards +X, +Z)
  },
  {
    id: 1,
    phase: 'catagen',
    ostiumX: -2.42,
    ostiumZ: -1.75,
    bulbX: -3.05,
    bulbY: -2.15,
    bulbZ: -2.38,
    tipX: -1.72,
    tipY: 4.95,
    tipZ: -1.05,
    shaftRadius: 0.058,
    sheathRadius: 0.168,
    sebaceousAngle: Math.atan2(0.63, 0.63)
  },
  {
    id: 2,
    phase: 'telogen',
    ostiumX: 1.98,
    ostiumZ: -1.62,
    bulbX: 1.48,
    bulbY: -1.28,
    bulbZ: -2.12,
    tipX: 2.58,
    tipY: 4.65,
    tipZ: -1.02,
    shaftRadius: 0.054,
    sheathRadius: 0.155,
    sebaceousAngle: Math.atan2(0.5, 0.5)
  },
  {
    id: 3,
    phase: 'anagen',
    ostiumX: 0.92,
    ostiumZ: 3.65,
    bulbX: 0.25,
    bulbY: -3.18,
    bulbZ: 3.05,
    tipX: 1.68,
    tipY: 5.18,
    tipZ: 4.35,
    shaftRadius: 0.064,
    sheathRadius: 0.185,
    sebaceousAngle: Math.atan2(0.6, 0.68)
  }
];

// 4 Complete Eccrine Sweat Glands
export const SWEAT_GLANDS: SweatGlandSpec[] = [
  {
    id: 0,
    poreX: 2.55,
    poreZ: 2.15,
    coilX: 2.58,
    coilY: -2.55,
    coilZ: 2.18,
    coilRadius: 0.52
  },
  {
    id: 1,
    poreX: -2.92,
    poreZ: 3.05,
    coilX: -2.96,
    coilY: -2.68,
    coilZ: 3.02,
    coilRadius: 0.48
  },
  {
    id: 2,
    poreX: 0.42,
    poreZ: -2.92,
    coilX: 0.38,
    coilY: -2.72,
    coilZ: -2.88,
    coilRadius: 0.46
  },
  {
    id: 3,
    poreX: 3.88,
    poreZ: -0.25,
    coilX: 3.92,
    coilY: -2.52,
    coilZ: -0.28,
    coilRadius: 0.48
  }
];

// Generate Vellus Hairs deterministically, avoiding terminal follicles and sweat pores
export const VELLUS_FOLLICLES: VellusFollicleSpec[] = (() => {
  const rand = createSeededRandom(90210);
  const list: VellusFollicleSpec[] = [];
  let attempts = 0;
  while (list.length < 16 && attempts < 400) {
    attempts++;
    const x = (rand() - 0.5) * 8.2;
    const z = (rand() - 0.5) * 8.2;

    const nearTerminal = TERMINAL_FOLLICLES.some(
      (f) => Math.hypot(x - f.ostiumX, z - f.ostiumZ) < 1.15
    );
    const nearSweat = SWEAT_GLANDS.some((s) => Math.hypot(x - s.poreX, z - s.poreZ) < 0.7);
    const nearOther = list.some((v) => Math.hypot(x - v.ostiumX, z - v.ostiumZ) < 1.35);

    if (!nearTerminal && !nearSweat && !nearOther) {
      list.push({
        ostiumX: x,
        ostiumZ: z,
        slantX: 0.22 + rand() * 0.14,
        slantZ: 0.18 + rand() * 0.15,
        depth: 0.65 + rand() * 0.35,
        heightAbove: 0.72 + rand() * 0.48
      });
    }
  }
  return list;
})();

// Generate Dermal Papillae across specimen so DEJ heightfield, capillary loops, and Meissner corpuscles match 1:1
export const DERMAL_PAPILLAE: DermalPapillaSpec[] = (() => {
  const rand = createSeededRandom(55123);
  const papillae: DermalPapillaSpec[] = [];
  const step = 1.02;

  // Hand-curated priority papillae for Meissner corpuscles (in front/mid area for clear inspection)
  const meissnerTargets: [number, number][] = [
    [-1.55, 2.35],
    [1.15, 2.25],
    [-2.15, 0.45],
    [2.85, -0.15],
    [0.15, 3.35]
  ];

  for (const [mx, mz] of meissnerTargets) {
    papillae.push({
      x: mx,
      z: mz,
      amplitude: 0.42,
      radius: 0.36,
      hasMeissner: true,
      hasCapillary: false
    });
  }

  for (let gx = -4.2; gx <= 4.21; gx += step) {
    for (let gz = -4.2; gz <= 4.21; gz += step) {
      const x = gx + (rand() - 0.5) * 0.42;
      const z = gz + (rand() - 0.5) * 0.42;

      if (Math.abs(x) > 4.45 || Math.abs(z) > 4.45) continue;

      const tooCloseOstium = TERMINAL_FOLLICLES.some(
        (f) => Math.hypot(x - f.ostiumX, z - f.ostiumZ) < 0.68
      );
      const tooCloseSweat = SWEAT_GLANDS.some(
        (s) => Math.hypot(x - s.poreX, z - s.poreZ) < 0.42
      );
      const tooCloseExisting = papillae.some((p) => Math.hypot(x - p.x, z - p.z) < 0.68);

      if (tooCloseOstium || tooCloseSweat || tooCloseExisting) continue;

      papillae.push({
        x,
        z,
        amplitude: 0.31 + rand() * 0.14,
        radius: 0.31 + rand() * 0.08,
        hasMeissner: false,
        hasCapillary: rand() < 0.68
      });
    }
  }
  return papillae;
})();

/**
 * Evaluates all 8 histological boundary elevations at (x, z) with full micro-topography:
 * - Skin surface sulci cutis (Langer furrows), follicular ostia funnels, and sweat pores
 * - Dermal-epidermal junction with dermal papillae & epidermal rete ridges
 * - Papillary/reticular dermal border and dermal-hypodermal border
 */
export function evaluateSkinStrata(x: number, z: number): SkinStrataHeights {
  // Macro organic skin contour
  const macroWave =
    fbm2D(x * 0.22 + 3.1, z * 0.22 + 1.7, 3) * 0.14 +
    Math.sin(x * 0.45) * Math.cos(z * 0.38) * 0.04;

  // Voronoi Langer skin microrelief furrows (sulci cutis)
  const vorPrimary = voronoi2D((x + 6.0) * 1.65, (z + 6.0) * 1.65, 0.84);
  const vorSecondary = voronoi2D((x + 12.0) * 3.3, (z + 12.0) * 3.3, 0.78);
  const sulcusIndent =
    Math.exp(-vorPrimary.edge * 10.5) * 0.052 +
    Math.exp(-vorSecondary.edge * 12.0) * 0.022;

  // Follicular ostia (funnel depressions around terminal and vellus hairs)
  let ostiumIndent = 0;
  let follicleDEJInvagination = 0;

  for (const f of TERMINAL_FOLLICLES) {
    const d2 = (x - f.ostiumX) * (x - f.ostiumX) + (z - f.ostiumZ) * (z - f.ostiumZ);
    if (d2 < 0.42) {
      ostiumIndent += 0.28 * Math.exp(-d2 / 0.075);
      follicleDEJInvagination += 0.46 * Math.exp(-d2 / 0.095);
    }
  }

  for (const vf of VELLUS_FOLLICLES) {
    const d2 = (x - vf.ostiumX) * (x - vf.ostiumX) + (z - vf.ostiumZ) * (z - vf.ostiumZ);
    if (d2 < 0.14) {
      ostiumIndent += 0.085 * Math.exp(-d2 / 0.022);
    }
  }

  // Sweat pores (crisp micro-funnels)
  let poreIndent = 0;
  for (const sg of SWEAT_GLANDS) {
    const d2 = (x - sg.poreX) * (x - sg.poreX) + (z - sg.poreZ) * (z - sg.poreZ);
    if (d2 < 0.1) {
      poreIndent += 0.125 * Math.exp(-d2 / 0.014);
    }
  }

  const ySurface = 2.84 + macroWave - sulcusIndent - ostiumIndent - poreIndent;

  // Epidermal sublayers (thin hairy skin — NO stratum lucidum!)
  const corneumThick = 0.135 + fbm2D(x * 1.8, z * 1.8, 2) * 0.018;
  const yCorneumBottom = ySurface - corneumThick;

  const granulosumThick = 0.095 + fbm2D(x * 2.1 + 4.0, z * 2.1, 2) * 0.012;
  const yGranulosumBottom = yCorneumBottom - granulosumThick;

  // Dermal papillae upward hills & epidermal rete ridges downward valleys
  let papillaSum = 0;
  for (let i = 0; i < DERMAL_PAPILLAE.length; i++) {
    const p = DERMAL_PAPILLAE[i];
    const dx = x - p.x;
    const dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    const r2 = p.radius * p.radius;
    if (d2 < r2 * 3.8) {
      papillaSum += p.amplitude * Math.exp(-d2 / r2);
    }
  }
  // Additional continuous organic ridge undulation visible all along side edges
  const edgePapillaWave =
    (Math.sin(x * 3.8 + fbm2D(x * 0.8, z * 0.8, 2) * 2.2) *
      Math.cos(z * 3.8 + fbm2D(z * 0.8, x * 0.8, 2) * 2.2) *
      0.5 +
      0.5) *
    0.22;

  const totalPapillaHeight = Math.min(0.56, papillaSum * 0.85 + edgePapillaWave * 0.48);

  // Basement membrane / Dermal-Epidermal Junction (yBasaleBottom)
  const yBasaleBottom = Math.min(
    yGranulosumBottom - 0.24,
    1.62 + macroWave * 0.8 + totalPapillaHeight - follicleDEJInvagination - ostiumIndent * 0.5
  );

  // Stratum basale is a 1-cell palisade sheet hugging the basement membrane
  const basaleThick = 0.125;
  const ySpinosumBottom = Math.min(yGranulosumBottom - 0.12, yBasaleBottom + basaleThick);

  // Papillary / Reticular dermis transition
  const yPapillaryBottom =
    1.08 + macroWave * 0.55 + fbm2D(x * 0.55 + 7.2, z * 0.55 + 2.3, 3) * 0.16;

  // Reticular dermis / Hypodermis transition
  const yReticularBottom =
    -2.82 + fbm2D(x * 0.35 + 2.1, z * 0.35 + 8.4, 3) * 0.32 + Math.sin(x * 0.5 - z * 0.4) * 0.08;

  // Deep subcutaneous fascial base
  const yHypodermisBottom =
    -6.28 + fbm2D(x * 0.28 + 5.5, z * 0.28 + 1.9, 2) * 0.14;

  return {
    ySurface,
    yCorneumBottom,
    yGranulosumBottom,
    ySpinosumBottom,
    yBasaleBottom,
    yPapillaryBottom,
    yReticularBottom,
    yHypodermisBottom
  };
}

export type StratumLayerKey =
  | 'corneum'
  | 'granulosum'
  | 'spinosum'
  | 'basale'
  | 'papillary'
  | 'reticular';

export function getStratumBounds(
  h: SkinStrataHeights,
  key: StratumLayerKey
): [number, number] {
  switch (key) {
    case 'corneum':
      return [h.yCorneumBottom, h.ySurface];
    case 'granulosum':
      return [h.yGranulosumBottom, h.yCorneumBottom];
    case 'spinosum':
      return [h.ySpinosumBottom, h.yGranulosumBottom];
    case 'basale':
      return [h.yBasaleBottom, h.ySpinosumBottom];
    case 'papillary':
      return [h.yPapillaryBottom, h.yBasaleBottom];
    case 'reticular':
      return [h.yReticularBottom, h.yPapillaryBottom];
  }
}

/**
 * Builds a watertight 3D undulating histological slab over [-BLOCK_HALF_W, BLOCK_HALF_W] x [-BLOCK_HALF_D, BLOCK_HALF_D]
 * with separate crisp normals for top surface, bottom surface, and all 4 histological side faces.
 */
export function buildStratumSlabGeometry(
  key: StratumLayerKey,
  gridSegments = 88,
  includeTop = true,
  includeBottom = true
): THREE.BufferGeometry {
  const N = gridSegments;
  const topY = new Float32Array((N + 1) * (N + 1));
  const botY = new Float32Array((N + 1) * (N + 1));

  for (let iz = 0; iz <= N; iz++) {
    const z = -BLOCK_HALF_D + (iz / N) * (BLOCK_HALF_D * 2);
    for (let ix = 0; ix <= N; ix++) {
      const x = -BLOCK_HALF_W + (ix / N) * (BLOCK_HALF_W * 2);
      const h = evaluateSkinStrata(x, z);
      const [yb, yt] = getStratumBounds(h, key);
      const idx = iz * (N + 1) + ix;
      topY[idx] = yt;
      botY[idx] = yb;
    }
  }

  const parts: THREE.BufferGeometry[] = [];

  // 1. Top surface
  if (includeTop) {
    const gTop = new THREE.BufferGeometry();
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const uv = new Float32Array((N + 1) * (N + 1) * 2);
    const indices: number[] = [];

    for (let iz = 0; iz <= N; iz++) {
      const v = iz / N;
      const z = -BLOCK_HALF_D + v * BLOCK_HALF_D * 2;
      for (let ix = 0; ix <= N; ix++) {
        const u = ix / N;
        const x = -BLOCK_HALF_W + u * BLOCK_HALF_W * 2;
        const idx = iz * (N + 1) + ix;
        pos[idx * 3] = x;
        pos[idx * 3 + 1] = topY[idx];
        pos[idx * 3 + 2] = z;
        uv[idx * 2] = u;
        uv[idx * 2 + 1] = v;
      }
    }
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const a = iz * (N + 1) + ix;
        const b = (iz + 1) * (N + 1) + ix;
        const c = (iz + 1) * (N + 1) + (ix + 1);
        const d = iz * (N + 1) + (ix + 1);
        indices.push(a, b, d, b, c, d);
      }
    }
    gTop.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gTop.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    gTop.setIndex(indices);
    gTop.computeVertexNormals();
    parts.push(gTop);
  }

  // 2. Bottom surface
  if (includeBottom) {
    const gBot = new THREE.BufferGeometry();
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const uv = new Float32Array((N + 1) * (N + 1) * 2);
    const indices: number[] = [];

    for (let iz = 0; iz <= N; iz++) {
      const v = iz / N;
      const z = -BLOCK_HALF_D + v * BLOCK_HALF_D * 2;
      for (let ix = 0; ix <= N; ix++) {
        const u = ix / N;
        const x = -BLOCK_HALF_W + u * BLOCK_HALF_W * 2;
        const idx = iz * (N + 1) + ix;
        pos[idx * 3] = x;
        pos[idx * 3 + 1] = botY[idx];
        pos[idx * 3 + 2] = z;
        uv[idx * 2] = u;
        uv[idx * 2 + 1] = v;
      }
    }
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const a = iz * (N + 1) + ix;
        const b = (iz + 1) * (N + 1) + ix;
        const c = (iz + 1) * (N + 1) + (ix + 1);
        const d = iz * (N + 1) + (ix + 1);
        indices.push(a, d, b, b, d, c);
      }
    }
    gBot.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gBot.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    gBot.setIndex(indices);
    gBot.computeVertexNormals();
    parts.push(gBot);
  }

  // Helper for the 4 vertical histological cut walls
  const buildSideWall = (
    sampleCoord: (i: number) => [number, number, number, number], // [x, z, yb, yt]
    flipWinding: boolean
  ) => {
    const gWall = new THREE.BufferGeometry();
    const pos = new Float32Array((N + 1) * 2 * 3);
    const uv = new Float32Array((N + 1) * 2 * 2);
    const indices: number[] = [];

    for (let i = 0; i <= N; i++) {
      const [x, z, yb, yt] = sampleCoord(i);
      const u = i / N;
      // Top vertex
      pos[i * 6] = x;
      pos[i * 6 + 1] = yt;
      pos[i * 6 + 2] = z;
      uv[i * 4] = u;
      uv[i * 4 + 1] = yt * 0.25 + 0.5;
      // Bottom vertex
      pos[i * 6 + 3] = x;
      pos[i * 6 + 4] = yb;
      pos[i * 6 + 5] = z;
      uv[i * 4 + 2] = u;
      uv[i * 4 + 3] = yb * 0.25 + 0.5;
    }
    for (let i = 0; i < N; i++) {
      const t0 = i * 2;
      const b0 = i * 2 + 1;
      const t1 = (i + 1) * 2;
      const b1 = (i + 1) * 2 + 1;
      if (!flipWinding) {
        indices.push(t0, b0, t1, b0, b1, t1);
      } else {
        indices.push(t0, t1, b0, b0, t1, b1);
      }
    }
    gWall.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gWall.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    gWall.setIndex(indices);
    gWall.computeVertexNormals();
    parts.push(gWall);
  };

  // Front wall (+Z, iz = N)
  buildSideWall((ix) => {
    const x = -BLOCK_HALF_W + (ix / N) * BLOCK_HALF_W * 2;
    const idx = N * (N + 1) + ix;
    return [x, BLOCK_HALF_D, botY[idx], topY[idx]];
  }, false);

  // Back wall (-Z, iz = 0)
  buildSideWall((ix) => {
    const x = -BLOCK_HALF_W + (ix / N) * BLOCK_HALF_W * 2;
    const idx = ix;
    return [x, -BLOCK_HALF_D, botY[idx], topY[idx]];
  }, true);

  // Right wall (+X, ix = N)
  buildSideWall((iz) => {
    const z = -BLOCK_HALF_D + (iz / N) * BLOCK_HALF_D * 2;
    const idx = iz * (N + 1) + N;
    return [BLOCK_HALF_W, z, botY[idx], topY[idx]];
  }, true);

  // Left wall (-X, ix = 0)
  buildSideWall((iz) => {
    const z = -BLOCK_HALF_D + (iz / N) * BLOCK_HALF_D * 2;
    const idx = iz * (N + 1);
    return [-BLOCK_HALF_W, z, botY[idx], topY[idx]];
  }, false);

  // Merge parts cleanly preserving sharp wall-to-surface crease normals
  let vTotal = 0;
  let iTotal = 0;
  for (const p of parts) {
    vTotal += p.getAttribute('position').count;
    iTotal += p.getIndex()!.count;
  }

  const mPos = new Float32Array(vTotal * 3);
  const mNorm = new Float32Array(vTotal * 3);
  const mUv = new Float32Array(vTotal * 2);
  const mIdx = new Uint32Array(iTotal);
  let vOff = 0;
  let iOff = 0;

  for (const p of parts) {
    const pa = p.getAttribute('position');
    const na = p.getAttribute('normal');
    const ua = p.getAttribute('uv');
    const ia = p.getIndex()!;
    mPos.set(pa.array as Float32Array, vOff * 3);
    mNorm.set(na.array as Float32Array, vOff * 3);
    mUv.set(ua.array as Float32Array, vOff * 2);
    for (let k = 0; k < ia.count; k++) {
      mIdx[iOff + k] = ia.getX(k) + vOff;
    }
    vOff += pa.count;
    iOff += ia.count;
    p.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(mNorm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(mUv, 2));
  out.setIndex(new THREE.BufferAttribute(mIdx, 1));
  return out;
}

export interface SliceBoundsState {
  xEnabled: boolean;
  xPos: number;
  xInvert: boolean;
  yEnabled: boolean;
  yPos: number;
  yInvert: boolean;
  zEnabled: boolean;
  zPos: number;
  zInvert: boolean;
}

/**
 * Generates exact solid histological cross-section cap geometry for a given stratum
 * on all currently active slice planes (X, Y, Z), respecting exploded Y offset!
 */
export function buildStratumSliceCapGeometry(
  key: StratumLayerKey,
  slice: SliceBoundsState,
  explodeDeltaY: number
): THREE.BufferGeometry | null {
  const xMin = slice.xEnabled && slice.xInvert ? Math.max(-BLOCK_HALF_W, slice.xPos) : -BLOCK_HALF_W;
  const xMax = slice.xEnabled && !slice.xInvert ? Math.min(BLOCK_HALF_W, slice.xPos) : BLOCK_HALF_W;

  const zMin = slice.zEnabled && slice.zInvert ? Math.max(-BLOCK_HALF_D, slice.zPos) : -BLOCK_HALF_D;
  const zMax = slice.zEnabled && !slice.zInvert ? Math.min(BLOCK_HALF_D, slice.zPos) : BLOCK_HALF_D;

  const yMin = slice.yEnabled && slice.yInvert ? slice.yPos : -99;
  const yMax = slice.yEnabled && !slice.yInvert ? slice.yPos : 99;

  if (xMax <= xMin + 0.01 || zMax <= zMin + 0.01 || yMax <= yMin + 0.01) {
    return null;
  }

  const pos: number[] = [];
  const norm: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const steps = 72;

  // 1. X-slice vertical ribbon cap
  if (slice.xEnabled && slice.xPos > -BLOCK_HALF_W + 0.01 && slice.xPos < BLOCK_HALF_W - 0.01) {
    const eps = slice.xInvert ? 0.002 : -0.002;
    const xFace = slice.xPos + eps;
    const nx = slice.xInvert ? -1 : 1;
    const baseVert = pos.length / 3;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const z = zMin + t * (zMax - zMin);
      const h = evaluateSkinStrata(slice.xPos, z);
      const [ybRaw, ytRaw] = getStratumBounds(h, key);
      const yb = Math.max(yMin, Math.min(yMax, ybRaw + explodeDeltaY));
      const yt = Math.max(yMin, Math.min(yMax, ytRaw + explodeDeltaY));

      pos.push(xFace, yt, z, xFace, yb, z);
      norm.push(nx, 0, 0, nx, 0, 0);
      uvs.push((z + BLOCK_HALF_D) / (BLOCK_HALF_D * 2), yt * 0.25 + 0.5);
      uvs.push((z + BLOCK_HALF_D) / (BLOCK_HALF_D * 2), yb * 0.25 + 0.5);
    }

    for (let i = 0; i < steps; i++) {
      const t0 = baseVert + i * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      if (nx > 0) {
        indices.push(t0, t1, b0, b0, t1, b1);
      } else {
        indices.push(t0, b0, t1, b0, b1, t1);
      }
    }
  }

  // 2. Z-slice vertical ribbon cap
  if (slice.zEnabled && slice.zPos > -BLOCK_HALF_D + 0.01 && slice.zPos < BLOCK_HALF_D - 0.01) {
    const eps = slice.zInvert ? 0.002 : -0.002;
    const zFace = slice.zPos + eps;
    const nz = slice.zInvert ? -1 : 1;
    const baseVert = pos.length / 3;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = xMin + t * (xMax - xMin);
      const h = evaluateSkinStrata(x, slice.zPos);
      const [ybRaw, ytRaw] = getStratumBounds(h, key);
      const yb = Math.max(yMin, Math.min(yMax, ybRaw + explodeDeltaY));
      const yt = Math.max(yMin, Math.min(yMax, ytRaw + explodeDeltaY));

      pos.push(x, yt, zFace, x, yb, zFace);
      norm.push(0, 0, nz, 0, 0, nz);
      uvs.push((x + BLOCK_HALF_W) / (BLOCK_HALF_W * 2), yt * 0.25 + 0.5);
      uvs.push((x + BLOCK_HALF_W) / (BLOCK_HALF_W * 2), yb * 0.25 + 0.5);
    }

    for (let i = 0; i < steps; i++) {
      const t0 = baseVert + i * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      if (nz > 0) {
        indices.push(t0, b0, t1, b0, b1, t1);
      } else {
        indices.push(t0, t1, b0, b0, t1, b1);
      }
    }
  }

  // 3. Y-slice horizontal tangential histological cap!
  // Reveals circular dermal papilla islands surrounded by basal & spinous rings when slicing across DEJ!
  if (slice.yEnabled) {
    const eps = slice.yInvert ? 0.002 : -0.002;
    const yFace = slice.yPos + eps;
    const ny = slice.yInvert ? -1 : 1;
    const gridN = 64;

    // Sample grid once to check where yPos lies inside [yb, yt]
    const inside = new Uint8Array((gridN + 1) * (gridN + 1));
    let anyInside = false;

    for (let iz = 0; iz <= gridN; iz++) {
      const z = zMin + (iz / gridN) * (zMax - zMin);
      for (let ix = 0; ix <= gridN; ix++) {
        const x = xMin + (ix / gridN) * (xMax - xMin);
        const h = evaluateSkinStrata(x, z);
        const [ybRaw, ytRaw] = getStratumBounds(h, key);
        const yb = ybRaw + explodeDeltaY;
        const yt = ytRaw + explodeDeltaY;
        if (slice.yPos >= yb && slice.yPos <= yt) {
          inside[iz * (gridN + 1) + ix] = 1;
          anyInside = true;
        }
      }
    }

    if (anyInside) {
      const baseVert = pos.length / 3;
      for (let iz = 0; iz <= gridN; iz++) {
        const z = zMin + (iz / gridN) * (zMax - zMin);
        for (let ix = 0; ix <= gridN; ix++) {
          const x = xMin + (ix / gridN) * (xMax - xMin);
          pos.push(x, yFace, z);
          norm.push(0, ny, 0);
          uvs.push(
            (x + BLOCK_HALF_W) / (BLOCK_HALF_W * 2),
            (z + BLOCK_HALF_D) / (BLOCK_HALF_D * 2)
          );
        }
      }

      for (let iz = 0; iz < gridN; iz++) {
        for (let ix = 0; ix < gridN; ix++) {
          const a = iz * (gridN + 1) + ix;
          const b = (iz + 1) * (gridN + 1) + ix;
          const c = (iz + 1) * (gridN + 1) + (ix + 1);
          const d = iz * (gridN + 1) + (ix + 1);
          // Emit triangle if majority of its vertices fall within this histological stratum
          if (inside[a] + inside[b] + inside[d] >= 2) {
            if (ny > 0) indices.push(baseVert + a, baseVert + b, baseVert + d);
            else indices.push(baseVert + a, baseVert + d, baseVert + b);
          }
          if (inside[b] + inside[c] + inside[d] >= 2) {
            if (ny > 0) indices.push(baseVert + b, baseVert + c, baseVert + d);
            else indices.push(baseVert + b, baseVert + d, baseVert + c);
          }
        }
      }
    }
  }

  if (indices.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}
