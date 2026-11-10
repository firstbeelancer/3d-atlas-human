import type { BufferGeometry } from 'three';
import { capsule, smooth, smoothSubtract, type Sdf, type V3 } from '../skeleton/sdf';
import { spineZ } from '../skeleton/anatomy';
import { E, Er, grooved, mirrored, noise3, slab, textured, wobble } from './sdfx';
import { merge, sdfMesh, snap, tint, tube, wave } from './geo';
import type { GeometrySet } from './transfer';

/* Голова, шея и грудная клетка: мозг, внутренности черепа, уши, лёгкие, дыхательные пути, сердце. */

/* ---------------- Мозг ---------------- */

export function cerebrumField(): Sdf {
  const hemi = smooth(
    0.12,
    E([0.32, 16.8, -0.1], [0.33, 0.55, 0.84]),
    E([0.33, 16.62, 0.4], [0.3, 0.4, 0.4]),
    E([0.31, 16.58, -0.66], [0.3, 0.42, 0.36]),
    E([0.4, 16.28, 0.0], [0.2, 0.2, 0.5]),
  );
  const both = mirrored(hemi);
  // продольная щель до мозолистого тела и боковая (сильвиева) борозда
  const fissure = slab([0, 0, 0], [1, 0, 0], 0.018, [0, 17.2, -0.12], 0.78);
  const lateral = (s: number): Sdf => slab([0.4 * s, 16.55, 0.1], [0, 0.55, -0.35], 0.014, [0.55 * s, 16.5, 0.12], 0.42);
  // глазницы: передняя часть мозга лежит выше их крыши
  const orbit = mirrored(Er([0.3, 16.3, 0.62], [0.34, 0.26, 0.5], [0.3, 0, 0], 0.3));
  const brain = smoothSubtract(0.06, both, fissure, lateral(1), lateral(-1), orbit);
  return grooved(brain, 10.5, 0.04, 4, 0.16);
}

export function cerebellumField(): Sdf {
  const lobes = smooth(
    0.07,
    // мозжечок лежит в задней черепной ямке под затылочными долями и не выходит за затылок
    mirrored(E([0.22, 16.06, -0.7], [0.24, 0.2, 0.26])),
    E([0, 16.06, -0.72], [0.17, 0.2, 0.25]),
    E([0, 15.98, -0.24], [0.17, 0.13, 0.14]),
    capsule([0, 16.2, -0.26], [0, 15.75, -0.34], 0.12, 0.095),
    capsule([0, 15.78, -0.34], [0, 15.5, -0.38], 0.095, 0.085),
  );
  // тонкие складки мозжечка идут параллельными дугами
  return (x, y, z) => {
    const d = lobes(x, y, z);
    if (d > 0.1 || d < -0.2) return d;
    if (z > -0.58) return d;
    return d + 0.01 * Math.sin(y * 92 + 2.4 * noise3(x * 3, y * 3, z * 3));
  };
}

function spinalCord(): BufferGeometry {
  const pts: V3[] = [];
  for (let y = 15.55; y >= 11.2; y -= 0.25) pts.push([0, y, spineZ(y) - 0.27]);
  const main = tube(pts, (t) => 0.07 + 0.012 * Math.exp(-(((t - 0.12) / 0.1) ** 2)) + 0.012 * Math.exp(-(((t - 0.85) / 0.1) ** 2)), { radial: 10, segments: 120 });
  const parts: BufferGeometry[] = [main];
  // конский хвост
  for (let k = 0; k < 7; k++) {
    const s = (k - 3) / 3;
    const p: V3[] = [];
    for (let y = 11.2; y >= 9.95; y -= 0.25) p.push([s * 0.1 * (11.2 - y) * 0.9, y, spineZ(y) - 0.27 - 0.02 * Math.abs(s)]);
    parts.push(tube(p, 0.014, { radial: 5, segments: 12 }));
  }
  // корешки спинномозговых нервов
  for (let y = 15.5, i = 0; y > 10.2; y -= 0.27, i++) {
    const zc = spineZ(y) - 0.27;
    const drop = 0.1 + (i % 2) * 0.03;
    for (const s of [1, -1]) {
      parts.push(
        tube(
          [[0.05 * s, y, zc], [0.28 * s, y - drop * 0.7, zc + 0.03], [0.5 * s, y - drop * 2, zc + 0.1], [0.82 * s, y - drop * 2.8, zc + 0.12]],
          0.013,
          { radial: 5, segments: 8 },
        ),
      );
    }
  }
  return tint(merge(parts), (_x, y) => {
    const w = 0.92 + 0.08 * wave(y, 9, 3);
    return [w, w, w * 0.96];
  });
}

/* ---------------- Ухо ---------------- */

