import type { BufferGeometry } from 'three';
import { SKULL_ORIGIN } from './anatomy';
import {
  bounded, capsule, chain, ellipsoid, flatCapsule, meshSdf, mirrorX, roundBox,
  smooth, smoothSubtract, sphere, strip, subtract, triangle, union, type Sdf,
} from './sdf';

// Half of the adult dental arch, from central incisor to third molar.
// Coordinates are local to the skull and measured in decimetres.
const DENTAL_ARC = [
  [0.045, 0.738, 0.039, 0.028, 0.124],
  [0.116, 0.724, 0.029, 0.027, 0.115],
  [0.178, 0.694, 0.032, 0.034, 0.126],
  [0.228, 0.641, 0.031, 0.040, 0.103],
  [0.265, 0.572, 0.034, 0.042, 0.098],
  [0.290, 0.481, 0.044, 0.052, 0.096],
  [0.302, 0.385, 0.043, 0.053, 0.092],
  [0.305, 0.293, 0.041, 0.050, 0.085],
] as const;

function teeth(upper: boolean): Sdf {
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
    const root = upper ? -0.506 - i * 0.003 : -0.796 + i * 0.010;
    const cy = root + (upper ? -1 : 1) * height / 2;
    const crown = roundBox([0, cy, 0], [w, height / 2, d], i < 2 ? 0.012 : 0.020);
    return (X: number, Y: number, Z: number) => {
      const a = X - px;
      const b = Z - pz;
      return crown(a * cos + b * sin, Y, -a * sin + b * cos);
    };
  });
  return bounded(mirrorX(union(...crowns)), [-0.39, -0.83, 0.19], [0.39, -0.49, 0.81]);
}

function cranium(): Sdf {
  const vault = smooth(
    0.15,
    ellipsoid([0, 0.35, -0.26], [0.704, 0.794, 0.845]),
    ellipsoid([0, 0.32, 0.11], [0.640, 0.702, 0.615]),
    ellipsoid([0, 0.01, -0.66], [0.53, 0.447, 0.445]),
    ellipsoid([0, -0.145, -0.20], [0.575, 0.36, 0.64]),
  );
  const brows = mirrorX(chain(
    [[0.035, 0.157, 0.731], [0.155, 0.179, 0.714], [0.32, 0.170, 0.660], [0.459, 0.097, 0.592]],
    [0.068, 0.070, 0.070, 0.065],
  ));
  const orbitalWalls = mirrorX(ellipsoid([0.401, -0.023, 0.417], [0.134, 0.186, 0.238]));
  const orbitalRims = mirrorX(smooth(
    0.045,
    capsule([0.457, 0.106, 0.61], [0.489, -0.175, 0.553], 0.063, 0.083),
    capsule([0.117, -0.198, 0.718], [0.459, -0.21, 0.554], 0.055, 0.073),
  ));
  const cheek = mirrorX(ellipsoid([0.47, -0.233, 0.526], [0.136, 0.114, 0.132]));
  const zygomaticArch = mirrorX(smooth(
    0.030,
    flatCapsule([0.48, -0.21, 0.53], [0.606, -0.224, 0.24], 0.075, 0.061, [0.70, 1, 1]),
    flatCapsule([0.606, -0.224, 0.24], [0.623, -0.236, -0.15], 0.063, 0.053, [0.70, 1, 1]),
    flatCapsule([0.623, -0.236, -0.15], [0.519, -0.235, -0.31], 0.053, 0.073, [0.70, 1, 1]),
  ));
  const maxilla = smooth(
    0.042,
    mirrorX(ellipsoid([0.157, -0.327, 0.536], [0.17, 0.166, 0.192])),
    ellipsoid([0, -0.478, 0.498], [0.276, 0.061, 0.248]),
    mirrorX(chain(DENTAL_ARC.map(([x, z], i) => [x, -0.483 - i * 0.003, z - 0.016]), 0.058)),
  );
  const nasalBridge = flatCapsule([0, 0.104, 0.739], [0, -0.107, 0.765], 0.060, 0.038, [1, 1, 0.65]);
  const mastoids = mirrorX(ellipsoid([0.531, -0.394, -0.385], [0.079, 0.116, 0.089]));
  const bone = smooth(0.069, vault, brows, orbitalRims, orbitalWalls, cheek, zygomaticArch, maxilla, nasalBridge, mastoids);

  // Orbital entrances flare towards the front, with bony walls tapering to the optic canals.
  const orbits = mirrorX(smooth(
    0.044,
    ellipsoid([0.281, -0.006, 0.789], [0.200, 0.183, 0.277]),
    capsule([0.283, -0.012, 0.694], [0.176, 0.009, 0.235], 0.157, 0.043),
  ));
  const nasalAperture = smooth(
    0.047,
    flatCapsule([0, -0.143, 1.03], [0, -0.150, 0.417], 0.066, 0.047, [0.87, 1.14, 1]),
    flatCapsule([0, -0.288, 1.02], [0, -0.293, 0.352], 0.121, 0.083, [1, 1.14, 1]),
    ellipsoid([0, -0.344, 0.681], [0.123, 0.093, 0.275]),
  );
  const temporalFossae = mirrorX(ellipsoid([0.759, 0.015, 0.007], [0.097, 0.269, 0.265]));
  const canineFossae = mirrorX(ellipsoid([0.238, -0.347, 0.736], [0.077, 0.068, 0.058]));
  const earCanals = mirrorX(capsule([0.81, -0.292, -0.322], [0.51, -0.292, -0.323], 0.050));
  const infraorbitalForamina = mirrorX(capsule([0.270, -0.248, 0.78], [0.267, -0.258, 0.621], 0.020, 0.014));
  const face = subtract(
    smoothSubtract(0.038, bone, orbits, nasalAperture, temporalFossae, canineFossae),
    earCanals, infraorbitalForamina,
  );
  // A recessed bony septum, behind the opening and joined to the palate.
  const septum = roundBox([0, -0.294, 0.432], [0.017, 0.137, 0.106], 0.013);
  return union(smooth(0.019, face, septum), teeth(true));
}

