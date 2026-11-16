import * as THREE from 'three';
import { AnatomyStructureId } from '../../../../content/ru/skin-atlas';
import { createSeededRandom, fbm3D, mergeBufferGeometries } from '../mathNoise';
import { createBiologicalMaterial } from '../materialFactory';
import { TissueTextureSet } from '../proceduralTextures';
import {
  BLOCK_HALF_D,
  BLOCK_HALF_W,
  evaluateSkinStrata,
  TERMINAL_FOLLICLES
} from '../skinHeightfield';

export const PACINIAN_LOCATIONS: Array<{
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: number;
}> = [
  {
    pos: new THREE.Vector3(2.1, -3.85, -1.6),
    rot: new THREE.Euler(0.32, 0.45, -0.28),
    scale: 1.0
  },
  {
    pos: new THREE.Vector3(-2.65, -4.15, 2.35),
    rot: new THREE.Euler(-0.24, -0.6, 0.35),
    scale: 0.88
  }
];

// 8 Fat lobule centers in XZ plane for authentic lobular grouping & interlobular septa
const LOBULE_CENTERS: Array<[number, number]> = [
  [-2.8, 2.7],
  [0.2, 2.9],
  [3.0, 2.6],
  [-3.1, -0.2],
  [0.1, -0.1],
  [3.1, -0.3],
  [-2.2, -3.0],
  [2.1, -3.1]
];

function evaluateSeptumProximity(x: number, z: number): {
  nearestDist: number;
  edgeGap: number;
  lobuleIdx: number;
} {
  // Warped coordinates so interlobular septa curve organically
  const wx = x + fbm3D(x * 0.35, 0, z * 0.35, 2) * 0.65;
  const wz = z + fbm3D(x * 0.35 + 7.1, 1.3, z * 0.35, 2) * 0.65;

  let d1 = 999;
  let d2 = 999;
  let best = 0;

  for (let i = 0; i < LOBULE_CENTERS.length; i++) {
    const [lx, lz] = LOBULE_CENTERS[i];
    const d = Math.hypot(wx - lx, wz - lz);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      best = i;
    } else if (d < d2) {
      d2 = d;
    }
  }
  return { nearestDist: d1, edgeGap: d2 - d1, lobuleIdx: best };
}

/**
 * Creates a polyhedral-compressed organic adipocyte archetype (NOT a sphere!)
 */
function createOrganicAdipocyteVariant(seedOffset: number): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(1.0, 2);
  const pos = geom.getAttribute('position');
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3D(
      v.x * 1.45 + seedOffset,
      v.y * 1.45 + seedOffset * 0.7,
      v.z * 1.45 - seedOffset * 0.4,
      3
    );
    // Soft polyhedral compression facets simulating neighbor cell contact
    const facet =
      1.0 -
      0.075 *
        (Math.pow(Math.abs(v.x), 4) +
          Math.pow(Math.abs(v.y), 4) +
          Math.pow(Math.abs(v.z), 4));
    const scale = (0.94 + n * 0.16) * facet;
    v.multiplyScalar(scale);
    // Slight natural vertical compression
    v.y *= 0.91;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds curved 3D fibrous interlobular septa (retinacula cutis) + deep subcutaneous fascia base
 */