function earField(): Sdf {
  // ухо прилегает к голове (поверхность головы на этом уровне около x = 0,72)
  const C: V3 = [0.74, 16.08, -0.2];
  const rim: V3[] = [];
  const anti: V3[] = [];
  for (let i = 0; i <= 18; i++) {
    const th = 0.3 * Math.PI + (i / 18) * 1.65 * Math.PI;
    rim.push([C[0] + 0.045, C[1] + 0.02 + 0.33 * Math.sin(th), C[2] - 0.19 * Math.cos(th) - 0.02]);
  }
  for (let i = 0; i <= 12; i++) {
    const th = 0.5 * Math.PI + (i / 12) * 1.3 * Math.PI;
    anti.push([C[0] + 0.05, C[1] + 0.05 + 0.2 * Math.sin(th), C[2] - 0.1 * Math.cos(th) - 0.03]);
  }
  const chain = (pts: V3[], r0: number, r1: number): Sdf => {
    const parts: Sdf[] = [];
    for (let i = 0; i < pts.length - 1; i++) parts.push(capsule(pts[i], pts[i + 1], r0 + ((r1 - r0) * i) / pts.length, r0 + ((r1 - r0) * (i + 1)) / pts.length));
    return smooth(0.01, ...parts);
  };
  const plate = Er([C[0], C[1] + 0.02, C[2]], [0.035, 0.34, 0.2], [0, 0, 0.12]);
  const lobule = E([C[0] + 0.02, C[1] - 0.33, C[2] + 0.02], [0.05, 0.075, 0.07], 0.2);
  const tragus = E([C[0] + 0.01, C[1] - 0.07, C[2] + 0.2], [0.05, 0.07, 0.045], 0.2);
  let ear = smooth(0.035, plate, chain(rim, 0.04, 0.034), chain(anti, 0.028, 0.024), lobule, tragus);
  ear = smoothSubtract(0.04, ear, E([C[0] + 0.08, C[1] - 0.05, C[2] + 0.03], [0.07, 0.1, 0.08], 0.2));
  return ear;
}

/* ---------------- Лёгкие ---------------- */

function lungField(side: 1 | -1): Sdf {
  const s = side;
  const big = side === -1 ? 1.04 : 1;
  // Лёгкое вписано в грудную клетку скелета: стопка горизонтальных сечений по уровням рёбер.
  // Боковой край идёт на ~1 см внутри рёбер (ширина клетки: ±0,57 у 1-го ребра, ±1,03 у 3-го,
  // ±1,35 у 6-го), медиальный — у средостения; верхушка поднимается на 2–3 см над ключицей.
  // [y, боковой край, центр по глубине, полуглубина]
  const LEVELS: [number, number, number, number][] = [
    [14.46, 0.44, -0.05, 0.16],
    [14.2, 0.52, -0.08, 0.38],
    [13.88, 0.72, -0.1, 0.6],
    [13.56, 0.9, -0.1, 0.74],
    [13.25, 1.02, -0.08, 0.84],
    [12.95, 1.12, -0.07, 0.9],
    [12.65, 1.2, -0.08, 0.92],
    [12.35, 1.27, -0.12, 0.9],
    [12.05, 1.32, -0.2, 0.8],
    [11.8, 1.33, -0.42, 0.5],
  ];
  const MEDIAL = 0.25;
  let lung = smooth(
    0.16,
    ...LEVELS.map(([y, lat, zc, d]) => {
      const w = ((lat - MEDIAL) / 2) * big;
      return E([(MEDIAL + w) * s, y, zc], [w, 0.3, d * big]);
    }),
  );
  // вогнутое основание лежит на диафрагме
  const domeY = side === -1 ? 11.05 : 10.8;
  lung = smoothSubtract(0.2, lung, E([0.95 * s, domeY, -0.1], [1.2, 1.28, 1.25], 0.4));
  // левое лёгкое: сердечная вырезка, правое — слегка уже у печени
  if (side === 1) lung = smoothSubtract(0.28, lung, Er([0.2, 12.55, 0.55], [0.72, 0.85, 0.6], [0, 0, 0.5], 0.4));
  else lung = smoothSubtract(0.22, lung, E([-0.15, 12.7, 0.62], [0.5, 0.55, 0.45], 0.4));
  // ворота лёгкого — вмятина на средней стенке
  lung = smoothSubtract(0.1, lung, E([0.3 * s, 12.7, -0.08], [0.22, 0.34, 0.3], 0.3));
  // косая щель (обе стороны) и горизонтальная щель (справа)
  const oblique = slab([0.95 * s, 12.7, 0.1], [0, 0.68, 0.73], 0.02, [1.3 * s, 12.7, 0.05], 0.95);
  lung = smoothSubtract(0.1, lung, oblique);
  if (side === -1) {
    const horiz = slab([-1.1, 13.0, 0.5], [0, 1, 0.12], 0.02, [-1.2, 13.0, 0.5], 0.7);
    lung = smoothSubtract(0.1, lung, horiz);
  }
  return textured(wobble(lung, 2.2, 0.02), 24, 0.005, 0.12);
}

