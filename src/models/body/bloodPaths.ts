import { flipX, tube, type V3 } from './geo';
import { armPoint, fingerChains } from './skin';

export interface BloodPath {
  part: string;
  points: V3[];
  radii: [number, number];
  /** The coordinates can be listed from the larger vessel for easy branching. */
  reverse?: boolean;
}

export function bloodTube({ points, radii: [start, end] }: BloodPath) {
  return tube(points, (t) => start + (end - start) * t, { radial: start >= 0.07 ? 12 : 8 });
}

// The same pose and decimetre coordinates as the body on the atlas home page.
const archRight: V3 = [0.17, 13.92, 0.16];
const archMiddle: V3 = [0.35, 14.11, -0.04];
const archLeft: V3 = [0.51, 14.06, -0.23];
const aortaFork: V3 = [0.22, 10.02, -0.15];
const cavaFork: V3 = [-0.24, 10.01, -0.22];
const neckRight: V3 = [-0.31, 14.48, 0.10];
const armPose = (points: V3[]) => points.map((p) => p[1] < 14 ? armPoint(p) : p);

function tree(reverse = false) {
  const paths: BloodPath[] = [];
  const add = (part: string, points: V3[], start: number, end = start, incoming = reverse) =>
    paths.push({ part, points, radii: [start, end], reverse: incoming });
  return { paths, add };
}