function buildFibrousSeptaAndFascia(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Deep subcutaneous fascial floor sheet
  const N = 60;
  const floorGeom = new THREE.BufferGeometry();
  const fPos = new Float32Array((N + 1) * (N + 1) * 3);
  const fUv = new Float32Array((N + 1) * (N + 1) * 2);
  const fIdx: number[] = [];

  for (let iz = 0; iz <= N; iz++) {
    const v = iz / N;
    const z = -BLOCK_HALF_D + v * BLOCK_HALF_D * 2;
    for (let ix = 0; ix <= N; ix++) {
      const u = ix / N;
      const x = -BLOCK_HALF_W + u * BLOCK_HALF_W * 2;
      const h = evaluateSkinStrata(x, z);
      const sep = evaluateSeptumProximity(x, z);
      // Septal ridges rise slightly from fascial floor
      const ridgeBoost = Math.exp(-sep.edgeGap * 4.2) * 0.28;
      const idx = iz * (N + 1) + ix;
      fPos[idx * 3] = x;
      fPos[idx * 3 + 1] = h.yHypodermisBottom + ridgeBoost;
      fPos[idx * 3 + 2] = z;
      fUv[idx * 2] = u;
      fUv[idx * 2 + 1] = v;
    }
  }
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = iz * (N + 1) + ix;
      const b = (iz + 1) * (N + 1) + ix;
      const c = (iz + 1) * (N + 1) + (ix + 1);
      const d = iz * (N + 1) + (ix + 1);
      fIdx.push(a, b, d, b, c, d);
    }
  }
  floorGeom.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  floorGeom.setAttribute('uv', new THREE.BufferAttribute(fUv, 2));
  floorGeom.setIndex(fIdx);
  floorGeom.computeVertexNormals();
  parts.push(floorGeom);

  // Also add underside of fascial floor so it has real thickness (0.14 units)
  const underGeom = floorGeom.clone();
  const uPos = underGeom.getAttribute('position');
  for (let i = 0; i < uPos.count; i++) {
    uPos.setY(i, uPos.getY(i) - 0.14);
  }
  const uIdx = underGeom.getIndex()!;
  for (let i = 0; i < uIdx.count; i += 3) {
    const tmp = uIdx.getX(i + 1);
    uIdx.setX(i + 1, uIdx.getX(i + 2));
    uIdx.setX(i + 2, tmp);
  }
  underGeom.computeVertexNormals();
  parts.push(underGeom);

  // 2. Curved 3D interlobular septal sheets (retinacula cutis) partitioning fat lobules
  const septumPaths: Array<Array<[number, number]>> = [
    // Longitudinal curved septum 1
    [
      [-1.35, -4.65],
      [-1.15, -2.2],
      [-1.48, 0.2],
      [-1.22, 2.5],
      [-1.38, 4.65]
    ],
    // Longitudinal curved septum 2
    [
      [1.55, -4.65],
      [1.72, -2.1],
      [1.42, 0.35],
      [1.68, 2.45],
      [1.52, 4.65]
    ],
    // Transverse curved septum 1
    [
      [-4.65, 1.35],
      [-2.1, 1.55],
      [0.15, 1.22],
      [2.35, 1.48],
      [4.65, 1.32]
    ],
    // Transverse curved septum 2
    [
      [-4.65, -1.65],
      [-2.05, -1.45],
      [0.2, -1.78],
      [2.45, -1.52],
      [4.65, -1.68]
    ]
  ];

  for (let sIdx = 0; sIdx < septumPaths.length; sIdx++) {
    const ctrl = septumPaths[sIdx].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(ctrl);
    const segU = 38;
    const segV = 10;

    // Build two-sided thin undulating fibrous sheet with real 3D thickness (0.065)
    for (const sideSign of [-1, 1]) {
      const sGeom = new THREE.BufferGeometry();
      const sPos = new Float32Array((segU + 1) * (segV + 1) * 3);
      const sUv = new Float32Array((segU + 1) * (segV + 1) * 2);
      const sIndices: number[] = [];

      for (let iu = 0; iu <= segU; iu++) {
        const u = iu / segU;
        const p = curve.getPointAt(u);
        const tan = curve.getTangentAt(u);
        const normX = -tan.z;
        const normZ = tan.x;
        const h = evaluateSkinStrata(p.x, p.z);

        for (let iv = 0; iv <= segV; iv++) {
          const v = iv / segV;
          const y = THREE.MathUtils.lerp(
            h.yHypodermisBottom + 0.05,
            h.yReticularBottom + 0.08,
            v
          );
          // Organic lateral undulation + flare at top & bottom attachments
          const flare = 1.0 + 0.85 * Math.pow(Math.abs(v - 0.5) * 2, 3);
          const halfThick = 0.034 * flare;
          const wave = Math.sin(v * Math.PI) * Math.sin(u * 9.0 + sIdx * 2.1) * 0.16;

          const vx = p.x + normX * (wave + sideSign * halfThick);
          const vz = p.z + normZ * (wave + sideSign * halfThick);
          const idx = iv * (segU + 1) + iu;

          sPos[idx * 3] = vx;
          sPos[idx * 3 + 1] = y;
          sPos[idx * 3 + 2] = vz;
          sUv[idx * 2] = u * 3.0;
          sUv[idx * 2 + 1] = v;
        }
      }

      for (let iv = 0; iv < segV; iv++) {
        for (let iu = 0; iu < segU; iu++) {
          const a = iv * (segU + 1) + iu;
          const b = (iv + 1) * (segU + 1) + iu;
          const c = (iv + 1) * (segU + 1) + (iu + 1);
          const d = iv * (segU + 1) + (iu + 1);
          if (sideSign > 0) {
            sIndices.push(a, b, d, b, c, d);
          } else {
            sIndices.push(a, d, b, b, d, c);
          }
        }
      }

      sGeom.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
      sGeom.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
      sGeom.setIndex(sIndices);
      sGeom.computeVertexNormals();
      parts.push(sGeom);
    }
  }

  const merged = mergeBufferGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * Generates non-grid, organically packed 3D adipocytes of varied diameters inside fat lobules
 */