function bronchi(): BufferGeometry {
  const rings = 20;
  const trachea = tube(
    [[0, 15.02, 0.16], [0, 14.4, 0.1], [0, 13.7, 0.01], [0, 13.12, -0.1]],
    (t) => {
      const ring = Math.pow(Math.max(0, Math.sin(t * rings * Math.PI)), 0.5);
      const r = 0.105 + 0.011 * ring;
      return [r * 1.04, r * 0.92];
    },
    { segments: 260, radial: 16 },
  );
  const branch = (pts: V3[], r0: number): BufferGeometry =>
    tube(pts, (t) => r0 * (1 - 0.35 * t) * (1 + 0.1 * Math.pow(Math.max(0, Math.sin(t * 9 * Math.PI)), 0.5)), { segments: 80, radial: 12 });
  const list: BufferGeometry[] = [trachea];
  for (const s of [1, -1] as const) {
    const sc = s === 1 ? 0.92 : 1;
    list.push(branch([[0, 13.12, -0.1], [0.28 * s, 12.98, -0.1], [0.55 * s, 12.78, -0.08], [0.78 * s, 12.5, -0.06]], 0.085 * sc));
    // долевые бронхи у ворот лёгкого
    list.push(branch([[0.7 * s, 12.55, -0.07], [0.88 * s, 12.95, -0.04], [0.98 * s, 13.4, -0.02]], 0.05));
    list.push(branch([[0.72 * s, 12.5, -0.07], [0.92 * s, 12.1, 0.0], [1.0 * s, 11.8, 0.02]], 0.05));
    if (s === -1) list.push(branch([[0.74 * s, 12.58, -0.05], [0.98 * s, 12.6, 0.2], [1.1 * s, 12.62, 0.4]], 0.045));
  }
  return tint(merge(list), (_x, y) => {
    const w = 0.94 + 0.06 * wave(y, 40, 7);
    return [w, w, w];
  });
}

function larynx(): BufferGeometry {
  const C: V3 = [0, 15.02, 0.36];
  const plate = (s: number): Sdf => Er([C[0] + 0.1 * s, C[1] + 0.02, C[2] + 0.02], [0.022, 0.17, 0.13], [0, 0.55 * s, 0]);
  const shield = smooth(0.03, plate(1), plate(-1), E([0, C[1] + 0.02, C[2] + 0.12], [0.03, 0.15, 0.03], 0.1));
  const cricoid = smoothSubtract(0.02, E([0, C[1] - 0.2, C[2] - 0.06], [0.13, 0.07, 0.12], 0.1), E([0, C[1] - 0.2, C[2] - 0.06], [0.09, 0.1, 0.08], 0.1));
  const hy: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI - Math.PI / 2;
    hy.push([0.3 * Math.sin(a), 15.3, 0.34 + 0.12 * Math.cos(a) * 0 + 0.1 * Math.cos(a) - 0.12 * Math.abs(Math.sin(a))]);
  }
  const hyoid = tube(hy, 0.034, { radial: 8, segments: 40 });
  const g = sdfMesh(smooth(0.02, shield, cricoid), [-0.35, 14.7, 0.1], [0.35, 15.35, 0.7], 0.018, 0.02);
  return merge([g, hyoid]);
}

function thyroid(): BufferGeometry {
  const lobe = (s: number): Sdf => Er([0.19 * s, 14.62, 0.22], [0.1, 0.3, 0.09], [0, 0, -0.12 * s], 0.2);
  const f = smooth(0.06, lobe(1), lobe(-1), E([0, 14.74, 0.26], [0.2, 0.045, 0.045], 0.2));
  return sdfMesh(textured(f, 30, 0.004), [-0.4, 14.2, 0.0], [0.4, 15.0, 0.5], 0.02, 0.02);
}

/* ---------------- Сердце ---------------- */

export function heartField(): Sdf {
  const f = smooth(
    0.1,
    Er([0.55, 12.55, 0.25], [0.4, 0.62, 0.4], [-0.35, 0, 0.65], 0.4),
    Er([0.1, 12.65, 0.52], [0.4, 0.55, 0.28], [-0.3, 0, 0.4], 0.4),
    E([-0.35, 12.85, 0.2], [0.28, 0.42, 0.28], 0.4),
    E([0.3, 13.2, -0.08], [0.38, 0.2, 0.28], 0.4),
    E([-0.1, 13.3, 0.55], [0.16, 0.13, 0.1], 0.4),
    E([0.72, 13.1, 0.4], [0.16, 0.12, 0.1], 0.4),
    E([0.12, 13.2, 0.25], [0.16, 0.12, 0.16], 0.4),
  );
  return wobble(f, 5, 0.012);
}