function arteries() {
  const { paths, add } = tree();
  const celiac: V3 = [0.33, 11.29, -0.25];
  const gut: V3 = [0.12, 10.35, 0.53];
  add('aorta', [[0.22, 12.98, 0.25], [0.14, 13.43, 0.27], archRight, archMiddle, archLeft,
    [0.66, 13.78, -0.47], [0.59, 13.02, -0.53], [0.47, 12.0, -0.39],
    celiac, [0.29, 10.99, -0.22], [0.26, 10.62, -0.20], aortaFork], 0.157, 0.089);
  add('brachiocephalic-trunk', [archRight, [-0.06, 14.29, 0.13], neckRight], 0.090, 0.076);
  add('visceral-arteries', [celiac, [0.29, 11.38, 0.20], [-0.10, 11.48, 0.32], [-0.55, 11.39, 0.43], [-0.93, 11.48, 0.49]], 0.055, 0.023);
  add('visceral-arteries', [[0.29, 11.38, 0.20], [0.63, 11.45, 0.11], [0.92, 11.34, -0.31], [1.16, 11.34, -0.49]], 0.044, 0.025);
  add('visceral-arteries', [[0.29, 10.99, -0.22], [0.27, 10.83, 0.22], [0.21, 10.62, 0.43], gut, [-0.17, 9.86, 0.61]], 0.055, 0.021);
  for (const [x, y] of [[-0.61, 10.55], [0.69, 10.55], [-0.60, 10.0], [0.58, 9.97]]) {
    add('visceral-arteries', [gut, [(x + gut[0]) * 0.5, (y + gut[1]) * 0.5, 0.63], [x, y, 0.67]], 0.025, 0.013);
  }
  for (const side of [1, -1] as const) {
    const mirror = (points: V3[]) => side === 1 ? points : flipX(points);
    const arm = (points: V3[]) => mirror(armPose(points));
    const carotid: V3 = [0.40, 15.57, 0.08];
    const cranial: V3 = [0.21, 16.19, -0.04];
    const shoulder: V3 = [1.36, 14.22, 0.03];
    const elbow: V3 = [1.84, 10.95, -0.12];
    const palm: V3 = [2.02, 8.02, -0.065];
    const groin: V3 = [0.85, 9.19, 0.24];
    const knee: V3 = [0.59, 4.85, -0.26];
    const ankle: V3 = [0.57, 0.72, 0.34];
    const foot: V3 = [0.67, 0.23, 1.12];

    add('carotid-arteries', [side === 1 ? archMiddle : neckRight, ...mirror([[0.38, 14.89, 0.09], carotid])], 0.062, 0.052);
    add('carotid-arteries', mirror([carotid, [0.39, 15.90, -0.02], [0.30, 16.09, -0.18], cranial]), 0.045, 0.031);
    add('facial-arteries', mirror([carotid, [0.54, 15.96, 0.21], [0.55, 16.21, 0.47], [0.48, 16.58, 0.51], [0.34, 17.02, 0.46]]), 0.037, 0.013);
    add('facial-arteries', mirror([[0.55, 16.21, 0.47], [0.44, 16.22, 0.69], [0.24, 16.45, 0.81], [0.10, 16.69, 0.67]]), 0.023, 0.010);
    add('cerebral-arteries', mirror([cranial, [0.42, 16.35, -0.10], [0.54, 16.58, -0.17], [0.48, 16.92, -0.35]]), 0.029, 0.011);
    add('cerebral-arteries', mirror([cranial, [0.13, 16.32, 0.28], [0.11, 16.76, 0.42], [0.14, 17.16, 0.08]]), 0.027, 0.012);
    add('cerebral-arteries', mirror([cranial, [0.20, 16.13, -0.29], [0.35, 16.34, -0.58], [0.31, 16.68, -0.77]]), 0.024, 0.011);
    add('subclavian-arteries', [side === 1 ? archLeft : neckRight, ...mirror([[0.85, 14.46, -0.01], shoulder])], 0.072, 0.057);
    add('arm-arteries', arm([shoulder, [1.62, 13.9, 0.02], [1.72, 13.1, -0.08], [1.80, 11.95, -0.12], elbow]), 0.057, 0.044);
    add('arm-arteries', arm([elbow, [1.95, 10.12, -0.055], [2.08, 8.86, -0.035], [2.15, 8.35, -0.04], palm]), 0.037, 0.024);
    add('arm-arteries', arm([elbow, [1.79, 10.05, -0.24], [1.88, 8.88, -0.24], [1.90, 8.26, -0.11], palm]), 0.035, 0.023);
    for (const finger of fingerChains()) {
      add('hand-arteries', arm([palm, ...finger.slice(1).map(([x, y, z]): V3 => [x + 0.023, y, z + 0.015])]), 0.017, 0.008);
    }

    add('renal-arteries', [[0.26, 10.62, -0.20], ...mirror([[0.45, 10.69, -0.35], [0.80, 10.69, -0.53], [0.91, 10.66, -0.59]])], 0.040, 0.025);
    add('iliac-arteries', [aortaFork, ...mirror([[0.59, 9.64, 0.07], groin])], 0.077, 0.062);
    add('iliac-arteries', mirror([[0.59, 9.64, 0.07], [0.67, 9.32, -0.22], [0.52, 9.06, -0.55]]), 0.044, 0.023);
    add('leg-arteries', mirror([groin, [0.89, 8.50, 0.37], [0.76, 6.45, 0.28], [0.63, 5.40, 0.06], knee]), 0.063, 0.046);
    add('leg-arteries', mirror([[0.89, 8.50, 0.37], [0.96, 7.71, 0.08], [0.89, 6.37, -0.19], [0.75, 5.42, -0.25]]), 0.045, 0.021);
    add('leg-arteries', mirror([knee, [0.62, 4.28, -0.20], [0.64, 3.13, -0.26], [0.64, 1.60, -0.21], [0.59, 0.75, -0.17], [0.64, 0.20, 0.75]]), 0.037, 0.017);
    add('leg-arteries', mirror([knee, [0.68, 4.18, 0.14], [0.66, 2.97, 0.18], [0.60, 1.41, 0.22], ankle]), 0.034, 0.020);
    add('foot-arteries', mirror([ankle, [0.64, 0.39, 0.62], foot]), 0.022, 0.017);
    for (const [x, z] of [[0.55, 1.80], [0.67, 1.76], [0.77, 1.66], [0.86, 1.51], [0.95, 1.35]]) {
      add('foot-arteries', mirror([foot, [x, 0.16, (z + 1.12) * 0.5], [x, 0.105, z]]), 0.012, 0.007);
    }
  }
  add('cerebral-arteries', [[0.21, 16.19, -0.04], [0.12, 16.17, 0.15], [0, 16.17, 0.20], [-0.12, 16.17, 0.15], [-0.21, 16.19, -0.04]], 0.017, 0.017);
  const basilar: V3 = [0, 16.13, -0.32];
  add('cerebral-arteries', [[0, 15.51, -0.44], [0, 15.87, -0.52], basilar], 0.027, 0.020);
  for (const side of [1, -1]) {
    add('cerebral-arteries', [[side * 0.85, 14.46, -0.01], [side * 0.37, 14.83, -0.28], [side * 0.26, 15.42, -0.45], [0, 15.51, -0.44]], 0.024, 0.017);
    add('cerebral-arteries', [basilar, [side * 0.13, 16.13, -0.25], [side * 0.21, 16.19, -0.04]], 0.018, 0.014);
  }
  return paths;
}

