import { BufferAttribute, type BufferGeometry } from 'three';
import { SKULL_ORIGIN } from './anatomy';
import {
  bounded, capsule, chain, ellipsoid, flatCapsule, meshSdf, mirrorX,
  smooth, smoothSubtract, strip, subtract, triangle, union, type Sdf,
} from './sdf';

// Half of the adult dental arch, from central incisor to third molar.
// Coordinates are local to the skull and measured in decimetres.
const DENTAL_ARC = [
  [0.042, 0.738, 0.041, 0.028, 0.124],
  [0.116, 0.724, 0.029, 0.027, 0.115],
  [0.178, 0.694, 0.032, 0.034, 0.126],
  [0.228, 0.641, 0.031, 0.040, 0.103],
  [0.265, 0.572, 0.034, 0.042, 0.098],
  [0.290, 0.481, 0.044, 0.052, 0.096],
  [0.302, 0.385, 0.043, 0.053, 0.092],
  [0.305, 0.293, 0.041, 0.050, 0.085],
] as const;

const toothSeat = (upper: boolean, i: number) => upper ? -0.500 - i * 0.003 : -0.754 + i * 0.011;

// Intermediate between an ellipse and a rounded rectangle.
function roundedOutline(x: number, y: number, squaredness: number) {
  const xx = x * x;
  const yy = y * y;
  const ellipse = Math.sqrt(xx + yy);
  return ellipse + squaredness * (Math.sqrt(Math.sqrt(xx * xx + yy * yy)) - ellipse);
}

function teeth(upper: boolean): Sdf {
  const direction = upper ? -1 : 1;
  const crowns = DENTAL_ARC.map(([x, z, w, d, height], i) => {
    const previous = DENTAL_ARC[Math.max(0, i - 1)];
    const next = DENTAL_ARC[Math.min(DENTAL_ARC.length - 1, i + 1)];
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz);
    const cos = dx / length;
    const sin = dz / length;
    const px = x * (upper ? 1 : 0.94);
    const pz = z - (upper ? 0 : 0.036);
    const root = toothSeat(upper, i);
    const lengthY = height * (upper ? 1 : 0.90);
    const crown: Sdf = (X, Y, Z) => {
      const a = X - px;
      const b = Z - pz;
      const across = a * cos + b * sin;
      const depth = -a * sin + b * cos;
      const t = (Y - root) * direction / lengthY;
      // Narrow neck, flat incisor edge, pointed canine and broader back teeth.
      const neck = 0.83 + 0.17 * Math.max(0, Math.min(1, t * 2.4));
      const edge = Math.max(0, Math.min(1, t));
      const edgeSquared = edge * edge;
      const taper = edgeSquared * edgeSquared;
      const width = w * neck * (i === 2 ? 1 - 0.65 * taper * edge : 1 - 0.13 * taper);
      const thickness = d * (i < 3 ? 1 - 0.48 * edgeSquared : neck);
      const section = roundedOutline(across / width, (depth + 0.010 * edge) / thickness, i < 2 ? 0.66 : 0.33);
      return (roundedOutline(section, 2 * t - 1, i < 2 ? 0.92 : 0.64) - 1) * Math.min(w, d);
    };
    const span = Math.sqrt(w * w + d * d) + 0.012;
    const tip = root + direction * lengthY;
    return bounded(crown, [px - span, Math.min(root, tip), pz - span], [px + span, Math.max(root, tip), pz + span], 0.024);
  });
  return bounded(mirrorX(union(...crowns)), [-0.39, -0.80, 0.19], [0.39, -0.49, 0.81], 0.040);
}

function orbitalCavity(x: number, y: number, z: number) {
  // The medial wall runs back nearly straight. The lateral wall flares out
  // and the lower medial corner clears the bony wall of the nasal cavity.
  const flare = Math.max(0, Math.min(1, (z - 0.14) / 0.43));
  const centreX = 0.157 + 0.145 * flare;
  const centreY = 0.026 - 0.056 * flare;
  const width = 0.025 + 0.165 * flare;
  const height = 0.029 + 0.151 * flare;
  const lowerWall = Math.max(0, Math.min(1, (centreY - y) / height));
  const u = (x - centreX - 0.025 * flare * lowerWall) / width;
  const v = (y - centreY + 0.025 * u * flare) / height;
  const section = roundedOutline(u, v, 0.65);
  const back = Math.min(0, (z - 0.14) / 0.053);
  return (Math.sqrt(section * section + back * back) - 1) * Math.min(width, height);
}