function buildAdiposeLobulesGeometry(): THREE.BufferGeometry {
  const rand = createSeededRandom(314159);
  const variants = [
    createOrganicAdipocyteVariant(1.1),
    createOrganicAdipocyteVariant(5.7),
    createOrganicAdipocyteVariant(11.3),
    createOrganicAdipocyteVariant(19.9)
  ];

  interface PackedCell {
    x: number;
    y: number;
    z: number;
    r: number;
  }

  const cells: PackedCell[] = [];
  const septumCurves = [
    // Approximate septum planes to leave realistic narrow septal clefts between lobules
    (x: number, z: number) => Math.abs(x - (-1.3 + Math.sin(z * 0.6) * 0.16)),
    (x: number, z: number) => Math.abs(x - (1.58 + Math.cos(z * 0.55) * 0.16)),
    (x: number, z: number) => Math.abs(z - (1.38 + Math.sin(x * 0.55) * 0.16)),
    (x: number, z: number) => Math.abs(z - (-1.6 + Math.cos(x * 0.6) * 0.16))
  ];

  const isBlocked = (x: number, y: number, z: number, r: number): boolean => {
    // Keep clear of deep hair bulbs
    for (const f of TERMINAL_FOLLICLES) {
      if (y > f.bulbY - 0.35) {
        const dx = x - f.bulbX;
        const dz = z - f.bulbZ;
        if (Math.hypot(dx, dz) < f.sheathRadius + r + 0.14) return true;
      }
    }
    // Keep clear of Pacinian corpuscles
    for (const pc of PACINIAN_LOCATIONS) {
      const dx = x - pc.pos.x;
      const dy = y - pc.pos.y;
      const dz = z - pc.pos.z;
      if (Math.hypot(dx, dy, dz) < 0.58 * pc.scale + r) return true;
    }
    // Leave thin septal corridors between fat lobules
    for (const fn of septumCurves) {
      if (fn(x, z) < 0.085 + r * 0.32) return true;
    }
    return false;
  };

  // Multi-pass Poisson-disk spatial packing (larger primary adipocytes first, then smaller interstitial adipocytes!)
  const maxAttempts = 8500;
  for (let attempt = 0; attempt < maxAttempts && cells.length < 480; attempt++) {
    const progress = attempt / maxAttempts;
    // Varied cell radii: 0.21 to 0.44 units (realistic ~2.2x size variation!)
    const r =
      progress < 0.45
        ? 0.31 + rand() * 0.13
        : progress < 0.8
          ? 0.24 + rand() * 0.09
          : 0.19 + rand() * 0.07;

    const x = (rand() - 0.5) * (BLOCK_HALF_W * 2 - r * 1.3);
    const z = (rand() - 0.5) * (BLOCK_HALF_D * 2 - r * 1.3);
    const h = evaluateSkinStrata(x, z);
    const yMin = h.yHypodermisBottom + r * 0.95 + 0.06;
    const yMax = h.yReticularBottom - r * 0.72;
    if (yMax <= yMin) continue;

    const y = yMin + rand() * (yMax - yMin);
    if (isBlocked(x, y, z, r)) continue;

    // Allow slight 12% soft neighbor compression so cells pack tightly into grape-like lobules!
    let overlap = false;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const dx = x - c.x;
      const dy = y - c.y;
      const dz = z - c.z;
      const minDist = (r + c.r) * 0.86;
      if (dx * dx + dy * dy + dz * dz < minDist * minDist) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      cells.push({ x, y, z, r });
    }
  }

  // Build merged high-detail BufferGeometry with subtle per-adipocyte golden-amber vertex color variation
  const cellGeoms: THREE.BufferGeometry[] = [];
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const posVec = new THREE.Vector3();
  const baseColor = new THREE.Color();

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const template = variants[i % variants.length].clone();

    euler.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
    quat.setFromEuler(euler);
    scale.set(
      c.r * (0.92 + rand() * 0.18),
      c.r * (0.86 + rand() * 0.18),
      c.r * (0.92 + rand() * 0.18)
    );
    posVec.set(c.x, c.y, c.z);
    mat4.compose(posVec, quat, scale);
    template.applyMatrix4(mat4);

    // Subtle biological variation in triglyceride yellow-gold hue per cell
    const hueShift = (rand() - 0.5) * 0.025;
    const lightShift = (rand() - 0.5) * 0.08;
    baseColor.setHSL(0.112 + hueShift, 0.82, 0.58 + lightShift);

    const vCount = template.getAttribute('position').count;
    const cols = new Float32Array(vCount * 3);
    for (let k = 0; k < vCount; k++) {
      cols[k * 3] = baseColor.r;
      cols[k * 3 + 1] = baseColor.g;
      cols[k * 3 + 2] = baseColor.b;
    }
    template.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    cellGeoms.push(template);
  }

  const merged = mergeBufferGeometries(cellGeoms);
  for (const g of cellGeoms) g.dispose();
  for (const v of variants) v.dispose();
  return merged;
}