function veins() {
  const { paths, add } = tree(true);
  const cavaTop: V3 = [-0.48, 14.34, 0.08];
  const hepatic: V3 = [-0.39, 11.78, -0.29];
  const renal: V3 = [-0.28, 10.62, -0.24];
  const portal: V3 = [-0.11, 10.85, 0.36];
  add('vena-cava-superior', [[-0.35, 13.05, 0.23], [-0.45, 13.72, 0.16], cavaTop], 0.121, 0.105);
  add('vena-cava-inferior', [[-0.33, 12.63, 0.13], [-0.34, 12.18, -0.18], hepatic, [-0.36, 11.11, -0.32], renal, cavaFork], 0.144, 0.116);
  add('hepatic-veins', [hepatic, [-0.60, 11.76, -0.10], [-0.98, 11.66, 0.21], [-1.28, 11.59, 0.46]], 0.066, 0.025);
  add('hepatic-veins', [hepatic, [-0.29, 11.79, 0.02], [-0.04, 11.69, 0.30]], 0.056, 0.022);
  add('portal-vein', [[-0.36, 9.86, 0.54], [-0.26, 10.29, 0.56], portal, [-0.28, 11.10, 0.38], [-0.53, 11.41, 0.43]], 0.050, 0.071, false);
  add('portal-vein', [[1.12, 11.28, -0.47], [0.83, 11.23, -0.26], [0.32, 11.06, 0.17], portal], 0.038, 0.051, false);
  add('portal-vein', [[-0.53, 11.41, 0.43], [-0.83, 11.41, 0.48], [-1.24, 11.51, 0.54]], 0.061, 0.026, false);
  add('portal-vein', [[-0.53, 11.41, 0.43], [-0.24, 11.46, 0.46], [0.05, 11.51, 0.34]], 0.047, 0.021, false);
  add('cerebral-veins', [[0, 16.81, -0.69], [0, 17.08, -0.49], [0, 17.25, -0.20]], 0.029, 0.023);
  for (const [x, y] of [[-0.67, 10.55], [0.65, 10.51], [-0.57, 9.99], [0.60, 9.91]]) {
    add('portal-vein', [[x, y, 0.61], [(x + portal[0]) * 0.5, (y + portal[1]) * 0.5, 0.62], portal], 0.014, 0.035, false);
  }
  for (const side of [1, -1] as const) {
    const mirror = (points: V3[]) => side === 1 ? points : flipX(points);
    const arm = (points: V3[]) => mirror(armPose(points));
    const junction: V3 = [0.56, 14.52, 0.15];
    const jugular: V3 = [0.51, 15.87, -0.12];
    const shoulder: V3 = [1.34, 14.31, 0.13];
    const wrist: V3 = [2.08, 8.29, 0.04];
    const palm: V3 = [2.04, 7.99, 0.035];
    const groin: V3 = [0.77, 9.22, 0.12];
    const knee: V3 = [0.54, 4.85, -0.16];
    const ankle: V3 = [0.59, 0.72, 0.24];
    const foot: V3 = [0.67, 0.28, 1.04];
    add('brachiocephalic-veins', [cavaTop, ...(side === 1 ? [[-0.05, 14.43, 0.23] as V3] : []), ...mirror([junction, shoulder])], 0.087, 0.061);
    add('jugular-veins', mirror([junction, [0.53, 15.03, 0.12], [0.50, 15.49, 0.07], jugular]), 0.067, 0.051);
    add('jugular-veins', mirror([[0.53, 15.03, 0.12], [0.66, 15.57, 0.24], [0.57, 16.01, 0.45], [0.39, 16.52, 0.65]]), 0.034, 0.015);
    add('cerebral-veins', mirror([jugular, [0.49, 16.13, -0.36], [0.38, 16.38, -0.68], [0.14, 16.59, -0.85], [0, 16.81, -0.69]]), 0.043, 0.029);
    add('cerebral-veins', mirror([[0, 17.25, -0.20], [0.29, 17.06, 0.02], [0.44, 16.86, 0.25]]), 0.022, 0.011);
    add('arm-veins', arm([shoulder, [1.57, 13.84, 0.11], [1.67, 13.1, 0.02], [1.77, 11.91, -0.02], [1.80, 10.95, -0.055], [1.84, 10.03, -0.13], wrist, palm]), 0.060, 0.024);
    add('arm-veins', arm([[1.57, 13.84, 0.11], [1.87, 13.03, 0.14], [1.98, 11.48, 0.18], [2.02, 10.42, 0.15], [2.12, 9.0, 0.08], wrist]), 0.035, 0.023);
    add('arm-veins', arm([[2.02, 10.42, 0.15], [1.88, 10.60, 0.21], [1.78, 10.79, 0.12], [1.80, 10.95, -0.055]]), 0.022, 0.017);
    for (const finger of fingerChains()) {
      add('arm-veins', arm([palm, ...finger.slice(1).map(([x, y, z]): V3 => [x - 0.025, y, z + 0.035])]), 0.016, 0.008);
    }
    add('renal-veins', [renal, ...mirror([[0.48, 10.59, -0.31], [0.79, 10.62, -0.43], [0.90, 10.60, -0.55]])], 0.057, 0.030);
    add('iliac-veins', [cavaFork, ...mirror([[0.47, 9.70, -0.055], groin])], 0.094, 0.075);
    add('leg-veins', mirror([groin, [0.83, 8.62, 0.23], [0.76, 7.46, 0.22], [0.65, 6.16, 0.12], [0.55, 5.39, -0.06], knee, [0.57, 3.8, -0.13], [0.61, 1.7, -0.09], ankle, foot]), 0.073, 0.022);
    add('leg-veins', mirror([[0.83, 8.62, 0.23], [0.70, 8.29, 0.46], [0.60, 7.17, 0.54], [0.49, 5.58, 0.41], [0.36, 3.72, 0.27], [0.41, 2.11, 0.20], ankle]), 0.041, 0.022);
    add('leg-veins', mirror([knee, [0.70, 4.13, -0.38], [0.75, 2.85, -0.46], [0.76, 1.58, -0.20], ankle]), 0.034, 0.016);
    for (const [x, z] of [[0.54, 1.80], [0.66, 1.76], [0.76, 1.66], [0.85, 1.51], [0.94, 1.35]]) {
      add('leg-veins', mirror([foot, [x, 0.19, (z + 1.04) * 0.5], [x, 0.135, z]]), 0.013, 0.008);
    }
  }
  return paths;
}

export const systemicArteries = arteries();
export const systemicVeins = veins();