function mandible(): Sdf {
  const chin = [
    [0, -1.076, 0.705], [0.142, -1.065, 0.665], [0.265, -1.024, 0.505],
    [0.359, -0.992, 0.286], [0.446, -0.949, 0.018], [0.483, -0.887, -0.120],
  ] as const;
  const lower = chin.map(([x, y, z]): [number, number, number] => [x, y, z]);
  const upper = [
    [0, -0.788, 0.702], [0.126, -0.785, 0.648], [0.231, -0.778, 0.522],
    [0.308, -0.750, 0.323], [0.369, -0.725, 0.179], [0.423, -0.733, -0.068],
  ] as [number, number, number][];
  const condylarNeck = [0.504, -0.416, -0.204] as const;
  const ramus = smooth(
    0.046,
    strip(lower, upper, 0.048),
    chain(lower, [0.056, 0.053, 0.052, 0.050, 0.049, 0.054]),
    chain(DENTAL_ARC.map(([x, z], i) => [x * 0.94, -0.815 + i * 0.010, z - 0.04]), 0.049),
    triangle([0.475, -0.871, -0.108], [0.395, -0.762, 0.154], [0.456, -0.349, 0.102], 0.036),
    triangle([0.475, -0.871, -0.108], [0.456, -0.349, 0.102], [...condylarNeck], 0.036),
    chain([[0.474, -0.865, -0.127], [0.487, -0.689, -0.172], [...condylarNeck]], [0.046, 0.040, 0.042]),
    ellipsoid([0.514, -0.355, -0.205], [0.083, 0.042, 0.056]),
  );
  const notch = mirrorX(sphere([0.485, -0.296, -0.037], 0.116));
  const mentalForamina = mirrorX(capsule([0.224, -0.883, 0.697], [0.206, -0.879, 0.571], 0.018, 0.011));
  const jaw = smooth(0.044, mirrorX(ramus), ellipsoid([0, -1.019, 0.699], [0.116, 0.073, 0.049]));
  return union(subtract(smoothSubtract(0.018, jaw, notch), mentalForamina), teeth(false));
}

function shadeSutures(geometry: BufferGeometry) {
  const positions = geometry.attributes.position;
  const colors = geometry.attributes.color;
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
    const shade = 1 - 0.38 * Math.max(coronal, sagittal, lambdoid, squamous);
    colors.setXYZ(i, colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
  }
}

export function buildSkull(detail: number) {
  const geometry = meshSdf(cranium(), { min: [-0.84, -0.79, -1.18], max: [0.84, 1.20, 0.97], cell: 0.014 * detail, ao: 0.057 });
  shadeSutures(geometry);
  return geometry.translate(...SKULL_ORIGIN);
}

export function buildMandible(detail: number) {
  return meshSdf(mandible(), { min: [-0.66, -1.19, -0.36], max: [0.66, -0.25, 0.88], cell: 0.013 * detail, ao: 0.033 })
    .translate(...SKULL_ORIGIN);
}