function nasalPassage(x: number, y: number, z: number) {
  const centreY = Math.max(-0.332, Math.min(-0.126, y));
  const radius = 0.029 + (-0.126 - centreY) * 0.38;
  const height = (y - centreY) * 1.82;
  const outline = Math.sqrt(x * x + height * height) - radius;
  return Math.max(outline, 0.035 - z);
}

function cranium(): Sdf {
  const vault = smooth(
    0.16,
    ellipsoid([0, 0.35, -0.28], [0.704, 0.794, 0.824]),
    ellipsoid([0, 0.38, 0.108], [0.618, 0.693, 0.590]),
    ellipsoid([0, -0.025, -0.65], [0.537, 0.421, 0.422]),
    ellipsoid([0, -0.141, -0.23], [0.542, 0.342, 0.620]),
  );
  const brow = ellipsoid([0, 0.159, 0.541], [0.497, 0.201, 0.151]);
  const cheek = mirrorX(smooth(
    0.052,
    ellipsoid([0.430, -0.169, 0.430], [0.168, 0.182, 0.156]),
    ellipsoid([0.477, -0.029, 0.414], [0.085, 0.177, 0.123]),
    ellipsoid([0.322, -0.202, 0.469], [0.172, 0.101, 0.146]),
  ));
  const zygomaticArch = mirrorX(smooth(
    0.026,
    flatCapsule([0.471, -0.207, 0.456], [0.593, -0.206, 0.185], 0.073, 0.047, [0.61, 1, 1]),
    flatCapsule([0.593, -0.206, 0.185], [0.610, -0.195, -0.148], 0.047, 0.043, [0.61, 1, 1]),
    flatCapsule([0.610, -0.195, -0.148], [0.505, -0.206, -0.316], 0.043, 0.067, [0.61, 1, 1]),
  ));
  const maxilla = smooth(
    0.060,
    mirrorX(ellipsoid([0.183, -0.333, 0.522], [0.167, 0.177, 0.176])),
    ellipsoid([0, -0.447, 0.515], [0.296, 0.078, 0.224]),
    ellipsoid([0, -0.461, 0.251], [0.255, 0.052, 0.287]),
    mirrorX(flatCapsule([0.069, 0.054, 0.629], [0.132, -0.297, 0.631], 0.044, 0.102, [1, 1, 0.85])),
    mirrorX(chain(DENTAL_ARC.map(([x, z], i) => [x, toothSeat(true, i) + 0.024, z - 0.029]), 0.047)),
  );
  const nasalBridge = flatCapsule([0, 0.095, 0.652], [0, -0.121, 0.725], 0.067, 0.045, [1, 1, 0.60]);
  const nasalSpine = ellipsoid([0, -0.411, 0.684], [0.036, 0.030, 0.079]);
  const mastoids = mirrorX(ellipsoid([0.477, -0.337, -0.445], [0.087, 0.113, 0.121]));
  const jawSockets = mirrorX(ellipsoid([0.502, -0.237, -0.276], [0.092, 0.066, 0.094]));
  const temporalFossae = mirrorX(ellipsoid([0.703, 0.022, 0.088], [0.163, 0.308, 0.313]));
  const temple = smoothSubtract(0.069, smooth(0.075, vault, brow, cheek), temporalFossae);
  const bone = smooth(0.060, temple, maxilla, nasalBridge, nasalSpine, zygomaticArch, mastoids, jawSockets);

  const orbits = mirrorX(orbitalCavity);
  const canineFossae = mirrorX(ellipsoid([0.224, -0.345, 0.741], [0.087, 0.100, 0.046]));
  const earCanals = mirrorX(capsule([0.74, -0.278, -0.342], [0.435, -0.269, -0.353], 0.046, 0.039));
  const infraorbitalForamina = mirrorX(capsule([0.258, -0.257, 0.72], [0.247, -0.264, 0.536], 0.016, 0.010));
  const opticCanals = mirrorX(capsule([0.161, 0.027, 0.21], [0.122, 0.056, 0.031], 0.023, 0.020));
  const mandibularFossae = mirrorX(ellipsoid([0.504, -0.329, -0.248], [0.089, 0.053, 0.060]));
  const face = subtract(
    smoothSubtract(0.026, bone, orbits, nasalPassage, canineFossae, mandibularFossae),
    earCanals, infraorbitalForamina, opticCanals,
  );
  const septum = ellipsoid([0, -0.263, 0.267], [0.017, 0.205, 0.209]);
  const conchae = mirrorX(ellipsoid([0.097, -0.319, 0.327], [0.035, 0.032, 0.126]));
  return smooth(0.016, face, septum, conchae);
}

