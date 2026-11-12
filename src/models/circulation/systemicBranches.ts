import type { BloodPath } from '../body/bloodPaths';
import type { V3 } from '../body/geo';
import { armPoint, fingerChains } from '../body/skin';

export const PALM_RADIAL: V3[] = [[2.13, 8.10, -0.15], [2.18, 7.91, -0.07]];
export const PALM_ULNAR: V3[] = [[1.89, 8.09, -0.15], [1.84, 7.94, -0.10]];

// The atlas uses the same body coordinates as the home figure. Arm coordinates
// are entered before abduction and transformed exactly like the parent vessels.
export function buildSystemicBranches() {
  const arteries: BloodPath[] = [];
  const veins: BloodPath[] = [];
  const artery = (part: string, points: V3[], start: number, end: number) =>
    arteries.push({ part, points, radii: [start, end] });
  // These branches are authored from their collecting vein outwards.
  const vein = (part: string, points: V3[], start: number, end: number, reverse = true) =>
    veins.push({ part, points, radii: [start, end], reverse });

  artery('intercostal-arteries', [[0.59, 13.02, -0.53], [0.43, 13.02, -0.63], [0.29, 12.98, -0.66]], 0.032, 0.025);
  artery('intercostal-arteries', [[0.47, 12.00, -0.39], [0.36, 12.03, -0.60], [0.28, 12.01, -0.63]], 0.031, 0.023);
  const azygosArch: V3 = [-0.28, 13.77, -0.59];
  const azygosMid: V3 = [-0.15, 12.72, -0.65];
  const azygosLow: V3 = [-0.09, 11.91, -0.61];
  vein('azygos-vein', [[-0.45, 13.72, 0.16], [-0.52, 13.89, -0.15], azygosArch, azygosMid, azygosLow, [-0.16, 11.39, -0.58]], 0.063, 0.031);
  const hemi: V3 = [0.55, 11.89, -0.60];
  vein('azygos-vein', [azygosLow, [0.22, 11.83, -0.72], hemi, [0.58, 11.41, -0.57]], 0.034, 0.023);

  for (const side of [1, -1] as const) {
    const pair = (points: V3[]): V3[] => points.map(([x, y, z]) => [side * x, y, z]);
    const arm = (points: V3[]) => pair(points.map((point) => point[1] < 14 ? armPoint(point) : point));

    artery('facial-arteries', pair([[0.54, 15.96, 0.21], [0.63, 16.20, 0.08], [0.63, 16.61, -0.02], [0.51, 16.99, -0.12]]), 0.022, 0.010);
    artery('facial-arteries', pair([[0.48, 16.58, 0.51], [0.42, 16.75, 0.53], [0.31, 16.84, 0.55]]), 0.013, 0.006);
    artery('cerebral-arteries', pair([[0.42, 16.35, -0.10], [0.54, 16.54, -0.06], [0.58, 16.73, 0.02]]), 0.017, 0.008);
    artery('cerebral-arteries', pair([[0.54, 16.58, -0.17], [0.53, 16.74, -0.31], [0.47, 16.87, -0.49]]), 0.017, 0.009);
    artery('cerebral-arteries', pair([[0.11, 16.76, 0.42], [0.12, 16.95, 0.30], [0.28, 17.12, 0.23]]), 0.014, 0.007);
    vein('jugular-veins', pair([[0.57, 16.01, 0.45], [0.54, 16.26, 0.48], [0.45, 16.43, 0.57]]), 0.024, 0.011);
    vein('cerebral-veins', [[0, 17.08, -0.49], ...pair([[0.23, 17.05, -0.36], [0.45, 16.89, -0.32]])], 0.021, 0.009);

    // Posterior intercostal arteries follow the lower edge of the ribs.
    for (const [y, origin] of [[12.98, [0.29, 12.98, -0.66]], [12.01, [0.28, 12.01, -0.63]]] as const) {
      const root: V3 = [...origin];
      const rib: V3 = [side * 0.98, y - 0.08, -0.55];
      artery('intercostal-arteries', [root, [side * 0.44, y - 0.02, -0.68], rib,
        [side * 1.25, y - 0.23, -0.15], [side * 1.20, y - 0.34, 0.24]], 0.022, 0.010);
      artery('intercostal-arteries', [rib, [side * 1.12, y - 0.33, -0.43], [side * 1.14, y - 0.43, -0.21]], 0.011, 0.006);
    }
    for (const [root, y] of [[azygosMid, 12.65], [side === -1 ? azygosLow : hemi, 11.92]] as const) {
      vein('azygos-vein', [root, [side * 0.66, y, -0.61], [side * 1.10, y - 0.21, -0.43], [side * 1.23, y - 0.31, -0.05]], 0.024, 0.011);
    }

    artery('deep-arm-arteries', arm([[1.72, 13.10, -0.08], [1.66, 12.87, -0.31], [1.85, 12.10, -0.44], [2.00, 11.57, -0.36], [1.97, 11.06, -0.26]]), 0.030, 0.013);
    artery('arm-arteries', arm([[1.79, 10.05, -0.24], [1.97, 9.75, -0.18], [2.00, 9.08, -0.16], [1.98, 8.57, -0.13]]), 0.020, 0.009);
    vein('arm-veins', arm([[1.98, 11.48, 0.18], [1.92, 11.14, 0.24], [1.91, 10.87, 0.25]]), 0.019, 0.011);
    vein('arm-veins', arm([[1.84, 10.03, -0.13], [1.91, 9.45, -0.26], [1.96, 8.85, -0.24], [2.04, 7.99, 0.035]]), 0.028, 0.016);

    const arc: V3[] = [PALM_ULNAR[1], [1.89, 7.82, -0.09], [2.00, 7.79, -0.08],
      [2.11, 7.82, -0.07], PALM_RADIAL[1]];
    // Superficial and deep arcades connect the radial and ulnar sides.
    artery('palmar-arches', arm(arc), 0.022, 0.015);
    artery('palmar-arches', arm([PALM_RADIAL[0], [2.07, 8.025, -0.19], [1.99, 8.015, -0.19], PALM_ULNAR[0]]), 0.018, 0.014);
    const digitalRoots = [arc[3], arc[2], arc[1], arc[0], arc[4]];
    for (const [i, finger] of fingerChains().entries()) {
      const root = digitalRoots[i];
      for (const offset of [-0.024, 0.024]) {
        const shaft: V3[] = finger.slice(1).map(([x, y, z]) => [x + offset, y, z + 0.013]);
        artery('hand-arteries', arm([root, ...shaft]), 0.010, 0.0058);
      }
    }

    const renalHilum: V3 = [0.91, 10.66, -0.59];
    const renalVein: V3 = [0.90, 10.60, -0.55];
    for (const [dy, dz] of [[0.24, -0.07], [0.12, 0.12], [-0.02, 0.17], [-0.16, 0.08], [-0.26, -0.06]]) {
      artery('renal-arteries', pair([renalHilum, [1.02, 10.66 + dy * 0.55, -0.60 + dz * 0.7], [1.16, 10.66 + dy, -0.58 + dz]]), 0.014, 0.007);
      vein('renal-veins', pair([renalVein, [1.01, 10.61 + dy * 0.54, -0.54 + dz * 0.6], [1.13, 10.60 + dy, -0.53 + dz]]), 0.017, 0.008);
    }
    artery('iliac-arteries', pair([[0.67, 9.32, -0.22], [0.84, 9.22, -0.35], [1.02, 9.13, -0.45]]), 0.023, 0.012);
    artery('iliac-arteries', pair([[0.52, 9.06, -0.55], [0.64, 8.93, -0.54], [0.77, 8.84, -0.39]]), 0.017, 0.009);
    vein('iliac-veins', pair([[0.47, 9.70, -0.055], [0.64, 9.45, -0.19], [0.71, 9.16, -0.43], [0.88, 9.10, -0.44]]), 0.044, 0.017);

    for (const [x, y, z] of [[0.96, 7.71, 0.08], [0.89, 6.37, -0.19], [0.75, 5.42, -0.25]]) {
      artery('deep-femoral-arteries', pair([[x, y, z], [x + 0.15, y - 0.20, z - 0.13], [x + 0.18, y - 0.37, z - 0.22]]), 0.017, 0.008);
    }
    const knee: V3 = [0.59, 4.85, -0.26];
    for (const [dx, dy] of [[0.19, 0.16], [-0.16, 0.13], [0.18, -0.15], [-0.15, -0.12]]) {
      artery('leg-arteries', pair([knee, [0.59 + dx, 4.85 + dy, -0.14], [0.59 + dx * 1.05, 4.85 + dy, 0.10]]), 0.015, 0.007);
    }
    artery('fibular-arteries', pair([[0.62, 4.28, -0.20], [0.76, 3.91, -0.31], [0.80, 2.78, -0.33], [0.75, 1.72, -0.27], [0.72, 0.82, -0.16]]), 0.025, 0.012);
    artery('fibular-arteries', pair([[0.75, 1.72, -0.27], [0.75, 1.38, -0.02], [0.71, 1.01, 0.24]]), 0.013, 0.007);
    vein('leg-veins', pair([[0.54, 4.85, -0.16], [0.66, 4.10, 0.05], [0.64, 2.90, 0.15], [0.61, 1.47, 0.19], [0.59, 0.72, 0.24]]), 0.036, 0.018);
    // Small saphenous vein joins the popliteal vein behind the knee.
    vein('saphenous-veins', pair([[0.54, 4.85, -0.16], [0.58, 4.62, -0.47], [0.62, 3.31, -0.53], [0.68, 2.01, -0.44], [0.73, 0.75, -0.21], [0.67, 0.28, 1.04]]), 0.028, 0.016);

    const tarsus: V3 = [0.67, 0.23, 1.12];
    const toes: V3[] = [[0.55, 0.105, 1.80], [0.67, 0.105, 1.76], [0.77, 0.105, 1.66], [0.86, 0.105, 1.51], [0.95, 0.105, 1.35]];
    const dorsalArch: V3[] = [[0.55, 0.21, 1.28], [0.67, 0.21, 1.28], [0.77, 0.20, 1.25], [0.86, 0.19, 1.21], [0.92, 0.18, 1.13]];
    const plantar: V3 = [0.64, 0.20, 0.75];
    const plantarArch: V3[] = [[0.56, 0.10, 1.20], [0.66, 0.09, 1.22], [0.76, 0.09, 1.20], [0.85, 0.09, 1.17], [0.91, 0.09, 1.08]];
    artery('foot-arteries', pair([tarsus, dorsalArch[1], ...dorsalArch.slice(2)]), 0.019, 0.009);
    artery('foot-arteries', pair([dorsalArch[1], dorsalArch[0]]), 0.013, 0.009);
    artery('plantar-arteries', pair([plantar, [0.82, 0.11, 0.86], ...[...plantarArch].reverse()]), 0.019, 0.009);
    artery('plantar-arteries', pair([plantar, [0.57, 0.11, 1.02], plantarArch[0]]), 0.014, 0.009);
    artery('plantar-arteries', pair([tarsus, [0.67, 0.15, 1.14], plantarArch[1]]), 0.012, 0.011);
    for (const [i, [x, y, z]] of toes.entries()) {
      const digital: V3 = [x, y, z - 0.09];
      artery('foot-arteries', pair([dorsalArch[i], [x, 0.16, (z + dorsalArch[i][2]) / 2], digital, [x, y, z]]), 0.010, 0.0055);
      artery('plantar-arteries', pair([plantarArch[i], [x, 0.085, (z + plantarArch[i][2]) / 2], digital]), 0.009, 0.006);
    }
  }
  artery('visceral-arteries', [[0.29, 11.38, 0.20], [0.38, 11.52, 0.42], [0.52, 11.48, 0.59], [0.66, 11.36, 0.63]], 0.028, 0.014);
  for (const [x, y] of [[-0.59, 10.15], [0.58, 10.11], [0.28, 9.97]]) {
    artery('visceral-arteries', [[0.12, 10.35, 0.53], [x * 0.6, y + 0.14, 0.63], [x, y, 0.67]], 0.022, 0.010);
  }
  vein('portal-vein', [[-0.53, 11.41, 0.43], [-0.63, 11.48, 0.36], [-0.80, 11.54, 0.30]], 0.027, 0.012, false);
  vein('hepatic-veins', [[-0.60, 11.76, -0.10], [-0.69, 11.77, 0.19], [-0.80, 11.73, 0.40]], 0.031, 0.015);
  return { arteries, veins };
}
