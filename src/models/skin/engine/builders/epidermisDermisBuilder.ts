import * as THREE from 'three';
import { AnatomyStructureId } from '../../../../content/ru/skin-atlas';
import {
  buildVariableTubeGeometry,
  createSeededRandom,
  fbm3D,
  mergeBufferGeometries
} from '../mathNoise';
import { createBiologicalMaterial } from '../materialFactory';
import { TissueTextureSet } from '../proceduralTextures';
import {
  BLOCK_HALF_D,
  BLOCK_HALF_W,
  buildStratumSlabGeometry,
  evaluateSkinStrata,
  StratumLayerKey,
  SWEAT_GLANDS,
  TERMINAL_FOLLICLES
} from '../skinHeightfield';

export interface EpidermisDermisBuildResult {
  groups: Map<AnatomyStructureId, THREE.Group>;
  stratumMaterials: Map<StratumLayerKey, THREE.MeshPhysicalMaterial>;
}

function tagGroup(group: THREE.Group, id: AnatomyStructureId): void {
  group.userData.structureId = id;
  group.traverse((obj) => {
    obj.userData.structureId = id;
  });
}

/**
 * Builds the outer skin microrelief sheet (sulci cutis, pores, follicular ostia)
 */
function buildOuterSkinSurfaceGeometry(segments = 104): THREE.BufferGeometry {
  const N = segments;
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const uv = new Float32Array((N + 1) * (N + 1) * 2);
  const indices: number[] = [];

  for (let iz = 0; iz <= N; iz++) {
    const v = iz / N;
    const z = -BLOCK_HALF_D + v * BLOCK_HALF_D * 2;
    for (let ix = 0; ix <= N; ix++) {
      const u = ix / N;
      const x = -BLOCK_HALF_W + u * BLOCK_HALF_W * 2;
      const h = evaluateSkinStrata(x, z);
      const idx = iz * (N + 1) + ix;
      pos[idx * 3] = x;
      pos[idx * 3 + 1] = h.ySurface + 0.005;
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

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds organized 3D histological cellular micro-relief along the Front (+Z) and Right (+X) edges
 * so zooming in shows distinct cell shapes per epidermal stratum (flat squames, fusiform granular,
 * polyhedral spinous, and columnar basal cells — NOT chaotic spheres!).
 */
function buildHistologicalBorderCells(
  stratum: 'corneum' | 'granulosum' | 'spinosum' | 'basale'
): THREE.BufferGeometry {
  const rand = createSeededRandom(stratum.charCodeAt(0) * 977 + 13);
  const cellGeoms: THREE.BufferGeometry[] = [];

  // Base unit cell geometry appropriate to each histological layer
  let baseCell: THREE.BufferGeometry;
  if (stratum === 'corneum') {
    // Flattened hexagonal keratinized squame plate
    baseCell = new THREE.CylinderGeometry(0.085, 0.088, 0.022, 6, 1);
  } else if (stratum === 'granulosum') {
    // Flattened diamond-fusiform cell
    baseCell = new THREE.IcosahedronGeometry(0.055, 1);
    baseCell.scale(1.35, 0.36, 0.55);
  } else if (stratum === 'spinosum') {
    // Polygonal polyhedral prickle cell
    baseCell = new THREE.DodecahedronGeometry(0.058, 0);
    baseCell.scale(1.0, 0.88, 0.52);
  } else {
    // Columnar palisade basal stem cell
    baseCell = new THREE.CapsuleGeometry(0.036, 0.055, 4, 7);
    baseCell.scale(1.0, 1.0, 0.58);
  }

  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();

  // Populate along front border (+Z = BLOCK_HALF_D) and right border (+X = BLOCK_HALF_W)
  const sampleEdge = (isFront: boolean) => {
    const count = stratum === 'basale' ? 92 : stratum === 'spinosum' ? 86 : 68;
    const rows = stratum === 'spinosum' ? 3 : stratum === 'corneum' ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const coord = -BLOCK_HALF_W + 0.18 + t * (BLOCK_HALF_W * 2 - 0.36);
      const x = isFront ? coord : BLOCK_HALF_W - 0.008;
      const z = isFront ? BLOCK_HALF_D - 0.008 : coord;

      const h = evaluateSkinStrata(x, z);
      let yBot = h.yBasaleBottom;
      let yTop = h.ySpinosumBottom;
      if (stratum === 'corneum') {
        yBot = h.yCorneumBottom;
        yTop = h.ySurface;
      } else if (stratum === 'granulosum') {
        yBot = h.yGranulosumBottom;
        yTop = h.yCorneumBottom;
      } else if (stratum === 'spinosum') {
        yBot = h.ySpinosumBottom;
        yTop = h.yGranulosumBottom;
      }

      const span = yTop - yBot;
      if (span < 0.04) continue;

      for (let r = 0; r < rows; r++) {
        const frac = (r + 0.5) / rows;
        const y = yBot + span * frac + (rand() - 0.5) * 0.015;
        const jitter = (rand() - 0.5) * 0.03;

        pos.set(
          isFront ? x + jitter : BLOCK_HALF_W + 0.006,
          y,
          isFront ? BLOCK_HALF_D + 0.006 : z + jitter
        );

        euler.set(
          (rand() - 0.5) * 0.16,
          isFront ? (rand() - 0.5) * 0.2 : Math.PI * 0.5 + (rand() - 0.5) * 0.2,
          (rand() - 0.5) * 0.18
        );
        quat.setFromEuler(euler);
        const s = 0.86 + rand() * 0.28;
        scale.set(s, s, s);
        mat4.compose(pos, quat, scale);

        const clone = baseCell.clone();
        clone.applyMatrix4(mat4);
        cellGeoms.push(clone);
      }
    }
  };

  sampleEdge(true);
  sampleEdge(false);
  baseCell.dispose();

  const merged = mergeBufferGeometries(cellGeoms);
  for (const g of cellGeoms) g.dispose();
  return merged;
}

/**
 * Builds an authentic 3D interwoven biomechanical network of thick wavy Type-I collagen bundles
 * and slender branching elastic fibers inside the dermis, curving organically around appendages.
 */
function buildCollagenAndElastinNetwork(): {
  collagenGeom: THREE.BufferGeometry;
  elastinGeom: THREE.BufferGeometry;
} {
  const rand = createSeededRandom(778899);
  const collagenList: THREE.BufferGeometry[] = [];
  const elastinList: THREE.BufferGeometry[] = [];

  const pushAwayFromAppendages = (pt: THREE.Vector3) => {
    for (const f of TERMINAL_FOLLICLES) {
      // Approximate follicle axis at height pt.y
      const t = THREE.MathUtils.clamp((pt.y - f.bulbY) / (2.8 - f.bulbY), 0, 1);
      const fx = THREE.MathUtils.lerp(f.bulbX, f.ostiumX, t);
      const fz = THREE.MathUtils.lerp(f.bulbZ, f.ostiumZ, t);
      const dx = pt.x - fx;
      const dz = pt.z - fz;
      const d = Math.hypot(dx, dz);
      const minR = f.sheathRadius + 0.18;
      if (d < minR && d > 1e-4) {
        pt.x = fx + (dx / d) * minR;
        pt.z = fz + (dz / d) * minR;
      }
    }
    for (const s of SWEAT_GLANDS) {
      const dx = pt.x - s.coilX;
      const dy = pt.y - s.coilY;
      const dz = pt.z - s.coilZ;
      const d = Math.hypot(dx, dy, dz);
      if (d < s.coilRadius + 0.15 && d > 1e-4) {
        const push = (s.coilRadius + 0.15) / d;
        pt.x = s.coilX + dx * push;
        pt.y = s.coilY + dy * push;
        pt.z = s.coilZ + dz * push;
      }
    }
  };

  // 1. Coarse wavy Collagen Type-I fiber bundles in reticular dermis (Langer cross-weave)
  const collagenCount = 108;
  for (let i = 0; i < collagenCount; i++) {
    const isPrimaryDir = i % 2 === 0;
    const baseAngle = (isPrimaryDir ? 0.42 : -0.68) + (rand() - 0.5) * 0.45;
    const cx = (rand() - 0.5) * 8.4;
    const cz = (rand() - 0.5) * 8.4;
    const cy = -2.45 + rand() * 3.45; // Reticular up to lower papillary dermis
    const halfLen = 1.2 + rand() * 1.65;

    const pts: THREE.Vector3[] = [];
    const ctrlCount = 6;
    for (let k = 0; k <= ctrlCount; k++) {
      const s = (k / ctrlCount - 0.5) * 2 * halfLen;
      const waveY = Math.sin(s * 2.6 + i) * 0.14 + fbm3D(cx + s, cy, cz, 2) * 0.16;
      const waveLat = Math.cos(s * 2.2 + i * 1.7) * 0.15;
      const px = THREE.MathUtils.clamp(
        cx + Math.cos(baseAngle) * s - Math.sin(baseAngle) * waveLat,
        -BLOCK_HALF_W + 0.08,
        BLOCK_HALF_W - 0.08
      );
      const pz = THREE.MathUtils.clamp(
        cz + Math.sin(baseAngle) * s + Math.cos(baseAngle) * waveLat,
        -BLOCK_HALF_D + 0.08,
        BLOCK_HALF_D - 0.08
      );
      const h = evaluateSkinStrata(px, pz);
      const py = THREE.MathUtils.clamp(
        cy + waveY,
        h.yReticularBottom + 0.12,
        h.yBasaleBottom - 0.22
      );
      const pt = new THREE.Vector3(px, py, pz);
      pushAwayFromAppendages(pt);
      pts.push(pt);
    }

    const curve = new THREE.CatmullRomCurve3(pts);
    const baseR = cy > 0.85 ? 0.024 + rand() * 0.014 : 0.042 + rand() * 0.028;
    const g = buildVariableTubeGeometry({
      curve,
      tubularSegments: 20,
      radialSegments: 6,
      radiusFn: (u, theta) => {
        const taper = Math.sin(u * Math.PI) * 0.35 + 0.65;
        const ribbon = 1.0 + 0.22 * Math.cos(theta * 2 + u * 8.0);
        return baseR * taper * ribbon;
      },
      capStart: true,
      capEnd: true
    });
    collagenList.push(g);
  }

  // 2. Fine branching Elastic fibers (horizontal reticular elastin + vertical oxytalan/elaunin in papillary dermis)
  const elastinCount = 88;
  for (let i = 0; i < elastinCount; i++) {
    const isAscending = i < 34; // Oxytalan/elaunin fibers ascending toward dermal papillae
    const pts: THREE.Vector3[] = [];

    if (isAscending) {
      const x0 = (rand() - 0.5) * 8.6;
      const z0 = (rand() - 0.5) * 8.6;
      const h = evaluateSkinStrata(x0, z0);
      const yStart = h.yPapillaryBottom - 0.45 - rand() * 0.5;
      const yEnd = h.yBasaleBottom - 0.06;
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const pt = new THREE.Vector3(
          THREE.MathUtils.clamp(x0 + Math.sin(t * 5 + i) * 0.12, -BLOCK_HALF_W + 0.1, BLOCK_HALF_W - 0.1),
          THREE.MathUtils.lerp(yStart, yEnd, t),
          THREE.MathUtils.clamp(z0 + Math.cos(t * 5 + i) * 0.12, -BLOCK_HALF_D + 0.1, BLOCK_HALF_D - 0.1)
        );
        pushAwayFromAppendages(pt);
        pts.push(pt);
      }
    } else {
      const angle = rand() * Math.PI * 2;
      const cx = (rand() - 0.5) * 8.4;
      const cz = (rand() - 0.5) * 8.4;
      const cy = -2.3 + rand() * 3.2;
      const len = 1.4 + rand() * 1.5;
      for (let k = 0; k <= 5; k++) {
        const s = (k / 5 - 0.5) * len;
        const px = THREE.MathUtils.clamp(cx + Math.cos(angle) * s, -BLOCK_HALF_W + 0.1, BLOCK_HALF_W - 0.1);
        const pz = THREE.MathUtils.clamp(cz + Math.sin(angle) * s, -BLOCK_HALF_D + 0.1, BLOCK_HALF_D - 0.1);
        const h = evaluateSkinStrata(px, pz);
        const py = THREE.MathUtils.clamp(
          cy + Math.sin(s * 3.5 + i) * 0.18,
          h.yReticularBottom + 0.12,
          h.yBasaleBottom - 0.18
        );
        const pt = new THREE.Vector3(px, py, pz);
        pushAwayFromAppendages(pt);
        pts.push(pt);
      }
    }

    const curve = new THREE.CatmullRomCurve3(pts);
    const g = buildVariableTubeGeometry({
      curve,
      tubularSegments: 14,
      radialSegments: 5,
      radiusFn: (u) => 0.015 * (0.7 + 0.3 * Math.sin(u * Math.PI)),
      capStart: true,
      capEnd: true
    });
    elastinList.push(g);
  }

  const collagenGeom = mergeBufferGeometries(collagenList);
  const elastinGeom = mergeBufferGeometries(elastinList);
  for (const g of collagenList) g.dispose();
  for (const g of elastinList) g.dispose();

  return { collagenGeom, elastinGeom };
}

export function buildEpidermisAndDermis(
  textures: TissueTextureSet,
  clippingPlanes: THREE.Plane[]
): EpidermisDermisBuildResult {
  const groups = new Map<AnatomyStructureId, THREE.Group>();
  const stratumMaterials = new Map<StratumLayerKey, THREE.MeshPhysicalMaterial>();

  // 1. OUTER SKIN SURFACE (Sulci cutis, pores, follicular ostia)
  const surfGroup = new THREE.Group();
  const surfMat = createBiologicalMaterial({
    color: 0xffffff,
    map: textures.skinSurfaceMap,
    bumpMap: textures.skinSurfaceBump,
    bumpScale: 0.042,
    roughnessMap: textures.skinSurfaceRoughness,
    roughness: 0.62,
    clearcoat: 0.18,
    clearcoatRoughness: 0.48,
    sheen: 0.35,
    sheenRoughness: 0.62,
    sheenColor: 0xffd5c2,
    clippingPlanes
  });
  const surfMesh = new THREE.Mesh(buildOuterSkinSurfaceGeometry(104), surfMat);
  surfMesh.castShadow = true;
  surfMesh.receiveShadow = true;
  surfGroup.add(surfMesh);

  // Subtle recessed dark pore orifices inside each sweat pore funnel
  const poreMat = createBiologicalMaterial({
    color: 0x8c5542,
    roughness: 0.85,
    clippingPlanes
  });
  for (const sg of SWEAT_GLANDS) {
    const hPore = evaluateSkinStrata(sg.poreX, sg.poreZ);
    const poreRing = new THREE.TorusGeometry(0.036, 0.012, 8, 18);
    poreRing.rotateX(Math.PI * 0.5);
    poreRing.translate(sg.poreX, hPore.ySurface + 0.008, sg.poreZ);
    surfGroup.add(new THREE.Mesh(poreRing, poreMat));
  }

  tagGroup(surfGroup, 'skin_surface');
  groups.set('skin_surface', surfGroup);

  // 2. STRATUM CORNEUM
  const corneumGroup = new THREE.Group();
  const corneumMat = createBiologicalMaterial({
    color: 0xf6ebe4,
    map: textures.corneumMap,
    bumpMap: textures.corneumBump,
    bumpScale: 0.032,
    roughness: 0.68,
    sheen: 0.22,
    doubleSided: false,
    clippingPlanes
  });
  stratumMaterials.set('corneum', corneumMat);
  const corneumMesh = new THREE.Mesh(buildStratumSlabGeometry('corneum', 88), corneumMat);
  corneumMesh.castShadow = true;
  corneumMesh.receiveShadow = true;
  corneumGroup.add(corneumMesh);

  const corneumCellsMat = createBiologicalMaterial({
    color: 0xe29d7b,
    roughness: 0.62,
    clippingPlanes
  });
  corneumGroup.add(new THREE.Mesh(buildHistologicalBorderCells('corneum'), corneumCellsMat));
  tagGroup(corneumGroup, 'stratum_corneum');
  groups.set('stratum_corneum', corneumGroup);

  // 3. STRATUM GRANULOSUM
  const granGroup = new THREE.Group();
  const granMat = createBiologicalMaterial({
    color: 0xf7e6ec,
    map: textures.granulosumMap,
    bumpMap: textures.spinosumBump,
    bumpScale: 0.02,
    roughness: 0.56,
    doubleSided: false,
    clippingPlanes
  });
  stratumMaterials.set('granulosum', granMat);
  const granMesh = new THREE.Mesh(buildStratumSlabGeometry('granulosum', 88), granMat);
  granMesh.receiveShadow = true;
  granGroup.add(granMesh);

  const granCellsMat = createBiologicalMaterial({
    color: 0xb15c70,
    roughness: 0.52,
    clippingPlanes
  });
  granGroup.add(new THREE.Mesh(buildHistologicalBorderCells('granulosum'), granCellsMat));
  tagGroup(granGroup, 'stratum_granulosum');
  groups.set('stratum_granulosum', granGroup);

  // 4. STRATUM SPINOSUM
  const spinGroup = new THREE.Group();
  const spinMat = createBiologicalMaterial({
    color: 0xfae9eb,
    map: textures.spinosumMap,
    bumpMap: textures.spinosumBump,
    bumpScale: 0.03,
    roughness: 0.52,
    sheen: 0.25,
    doubleSided: false,
    clippingPlanes
  });
  stratumMaterials.set('spinosum', spinMat);
  const spinMesh = new THREE.Mesh(buildStratumSlabGeometry('spinosum', 88), spinMat);
  spinMesh.receiveShadow = true;
  spinGroup.add(spinMesh);

  const spinCellsMat = createBiologicalMaterial({
    color: 0xd67c84,
    roughness: 0.48,
    clippingPlanes
  });
  spinGroup.add(new THREE.Mesh(buildHistologicalBorderCells('spinosum'), spinCellsMat));
  tagGroup(spinGroup, 'stratum_spinosum');
  groups.set('stratum_spinosum', spinGroup);

  // 5. STRATUM BASALE
  const basaleGroup = new THREE.Group();
  const basaleMat = createBiologicalMaterial({
    color: 0xf5e2e8,
    map: textures.basaleMap,
    bumpMap: textures.spinosumBump,
    bumpScale: 0.024,
    roughness: 0.5,
    doubleSided: false,
    clippingPlanes
  });
  stratumMaterials.set('basale', basaleMat);
  const basaleMesh = new THREE.Mesh(buildStratumSlabGeometry('basale', 92), basaleMat);
  basaleMesh.receiveShadow = true;
  basaleGroup.add(basaleMesh);

  const basaleCellsMat = createBiologicalMaterial({
    color: 0x9e4964,
    roughness: 0.46,
    clippingPlanes
  });
  basaleGroup.add(new THREE.Mesh(buildHistologicalBorderCells('basale'), basaleCellsMat));
  tagGroup(basaleGroup, 'stratum_basale');
  groups.set('stratum_basale', basaleGroup);

  // 6. PAPILLARY DERMIS (with upward dermal papillae!)
  const papGroup = new THREE.Group();
  const papMat = createBiologicalMaterial({
    color: 0xfceced,
    map: textures.papillaryDermisMap,
    bumpMap: textures.dermisBump,
    bumpScale: 0.032,
    roughness: 0.54,
    sheen: 0.3,
    opacity: 0.66,
    doubleSided: false,
    clippingPlanes
  });
  stratumMaterials.set('papillary', papMat);
  const papMesh = new THREE.Mesh(buildStratumSlabGeometry('papillary', 88), papMat);
  papMesh.receiveShadow = true;
  papGroup.add(papMesh);
  tagGroup(papGroup, 'papillary_dermis');
  groups.set('papillary_dermis', papGroup);

  // 7. RETICULAR DERMIS (semi-translucent connective matrix housing follicles, glands, vessels, nerves & 3D fibers)
  const retGroup = new THREE.Group();
  const retMat = createBiologicalMaterial({
    color: 0xfbe5e6,
    map: textures.reticularDermisMap,
    bumpMap: textures.dermisBump,
    bumpScale: 0.045,
    roughness: 0.58,
    sheen: 0.28,
    opacity: 0.48,
    doubleSided: false,
    clippingPlanes
  });
  stratumMaterials.set('reticular', retMat);
  const retMesh = new THREE.Mesh(buildStratumSlabGeometry('reticular', 80), retMat);
  retMesh.receiveShadow = true;
  retGroup.add(retMesh);
  tagGroup(retGroup, 'reticular_dermis');
  groups.set('reticular_dermis', retGroup);

  // 8. 3D COLLAGEN & ELASTIC FIBER NETWORK
  const fiberGroup = new THREE.Group();
  const { collagenGeom, elastinGeom } = buildCollagenAndElastinNetwork();

  const collagenMat = createBiologicalMaterial({
    color: 0xf2aba4,
    roughness: 0.44,
    clearcoat: 0.16,
    sheen: 0.35,
    opacity: 0.88,
    clippingPlanes
  });
  const elastinMat = createBiologicalMaterial({
    color: 0xe6be6a,
    roughness: 0.38,
    clearcoat: 0.2,
    opacity: 0.92,
    clippingPlanes
  });

  const collagenMesh = new THREE.Mesh(collagenGeom, collagenMat);
  const elastinMesh = new THREE.Mesh(elastinGeom, elastinMat);
  fiberGroup.add(collagenMesh, elastinMesh);
  tagGroup(fiberGroup, 'collagen_elastin');
  groups.set('collagen_elastin', fiberGroup);

  return { groups, stratumMaterials };
}