function mandible(): Sdf {
  const chin = [
    [0, -1.062, 0.697], [0.152, -1.052, 0.658], [0.268, -1.013, 0.511],
    [0.361, -0.979, 0.285], [0.438, -0.935, -0.018], [0.472, -0.866, -0.213],
  ] as const;
  const lower = chin.map(([x, y, z]): [number, number, number] => [x, y, z]);
  const upper = [
    [0, -0.773, 0.691], [0.126, -0.772, 0.649], [0.231, -0.766, 0.521],
    [0.309, -0.735, 0.324], [0.369, -0.718, 0.154], [0.427, -0.713, -0.113],
  ] as [number, number, number][];
  const condylarNeck = [0.501, -0.391, -0.249] as const;
  const ramus = smooth(
    0.046,
    strip(lower, upper, 0.048),
    chain(lower, [0.056, 0.053, 0.052, 0.050, 0.049, 0.054]),
    chain(DENTAL_ARC.map(([x, z], i) => [x * 0.94, toothSeat(false, i) - 0.036, z - 0.04]), 0.051),
    triangle([0.469, -0.856, -0.195], [0.387, -0.744, 0.165], [0.433, -0.362, 0.128], 0.038),
    triangle([0.469, -0.856, -0.195], [0.433, -0.362, 0.128], [...condylarNeck], 0.037),
    chain([[0.468, -0.841, -0.206], [0.489, -0.669, -0.254], [...condylarNeck]], [0.045, 0.042, 0.041]),
    ellipsoid([0.504, -0.330, -0.248], [0.076, 0.044, 0.049]),
  );
  const notch = mirrorX(ellipsoid([0.474, -0.318, -0.057], [0.147, 0.120, 0.123]));
  const mentalForamina = mirrorX(capsule([0.224, -0.883, 0.697], [0.206, -0.879, 0.571], 0.018, 0.011));
  const jaw = smooth(0.044, mirrorX(ramus), ellipsoid([0, -1.019, 0.699], [0.116, 0.073, 0.049]));
  return subtract(smoothSubtract(0.022, jaw, notch), mentalForamina);
}

function shadeCranium(geometry: BufferGeometry) {
  const positions = geometry.attributes.position;
  const colors = new BufferAttribute(new Float32Array(positions.count * 3), 3);
  const line = (distance: number, width: number) => Math.exp(-((distance / width) ** 2));
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const a = Math.abs(x);
    const wiggle = 0.012 * Math.sin(41 * x + 29 * y) + 0.006 * Math.sin(93 * x - 23 * y);
    const coronal = y > 0.16 ? line(z - (0.108 - 0.36 * (1.10 - y) + 0.11 * a) + wiggle, 0.020) : 0;
    const sagittal = y > 0.68 && z > -0.89 && z < 0.108 ? line(x + 0.012 * Math.sin(37 * z), 0.019) : 0;
    const lambdoid = z < -0.64 ? line(y - (0.89 - 1.12 * a - 0.13 * (z + 0.90)) + wiggle, 0.020) : 0;
    const squamous = a > 0.53 && z > -0.83 && z < 0.30 ? line(y - (0.136 + 0.17 * Math.exp(-((z + 0.31) ** 2) / 0.105)) + wiggle, 0.018) : 0;
    const suture = Math.max(coronal, sagittal, lambdoid, squamous);
    const orbit = line(orbitalCavity(a, y, z), 0.034);
    const nasal = Math.max(0, Math.min(1, (0.021 - nasalPassage(x, y, z)) / 0.032));
    const depth = Math.max(0, Math.min(1, (0.58 - z) / 0.39));
    const shade = (1 - 0.29 * suture) * (1 - 0.72 * depth * Math.max(orbit, nasal));
    colors.setXYZ(i, shade, shade, shade);
  }
  geometry.setAttribute('color', colors);
}

export function buildSkull(detail: number) {
  const geometry = meshSdf(union(cranium(), teeth(true)), {
    min: [-0.82, -0.76, -1.18], max: [0.82, 1.20, 0.86], cell: 0.012 * detail,
  });
  shadeCranium(geometry);
  return geometry.translate(...SKULL_ORIGIN);
}

export function buildMandible(detail: number) {
  return meshSdf(union(mandible(), teeth(false)), {
    min: [-0.65, -1.16, -0.38], max: [0.65, -0.26, 0.85], cell: 0.011 * detail, ao: 0.036,
  })
    .translate(...SKULL_ORIGIN);
}
