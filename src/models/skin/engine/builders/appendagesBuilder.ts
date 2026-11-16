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
  evaluateSkinStrata,
  SWEAT_GLANDS,
  TERMINAL_FOLLICLES,
  TerminalFollicleSpec,
  VELLUS_FOLLICLES
} from '../skinHeightfield';

/**
 * Builds the curved central axis of a terminal hair follicle from bulb base up to hair tip above skin
 */
export function getFollicleAxisPoints(f: TerminalFollicleSpec): {
  follicleCurve: THREE.CatmullRomCurve3;
  fullHairCurve: THREE.CatmullRomCurve3;
  surfacePoint: THREE.Vector3;
  bulbCenter: THREE.Vector3;
  axisDirAtBulb: THREE.Vector3;
} {
  const hSurf = evaluateSkinStrata(f.ostiumX, f.ostiumZ);
  const surfacePoint = new THREE.Vector3(f.ostiumX, hSurf.ySurface - 0.04, f.ostiumZ);
  const bulbCenter = new THREE.Vector3(f.bulbX, f.bulbY, f.bulbZ);

  // Subtle organic curve along intradermal follicle root
  const mid1 = new THREE.Vector3().lerpVectors(bulbCenter, surfacePoint, 0.34);
  mid1.x += 0.06;
  mid1.z -= 0.04;

  const mid2 = new THREE.Vector3().lerpVectors(bulbCenter, surfacePoint, 0.72);
  mid2.x += 0.03;

  const follicleCurve = new THREE.CatmullRomCurve3([bulbCenter, mid1, mid2, surfacePoint]);

  // Above-skin shaft arches naturally due to gravity
  const aboveMid = new THREE.Vector3(
    THREE.MathUtils.lerp(f.ostiumX, f.tipX, 0.52),
    THREE.MathUtils.lerp(surfacePoint.y, f.tipY, 0.58),
    THREE.MathUtils.lerp(f.ostiumZ, f.tipZ, 0.52)
  );
  const tipPoint = new THREE.Vector3(f.tipX, f.tipY, f.tipZ);

  // Telogen club hair starts slightly higher inside its resting capsule
  const hairStart =
    f.phase === 'telogen'
      ? follicleCurve.getPointAt(0.12)
      : follicleCurve.getPointAt(0.035);

  const fullHairCurve = new THREE.CatmullRomCurve3([
    hairStart,
    follicleCurve.getPointAt(0.36),
    follicleCurve.getPointAt(0.74),
    surfacePoint,
    aboveMid,
    tipPoint
  ]);

  const axisDirAtBulb = follicleCurve.getTangentAt(0.02).normalize();

  return { follicleCurve, fullHairCurve, surfacePoint, bulbCenter, axisDirAtBulb };
}

/**
 * Creates a cup-invaginated 3D hair bulb geometry (pear-shaped outer contour + concave basal pocket for dermal papilla!)
 */
