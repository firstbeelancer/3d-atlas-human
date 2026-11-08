import type { BufferGeometry } from 'three';
import { capsule, smooth, smoothSubtract, type Sdf, type V3 } from '../skeleton/sdf';
import { E, Er, mirrored, slab, textured, wobble } from './sdfx';
import { curveOf, merge, sdfMesh, tint, tube, wave } from './geo';
import type { GeometrySet } from './transfer';

/* Брюшная полость и таз: печень, жёлчный пузырь, желудок, селезёнка, поджелудочная, кишечник, почки, мочевой пузырь. */

function chainField(pts: V3[], radii: number[], k = 0.05): Sdf {
  const parts: Sdf[] = [];
  for (let i = 0; i < pts.length - 1; i++) parts.push(capsule(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  return smooth(k, ...parts);
}

function liverField(): Sdf {
  let liver = smooth(
    0.2,
    Er([-0.55, 11.75, 0.0], [0.9, 0.78, 0.86], [0, 0, -0.14]),
    Er([0.5, 11.72, 0.46], [0.68, 0.34, 0.44], [0, 0, 0.2]),
    E([-0.12, 11.6, -0.42], [0.3, 0.34, 0.26]),
    E([-0.5, 11.4, 0.5], [0.5, 0.4, 0.4]),
  );
  // висцеральная поверхность вогнута, на ней желчный пузырь и ворота печени
  liver = smoothSubtract(0.18, liver, E([-0.45, 10.35, -0.1], [1.4, 0.7, 1.25], 0.4));
  liver = smoothSubtract(0.06, liver, E([-0.62, 11.0, 0.66], [0.17, 0.26, 0.18], 0.3));
  liver = smoothSubtract(0.05, liver, slab([0.18, 11.7, 0.5], [1, 0, 0.12], 0.02, [0.18, 11.4, 0.65], 0.7));
  liver = smoothSubtract(0.08, liver, E([-0.12, 11.25, 0.1], [0.14, 0.1, 0.24], 0.3));
  return textured(wobble(liver, 2.5, 0.02), 20, 0.006, 0.12);
}

function gallbladder(): BufferGeometry {
  const f = smooth(
    0.07,
    Er([-0.62, 11.0, 0.62], [0.13, 0.27, 0.13], [0.3, 0, 0.1], 0.2),
    E([-0.56, 10.78, 0.7], [0.11, 0.14, 0.11], 0.2),
    capsule([-0.5, 11.25, 0.5], [-0.34, 11.2, 0.28], 0.035, 0.03),
  );
  return sdfMesh(f, [-0.9, 10.4, 0.2], [-0.15, 11.5, 1.0], 0.018, 0.025);
}

function stomachField(): Sdf {
  const f = smooth(
    0.22,
    E([1.0, 11.88, -0.15], [0.5, 0.46, 0.46]),
    chainField([[0.98, 11.78, -0.05], [0.9, 11.2, 0.15], [0.62, 10.64, 0.32]], [0.5, 0.5, 0.42], 0.2),
    chainField([[0.62, 10.64, 0.32], [0.2, 10.62, 0.48], [-0.2, 10.98, 0.52], [-0.4, 11.1, 0.5]], [0.4, 0.3, 0.2, 0.14], 0.12),
    capsule([0.42, 12.15, -0.15], [0.45, 11.85, -0.1], 0.1, 0.13),
  );
  // малая кривизна — вогнутая, у входа в желудок угол
  const lesser = smoothSubtract(0.12, f, E([0.2, 11.28, 0.35], [0.28, 0.4, 0.5], 0.3));
  return textured(wobble(lesser, 3, 0.015), 16, 0.007, 0.12);
}

function esophagus(): BufferGeometry {
  return tube(
    [[0, 15.0, -0.06], [0, 14.3, -0.22], [0, 13.4, -0.32], [0.08, 12.7, -0.3], [0.3, 12.22, -0.2], [0.42, 12.08, -0.15]],
    (t) => [0.085 + 0.02 * Math.sin(t * 9), 0.062],
    { segments: 150, radial: 14 },
  );
}

function spleenField(): Sdf {
  // селезёнка — под 9–11 рёбрами слева, сзади и сбоку от желудка, над левой почкой; 11×7×4 см
  const f = smooth(0.06, Er([1.05, 11.65, -0.55], [0.2, 0.52, 0.32], [0, 0, 0.28]), E([0.98, 11.4, -0.45], [0.15, 0.28, 0.2]));
  return smoothSubtract(0.02, wobble(f, 4, 0.02), slab([0.86, 11.65, -0.45], [1, 0, 0.5], 0.01, [0.86, 11.95, -0.45], 0.3));
}

function pancreasField(): Sdf {
  const f = smooth(
    0.08,
    E([-0.3, 10.55, 0.15], [0.3, 0.32, 0.2]),
    chainField([[-0.1, 10.78, 0.2], [0.4, 10.9, 0.1], [0.85, 11.04, -0.16], [1.08, 11.3, -0.4]], [0.17, 0.15, 0.14, 0.1], 0.04),
    capsule([-0.28, 10.4, 0.1], [-0.05, 10.3, 0.1], 0.12, 0.09),
  );
  return textured(f, 15, 0.018, 0.1);
}

function kidney(s: 1 | -1): Sdf {
  const y = s === 1 ? 10.78 : 10.6;
  let f = smooth(0.1, Er([0.84 * s, y, -0.52], [0.3, 0.6, 0.25], [0, 0, 0.12 * s]), E([0.84 * s, y + 0.05, -0.52], [0.26, 0.5, 0.26]));
  f = smoothSubtract(0.07, f, E([0.55 * s, y, -0.5], [0.15, 0.2, 0.2], 0.3));
  return wobble(f, 3, 0.012);
}

function kidneyInner(s: 1 | -1): BufferGeometry {
  const y = s === 1 ? 10.78 : 10.6;
  const pelvis = tube([[0.62 * s, y + 0.1, -0.5], [0.52 * s, y - 0.02, -0.5], [0.46 * s, y - 0.28, -0.5]], 0.045, { radial: 8, segments: 14 });
  return pelvis;
}

function adrenal(s: 1 | -1): Sdf {
  const f = smooth(0.03, Er([0.58 * s, 11.48, -0.5], [0.14, 0.06, 0.1], [0, 0, 0.4 * s], 0.2), E([0.52 * s, 11.52, -0.5], [0.08, 0.1, 0.07], 0.2));
  return textured(f, 40, 0.004);
}

function bladderField(): Sdf {
  const f = smooth(0.1, Er([0, 9.1, 0.36], [0.4, 0.34, 0.36], [0.2, 0, 0]), E([0, 9.4, 0.2], [0.12, 0.12, 0.12]));
  return wobble(f, 4, 0.012);
}

function intestineColor(g: BufferGeometry, a: number, b: number): BufferGeometry {
  return tint(g, (x, y, z) => {
    const w = wave(x * 3 + y * 5 + z * 4, a, b);
    return [0.95 + 0.05 * w, 0.88 + 0.1 * w, 0.86 + 0.1 * w];
  });
}

function smallIntestine(): BufferGeometry {
  const pts: V3[] = [];
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    const dir = r % 2 === 0 ? 1 : -1;
    const y0 = 10.35 - r * 0.15;
    const m = 70;
    for (let k = 0; k <= m; k++) {
      const u = k / m;
      const x = dir * (-0.88 + 1.76 * u) * (0.92 + 0.08 * Math.sin(r * 2.1));
      const y = y0 + 0.075 * Math.sin(u * Math.PI * 2 * 5 + r * 1.3) + 0.04 * Math.sin(u * Math.PI * 2 * 11 + r);
      const z = 0.5 + 0.34 * Math.sin(u * Math.PI * 2 * 3 + r * 2.0) + 0.1 * Math.cos(u * Math.PI * 2 * 7 + r * 0.7);
      pts.push([x, y, z]);
    }
  }
  // отрезок, идущий в слепую кишку
  pts.push([-0.9, 9.5, 0.45], [-1.0, 9.42, 0.34]);
  const curve = curveOf(pts);
  const len = curve.getLength();
  return intestineColor(
    tube(pts, (t) => 0.105 * (0.95 + 0.05 * Math.sin(t * len * 3)), { segments: Math.round(len * 40), radial: 10 }),
    17,
    5,
  );
}

function duodenum(): BufferGeometry {
  return intestineColor(
    tube(
      [[-0.4, 11.08, 0.46], [-0.62, 10.9, 0.3], [-0.74, 10.5, 0.1], [-0.62, 10.12, 0.0], [-0.25, 9.98, -0.04], [0.15, 10.08, -0.04], [0.5, 10.38, 0.0], [0.62, 10.5, 0.08]],
      0.115,
      { segments: 120, radial: 12 },
    ),
    9,
    3,
  );
}

function colon(): BufferGeometry {
  const path: V3[] = [
    [-1.12, 9.3, 0.3], [-1.18, 9.9, 0.2], [-1.22, 10.5, 0.12], [-1.12, 11.0, 0.05], // восходящая
    [-0.9, 10.98, 0.5], [-0.45, 10.62, 0.78], [0.1, 10.5, 0.8], [0.6, 10.72, 0.72], [1.0, 11.1, 0.3], // поперечная
    [1.3, 11.1, -0.2], [1.32, 10.5, -0.28], [1.28, 9.8, -0.25], // нисходящая
    [1.0, 9.25, -0.05], [0.7, 9.1, 0.25], [0.45, 9.38, 0.2], [0.2, 9.12, 0.02], [0.05, 9.15, -0.32], // сигмовидная
    [0.0, 9.0, -0.55], [0.0, 8.75, -0.68], [0.0, 8.5, -0.6], // прямая
  ];
  const curve = curveOf(path);
  const len = curve.getLength();
  const period = 0.44;
  const g = tube(
    path,
    (t) => {
      const h = Math.pow(Math.abs(Math.sin((Math.PI * t * len) / period)), 0.55);
      const base = t > 0.88 ? 0.15 : 0.2;
      const r = base * (0.86 + 0.14 * h);
      return [r, r * 0.96];
    },
    { segments: Math.round(len * 46), radial: 14 },
  );
  const cecum = sdfMesh(E([-1.1, 9.22, 0.28], [0.22, 0.2, 0.22], 0.2), [-1.5, 8.8, -0.1], [-0.7, 9.6, 0.7], 0.014);
  const appendix = tube([[-1.02, 9.12, 0.3], [-0.9, 8.95, 0.35], [-0.78, 8.88, 0.28], [-0.72, 8.98, 0.2]], (t) => 0.04 * (1 - 0.3 * t), { segments: 30, radial: 8 });
  return intestineColor(merge([g, cecum, appendix]), 14, 4);
}

function ureters(): BufferGeometry {
  const one = (s: 1 | -1): BufferGeometry =>
    tube(
      [[0.46 * s, (s === 1 ? 10.5 : 10.32), -0.5], [0.5 * s, 10.0, -0.5], [0.55 * s, 9.5, -0.42], [0.46 * s, 9.15, -0.1], [0.28 * s, 9.05, 0.12]],
      0.028,
      { segments: 80, radial: 8 },
    );
  return merge([one(1), one(-1)]);
}

export function buildAbdomen(): GeometrySet {
  const out: GeometrySet = {};
  out.liver = sdfMesh(liverField(), [-1.65, 10.7, -0.75], [1.2, 12.65, 1.05], 0.032, 0.05);
  out.gallbladder = gallbladder();
  out.stomach = sdfMesh(stomachField(), [-0.7, 10.0, -0.7], [1.65, 12.5, 0.95], 0.03, 0.045);
  out.esophagus = esophagus();
  out.spleen = sdfMesh(spleenField(), [0.6, 10.9, -1.0], [1.5, 12.35, -0.05], 0.024, 0.03);
  out.pancreas = sdfMesh(pancreasField(), [-0.7, 10.0, -0.4], [1.3, 11.8, 0.6], 0.022, 0.03);
  out.kidneyL = sdfMesh(kidney(1), [0.4, 10.0, -0.9], [1.3, 11.5, -0.15], 0.022, 0.03);
  out.kidneyR = sdfMesh(kidney(-1), [-1.3, 9.9, -0.9], [-0.4, 11.4, -0.15], 0.022, 0.03);
  out.kidneyPelvis = merge([kidneyInner(1), kidneyInner(-1)]);
  out.adrenal = sdfMesh(mirrored(adrenal(1)), [-0.8, 11.3, -0.75], [0.8, 11.75, -0.25], 0.016, 0.015);
  out.bladder = sdfMesh(bladderField(), [-0.6, 8.6, -0.1], [0.6, 9.7, 0.85], 0.024, 0.03);
  out.ureters = ureters();
  out.duodenum = duodenum();
  out.smallIntestine = smallIntestine();
  out.colon = colon();
  return out;
}