function coronaries(): { arteries: BufferGeometry; veins: BufferGeometry } {
  const h = heartField();
  const onHeart = (pts: V3[], lift = 0.012): V3[] => pts.map((p) => snap(h, p, lift, 10));
  const art: BufferGeometry[] = [];
  const ven: BufferGeometry[] = [];
  const lad = onHeart([[0.18, 13.05, 0.45], [0.3, 12.7, 0.62], [0.5, 12.3, 0.62], [0.72, 11.95, 0.5], [0.9, 12.05, 0.35]]);
  const rca = onHeart([[0.0, 13.15, 0.48], [-0.3, 12.95, 0.45], [-0.58, 12.6, 0.36], [-0.5, 12.2, 0.4], [-0.22, 11.95, 0.5], [0.15, 12.0, 0.55]]);
  const cx = onHeart([[0.35, 13.12, 0.18], [0.65, 13.0, 0.0], [0.85, 12.65, -0.1], [0.92, 12.2, 0.0]]);
  for (const pts of [lad, rca, cx]) art.push(tube(pts, (t) => 0.028 * (1 - 0.55 * t), { radial: 8, segments: 60 }));
  // ветви
  art.push(tube(onHeart([[0.4, 12.5, 0.62], [0.2, 12.35, 0.6], [0.02, 12.3, 0.55]]), 0.012, { radial: 6, segments: 20 }));
  art.push(tube(onHeart([[0.62, 12.15, 0.55], [0.8, 12.4, 0.5], [0.9, 12.6, 0.38]]), 0.012, { radial: 6, segments: 20 }));
  art.push(tube(onHeart([[-0.5, 12.3, 0.4], [-0.62, 12.1, 0.3], [-0.55, 11.95, 0.18]]), 0.012, { radial: 6, segments: 20 }));
  // вены сердца
  const gcv = onHeart([[0.88, 12.15, 0.12], [0.75, 12.5, 0.45], [0.55, 12.3, 0.6], [0.4, 12.75, 0.62], [0.28, 13.05, 0.5]], 0.01);
  ven.push(tube(gcv, 0.022, { radial: 8, segments: 60 }));
  ven.push(tube(onHeart([[0.88, 12.3, -0.1], [0.55, 12.8, -0.1], [0.05, 12.95, -0.05], [-0.3, 12.55, 0.05]], 0.01), 0.026, { radial: 8, segments: 50 }));
  return { arteries: merge(art), veins: merge(ven) };
}

/* ---------------- Сборка ---------------- */

export function buildThorax(): GeometrySet {
  const out: GeometrySet = {};
  out.brain = sdfMesh(cerebrumField(), [-0.78, 15.9, -1.05], [0.78, 17.45, 0.9], 0.018, 0.02);
  out.cerebellum = sdfMesh(cerebellumField(), [-0.7, 15.4, -1.2], [0.7, 16.5, -0.1], 0.018, 0.03);
  out.cord = spinalCord();
  out.optic = tint(
    merge([
      tube([[0.3, 16.33, 0.68], [0.22, 16.3, 0.42], [0.09, 16.16, 0.2], [0.0, 16.12, 0.16]], 0.03, { radial: 8, segments: 24 }),
      tube([[-0.3, 16.33, 0.68], [-0.22, 16.3, 0.42], [-0.09, 16.16, 0.2], [0.0, 16.12, 0.16]], 0.03, { radial: 8, segments: 24 }),
    ]),
    () => [1, 1, 0.95],
  );
  out.ear = sdfMesh(earField(), [0.55, 15.55, -0.7], [1.2, 16.65, 0.35], 0.016, 0.025);
  out.lungL = sdfMesh(lungField(1), [0.0, 11.3, -1.05], [1.6, 14.85, 0.95], 0.04, 0.05);
  out.lungR = sdfMesh(lungField(-1), [-1.65, 11.3, -1.05], [0.0, 14.85, 0.95], 0.04, 0.05);
  out.bronchi = bronchi();
  out.larynx = larynx();
  out.thyroid = thyroid();
  out.heart = sdfMesh(heartField(), [-0.9, 11.8, -0.6], [1.3, 13.9, 1.0], 0.026, 0.05);
  const c = coronaries();
  out.coronaryArteries = c.arteries;
  out.coronaryVeins = c.veins;
  return out;
}

