import * as THREE from 'three';
import { AnatomyStructureId } from '../../../../content/ru/skin-atlas';
import {
  buildVariableTubeGeometry,
  createSeededRandom,
  mergeBufferGeometries
} from '../mathNoise';
import { createBiologicalMaterial } from '../materialFactory';
import { getFollicleAxisPoints } from './appendagesBuilder';
import { PACINIAN_LOCATIONS } from './hypodermisBuilder';
import {
  BLOCK_HALF_D,
  BLOCK_HALF_W,
  DERMAL_PAPILLAE,
  evaluateSkinStrata,
  SWEAT_GLANDS,
  TERMINAL_FOLLICLES
} from '../skinHeightfield';

function makeTubeBranch(
  pts: THREE.Vector3[],
  rStart: number,
  rEnd: number,
  tubularSegs = 24,
  radialSegs = 8
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  return buildVariableTubeGeometry({
    curve,
    tubularSegments: tubularSegs,
    radialSegments: radialSegs,
    radiusFn: (u) => THREE.MathUtils.lerp(rStart, rEnd, u),
    capStart: true,
    capEnd: true
  });
}

export function buildNeurovascularSystems(
  clippingPlanes: THREE.Plane[]
): Map<AnatomyStructureId, THREE.Group> {
  const groups = new Map<AnatomyStructureId, THREE.Group>();
  const rand = createSeededRandom(202607);

  // =========================================================================
  // 1. VASCULAR SYSTEM (Arteries, Veins, Dermal Papillary Capillary Loops)
  // =========================================================================
  const arteryGeoms: THREE.BufferGeometry[] = [];
  const veinGeoms: THREE.BufferGeometry[] = [];
  const capillaryGeoms: THREE.BufferGeometry[] = [];

  // Deep cutaneous arterial & venous trunks coursing near dermal-hypodermal border (y ~ -3.0)
  const deepArteryMainPaths: THREE.Vector3[][] = [
    // Trunk 1: Diagonal-longitudinal deep cutaneous artery
    [
      new THREE.Vector3(-4.55, -3.45, 2.85),
      new THREE.Vector3(-2.35, -3.05, 1.95),
      new THREE.Vector3(-0.15, -2.92, 1.35),
      new THREE.Vector3(2.15, -3.02, 1.85),
      new THREE.Vector3(4.55, -3.32, 2.45)
    ],
    // Trunk 2: Posterior-transverse deep cutaneous artery
    [
      new THREE.Vector3(-4.55, -3.28, -2.15),
      new THREE.Vector3(-1.85, -2.98, -1.65),
      new THREE.Vector3(0.65, -2.88, -1.85),
      new THREE.Vector3(2.85, -3.04, -1.35),
      new THREE.Vector3(4.55, -3.22, -1.75)
    ],
    // Connecting deep arcade + ascending perforator from deep hypodermis
    [
      new THREE.Vector3(-0.35, -5.95, 0.25),
      new THREE.Vector3(-0.22, -4.45, 0.72),
      new THREE.Vector3(-0.15, -2.92, 1.35),
      new THREE.Vector3(0.25, -2.88, -0.25),
      new THREE.Vector3(0.65, -2.88, -1.85)
    ]
  ];

  for (const pts of deepArteryMainPaths) {
    arteryGeoms.push(makeTubeBranch(pts, 0.095, 0.082, 36, 10));
    // Companion deep vein (slightly larger caliber, parallel offset without intersecting)
    const vPts = pts.map((p) => new THREE.Vector3(p.x + 0.19, p.y - 0.14, p.z + 0.17));
    veinGeoms.push(makeTubeBranch(vPts, 0.118, 0.102, 36, 10));
  }

  // Superficial subpapillary arterial & venous plexus grid at papillary-reticular border (y ~ +1.02)
  const subpapillaryNodes: Array<[number, number]> = [
    [-2.8, 2.6],
    [0.0, 2.75],
    [2.8, 2.55],
    [-2.9, 0.1],
    [0.1, 0.15],
    [2.9, 0.05],
    [-2.7, -2.5],
    [0.15, -2.55],
    [2.75, -2.45]
  ];

  // Ascending communicating arterioles & descending venules linking deep & superficial plexuses
  for (let i = 0; i < subpapillaryNodes.length; i++) {
    const [nx, nz] = subpapillaryNodes[i];
    const h = evaluateSkinStrata(nx, nz);
    const yTop = h.yPapillaryBottom - 0.04;
    const yBot = h.yReticularBottom + 0.05;

    const midX = nx + (rand() - 0.5) * 0.55;
    const midZ = nz + (rand() - 0.5) * 0.55;

    const ascArt = [
      new THREE.Vector3(nx - 0.25, yBot - 0.15, nz - 0.18),
      new THREE.Vector3(midX - 0.12, THREE.MathUtils.lerp(yBot, yTop, 0.45), midZ - 0.08),
      new THREE.Vector3(nx, yTop, nz)
    ];
    arteryGeoms.push(makeTubeBranch(ascArt, 0.058, 0.034, 24, 8));

    const descVein = [
      new THREE.Vector3(nx + 0.15, yTop - 0.08, nz + 0.14),
      new THREE.Vector3(midX + 0.16, THREE.MathUtils.lerp(yBot, yTop, 0.45) - 0.06, midZ + 0.14),
      new THREE.Vector3(nx + 0.05, yBot - 0.28, nz + 0.08)
    ];
    veinGeoms.push(makeTubeBranch(descVein, 0.044, 0.072, 24, 8));
  }

  // Horizontal subpapillary anastomosing arcades (3x3 lattice)
  const arcadeEdges: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [3, 4],
    [4, 5],
    [6, 7],
    [7, 8],
    [0, 3],
    [1, 4],
    [2, 5],
    [3, 6],
    [4, 7],
    [5, 8]
  ];
  for (const [a, b] of arcadeEdges) {
    const [ax, az] = subpapillaryNodes[a];
    const [bx, bz] = subpapillaryNodes[b];
    const mx = (ax + bx) * 0.5 + (rand() - 0.5) * 0.35;
    const mz = (az + bz) * 0.5 + (rand() - 0.5) * 0.35;

    const ha = evaluateSkinStrata(ax, az);
    const hm = evaluateSkinStrata(mx, mz);
    const hb = evaluateSkinStrata(bx, bz);

    arteryGeoms.push(
      makeTubeBranch(
        [
          new THREE.Vector3(ax, ha.yPapillaryBottom - 0.04, az),
          new THREE.Vector3(mx, hm.yPapillaryBottom - 0.02, mz),
          new THREE.Vector3(bx, hb.yPapillaryBottom - 0.04, bz)
        ],
        0.031,
        0.029,
        20,
        7
      )
    );

    veinGeoms.push(
      makeTubeBranch(
        [
          new THREE.Vector3(ax + 0.14, ha.yPapillaryBottom - 0.12, az + 0.12),
          new THREE.Vector3(mx + 0.14, hm.yPapillaryBottom - 0.1, mz + 0.12),
          new THREE.Vector3(bx + 0.14, hb.yPapillaryBottom - 0.12, bz + 0.12)
        ],
        0.04,
        0.038,
        20,
        7
      )
    );
  }

  // Nutrient vascular branches directly feeding Hair Papillae & Sweat Glomeruli!
  for (const f of TERMINAL_FOLLICLES) {
    const papBase = new THREE.Vector3(f.bulbX, f.bulbY - 0.04, f.bulbZ);
    arteryGeoms.push(
      makeTubeBranch(
        [
          new THREE.Vector3(f.bulbX - 0.55, f.bulbY - 0.42, f.bulbZ + 0.35),
          new THREE.Vector3(f.bulbX - 0.18, f.bulbY - 0.25, f.bulbZ + 0.12),
          papBase
        ],
        0.036,
        0.018,
        16,
        7
      )
    );
    veinGeoms.push(
      makeTubeBranch(
        [
          new THREE.Vector3(f.bulbX + 0.04, f.bulbY - 0.05, f.bulbZ - 0.03),
          new THREE.Vector3(f.bulbX + 0.24, f.bulbY - 0.28, f.bulbZ - 0.18),
          new THREE.Vector3(f.bulbX + 0.62, f.bulbY - 0.48, f.bulbZ - 0.36)
        ],
        0.02,
        0.042,
        16,
        7
      )
    );
  }

  for (const sg of SWEAT_GLANDS) {
    arteryGeoms.push(
      makeTubeBranch(
        [
          new THREE.Vector3(sg.coilX - 0.68, sg.coilY - 0.35, sg.coilZ - 0.25),
          new THREE.Vector3(sg.coilX - sg.coilRadius * 0.82, sg.coilY, sg.coilZ),
          new THREE.Vector3(sg.coilX - sg.coilRadius * 0.4, sg.coilY + 0.22, sg.coilZ + 0.2)
        ],
        0.035,
        0.018,
        16,
        7
      )
    );
    veinGeoms.push(
      makeTubeBranch(
        [
          new THREE.Vector3(sg.coilX + sg.coilRadius * 0.4, sg.coilY + 0.18, sg.coilZ - 0.2),
          new THREE.Vector3(sg.coilX + sg.coilRadius * 0.85, sg.coilY - 0.08, sg.coilZ),
          new THREE.Vector3(sg.coilX + 0.65, sg.coilY - 0.42, sg.coilZ + 0.28)
        ],
        0.022,
        0.042,
        16,
        7
      )
    );
  }

  // Hairpin Capillary Loops (Ansae capillares) rising directly into Dermal Papillae!
  const colArterial = new THREE.Color(0xef293d);
  const colApex = new THREE.Color(0xb22e84);
  const colVenous = new THREE.Color(0x315ed2);

  for (const p of DERMAL_PAPILLAE) {
    if (!p.hasCapillary) continue;
    const h = evaluateSkinStrata(p.x, p.z);
    const yApex = h.yBasaleBottom - 0.055;
    const yBaseArt = h.yPapillaryBottom - 0.04;
    const yBaseVen = h.yPapillaryBottom - 0.12;
    if (yApex <= yBaseArt + 0.18) continue;

    const spread = 0.068;
    const twistAngle = (p.x * 3.1 + p.z * 2.7) % (Math.PI * 2);
    const dx = Math.cos(twistAngle) * spread;
    const dz = Math.sin(twistAngle) * spread;

    const loopCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(p.x - dx * 1.4, yBaseArt, p.z - dz * 1.4),
      new THREE.Vector3(p.x - dx * 0.85, THREE.MathUtils.lerp(yBaseArt, yApex, 0.62), p.z - dz * 0.85),
      new THREE.Vector3(p.x, yApex, p.z),
      new THREE.Vector3(p.x + dx * 0.85, THREE.MathUtils.lerp(yBaseVen, yApex, 0.62), p.z + dz * 0.85),
      new THREE.Vector3(p.x + dx * 1.4, yBaseVen, p.z + dz * 1.4)
    ]);

    capillaryGeoms.push(
      buildVariableTubeGeometry({
        curve: loopCurve,
        tubularSegments: 22,
        radialSegments: 6,
        radiusFn: (u) => (u < 0.5 ? 0.015 : 0.0175),
        capStart: true,
        capEnd: true,
        colorFn: (u) => {
          const c = new THREE.Color();
          if (u < 0.5) {
            c.lerpColors(colArterial, colApex, u * 2.0);
          } else {
            c.lerpColors(colApex, colVenous, (u - 0.5) * 2.0);
          }
          return c;
        }
      })
    );
  }

  // Assemble Vascular Groups
  const artGroup = new THREE.Group();
  const artMat = createBiologicalMaterial({
    color: 0xdc2436,
    roughness: 0.34,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22,
    sheen: 0.3,
    cutInteriorTint: new THREE.Color(0x8f111e),
    clippingPlanes
  });
  artGroup.add(new THREE.Mesh(mergeBufferGeometries(arteryGeoms), artMat));
  artGroup.userData.structureId = 'arteries';
  artGroup.traverse((o) => (o.userData.structureId = 'arteries'));
  groups.set('arteries', artGroup);

  const veinGroup = new THREE.Group();
  const veinMat = createBiologicalMaterial({
    color: 0x2c56c4,
    roughness: 0.38,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
    sheen: 0.28,
    cutInteriorTint: new THREE.Color(0x1b357d),
    clippingPlanes
  });
  veinGroup.add(new THREE.Mesh(mergeBufferGeometries(veinGeoms), veinMat));
  veinGroup.userData.structureId = 'veins';
  veinGroup.traverse((o) => (o.userData.structureId = 'veins'));
  groups.set('veins', veinGroup);

  const capGroup = new THREE.Group();
  const capMat = createBiologicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.32,
    clearcoat: 0.45,
    clippingPlanes
  });
  capGroup.add(new THREE.Mesh(mergeBufferGeometries(capillaryGeoms), capMat));
  capGroup.userData.structureId = 'capillary_loops';
  capGroup.traverse((o) => (o.userData.structureId = 'capillary_loops'));
  groups.set('capillary_loops', capGroup);

  [...arteryGeoms, ...veinGeoms, ...capillaryGeoms].forEach((g) => g.dispose());

  // =========================================================================
  // 2. INNERVATION & SPECIALIZED SENSORY RECEPTORS
  // =========================================================================
  const nerveTrunkGeoms: THREE.BufferGeometry[] = [];

  // Deep cutaneous nerve trunks entering via hypodermis septa & branching into subpapillary nerve plexus
  const mainNerveTrunks: THREE.Vector3[][] = [
    [
      new THREE.Vector3(-4.55, -4.35, 1.45),
      new THREE.Vector3(-2.35, -3.55, 1.55),
      new THREE.Vector3(-0.45, -3.15, 1.25),
      new THREE.Vector3(1.65, -3.35, 1.42),
      new THREE.Vector3(4.45, -3.85, 1.32)
    ],
    [
      new THREE.Vector3(-1.42, -5.85, -1.85),
      new THREE.Vector3(-1.35, -4.15, -1.55),
      new THREE.Vector3(-0.45, -3.15, 1.25)
    ],
    [
      new THREE.Vector3(-0.45, -3.15, 1.25),
      new THREE.Vector3(0.85, -3.35, -0.45),
      new THREE.Vector3(2.25, -3.65, -1.95),
      new THREE.Vector3(4.45, -3.95, -2.25)
    ]
  ];

  for (const pts of mainNerveTrunks) {
    nerveTrunkGeoms.push(makeTubeBranch(pts, 0.068, 0.052, 30, 8));
  }

  // Ascending dermal nerve branches & subpapillary neural ring
  const nerveRisers: Array<[number, number]> = [
    [-2.1, 2.2],
    [0.5, 2.5],
    [2.4, 1.8],
    [-2.3, -0.8],
    [0.1, -0.5],
    [2.5, -0.9]
  ];

  for (const [rx, rz] of nerveRisers) {
    const h = evaluateSkinStrata(rx, rz);
    nerveTrunkGeoms.push(
      makeTubeBranch(
        [
          new THREE.Vector3(rx - 0.25, -3.25, rz - 0.15),
          new THREE.Vector3(rx + 0.12, -1.05, rz + 0.1),
          new THREE.Vector3(rx, h.yPapillaryBottom - 0.18, rz)
        ],
        0.042,
        0.022,
        24,
        7
      )
    );
  }

  // Subpapillary neural connections
  for (let i = 0; i < nerveRisers.length - 1; i++) {
    const [ax, az] = nerveRisers[i];
    const [bx, bz] = nerveRisers[i + 1];
    if (Math.hypot(ax - bx, az - bz) > 3.8) continue;
    const ha = evaluateSkinStrata(ax, az);
    const hb = evaluateSkinStrata(bx, bz);
    nerveTrunkGeoms.push(
      makeTubeBranch(
        [
          new THREE.Vector3(ax, ha.yPapillaryBottom - 0.18, az),
          new THREE.Vector3((ax + bx) * 0.5, (ha.yPapillaryBottom + hb.yPapillaryBottom) * 0.5 - 0.22, (az + bz) * 0.5),
          new THREE.Vector3(bx, hb.yPapillaryBottom - 0.18, bz)
        ],
        0.02,
        0.02,
        18,
        6
      )
    );
  }

  // -------------------------------------------------------------------------
  // A. PACINIAN LAMELLAR CORPUSCLES (Corpuscula lamellosa — 6 concentric shells + central axon!)
  // -------------------------------------------------------------------------
  const pacinianShellGeoms: THREE.BufferGeometry[] = [];
  const pacinianCoreGeoms: THREE.BufferGeometry[] = [];

  for (const pc of PACINIAN_LOCATIONS) {
    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion().setFromEuler(pc.rot);

    // 6 nested concentric ellipsoidal lamellae! Slicing reveals onion-ring cross-section!
    const layerFactors = [0.24, 0.39, 0.54, 0.69, 0.84, 1.0];
    for (const lf of layerFactors) {
      const shell = new THREE.SphereGeometry(1.0, 26, 20);
      shell.scale(0.39 * lf * pc.scale, 0.64 * lf * pc.scale, 0.39 * lf * pc.scale);
      mat4.compose(pc.pos, quat, new THREE.Vector3(1, 1, 1));
      shell.applyMatrix4(mat4);
      pacinianShellGeoms.push(shell);
    }

    // Central unmyelinated sensory axon cylinder + terminal bulb inside core
    const coreCyl = new THREE.CapsuleGeometry(0.032 * pc.scale, 0.78 * pc.scale, 6, 10);
    mat4.compose(pc.pos, quat, new THREE.Vector3(1, 1, 1));
    coreCyl.applyMatrix4(mat4);
    pacinianCoreGeoms.push(coreCyl);

    // Entering myelinated nerve fiber stalk connecting Pacinian corpuscle to deep nerve trunk
    const poleOffset = new THREE.Vector3(0, -0.64 * pc.scale, 0).applyQuaternion(quat);
    const entryPt = pc.pos.clone().add(poleOffset);
    const trunkAnchor = new THREE.Vector3(pc.pos.x * 0.65, -3.45, pc.pos.z * 0.45);
    const stalk = makeTubeBranch(
      [
        trunkAnchor,
        new THREE.Vector3().lerpVectors(trunkAnchor, entryPt, 0.55).add(new THREE.Vector3(0, -0.25, 0)),
        entryPt
      ],
      0.034,
      0.028,
      18,
      7
    );
    pacinianCoreGeoms.push(stalk);
  }

  const pacinianGroup = new THREE.Group();
  const pacShellMat = createBiologicalMaterial({
    color: 0xd9edf7,
    roughness: 0.24,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
    opacity: 0.42, // Semi-transparent concentric lamellae!
    cutInteriorTint: new THREE.Color(0x9bc4da),
    clippingPlanes
  });
  const pacCoreMat = createBiologicalMaterial({
    color: 0xf4c842,
    roughness: 0.3,
    clearcoat: 0.4,
    clippingPlanes
  });
  pacinianGroup.add(
    new THREE.Mesh(mergeBufferGeometries(pacinianShellGeoms), pacShellMat),
    new THREE.Mesh(mergeBufferGeometries(pacinianCoreGeoms), pacCoreMat)
  );
  pacinianShellGeoms.forEach((g) => g.dispose());
  pacinianCoreGeoms.forEach((g) => g.dispose());
  pacinianGroup.userData.structureId = 'pacinian_corpuscle';
  pacinianGroup.traverse((o) => (o.userData.structureId = 'pacinian_corpuscle'));
  groups.set('pacinian_corpuscle', pacinianGroup);

  // -------------------------------------------------------------------------
  // B. MEISSNER TACTILE CORPUSCLES (Corpuscula tactus — stacked Schwann discs + meandering spiral axon!)
  // -------------------------------------------------------------------------
  const meissnerCapsuleGeoms: THREE.BufferGeometry[] = [];
  const meissnerAxonGeoms: THREE.BufferGeometry[] = [];

  for (const p of DERMAL_PAPILLAE) {
    if (!p.hasMeissner) continue;
    const h = evaluateSkinStrata(p.x, p.z);
    const yTop = h.yBasaleBottom - 0.04;
    const height = 0.31;
    const yCenter = yTop - height * 0.5;
    const radius = 0.115;

    // Translucent pinecone capsule
    const cap = new THREE.SphereGeometry(1.0, 20, 16);
    cap.scale(radius, height * 0.52, radius);
    cap.translate(p.x, yCenter, p.z);
    meissnerCapsuleGeoms.push(cap);

    // 6 stacked horizontal Schwann-cell lamellae discs inside the capsule
    const discCount = 6;
    for (let d = 0; d < discCount; d++) {
      const frac = (d + 0.5) / discCount;
      const dy = (frac - 0.5) * height * 0.82;
      const profileR = radius * 0.84 * Math.sin(frac * Math.PI);
      const disc = new THREE.CylinderGeometry(profileR, profileR, 0.018, 14);
      disc.rotateZ((d % 2 === 0 ? 1 : -1) * 0.08);
      disc.translate(p.x, yCenter + dy, p.z);
      meissnerAxonGeoms.push(disc);
    }

    // Zig-zag helical unmyelinated sensory nerve fiber weaving up through the stacked discs + afferent stalk
    const helixPts: THREE.Vector3[] = [
      new THREE.Vector3(p.x - 0.12, h.yPapillaryBottom - 0.18, p.z - 0.08),
      new THREE.Vector3(p.x, yCenter - height * 0.55, p.z)
    ];
    const turns = 4.5;
    const hSteps = 26;
    for (let s = 0; s <= hSteps; s++) {
      const t = s / hSteps;
      const ang = t * Math.PI * 2 * turns;
      const hr = radius * 0.68 * Math.sin(Math.max(0.08, t) * Math.PI);
      helixPts.push(
        new THREE.Vector3(
          p.x + Math.cos(ang) * hr,
          yCenter - height * 0.42 + t * height * 0.84,
          p.z + Math.sin(ang) * hr
        )
      );
    }
    meissnerAxonGeoms.push(makeTubeBranch(helixPts, 0.015, 0.012, 42, 6));
  }

  const meissnerGroup = new THREE.Group();
  const meissnerCapMat = createBiologicalMaterial({
    color: 0xfbe8a6,
    roughness: 0.3,
    clearcoat: 0.45,
    opacity: 0.48,
    clippingPlanes
  });
  const meissnerInnerMat = createBiologicalMaterial({
    color: 0xf0c238,
    roughness: 0.34,
    clearcoat: 0.35,
    clippingPlanes
  });
  meissnerGroup.add(
    new THREE.Mesh(mergeBufferGeometries(meissnerCapsuleGeoms), meissnerCapMat),
    new THREE.Mesh(mergeBufferGeometries(meissnerAxonGeoms), meissnerInnerMat)
  );
  meissnerCapsuleGeoms.forEach((g) => g.dispose());
  meissnerAxonGeoms.forEach((g) => g.dispose());
  meissnerGroup.userData.structureId = 'meissner_corpuscle';
  meissnerGroup.traverse((o) => (o.userData.structureId = 'meissner_corpuscle'));
  groups.set('meissner_corpuscle', meissnerGroup);

  // -------------------------------------------------------------------------
  // C. MERKEL CELL-NEURITE COMPLEXES (Epitheliocyti tactiles et menisci tactus)
  // Located right at the base of epidermal rete ridges in Stratum Basale!
  // -------------------------------------------------------------------------
  const merkelCellGeoms: THREE.BufferGeometry[] = [];
  const merkelDiscGeoms: THREE.BufferGeometry[] = [];

  const merkelClusterCenters: Array<[number, number]> = [
    [0.45, 2.75],
    [-0.75, 3.45],
    [2.15, 1.05],
    [-2.65, 1.45],
    [1.25, -0.85],
    [-1.15, -2.15]
  ];

  for (const [cx, cz] of merkelClusterCenters) {
    const hCenter = evaluateSkinStrata(cx, cz);
    const stemBase = new THREE.Vector3(cx, hCenter.yPapillaryBottom - 0.16, cz);
    const stemBranchPt = new THREE.Vector3(cx, hCenter.yBasaleBottom - 0.22, cz);
    merkelDiscGeoms.push(makeTubeBranch([stemBase, stemBranchPt], 0.018, 0.014, 10, 6));

    // 4 Merkel cell + cup-disc pairs per cluster
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + cx;
      const mx = cx + Math.cos(ang) * 0.15;
      const mz = cz + Math.sin(ang) * 0.15;
      const hm = evaluateSkinStrata(mx, mz);
      const my = hm.yBasaleBottom + 0.048; // Right inside Stratum Basale!

      // Oval Merkel cell
      const cell = new THREE.SphereGeometry(0.052, 14, 12);
      cell.scale(1.0, 1.18, 1.0);
      cell.translate(mx, my, mz);
      merkelCellGeoms.push(cell);

      // Cup-like tactile meniscus cradling underside of Merkel cell
      const cup = new THREE.CylinderGeometry(0.056, 0.024, 0.032, 12);
      cup.translate(mx, my - 0.052, mz);
      merkelDiscGeoms.push(cup);

      // Fine afferent neurite twig connecting stemBranchPt to meniscus cup
      merkelDiscGeoms.push(
        makeTubeBranch(
          [
            stemBranchPt,
            new THREE.Vector3(
              THREE.MathUtils.lerp(cx, mx, 0.6),
              THREE.MathUtils.lerp(stemBranchPt.y, my - 0.06, 0.55),
              THREE.MathUtils.lerp(cz, mz, 0.6)
            ),
            new THREE.Vector3(mx, my - 0.06, mz)
          ],
          0.012,
          0.01,
          10,
          5
        )
      );
    }
  }

  const merkelGroup = new THREE.Group();
  const merkelCellMat = createBiologicalMaterial({
    color: 0x72d8ec,
    roughness: 0.28,
    clearcoat: 0.5,
    sheen: 0.3,
    clippingPlanes
  });
  const merkelDiscMat = createBiologicalMaterial({
    color: 0xf5cc49,
    roughness: 0.32,
    clearcoat: 0.38,
    clippingPlanes
  });
  merkelGroup.add(
    new THREE.Mesh(mergeBufferGeometries(merkelCellGeoms), merkelCellMat),
    new THREE.Mesh(mergeBufferGeometries(merkelDiscGeoms), merkelDiscMat)
  );
  merkelCellGeoms.forEach((g) => g.dispose());
  merkelDiscGeoms.forEach((g) => g.dispose());
  merkelGroup.userData.structureId = 'merkel_complex';
  merkelGroup.traverse((o) => (o.userData.structureId = 'merkel_complex'));
  groups.set('merkel_complex', merkelGroup);

  // -------------------------------------------------------------------------
  // D. FREE INTRAEPIDERMAL NERVE ENDINGS (Terminationes nervorum liberae)
  // Unmyelinated A-delta & C arborizations penetrating into Stratum Spinosum & Granulosum!
  // -------------------------------------------------------------------------
  const freeEndingGeoms: THREE.BufferGeometry[] = [];
  const freeEndingSeeds: Array<[number, number]> = [
    [2.2, 0.6],
    [-0.2, 1.6],
    [1.6, 3.1],
    [-2.4, 2.9],
    [-3.4, -0.4],
    [3.3, -1.5],
    [-0.9, -2.9],
    [2.6, -3.2],
    [3.5, 2.8],
    [-3.5, -2.8],
    [0.8, -0.2],
    [-1.6, 0.9]
  ];

  for (let i = 0; i < freeEndingSeeds.length; i++) {
    const [fx, fz] = freeEndingSeeds[i];
    if (Math.abs(fx) > BLOCK_HALF_W - 0.3 || Math.abs(fz) > BLOCK_HALF_D - 0.3) continue;
    const h = evaluateSkinStrata(fx, fz);

    const rootPt = new THREE.Vector3(fx, h.yPapillaryBottom - 0.2, fz);
    const dejPt = new THREE.Vector3(fx + 0.04, h.yBasaleBottom - 0.05, fz - 0.03);
    freeEndingGeoms.push(makeTubeBranch([rootPt, dejPt], 0.016, 0.011, 12, 5));

    // 3 fine intraepidermal terminal twigs reaching up into Stratum Spinosum / Granulosum
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2 + i * 1.1;
      const spread = 0.14 + (b % 2) * 0.08;
      const tipX = fx + Math.cos(ang) * spread;
      const tipZ = fz + Math.sin(ang) * spread;
      const hTip = evaluateSkinStrata(tipX, tipZ);
      const tipY = hTip.yGranulosumBottom - 0.02 - (b % 2) * 0.08;

      const mid = new THREE.Vector3(
        THREE.MathUtils.lerp(dejPt.x, tipX, 0.5) + (rand() - 0.5) * 0.06,
        THREE.MathUtils.lerp(dejPt.y, tipY, 0.55),
        THREE.MathUtils.lerp(dejPt.z, tipZ, 0.5) + (rand() - 0.5) * 0.06
      );
      const tip = new THREE.Vector3(tipX, tipY, tipZ);
      freeEndingGeoms.push(makeTubeBranch([dejPt, mid, tip], 0.01, 0.0055, 12, 5));

      // Tiny sensory varicosity bead at terminal tip
      const bead = new THREE.SphereGeometry(0.016, 8, 8);
      bead.translate(tipX, tipY, tipZ);
      freeEndingGeoms.push(bead);
    }
  }

  const freeGroup = new THREE.Group();
  const freeMat = createBiologicalMaterial({
    color: 0xf9df78,
    roughness: 0.32,
    clearcoat: 0.35,
    clippingPlanes
  });
  freeGroup.add(new THREE.Mesh(mergeBufferGeometries(freeEndingGeoms), freeMat));
  freeEndingGeoms.forEach((g) => g.dispose());
  freeGroup.userData.structureId = 'free_nerve_endings';
  freeGroup.traverse((o) => (o.userData.structureId = 'free_nerve_endings'));
  groups.set('free_nerve_endings', freeGroup);

  // -------------------------------------------------------------------------
  // E. PERIFOLLICULAR LANCEOLATE NERVE PLEXUS (Plexus nervosus perifollicularis)
  // Basket-like circumferential rings + palisade lanceolate endings wrapping around hair follicles!
  // -------------------------------------------------------------------------
  const follNerveGeoms: THREE.BufferGeometry[] = [];
  const upVec = new THREE.Vector3(0, 1, 0);

  for (const f of TERMINAL_FOLLICLES) {
    const { follicleCurve } = getFollicleAxisPoints(f);
    const collarU = 0.58; // Just below sebaceous gland in isthmus/bulge sensory collar!
    const center = follicleCurve.getPointAt(collarU);
    const tangent = follicleCurve.getTangentAt(collarU).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(upVec, tangent);
    const collarR = f.sheathRadius * 1.14;

    // 3 circumferential sensory nerve rings around follicle sheath
    for (const dy of [-0.11, 0.0, 0.11]) {
      const ring = new THREE.TorusGeometry(collarR, 0.013, 8, 28);
      ring.rotateX(Math.PI * 0.5);
      ring.translate(0, dy, 0);
      const m4 = new THREE.Matrix4().compose(center, quat, new THREE.Vector3(1, 1, 1));
      ring.applyMatrix4(m4);
      follNerveGeoms.push(ring);
    }

    // 10 longitudinal palisade lanceolate nerve endings hugging follicle circumference
    const palisadeCount = 10;
    for (let k = 0; k < palisadeCount; k++) {
      const ang = (k / palisadeCount) * Math.PI * 2;
      const lance = new THREE.CapsuleGeometry(0.013, 0.28, 4, 6);
      lance.translate(Math.cos(ang) * collarR, 0, Math.sin(ang) * collarR);
      const m4 = new THREE.Matrix4().compose(center, quat, new THREE.Vector3(1, 1, 1));
      lance.applyMatrix4(m4);
      follNerveGeoms.push(lance);
    }

    // Feeding afferent nerve branch connecting perifollicular collar to dermal nerve plexus
    const feedStart = new THREE.Vector3(center.x - 0.65, center.y - 0.42, center.z + 0.45);
    const feedEnd = center
      .clone()
      .add(new THREE.Vector3(-collarR, 0, 0).applyQuaternion(quat));
    follNerveGeoms.push(
      makeTubeBranch(
        [
          feedStart,
          new THREE.Vector3().lerpVectors(feedStart, feedEnd, 0.55),
          feedEnd
        ],
        0.022,
        0.015,
        14,
        6
      )
    );
  }

  const follNerveGroup = new THREE.Group();
  const follNerveMat = createBiologicalMaterial({
    color: 0xf7ca42,
    roughness: 0.3,
    clearcoat: 0.4,
    clippingPlanes
  });
  follNerveGroup.add(new THREE.Mesh(mergeBufferGeometries(follNerveGeoms), follNerveMat));
  follNerveGeoms.forEach((g) => g.dispose());
  follNerveGroup.userData.structureId = 'follicular_nerves';
  follNerveGroup.traverse((o) => (o.userData.structureId = 'follicular_nerves'));
  groups.set('follicular_nerves', follNerveGroup);

  // Assemble Cutaneous Nerve Trunks Group
  const trunkGroup = new THREE.Group();
  const trunkMat = createBiologicalMaterial({
    color: 0xe9c446,
    roughness: 0.34,
    clearcoat: 0.42,
    sheen: 0.25,
    cutInteriorTint: new THREE.Color(0xc29c25),
    clippingPlanes
  });
  trunkGroup.add(new THREE.Mesh(mergeBufferGeometries(nerveTrunkGeoms), trunkMat));
  nerveTrunkGeoms.forEach((g) => g.dispose());
  trunkGroup.userData.structureId = 'nerve_trunks';
  trunkGroup.traverse((o) => (o.userData.structureId = 'nerve_trunks'));
  groups.set('nerve_trunks', trunkGroup);

  return groups;
}