function buildInvaginatedHairBulb(
  bulbRadius: number,
  bulbHeight: number,
  isTelogen: boolean
): THREE.BufferGeometry {
  // Lathe profile around Y axis: from inner papilla cavity rim up over outer bulb dome
  const pts: THREE.Vector2[] = [];
  const segs = 28;

  if (isTelogen) {
    // Telogen club-hair bulb: compact rounded club without deep papilla invagination
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const angle = t * Math.PI;
      const r = Math.sin(angle) * bulbRadius * (0.85 + 0.15 * Math.cos(t * Math.PI));
      const y = -Math.cos(angle) * bulbHeight * 0.5;
      pts.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
  } else {
    // Anagen / Catagen bulb: concave invaginated pocket at bottom [0..8], then wide onion bulb [9..28]
    const cavSteps = 10;
    for (let i = 0; i <= cavSteps; i++) {
      const t = i / cavSteps; // 0 = top of inner papilla dome, 1 = bottom basal rim
      const r = Math.sin(t * Math.PI * 0.88) * bulbRadius * 0.48;
      const y = -bulbHeight * 0.12 - (1 - Math.cos(t * Math.PI * 0.88)) * bulbHeight * 0.36;
      pts.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    const outerSteps = 20;
    for (let i = 1; i <= outerSteps; i++) {
      const t = i / outerSteps; // 0 = bottom rim, 1 = upper neck merging into follicle sheath
      const bulge = Math.sin(t * Math.PI * 0.86);
      const r =
        bulbRadius * (0.35 + 0.72 * bulge) * (1 - 0.25 * Math.pow(t, 2.2));
      const y = -bulbHeight * 0.48 + t * bulbHeight * 1.05;
      pts.push(new THREE.Vector2(Math.max(0.02, r), y));
    }
  }

  const geom = new THREE.LatheGeometry(pts, 28);
  // Subtle organic asymmetry
  const pos = geom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1.0 + fbm3D(x * 4.5, y * 4.5, z * 4.5, 2) * 0.05;
    pos.setXYZ(i, x * n, y, z * n);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a vascularized pear-shaped dermal papilla of the hair follicle (papilla pili)
 */
function buildDermalPapillaOfHair(radius: number, height: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = narrow stalk at bottom, 1 = rounded apex inside bulb
    const profile =
      t < 0.25
        ? 0.28 + t * 2.2
        : Math.sin(((t - 0.1) / 0.9) * Math.PI);
    const r = Math.max(0.001, radius * profile);
    const y = -height * 0.55 + t * height;
    pts.push(new THREE.Vector2(r, y));
  }
  const geom = new THREE.LatheGeometry(pts, 20);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a multi-lobular grape-like sebaceous gland + short excretory duct opening into follicular infundibulum
 */
function buildSebaceousGlandCluster(
  f: TerminalFollicleSpec,
  follicleCurve: THREE.CatmullRomCurve3,
  seed: number
): THREE.BufferGeometry {
  const rand = createSeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];

  // Duct enters follicle infundibulum around u = 0.76 (upper reticular dermis)
  const attachPt = follicleCurve.getPointAt(0.75);
  const dirX = Math.cos(f.sebaceousAngle);
  const dirZ = Math.sin(f.sebaceousAngle);
  const perpX = -dirZ;
  const perpZ = dirX;

  const glandCenter = new THREE.Vector3(
    attachPt.x + dirX * (f.sheathRadius + 0.36),
    attachPt.y - 0.16,
    attachPt.z + dirZ * (f.sheathRadius + 0.36)
  );

  // Short excretory duct from cluster to follicular canal
  const ductCurve = new THREE.CatmullRomCurve3([
    glandCenter.clone(),
    new THREE.Vector3(
      attachPt.x + dirX * (f.sheathRadius + 0.12),
      attachPt.y - 0.04,
      attachPt.z + dirZ * (f.sheathRadius + 0.12)
    ),
    attachPt.clone()
  ]);
  parts.push(
    buildVariableTubeGeometry({
      curve: ductCurve,
      tubularSegments: 10,
      radialSegments: 10,
      radiusFn: (u) => THREE.MathUtils.lerp(0.11, 0.065, u),
      capStart: true,
      capEnd: true
    })
  );

  // 9 coalescing grape-like alveolar lobules (acini) of varied sizes & organic bumps
  const aciniOffsets: Array<[number, number, number, number]> = [
    [0.0, 0.0, 0.0, 0.22],
    [0.18, 0.08, 0.14, 0.18],
    [0.16, -0.1, -0.15, 0.19],
    [-0.08, 0.14, 0.18, 0.16],
    [-0.06, 0.12, -0.17, 0.16],
    [0.29, -0.04, 0.02, 0.17],
    [0.08, -0.19, 0.08, 0.165],
    [0.24, 0.13, -0.08, 0.145],
    [-0.12, -0.11, -0.05, 0.15]
  ];

  for (let i = 0; i < aciniOffsets.length; i++) {
    const [dFwd, dUp, dLat, rad] = aciniOffsets[i];
    const scaleFactor = f.phase === 'telogen' ? 0.84 : 1.0;
    const acinus = new THREE.IcosahedronGeometry(rad * scaleFactor, 2);
    const pos = acinus.getAttribute('position');
    const v = new THREE.Vector3();

    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const bump = 1.0 + fbm3D(v.x * 5 + i, v.y * 5, v.z * 5 + seed * 0.01, 2) * 0.16;
      v.multiplyScalar(bump);
      // Slightly pear-elongated toward the duct
      pos.setXYZ(k, v.x * (0.95 + rand() * 0.08), v.y * 0.92, v.z * (0.95 + rand() * 0.08));
    }
    acinus.computeVertexNormals();

    acinus.translate(
      glandCenter.x + dirX * dFwd + perpX * dLat,
      glandCenter.y + dUp,
      glandCenter.z + dirZ * dFwd + perpZ * dLat
    );
    parts.push(acinus);
  }

  const merged = mergeBufferGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * Builds the multi-fascicle smooth muscle arrector pili:
 * originates at the follicle bulge BELOW the sebaceous gland, cradles right underneath
 * the sebaceous lobules, and fans out obliquely upward into the papillary dermis!
 */
function buildArrectorPiliMuscle(
  f: TerminalFollicleSpec,
  follicleCurve: THREE.CatmullRomCurve3
): THREE.BufferGeometry {
  const fascicles: THREE.BufferGeometry[] = [];
  const dirX = Math.cos(f.sebaceousAngle);
  const dirZ = Math.sin(f.sebaceousAngle);
  const perpX = -dirZ;
  const perpZ = dirX;

  // Origin at follicular bulge (u = 0.56, well below sebaceous duct at u = 0.75)
  const bulgePt = follicleCurve.getPointAt(0.55);

  // Insertion in papillary dermis on the obtuse slant side (~1.65 units away horizontally)
  const insDist = f.phase === 'telogen' ? 1.42 : 1.72;
  const insBaseX = f.ostiumX + dirX * insDist;
  const insBaseZ = f.ostiumZ + dirZ * insDist;
  const hIns = evaluateSkinStrata(insBaseX, insBaseZ);
  const insBaseY = hIns.yPapillaryBottom + 0.34;

  // 5 closely bundled fusiform smooth muscle fascicles that fan slightly at dermal insertion
  const fascicleCount = 5;
  for (let i = 0; i < fascicleCount; i++) {
    const spread = (i / (fascicleCount - 1) - 0.5) * 2; // -1..1
    const origin = new THREE.Vector3(
      bulgePt.x + dirX * (f.sheathRadius * 0.82) + perpX * spread * 0.045,
      bulgePt.y + Math.abs(spread) * 0.04,
      bulgePt.z + dirZ * (f.sheathRadius * 0.82) + perpZ * spread * 0.045
    );

    // Mid-belly bows slightly downward & outward so it cradles right beneath the sebaceous gland!
    const belly1 = new THREE.Vector3(
      THREE.MathUtils.lerp(origin.x, insBaseX, 0.35) + dirX * 0.14 + perpX * spread * 0.065,
      THREE.MathUtils.lerp(origin.y, insBaseY, 0.28) - 0.12,
      THREE.MathUtils.lerp(origin.z, insBaseZ, 0.35) + dirZ * 0.14 + perpZ * spread * 0.065
    );

    const belly2 = new THREE.Vector3(
      THREE.MathUtils.lerp(origin.x, insBaseX, 0.68) + perpX * spread * 0.095,
      THREE.MathUtils.lerp(origin.y, insBaseY, 0.66) - 0.04,
      THREE.MathUtils.lerp(origin.z, insBaseZ, 0.68) + perpZ * spread * 0.095
    );

    const insertion = new THREE.Vector3(
      insBaseX + perpX * spread * 0.15,
      insBaseY + (1 - Math.abs(spread)) * 0.05,
      insBaseZ + perpZ * spread * 0.15
    );

    const curve = new THREE.CatmullRomCurve3([origin, belly1, belly2, insertion]);
    const g = buildVariableTubeGeometry({
      curve,
      tubularSegments: 24,
      radialSegments: 8,
      radiusFn: (u, theta) => {
        // Fusiform muscle belly: tapered elastic tendons at ends, plump middle belly
        const fusiform = 0.32 + 0.68 * Math.sin(u * Math.PI);
        const oval = 1.0 + 0.18 * Math.cos(theta * 2);
        return 0.046 * fusiform * oval;
      },
      capStart: true,
      capEnd: true
    });
    fascicles.push(g);
  }

  const merged = mergeBufferGeometries(fascicles);
  for (const fg of fascicles) fg.dispose();
  return merged;
}

/**
 * Builds a genuine 3D convoluted tubular eccrine sweat gland:
 * 1) Tightly self-weaving 3D coiled secretory glomerulus (NOT a ball!)
 * 2) Gently undulating dermal excretory duct + corkscrew intraepidermal acrosyringium opening at surface pore!
 */
function buildSingleEccrineSweatGland(sgIdx: number): {
  secretoryGeom: THREE.BufferGeometry;
  ductGeom: THREE.BufferGeometry;
} {
  const sg = SWEAT_GLANDS[sgIdx];
  const hSurf = evaluateSkinStrata(sg.poreX, sg.poreZ);

  // 1. Secretory coiled tubule: smooth parametric 3D space knot (Lissajous-toroidal convoluted coil)
  const coilPts: THREE.Vector3[] = [];
  const coilSamples = 95;
  const R = sg.coilRadius;
  const phaseShift = sgIdx * 1.35;

  for (let i = 0; i <= coilSamples; i++) {
    const t = i / coilSamples; // 0 = blind secretory start, 1 = top exit into dermal duct
    const a = t * Math.PI * 2 * 4.6 + phaseShift;
    const b = t * Math.PI * 2 * 2.9 + phaseShift * 0.7;
    const c = t * Math.PI * 2 * 3.7 - phaseShift * 0.4;

    // Envelope tapers cleanly into vertical ascending duct as t -> 1
    const exitBlend = Math.pow(Math.max(0, (t - 0.86) / 0.14), 2);

    const localX =
      (Math.cos(a) * 0.56 + Math.sin(b) * 0.36 + Math.cos(c * 1.5) * 0.16) * R;
    const localY =
      (Math.sin(a * 0.85) * 0.46 + Math.cos(c) * 0.32 + (t - 0.5) * 0.55) * R;
    const localZ =
      (Math.sin(a) * 0.56 + Math.cos(b * 1.1) * 0.34 + Math.sin(c * 1.3) * 0.16) * R;

    const targetExitX = sg.poreX + 0.04;
    const targetExitY = sg.coilY + R * 0.85;
    const targetExitZ = sg.poreZ - 0.03;

    coilPts.push(
      new THREE.Vector3(
        THREE.MathUtils.lerp(sg.coilX + localX, targetExitX, exitBlend),
        THREE.MathUtils.lerp(sg.coilY + localY, targetExitY, exitBlend),
        THREE.MathUtils.lerp(sg.coilZ + localZ, targetExitZ, exitBlend)
      )
    );
  }

  // Relax any overly close non-adjacent segments so coiled tube looks authentically packed without ugly self-clipping
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < coilPts.length - 3; i++) {
      for (let j = i + 6; j < coilPts.length - 2; j++) {
        const diff = new THREE.Vector3().subVectors(coilPts[i], coilPts[j]);
        const d = diff.length();
        const minD = 0.145;
        if (d < minD && d > 1e-4) {
          diff.multiplyScalar(((minD - d) * 0.45) / d);
          coilPts[i].add(diff);
          coilPts[j].sub(diff);
        }
      }
    }
  }

  const secretoryCurve = new THREE.CatmullRomCurve3(coilPts);
  const secretoryGeom = buildVariableTubeGeometry({
    curve: secretoryCurve,
    tubularSegments: 190,
    radialSegments: 10,
    radiusFn: (u) => {
      // Blind rounded ampulla at u=0, subtle myoepithelial acinar undulations, tapering slightly to duct at u=1
      const startAmpulla = u < 0.03 ? Math.sin((u / 0.03) * Math.PI * 0.5) : 1.0;
      const acinarWave = 1.0 + 0.11 * Math.sin(u * 95.0);
      const ductTransition = THREE.MathUtils.lerp(0.068, 0.046, Math.pow(u, 3));
      return Math.max(0.006, ductTransition * startAmpulla * acinarWave);
    },
    capStart: true,
    capEnd: true
  });

  // 2. Ascending dermal duct + tightly helical intraepidermal acrosyringium!
  const ductPts: THREE.Vector3[] = [];
  const coilEnd = coilPts[coilPts.length - 1].clone();
  const yDEJ = hSurf.yBasaleBottom;
  const yPore = hSurf.ySurface - 0.015;

  // Dermal portion: 28 smooth segments with gentle physiological sinuosity
  const dermalSteps = 28;
  for (let i = 0; i <= dermalSteps; i++) {
    const t = i / dermalSteps;
    const y = THREE.MathUtils.lerp(coilEnd.y, yDEJ, t);
    const sway = Math.sin(t * Math.PI * 3.2 + sgIdx) * 0.085 * (1 - t * 0.5);
    const swayZ = Math.cos(t * Math.PI * 2.7 + sgIdx) * 0.085 * (1 - t * 0.5);
    const x = THREE.MathUtils.lerp(coilEnd.x, sg.poreX, t) + sway;
    const z = THREE.MathUtils.lerp(coilEnd.z, sg.poreZ, t) + swayZ;
    ductPts.push(new THREE.Vector3(x, y, z));
  }

  // Intraepidermal spiral acrosyringium: 5.5 crisp helical corkscrew turns from yDEJ up to sweat pore!
  const spiralSteps = 46;
  const spiralTurns = 5.5;
  for (let i = 1; i <= spiralSteps; i++) {
    const t = i / spiralSteps;
    const y = THREE.MathUtils.lerp(yDEJ, yPore, t);
    const theta = t * Math.PI * 2 * spiralTurns;
    // Helical radius narrows right at the pore funnel
    const helixR = 0.058 * Math.sin(Math.min(1, t * 4) * Math.PI * 0.5) * (1 - 0.55 * Math.pow(t, 3));
    ductPts.push(
      new THREE.Vector3(
        sg.poreX + Math.cos(theta) * helixR,
        y,
        sg.poreZ + Math.sin(theta) * helixR
      )
    );
  }

  const ductCurve = new THREE.CatmullRomCurve3(ductPts);
  const ductGeom = buildVariableTubeGeometry({
    curve: ductCurve,
    tubularSegments: 140,
    radialSegments: 9,
    radiusFn: (u) => {
      // Slightly narrower spiral channel in epidermis, subtle pore rim flare at very end
      if (u > 0.97) {
        return THREE.MathUtils.lerp(0.032, 0.052, (u - 0.97) / 0.03);
      }
      return u < 0.62 ? 0.043 : 0.033;
    },
    capStart: false,
    capEnd: true
  });

  return { secretoryGeom, ductGeom };
}