export function buildHypodermis(
  textures: TissueTextureSet,
  clippingPlanes: THREE.Plane[]
): Map<AnatomyStructureId, THREE.Group> {
  const groups = new Map<AnatomyStructureId, THREE.Group>();

  // 1. Adipose lobules & adipocytes
  const fatGroup = new THREE.Group();
  const fatMat = createBiologicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    bumpMap: textures.sebaceousBump,
    bumpScale: 0.015,
    roughness: 0.31,
    clearcoat: 0.45,
    clearcoatRoughness: 0.24,
    sheen: 0.35,
    sheenColor: 0xfff0b8,
    cutInteriorTint: new THREE.Color(0xe6ac2e),
    clippingPlanes
  });
  const fatMesh = new THREE.Mesh(buildAdiposeLobulesGeometry(), fatMat);
  fatMesh.castShadow = true;
  fatMesh.receiveShadow = true;
  fatGroup.add(fatMesh);
  fatGroup.userData.structureId = 'adipose_lobules';
  fatGroup.traverse((o) => {
    o.userData.structureId = 'adipose_lobules';
  });
  groups.set('adipose_lobules', fatGroup);

  // 2. Connective tissue septa (retinacula cutis) & deep fascia
  const septaGroup = new THREE.Group();
  const septaMat = createBiologicalMaterial({
    color: 0xe6dad0,
    bumpMap: textures.dermisBump,
    bumpScale: 0.025,
    roughness: 0.52,
    sheen: 0.3,
    opacity: 0.88,
    cutInteriorTint: new THREE.Color(0xcab9ab),
    clippingPlanes
  });
  const septaMesh = new THREE.Mesh(buildFibrousSeptaAndFascia(), septaMat);
  septaMesh.receiveShadow = true;
  septaGroup.add(septaMesh);
  septaGroup.userData.structureId = 'fibrous_septa';
  septaGroup.traverse((o) => {
    o.userData.structureId = 'fibrous_septa';
  });
  groups.set('fibrous_septa', septaGroup);

  return groups;
}