export function buildSkinAppendages(
  textures: TissueTextureSet,
  clippingPlanes: THREE.Plane[]
): Map<AnatomyStructureId, THREE.Group> {
  const groups = new Map<AnatomyStructureId, THREE.Group>();

  const shaftGeoms: THREE.BufferGeometry[] = [];
  const sheathOuterGeoms: THREE.BufferGeometry[] = [];
  const sheathInnerGeoms: THREE.BufferGeometry[] = [];
  const bulbGeoms: THREE.BufferGeometry[] = [];
  const papillaGeoms: THREE.BufferGeometry[] = [];
  const sebaceousGeoms: THREE.BufferGeometry[] = [];
  const arrectorGeoms: THREE.BufferGeometry[] = [];

  const upVec = new THREE.Vector3(0, 1, 0);

  for (const f of TERMINAL_FOLLICLES) {
    const { follicleCurve, fullHairCurve, bulbCenter, axisDirAtBulb } =
      getFollicleAxisPoints(f);

    // 1. Hair shaft & root (Scapus et radix pili)
    shaftGeoms.push(
      buildVariableTubeGeometry({
        curve: fullHairCurve,
        tubularSegments: 84,
        radialSegments: 12,
        radiusFn: (u, theta) => {
          // Slight bulb root flare near u=0, constant cortex shaft in middle, smooth fine taper to tip at u=1
          const rootFlare = u < 0.08 ? 1.0 + (1 - u / 0.08) * 0.45 : 1.0;
          const tipTaper = u > 0.55 ? Math.max(0.08, 1.0 - Math.pow((u - 0.55) / 0.45, 1.45)) : 1.0;
          const elliptical = 1.0 + 0.13 * Math.cos(theta * 2);
          return f.shaftRadius * rootFlare * tipTaper * elliptical;
        },
        capStart: true,
        capEnd: true
      })
    );

    // 2. Concentric Inner & Outer Root Sheaths (Vaginabuli radicis pili)
    const sheathPoints: THREE.Vector3[] = [];
    const sStart = f.phase === 'telogen' ? 0.08 : 0.055;
    for (let k = 0; k <= 24; k++) {
      const u = THREE.MathUtils.lerp(sStart, 0.992, k / 24);
      sheathPoints.push(follicleCurve.getPointAt(u));
    }
    const sheathCurve = new THREE.CatmullRomCurve3(sheathPoints);

    // Outer root sheath (with anatomical bulge at u ~ 0.52 and funnel ostium flare at top)
    sheathOuterGeoms.push(
      buildVariableTubeGeometry({
        curve: sheathCurve,
        tubularSegments: 48,
        radialSegments: 16,
        radiusFn: (u, theta) => {
          const bulge =
            0.16 *
            Math.exp(-Math.pow((u - 0.52) / 0.11, 2)) *
            Math.max(0, Math.cos(theta - f.sebaceousAngle));
          const infundibulumFlare = u > 0.86 ? Math.pow((u - 0.86) / 0.14, 2) * 0.28 : 0;
          const lowerSwell = u < 0.16 ? Math.sin(((0.16 - u) / 0.16) * Math.PI * 0.5) * 0.24 : 0;
          return f.sheathRadius * (1.0 + bulge + infundibulumFlare + lowerSwell);
        },
        capStart: true,
        capEnd: true
      })
    );

    // Inner root sheath (terminates near sebaceous duct isthmus u ~ 0.76)
    const innerPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 18; k++) {
      const u = THREE.MathUtils.lerp(sStart, 0.76, k / 18);
      innerPts.push(follicleCurve.getPointAt(u));
    }
    sheathInnerGeoms.push(
      buildVariableTubeGeometry({
        curve: new THREE.CatmullRomCurve3(innerPts),
        tubularSegments: 32,
        radialSegments: 12,
        radiusFn: (u) => f.sheathRadius * 0.68 * (1.0 - 0.18 * Math.pow(u, 3)),
        capStart: true,
        capEnd: true
      })
    );

    // 3. Hair Bulb (Bulbus pili) oriented cleanly along follicle slant axis
    const bulbR =
      f.phase === 'anagen'
        ? f.sheathRadius * 1.72
        : f.phase === 'catagen'
          ? f.sheathRadius * 1.45
          : f.sheathRadius * 1.22;
    const bulbH =
      f.phase === 'anagen' ? 0.68 : f.phase === 'catagen' ? 0.52 : 0.38;

    const bulbG = buildInvaginatedHairBulb(bulbR, bulbH, f.phase === 'telogen');
    const bulbQuat = new THREE.Quaternion().setFromUnitVectors(upVec, axisDirAtBulb);
    const bulbMat4 = new THREE.Matrix4().compose(
      bulbCenter.clone().addScaledVector(axisDirAtBulb, bulbH * 0.22),
      bulbQuat,
      new THREE.Vector3(1, 1, 1)
    );
    bulbG.applyMatrix4(bulbMat4);
    bulbGeoms.push(bulbG);

    // 4. Dermal Papilla of Hair (Papilla pili) nestled inside basal invagination of bulb!
    const papScale = f.phase === 'anagen' ? 1.0 : f.phase === 'catagen' ? 0.72 : 0.48;
    const papG = buildDermalPapillaOfHair(bulbR * 0.42 * papScale, bulbH * 0.48 * papScale);
    const papOffset = f.phase === 'telogen' ? -bulbH * 0.22 : -bulbH * 0.04;
    const papMat4 = new THREE.Matrix4().compose(
      bulbCenter.clone().addScaledVector(axisDirAtBulb, papOffset),
      bulbQuat,
      new THREE.Vector3(1, 1, 1)
    );
    papG.applyMatrix4(papMat4);
    papillaGeoms.push(papG);

    // 5. Lobular Sebaceous Gland (Glandula sebacea)
    sebaceousGeoms.push(buildSebaceousGlandCluster(f, follicleCurve, 400 + f.id * 97));

    // 6. Arrector Pili smooth muscle (Musculus arrector pili)
    arrectorGeoms.push(buildArrectorPiliMuscle(f, follicleCurve));
  }

  // Assemble terminal hair groups
  // A. Hair Shaft & Root
  const shaftGroup = new THREE.Group();
  const shaftMat = createBiologicalMaterial({
    color: 0x3b2417,
    roughness: 0.34,
    metalness: 0.06,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    sheen: 0.45,
    sheenColor: 0x8c5b3e,
    cutInteriorTint: new THREE.Color(0x6e4730),
    clippingPlanes
  });
  const shaftMesh = new THREE.Mesh(mergeBufferGeometries(shaftGeoms), shaftMat);
  shaftMesh.castShadow = true;
  shaftGroup.add(shaftMesh);
  shaftGroup.userData.structureId = 'hair_shaft';
  shaftGroup.traverse((o) => (o.userData.structureId = 'hair_shaft'));
  groups.set('hair_shaft', shaftGroup);

  // B. Follicle Sheaths (Outer + Inner concentric sheaths)
  const sheathGroup = new THREE.Group();
  const outerSheathMat = createBiologicalMaterial({
    color: 0xe6ada6,
    map: textures.spinosumMap,
    bumpMap: textures.spinosumBump,
    bumpScale: 0.02,
    roughness: 0.48,
    opacity: 0.74, // Semi-translucent so dark hair root & inner sheath show inside!
    cutInteriorTint: new THREE.Color(0xc97f79),
    clippingPlanes
  });
  const innerSheathMat = createBiologicalMaterial({
    color: 0xf4d4ce,
    roughness: 0.42,
    opacity: 0.86,
    cutInteriorTint: new THREE.Color(0xdcb0a8),
    clippingPlanes
  });
  sheathGroup.add(
    new THREE.Mesh(mergeBufferGeometries(sheathOuterGeoms), outerSheathMat),
    new THREE.Mesh(mergeBufferGeometries(sheathInnerGeoms), innerSheathMat)
  );
  sheathGroup.userData.structureId = 'follicle_sheaths';
  sheathGroup.traverse((o) => (o.userData.structureId = 'follicle_sheaths'));
  groups.set('follicle_sheaths', sheathGroup);

  // C. Hair Bulb
  const bulbGroup = new THREE.Group();
  const bulbMat = createBiologicalMaterial({
    color: 0x9e5152,
    bumpMap: textures.spinosumBump,
    bumpScale: 0.022,
    roughness: 0.45,
    clearcoat: 0.22,
    opacity: 0.92,
    cutInteriorTint: new THREE.Color(0x7c3438),
    clippingPlanes
  });
  bulbGroup.add(new THREE.Mesh(mergeBufferGeometries(bulbGeoms), bulbMat));
  bulbGroup.userData.structureId = 'hair_bulb';
  bulbGroup.traverse((o) => (o.userData.structureId = 'hair_bulb'));
  groups.set('hair_bulb', bulbGroup);

  // D. Dermal Papilla of Hair
  const papillaGroup = new THREE.Group();
  const papillaMat = createBiologicalMaterial({
    color: 0xe85a68,
    roughness: 0.42,
    clearcoat: 0.25,
    cutInteriorTint: new THREE.Color(0xc93b4b),
    clippingPlanes
  });
  papillaGroup.add(new THREE.Mesh(mergeBufferGeometries(papillaGeoms), papillaMat));
  papillaGroup.userData.structureId = 'hair_papilla';
  papillaGroup.traverse((o) => (o.userData.structureId = 'hair_papilla'));
  groups.set('hair_papilla', papillaGroup);

  // E. Sebaceous Gland
  const sebGroup = new THREE.Group();
  const sebMat = createBiologicalMaterial({
    color: 0xf6e3b8,
    map: textures.sebaceousMap,
    bumpMap: textures.sebaceousBump,
    bumpScale: 0.032,
    roughness: 0.38,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    sheen: 0.3,
    cutInteriorTint: new THREE.Color(0xe6c78a),
    clippingPlanes
  });
  sebGroup.add(new THREE.Mesh(mergeBufferGeometries(sebaceousGeoms), sebMat));
  sebGroup.userData.structureId = 'sebaceous_gland';
  sebGroup.traverse((o) => (o.userData.structureId = 'sebaceous_gland'));
  groups.set('sebaceous_gland', sebGroup);

  // F. Arrector Pili Muscle
  const arrGroup = new THREE.Group();
  const arrMat = createBiologicalMaterial({
    color: 0xd85c62,
    map: textures.muscleMap,
    bumpMap: textures.dermisBump,
    bumpScale: 0.022,
    roughness: 0.46,
    clearcoat: 0.18,
    sheen: 0.28,
    cutInteriorTint: new THREE.Color(0xb23e44),
    clippingPlanes
  });
  arrGroup.add(new THREE.Mesh(mergeBufferGeometries(arrectorGeoms), arrMat));
  arrGroup.userData.structureId = 'arrector_pili';
  arrGroup.traverse((o) => (o.userData.structureId = 'arrector_pili'));
  groups.set('arrector_pili', arrGroup);

  // Dispose temporary arrays
  [
    ...shaftGeoms,
    ...sheathOuterGeoms,
    ...sheathInnerGeoms,
    ...bulbGeoms,
    ...papillaGeoms,
    ...sebaceousGeoms,
    ...arrectorGeoms
  ].forEach((g) => g.dispose());

  // G. VELLUS HAIRS (16 fine translucent downy hairs + superficial mini-follicles)
  const vellusShafts: THREE.BufferGeometry[] = [];
  const vellusFollicles: THREE.BufferGeometry[] = [];

  for (const vf of VELLUS_FOLLICLES) {
    const h = evaluateSkinStrata(vf.ostiumX, vf.ostiumZ);
    const ySurf = h.ySurface - 0.02;
    const basePt = new THREE.Vector3(
      vf.ostiumX - vf.slantX * 0.7,
      ySurf - vf.depth,
      vf.ostiumZ - vf.slantZ * 0.7
    );
    const surfPt = new THREE.Vector3(vf.ostiumX, ySurf, vf.ostiumZ);
    const midAbove = new THREE.Vector3(
      vf.ostiumX + vf.slantX * 0.65,
      ySurf + vf.heightAbove * 0.62,
      vf.ostiumZ + vf.slantZ * 0.65
    );
    const tipPt = new THREE.Vector3(
      vf.ostiumX + vf.slantX * 1.35,
      ySurf + vf.heightAbove,
      vf.ostiumZ + vf.slantZ * 1.35
    );

    const vCurve = new THREE.CatmullRomCurve3([basePt, surfPt, midAbove, tipPt]);
    vellusShafts.push(
      buildVariableTubeGeometry({
        curve: vCurve,
        tubularSegments: 24,
        radialSegments: 6,
        radiusFn: (u) => 0.021 * Math.max(0.12, 1.0 - Math.pow(u, 1.6)),
        capStart: true,
        capEnd: true
      })
    );

    const fCurve = new THREE.CatmullRomCurve3([basePt, surfPt]);
    vellusFollicles.push(
      buildVariableTubeGeometry({
        curve: fCurve,
        tubularSegments: 10,
        radialSegments: 7,
        radiusFn: (u) => 0.052 * (1.0 + (1 - u) * 0.35),
        capStart: true,
        capEnd: true
      })
    );
  }

  const vellusGroup = new THREE.Group();
  const vellusHairMat = createBiologicalMaterial({
    color: 0xc89f78,
    roughness: 0.38,
    clearcoat: 0.35,
    opacity: 0.88,
    clippingPlanes
  });
  const vellusSheathMat = createBiologicalMaterial({
    color: 0xe6b4ab,
    roughness: 0.5,
    opacity: 0.72,
    clippingPlanes
  });
  const vMesh = new THREE.Mesh(mergeBufferGeometries(vellusShafts), vellusHairMat);
  vMesh.castShadow = true;
  vellusGroup.add(
    vMesh,
    new THREE.Mesh(mergeBufferGeometries(vellusFollicles), vellusSheathMat)
  );
  vellusShafts.forEach((g) => g.dispose());
  vellusFollicles.forEach((g) => g.dispose());
  vellusGroup.userData.structureId = 'vellus_hairs';
  vellusGroup.traverse((o) => (o.userData.structureId = 'vellus_hairs'));
  groups.set('vellus_hairs', vellusGroup);

  // H. ECCRINE SWEAT GLANDS (Secretory Glomerulus + Dermal Duct & Spiral Acrosyringium)
  const sweatSecGeoms: THREE.BufferGeometry[] = [];
  const sweatDuctGeoms: THREE.BufferGeometry[] = [];

  for (let i = 0; i < SWEAT_GLANDS.length; i++) {
    const { secretoryGeom, ductGeom } = buildSingleEccrineSweatGland(i);
    sweatSecGeoms.push(secretoryGeom);
    sweatDuctGeoms.push(ductGeom);
  }

  const sweatSecGroup = new THREE.Group();
  const sweatSecMat = createBiologicalMaterial({
    color: 0x74c7b8,
    map: textures.sweatMap,
    bumpMap: textures.spinosumBump,
    bumpScale: 0.018,
    roughness: 0.34,
    clearcoat: 0.42,
    clearcoatRoughness: 0.24,
    sheen: 0.3,
    cutInteriorTint: new THREE.Color(0x4a9688),
    clippingPlanes
  });
  sweatSecGroup.add(new THREE.Mesh(mergeBufferGeometries(sweatSecGeoms), sweatSecMat));
  sweatSecGroup.userData.structureId = 'sweat_secretory';
  sweatSecGroup.traverse((o) => (o.userData.structureId = 'sweat_secretory'));
  groups.set('sweat_secretory', sweatSecGroup);

  const sweatDuctGroup = new THREE.Group();
  const sweatDuctMat = createBiologicalMaterial({
    color: 0x8ad6c8,
    map: textures.sweatMap,
    roughness: 0.36,
    clearcoat: 0.38,
    opacity: 0.94,
    cutInteriorTint: new THREE.Color(0x56a899),
    clippingPlanes
  });
  sweatDuctGroup.add(new THREE.Mesh(mergeBufferGeometries(sweatDuctGeoms), sweatDuctMat));
  sweatDuctGroup.userData.structureId = 'sweat_duct';
  sweatDuctGroup.traverse((o) => (o.userData.structureId = 'sweat_duct'));
  groups.set('sweat_duct', sweatDuctGroup);

  sweatSecGeoms.forEach((g) => g.dispose());
  sweatDuctGeoms.forEach((g) => g.dispose());

  return groups;
}
