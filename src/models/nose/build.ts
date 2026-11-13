import type { BufferGeometry } from 'three';
import { SphereGeometry } from 'three';
import {
  ANS,
  CAVITY_HALF_W,
  CHOANA_Z,
  CRIBRIFORM_Z,
  DORSUM_PTS,
  FLOOR_Y,
  NOSE_PART_IDS,
  ROOF_Y,
  type V3,
} from './anatomy';
import { add, blob, bothSides, bump, cross, ellipsoid, empty, grid, lerp, loft, merge, mirrorX, norm, plate, ring, smoothOutline, smoothstep, spline, sweep, tube, xf } from './geometry';
import { EXTERNAL_BOX, externalField, externalPart, faceZ, nostrilFrame, nostrilWallPoint, skinTint } from './field';
import { meshField, splitMesh } from './mesh';

export type MatKey =
  | 'skin'
  | 'skinInner'
  | 'dark'
  | 'hair'
  | 'bone'
  | 'boneGhost'
  | 'cartilage'
  | 'mucosa'
  | 'mucosaWet'
  | 'air'
  | 'sinus'
  | 'nerve'
  | 'ganglion'
  | 'artery'
  | 'vein'
  | 'muscle'
  | 'gland'
  | 'olfactory'
  | 'bulb'
  | 'ghostFace'
  | 'eye'
  | 'tonsil'
  | 'lymph';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Не участвует в выборе мышью (мелочь внутри крупных частей). */
  noPick?: boolean;
}

const RIGHT: V3 = [1, 0, 0];
const TAU = Math.PI * 2;

/* ---------- Наружный нос: сечения вдоль спинки ---------- */

const dorsum = spline(DORSUM_PTS);
/** Параметр кончика на сплайне спинки. */
const T_TIP = 0.66;

/** Полуширина и «высота» сечения носа по положению на спинке. */
function section(t: number): { a: number; b: number; n: number } {
  // корень узкий и невысокий, спинка расширяется, кончик округлый, колумелла узкая
  const a = t < T_TIP
    ? lerp(9.5, 10.5, smoothstep(0, 0.25, t)) + 3 * smoothstep(0.3, 0.62, t) + 1.5 * bump(t, 0.6, 0.14)
    : lerp(13.5, 3.6, smoothstep(T_TIP, 0.82, t));
  const b = t < T_TIP
    ? lerp(7, 11, smoothstep(0, 0.4, t)) + 2 * bump(t, 0.6, 0.12)
    : lerp(12, 3.2, smoothstep(T_TIP, 0.8, t));
  // показатель суперэллипса: у корня сечение остроконечное, у кончика круглое
  const n = lerp(2.4, 2.1, smoothstep(0, 0.5, t));
  return { a, b, n };
}

/** Локальная система сечения: центр на спинке, right = ось x, up = наружу от лица. */
function frame(t: number): { c: V3; up: V3 } {
  const c = dorsum.at(t);
  const d = norm(dorsum.dir(t));
  const up = norm(cross(d, RIGHT));
  return { c, up };
}

/**
 * Открытая оболочка носа: по дуге th0..th1 (0 — правый край у лица, pi/2 — гребень спинки, pi — левый край),
 * на долях спинки t0..t1, смещённая внутрь на depth мм. thickness > 0 даёт замкнутое сечение (пластина).
 */
function shell(t0: number, t1: number, th0: number, th1: number, depth: number, thickness = 0, stations = 28, segs = 40): BufferGeometry {
  const rings: V3[][] = [];
  for (let i = 0; i <= stations; i++) {
    const t = lerp(t0, t1, i / stations);
    const { c: c0, up } = frame(t);
    const { a, b, n } = section(t);
    // сплайн спинки — это линия кожи: центр сечения лежит под ней
    const c = add(c0, up, -b * 0.82);
    const e = 2 / n;
    const arc = (dep: number): V3[] => {
      const out: V3[] = [];
      for (let j = 0; j <= segs; j++) {
        const th = lerp(th0, th1, j / segs);
        const cx = Math.sign(Math.cos(th)) * Math.pow(Math.abs(Math.cos(th)), e);
        const cy = Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), e);
        // отступ внутрь — вдоль нормали сечения (приближённо радиально)
        const k = 1 - dep / Math.max(a, b);
        out.push(add(add(c, RIGHT, a * cx * k), up, b * cy * k));
      }
      return out;
    };
    if (thickness > 0) {
      const outer = arc(depth);
      const inner = arc(depth + thickness).reverse();
      rings.push([...outer, ...inner]);
    } else rings.push(arc(depth));
  }
  return loft(rings, { closed: thickness > 0, capStart: thickness > 0, capEnd: thickness > 0 });
}

function buildExternal(): Record<string, BufferGeometry> {
  // единая органическая поверхность: спинка, кончик с дольками, крылья, колумелла и настоящие ноздри
  const skin = meshField(externalField, EXTERNAL_BOX, 0.6, { uvScale: 1 / 32, color: skinTint, smooth: 2 });
  const parts = splitMesh(skin, externalPart);
  skin.dispose();
  // волоски преддверия: растут со стенок канала ноздри
  const hairs: BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const s of [1, -1] as const) {
    const f = nostrilFrame(s);
    const ax = norm([f.b[0] - f.a[0], f.b[1] - f.a[1], f.b[2] - f.a[2]]);
    for (let i = 0; i < 24; i++) {
      const w = 2.5 + rnd() * 6;
      const th = rnd() * TAU;
      const base = nostrilWallPoint(s, w, th);
      const inward = norm([f.a[0] + ax[0] * (w + 3) - base[0], f.a[1] + ax[1] * (w + 3) - base[1], f.a[2] + ax[2] * (w + 3) - base[2]]);
      const dir = norm([inward[0] + (rnd() - 0.5) * 0.5, inward[1] + 0.4 + rnd() * 0.3, inward[2] + (rnd() - 0.5) * 0.5]);
      const len = 2.5 + rnd() * 2.5;
      hairs.push(tube([base, add(base, dir, len * 0.5), add(add(base, dir, len), [0, 0.4, 0], 1)], 0.14, { segs: 6, radial: 5 }));
    }
  }
  parts.vibrissae = merge(hairs);
  return parts;
}

/* ---------- Костно-хрящевой скелет ---------- */

/** Пластина в сагиттальной плоскости x = x0: контур задаётся парами (z, y). */
function sagittal(outline: [number, number][], thickness: number, x0 = 0, smooth = true): BufferGeometry {
  const o = smooth ? smoothOutline(outline, 64) : outline;
  // локальный x -> мировой z, локальный y -> мировой y, толщина по мировому x
  return plate(o, thickness, { pos: [x0, 0, 0], rot: [0, -Math.PI / 2, 0] });
}
/** Пластина в горизонтальной плоскости y = y0: контур (x, z). */
function horizontal(outline: [number, number][], thickness: number, y0: number, smooth = true): BufferGeometry {
  // поворот вокруг x на -90°: локальный y уходит в мировой -z
  const o = (smooth ? smoothOutline(outline, 64) : outline).map(([x, z]) => [x, -z] as [number, number]);
  return plate(o, thickness, { pos: [0, y0, 0], rot: [-Math.PI / 2, 0, 0] });
}

function buildSkeleton(): Record<string, BufferGeometry> {
  const nasalBones = merge([
    shell(0.06, 0.42, 0.30 * Math.PI, 0.475 * Math.PI, 1.7, 1.7, 14, 12),
    shell(0.06, 0.42, 0.525 * Math.PI, 0.70 * Math.PI, 1.7, 1.7, 14, 12),
  ]);
  const frontalProcess = merge([
    shell(0.0, 0.4, 0.72 * Math.PI, 1.1 * Math.PI, 1.6, 1.8, 12, 12),
    shell(0.0, 0.4, -0.1 * Math.PI, 0.28 * Math.PI, 1.6, 1.8, 12, 12),
  ]);
  const ulc = shell(0.4, 0.6, 0.16 * Math.PI, 0.84 * Math.PI, 1.6, 1.2, 12, 24);
  // большой крыльный хрящ: подковообразная пластинка — медиальная ножка, купол, латеральная ножка
  const alarCrus = (s: 1 | -1) =>
    sweep(
      [
        [s * 1.5, -19.5, 30.5],
        [s * 1.9, -14, 36.5],
        [s * 2.3, -10, 40.2],
        [s * 3.4, -7.2, 42.3],
        [s * 6.5, -6.3, 40.8],
        [s * 10.5, -6.8, 36.5],
        [s * 13.5, -8.5, 31.5],
        [s * 15.0, -11, 27.5],
      ],
      [
        [s, 0, 0.2],
        [s, 0, 0.3],
        [s * 0.7, 0.2, 0.8],
        [s * 0.5, 0.3, 1],
        [s * 0.7, 0.3, 0.7],
        [s * 0.85, 0.2, 0.5],
        [s * 0.9, 0.1, 0.4],
        [s * 0.9, 0, 0.3],
      ],
      (t) => [lerp(1.1, 2.3, smoothstep(0.15, 0.6, t)) * (1 - 0.25 * smoothstep(0.8, 1, t)), 0.55],
      { segs: 40, radial: 14, n: 2.8 },
    );
  const alar = merge([alarCrus(1), alarCrus(-1)]);
  const septalCartilage = sagittal(
    [
      [22, -17],
      [30, -12],
      [36, -5],
      [36, 0],
      [31, 9],
      [26, 13],
      [14, 13],
      [2, 12],
      [-2, 4],
      [-4, -8],
      [4, -17],
    ],
    2.2,
  );
  const perpendicular = sagittal(
    [
      [-2, 27],
      [2, 20],
      [2, 12],
      [-2, 4],
      [-4, -8],
      [-16, -6],
      [-30, 2],
      [-36, 12],
      [-32, 24],
      [-26, 27],
    ],
    1.8,
  );
  const vomer = sagittal(
    [
      [-38, 10],
      [-30, 2],
      [-16, -6],
      [-4, -8],
      [6, -17],
      [10, -20],
      [-10, -21],
      [-30, -21],
      [-42, -16],
      [-42, 4],
    ],
    1.6,
  );
  const spine = tube([[0, -19, 14], [0, -19, 19], ANS], (t) => 2.8 * (1 - t * 0.85), { segs: 10, radial: 10 });
  const cribriform = merge([
    horizontal(
      [
        [-9, CRIBRIFORM_Z[0]],
        [9, CRIBRIFORM_Z[0]],
        [10.5, (CRIBRIFORM_Z[0] + CRIBRIFORM_Z[1]) / 2],
        [9, CRIBRIFORM_Z[1]],
        [-9, CRIBRIFORM_Z[1]],
        [-10.5, (CRIBRIFORM_Z[0] + CRIBRIFORM_Z[1]) / 2],
      ],
      1.4,
      ROOF_Y,
    ),
    // петушиный гребень над пластинкой
    sagittal(
      [
        [-4, ROOF_Y],
        [-6, ROOF_Y + 9],
        [-12, ROOF_Y + 10],
        [-20, ROOF_Y + 6],
        [-22, ROOF_Y],
      ],
      1.6,
    ),
  ]);
  return {
    'nasal-bones': nasalBones,
    'frontal-process': frontalProcess,
    'upper-lateral-cartilage': ulc,
    'alar-cartilage': alar,
    'septal-cartilage': septalCartilage,
    'perpendicular-plate': perpendicular,
    vomer,
    'anterior-nasal-spine': spine,
    'cribriform-plate': cribriform,
  };
}

/* ---------- Полость носа ---------- */

/** Носовая раковина: свёрнутый валик вдоль оси z, прикреплённый к латеральной стенке. */
function concha(xa: number, ya: number, z0: number, z1: number, r0: number, thick: number, curl: number, stations = 34): BufferGeometry {
  // носовая раковина: свёрнутая в рулончик пластинка, прикреплённая к латеральной стенке;
  // свободный край закручен медиально — так она выглядит на сагиттальном и фронтальном срезе
  const J = 26;
  const cx = xa - r0 * 0.9;
  const cy = ya - r0 * 0.35;
  const th0 = 0.3 * Math.PI;
  const sweepAng = curl * Math.PI;
  const rings: V3[][] = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const z = lerp(z0, z1, t);
    const taper = Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.max(0.001, t))), 0.5);
    const outer: V3[] = [];
    const inner: V3[] = [];
    for (let j = 0; j <= J; j++) {
      const f = j / J;
      const phi = sweepAng * f;
      const r = r0 * (1 - 0.45 * f) * taper;
      const th = th0 + phi;
      const px = cx + r * Math.cos(th);
      const py = cy + r * Math.sin(th);
      const nx = Math.cos(th);
      const ny = Math.sin(th);
      const ht = (thick / 2) * taper;
      outer.push([px + nx * ht, py + ny * ht, z]);
      inner.push([px - nx * ht, py - ny * ht, z]);
    }
    rings.push([...outer, ...inner.reverse()]);
  }
  return loft(rings, { closed: true, capStart: true, capEnd: true });
}

function lateralWall(): BufferGeometry {
  return grid(36, 28, (u, v) => {
    const z = lerp(-44, 22, u);
    const y = lerp(FLOOR_Y, ROOF_Y, v);
    const x = CAVITY_HALF_W - 4 * smoothstep(0, 22, z) + 1.2 * Math.cos((y / 50) * Math.PI) - 2.5 * smoothstep(-30, -44, z) - 2 * Math.pow(v, 3);
    return [x, y, z];
  });
}

function buildCavity(): Record<string, BufferGeometry> {
  const inferior = concha(13, -8, 16, -34, 6.5, 1.8, 1.45);
  const middle = concha(12.5, 4, 6, -32, 5.2, 1.6, 1.4);
  const superior = concha(11, 17, -10, -30, 3.0, 1.3, 1.3);
  const air = (c: V3, r: V3) => ellipsoid(c, r, [0, 0, 0], 20);
  const infMeatus = air([12.5, -16.5, -10], [3.2, 4.8, 24]);
  const midMeatus = air([12.5, 0, -10], [3.4, 5, 20]);
  const supMeatus = air([10, 14.5, -23], [2.6, 3.4, 9]);
  const valve = (s: 1 | -1) => {
    const pts: V3[] = [];
    for (let j = 0; j < 28; j++) {
      const th = (j / 28) * TAU;
      pts.push([s * (6 + 4 * Math.cos(th)), -4 + 9 * Math.sin(th), 24 - 2 * Math.sin(th) - 1.4 * Math.cos(th) * s]);
    }
    return tube(pts, 0.5, { segs: 40, radial: 8, caps: false, closedCurve: true });
  };
  const uncinate = sagittal(
    [
      [4, 9],
      [0, 11],
      [-8, 7],
      [-13, 0],
      [-11, -3],
      [-5, -1],
      [1, 4],
    ],
    1.0,
    12.5,
  );
  const bulla = blob([13.2, 8.5, -12], [3, 4.2, 7], (x, y, z) => 1 + 0.06 * Math.sin(4 * x + 3 * z) + 0.04 * Math.cos(5 * y));
  const recess = air([5, 20, -34], [3, 5, 5]);
  const choana = (s: 1 | -1) => {
    const pts: V3[] = [];
    for (let j = 0; j < 32; j++) {
      const th = (j / 32) * TAU;
      pts.push([s * (7 + 6 * Math.cos(th)), -8 + 13 * Math.sin(th), CHOANA_Z]);
    }
    return merge([
      tube(pts, 0.7, { segs: 48, radial: 8, caps: false, closedCurve: true }),
      xf(new SphereGeometry(1, 24, 12), { pos: [s * 7, -8, CHOANA_Z], scale: [6, 13, 0.4] }),
    ]);
  };
  const septumMucosa = sagittal(
    [
      [-42, 6],
      [-30, 24],
      [-26, 28],
      [-2, 28],
      [8, 18],
      [24, 2],
      [37, -5],
      [31, -14],
      [21, -19],
      [-40, -21],
    ],
    4.2,
  );
  return {
    'nasal-valve': merge([valve(1), valve(-1)]),
    'septum-mucosa': septumMucosa,
    'inferior-concha': bothSides(inferior),
    'middle-concha': bothSides(middle),
    'superior-concha': bothSides(superior),
    'inferior-meatus': bothSides(infMeatus),
    'middle-meatus': bothSides(midMeatus),
    'superior-meatus': bothSides(supMeatus),
    'lateral-wall': bothSides(lateralWall()),
    'uncinate-process': bothSides(uncinate),
    'ethmoid-bulla': bothSides(bulla),
    'sphenoethmoidal-recess': bothSides(recess),
    choanae: merge([choana(1), choana(-1)]),
  };
}

/* ---------- Околоносовые пазухи ---------- */

function buildSinuses(): Record<string, BufferGeometry> {
  const frontal = blob([10, 48, 10], [10.5, 14, 7.5], (x, y, z) => 1 + 0.07 * Math.sin(3 * x + 2 * y) + 0.05 * Math.cos(4 * z - y) - 0.25 * Math.max(0, -x) * Math.max(0, y), [0, 0, -0.15]);
  const maxillary = blob([25, -8, -2], [13, 17, 16], (x, y, z) => 1 - 0.12 * Math.max(0, x) + 0.05 * Math.sin(3 * y + z) - 0.12 * Math.max(0, -x) * Math.max(0, y), [0.1, 0, 0.1]);
  const cell = (c: V3, r: V3) => blob(c, r, (x, y, z) => 1 + 0.05 * Math.sin(5 * x + 4 * y + 3 * z), [0, 0, 0], 16);
  const anterior = merge([
    cell([17, 12, 2], [3.6, 4.2, 4.4]),
    cell([18, 19, -2], [3.2, 3.8, 4.2]),
    cell([17.5, 11, -7], [3.4, 4.6, 4.2]),
    cell([18.5, 20, -10], [3.2, 3.4, 4.6]),
    cell([17, 14, -14], [3.3, 3.5, 3.6]),
  ]);
  const posterior = merge([cell([17.5, 15, -22], [3.8, 4.8, 4.6]), cell([18, 22, -27], [3.2, 3.6, 4]), cell([17, 13, -31], [3.6, 4.6, 4.2])]);
  const sphenoid = blob([8, 10, -46], [8.5, 11, 10], (x, y, z) => 1 + 0.05 * Math.sin(3 * x + 2 * z) + 0.04 * Math.cos(4 * y));
  const fnDuct = tube(
    [
      [9, 36, 10],
      [10.5, 28, 6],
      [12, 18, 1],
      [12.5, 9, -3],
    ],
    1.5,
    { segs: 20, radial: 10 },
  );
  const ostium = tube(
    [
      [19.5, 5, -8],
      [16, 4.6, -8],
      [13.2, 4.2, -8],
    ],
    (t) => 2.2 - 0.6 * Math.sin(Math.PI * t),
    { segs: 10, radial: 12 },
  );
  return {
    'frontal-sinus': bothSides(frontal),
    'maxillary-sinus': bothSides(maxillary),
    'anterior-ethmoid-cells': bothSides(anterior),
    'posterior-ethmoid-cells': bothSides(posterior),
    'sphenoid-sinus': bothSides(sphenoid),
    'frontonasal-duct': bothSides(fnDuct),
    'maxillary-ostium': bothSides(ostium),
  };
}

/* ---------- Слизистая, обоняние ---------- */

function wavy(pts: V3[], amp: number, freq: number, phase: number): V3[] {
  return pts.map((p, i) => [p[0] + amp * Math.sin(i * freq + phase), p[1] + amp * Math.cos(i * freq * 1.3 + phase), p[2]]);
}

function buildMucosa(): Record<string, BufferGeometry> {
  // слизистая дна полости носа и нижнего хода — блестящий влажный покров
  const floorMucosa = grid(30, 12, (u, v) => {
    const z = lerp(-40, 20, u);
    const x = lerp(-13, 13, v) * (1 - 0.3 * smoothstep(4, 20, z));
    return [x, FLOOR_Y + 1.6 + 0.5 * Math.sin(z * 0.5) * Math.cos(x * 0.6), z];
  });
  // пещеристые сплетения внутри нижней раковины: извитые вены
  const cav: BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([9.5 + 1.6 * Math.cos(k * 1.6), -10 + 1.8 * Math.sin(k * 1.6) - 1.5 * Math.sin(t * 7 + k), lerp(12, -34, t)]);
    }
    cav.push(tube(wavy(pts, 1.1, 1.7, k * 1.1), 0.75, { segs: 48, radial: 7 }));
  }
  // железы: мелкие ацинусы в толще слизистой перегородки и средней раковины
  const glands: BufferGeometry[] = [];
  let seed = 11;
  const rnd = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 70; i++) {
    const onSeptum = rnd() < 0.6;
    const c: V3 = onSeptum ? [2.3 * (rnd() < 0.5 ? 1 : -1), lerp(-16, 22, rnd()), lerp(-38, 18, rnd())] : [(rnd() < 0.5 ? 1 : -1) * (9 + 3 * (rnd() - 0.5)), 6 + 6 * (rnd() - 0.5), lerp(-30, 2, rnd())];
    glands.push(xf(new SphereGeometry(1, 8, 6), { pos: c, scale: 0.55 + 0.35 * rnd() }));
  }
  // сплетение Киссельбаха: сеть сосудов на передненижней части перегородки
  const kb: BufferGeometry[] = [];
  const kbLines: V3[][] = [
    [[2.4, -4, 12], [2.5, -8, 17], [2.5, -12, 22], [2.4, -15, 26]],
    [[2.4, -14, 10], [2.5, -11, 16], [2.5, -7, 22], [2.4, -4, 27]],
    [[2.4, -9, 11], [2.5, -9.5, 17], [2.5, -10, 23], [2.4, -11, 28]],
    [[2.4, -16, 16], [2.5, -12, 19], [2.5, -6, 20], [2.4, -2, 22]],
    [[2.4, -3, 16], [2.5, -7, 20], [2.5, -13, 24]],
  ];
  for (const [i, l] of kbLines.entries()) kb.push(tube(wavy(l, 0.5, 2.1, i), 0.42, { segs: 20, radial: 6 }));
  return {
    'respiratory-mucosa': floorMucosa,
    'cavernous-plexus': bothSides(merge(cav)),
    'seromucous-glands': merge(glands),
    'kiesselbach-plexus': bothSides(merge(kb)),
  };
}

function buildOlfactory(): Record<string, BufferGeometry> {
  // обонятельная область: верхняя часть перегородки и медиальная поверхность верхней раковины
  const septal = sagittal(
    [
      [-4, 16],
      [-2, 26],
      [-24, 26],
      [-28, 16],
      [-20, 12],
    ],
    0.9,
    2.6,
  );
  const roof = grid(10, 6, (u, v) => [lerp(-8, 8, v) * (0.8 + 0.2 * Math.sin(u * Math.PI)), ROOF_Y - 1.4 - 1.5 * Math.pow(lerp(-1, 1, v), 2), lerp(CRIBRIFORM_Z[0], CRIBRIFORM_Z[1], u)]);
  const epithelium = merge([septal, mirrorX(septal), roof]);
  const fil: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const z = lerp(CRIBRIFORM_Z[0] + 1.5, CRIBRIFORM_Z[1] - 1.5, i / 8);
    const x0 = i % 2 === 0 ? 2.8 : 5.5;
    fil.push(
      tube(
        [
          [x0, 22 - (i % 3), z + 0.8],
          [x0 + 0.6, 26, z + 0.3],
          [4 + (i % 2) * 1.5, ROOF_Y + 1, z],
          [5.6, ROOF_Y + 3.5, z],
        ],
        0.32,
        { segs: 14, radial: 6 },
      ),
    );
  }
  const bulb = blob([6, 33, -13], [3.4, 2.6, 9], (x, _y, z) => 1 - 0.1 * Math.max(0, -z) * Math.abs(x));
  const tract = tube(
    [
      [6, 33.5, -20],
      [7, 34.5, -28],
      [9, 36, -38],
      [11, 37.5, -46],
    ],
    (t) => 1.8 - 0.6 * t,
    { segs: 16, radial: 10 },
  );
  return {
    'olfactory-epithelium': epithelium,
    'olfactory-filaments': bothSides(merge(fil)),
    'olfactory-bulb': bothSides(bulb),
    'olfactory-tract': bothSides(tract),
  };
}

/* ---------- Сосуды и нервы ---------- */

function branch(pts: V3[], r: number, taper = 0.5): BufferGeometry {
  return tube(pts, (t) => r * (1 - taper * t), { segs: Math.max(12, pts.length * 5), radial: 9 });
}

function buildVessels(): Record<string, BufferGeometry> {
  const spa = merge([
    branch(
      [
        [25, -2, -37],
        [20, 0, -36],
        [15.5, 2, -34],
      ],
      1.3,
      0.1,
    ),
    // латеральные задние носовые ветви — по стенке над раковинами вперёд
    branch(
      [
        [15.5, 2, -34],
        [14, -3, -24],
        [13.5, -6, -10],
        [13, -8, 4],
        [12, -10, 14],
      ],
      1.0,
    ),
    branch(
      [
        [15.5, 2, -34],
        [13.5, 10, -24],
        [13, 12, -12],
        [12.5, 12, -2],
      ],
      0.8,
    ),
    // задние перегородочные ветви — через свод хоаны к перегородке
    branch(
      [
        [15.5, 2, -34],
        [9, 6, -38],
        [2.2, 4, -34],
        [2.2, -2, -22],
        [2.2, -8, -6],
        [2.3, -12, 12],
      ],
      0.9,
      0.55,
    ),
  ]);
  const aea = branch(
    [
      [20, 24, -3],
      [12, 27, -4],
      [5, 28.5, -5],
      [2.3, 24, 0],
      [2.3, 14, 10],
      [2.3, 2, 18],
      [2.3, -6, 20],
    ],
    0.75,
  );
  const pea = branch(
    [
      [20, 24, -24],
      [12, 27, -25],
      [5, 28.5, -26],
      [2.3, 22, -24],
      [2.3, 12, -28],
    ],
    0.6,
  );
  const gpa = branch(
    [
      [23, -8, -33],
      [21, -18, -32],
      [19, -26, -30],
      [14, -27, -20],
      [8, -27, -8],
      [3, -26, 6],
      [1.8, -24, 14],
      [2.2, -16, 18],
    ],
    0.9,
    0.4,
  );
  const angular = branch(
    [
      [23, -24, 24],
      [21, -14, 27],
      [19, -4, 28.5],
      [16, 8, 26],
      [13.5, 18, 22.5],
      [11.5, 28, 19],
    ],
    1.0,
    0.3,
  );
  return {
    'sphenopalatine-artery': bothSides(spa),
    'anterior-ethmoidal-artery': bothSides(aea),
    'posterior-ethmoidal-artery': bothSides(pea),
    'greater-palatine-artery': bothSides(gpa),
    'angular-artery': bothSides(angular),
  };
}

function buildNerves(): Record<string, BufferGeometry> {
  const nasopalatine = branch(
    [
      [15, 1, -35],
      [9, 5, -38],
      [2.4, 2, -30],
      [2.4, -4, -18],
      [2.4, -10, -4],
      [2.4, -16, 10],
      [1.8, -22, 15],
    ],
    0.8,
    0.4,
  );
  const aen = merge([
    branch(
      [
        [18, 25, -1],
        [10, 28, -2],
        [4, 29, -3],
        [2.4, 23, 4],
        [2.4, 12, 14],
        [2.4, 4, 22],
      ],
      0.7,
      0.3,
    ),
    // наружная носовая ветвь: выходит между костью и хрящом к коже кончика
    branch(
      [
        [2.4, 12, 14],
        [3, 12, 24],
        [3.5, 6, 32],
        [4, -2, 40],
      ],
      0.45,
      0.4,
    ),
  ]);
  const ganglion = merge([
    ellipsoid([22, -2, -34], [2.6, 3.2, 2], [0, 0.3, 0], 16),
    branch([[22, 1, -34], [21, 10, -36], [19, 16, -36]], 0.6, 0.3),
    branch([[22, -5, -34], [22, -12, -33]], 0.7, 0.2),
    branch([[23.5, -2, -32], [27, 0, -28], [29, 4, -22]], 0.6, 0.3),
  ]);
  const infraorbital = merge([
    branch(
      [
        [28, 12, -12],
        [27, 9, 0],
        [26, 8, 12],
        [25, 6, 17],
      ],
      1.1,
      0.1,
    ),
    branch([[25, 6, 17], [23, -4, 23], [21, -12, 25]], 0.6, 0.4),
    branch([[25, 6, 17], [30, -2, 22], [34, -8, 22]], 0.55, 0.4),
    branch([[25, 6, 17], [26, 14, 20], [28, 20, 20]], 0.5, 0.4),
    branch([[25, 6, 17], [20, 2, 24], [15, -4, 28]], 0.5, 0.4),
  ]);
  return {
    'nasopalatine-nerve': bothSides(nasopalatine),
    'anterior-ethmoidal-nerve': bothSides(aen),
    'pterygopalatine-ganglion': bothSides(ganglion),
    'infraorbital-nerve': bothSides(infraorbital),
  };
}

/* ---------- Мышцы ---------- */

function buildMuscles(): Record<string, BufferGeometry> {
  const procerus = shell(0.0, 0.26, 0.34 * Math.PI, 0.66 * Math.PI, 1.7, 1.2, 10, 14);
  const nasalis = merge([
    shell(0.4, 0.58, -0.04 * Math.PI, 1.04 * Math.PI, 1.7, 1.2, 10, 30),
    // крыльная часть: у основания крыла
    bothSides(ellipsoid([14.5, -15, 24.5], [3.2, 2.4, 3.6], [0, 0.4, 0.3], 14)),
  ]);
  const llan = tube(
    [
      [15.5, 27, 12],
      [18, 16, 15],
      [20, 4, 17.5],
      [20, -8, 19.5],
      [18, -19, 20],
    ],
    3.4,
    { segs: 24, radial: 12, flat: 0.32 },
  );
  const depressor = tube(
    [
      [0, -22, 28],
      [0, -27, 25],
      [0, -32, 22],
    ],
    (t) => 2.6 - 0.8 * t,
    { segs: 10, radial: 10, flat: 0.5 },
  );
  return {
    procerus,
    nasalis,
    'levator-labii-alaeque-nasi': bothSides(llan),
    'depressor-septi': depressor,
  };
}

/* ---------- Соседи ---------- */

function faceMask(): BufferGeometry {
  return grid(48, 52, (u, v) => {
    const x = lerp(-52, 52, u);
    const y = lerp(-48, 66, v);
    return [x, y, faceZ(x, y)];
  });
}

function buildNeighbors(): Record<string, BufferGeometry> {
  const palate = horizontal(
    [
      [-20, -40],
      [20, -40],
      [20, -10],
      [16, 10],
      [8, 21],
      [0, 24],
      [-8, 21],
      [-16, 10],
      [-20, -10],
    ],
    4,
    FLOOR_Y - 2.2,
  );
  const softPalate = tube(
    [
      [0, -24, -40],
      [0, -25.5, -47],
      [0, -29, -54],
      [0, -35, -60],
    ],
    (t) => 18 - 4 * t,
    { segs: 20, radial: 28, flat: 0.17 },
  );
  const uvula = tube(
    [
      [0, -34, -60],
      [0, -40, -60.5],
      [0, -47, -61],
    ],
    (t) => 3.2 - 1.4 * t * t,
    { segs: 12, radial: 12 },
  );
  // носоглотка: задняя и боковые стенки — полуцилиндр позади хоан
  const pharynx = grid(28, 24, (u, v) => {
    const phi = lerp(-0.15, Math.PI + 0.15, u);
    const y = lerp(-46, 14, v);
    const r = 15 + 1.5 * Math.sin(v * Math.PI);
    const dome = smoothstep(2, 14, y);
    return [r * Math.cos(phi) * (1 - 0.6 * dome), y, -50 - (r - 2) * Math.sin(phi) * (1 - 0.45 * dome)];
  });
  const tonsil = blob([0, 6, -58], [9, 6, 5], (x, y, z) => 1 + 0.12 * Math.sin(6 * x) * Math.cos(5 * y) + 0.06 * Math.sin(7 * z));
  const torus = (s: 1 | -1) => {
    const pts: V3[] = [];
    for (let j = 0; j < 24; j++) {
      const th = (j / 24) * TAU;
      pts.push([s * (15 + 0.6 * Math.cos(th)), -7 + 5 * Math.sin(th), -50 + 3.5 * Math.cos(th)]);
    }
    return merge([
      tube(pts, 1.7, { segs: 40, radial: 10, caps: false, closedCurve: true }),
      xf(new SphereGeometry(1, 16, 10), { pos: [s * 15, -7, -50], scale: [0.6, 4, 2.8] }),
    ]);
  };
  const sac = ellipsoid([21, 20, 10], [2.6, 6.5, 3], [0, 0, 0.15], 16);
  const nld = tube(
    [
      [21, 14, 10],
      [19.5, 6, 8.5],
      [17.5, -4, 6],
      [16, -13, 4],
    ],
    1.6,
    { segs: 18, radial: 10 },
  );
  const eye = ellipsoid([32, 30, 1], [12, 12, 12], [0, 0, 0], 28);
  const maxilla = grid(22, 24, (u, v) => {
    const x = lerp(15, 50, u);
    const y = lerp(-40, 18, v);
    const z = 10 - 0.011 * (x - 10) * (x - 10) - 0.004 * (y - 2) * (y - 2) + 4 * bump(y, 10, 14) * bump(x, 44, 14);
    return [x, y, z];
  });
  return {
    face: faceMask(),
    'hard-palate': palate,
    'soft-palate': softPalate,
    uvula,
    nasopharynx: pharynx,
    'pharyngeal-tonsil': tonsil,
    'torus-tubarius': merge([torus(1), torus(-1)]),
    'lacrimal-sac': bothSides(sac),
    'nasolacrimal-duct': bothSides(nld),
    orbit: bothSides(eye),
    maxilla: bothSides(maxilla),
  };
}

/* ---------- Сборка ---------- */

const MATERIAL: Record<string, MatKey> = {
  'nasal-root': 'skin',
  'nasal-dorsum': 'skin',
  'nasal-tip': 'skin',
  'ala-left': 'skin',
  'ala-right': 'skin',
  columella: 'skin',
  nostrils: 'skinInner',
  vibrissae: 'hair',
  'nasal-bones': 'bone',
  'frontal-process': 'bone',
  'upper-lateral-cartilage': 'cartilage',
  'alar-cartilage': 'cartilage',
  'septal-cartilage': 'cartilage',
  'perpendicular-plate': 'bone',
  vomer: 'bone',
  'anterior-nasal-spine': 'bone',
  'cribriform-plate': 'bone',
  vestibule: 'skinInner',
  'nasal-valve': 'cartilage',
  'septum-mucosa': 'mucosa',
  'inferior-concha': 'mucosaWet',
  'middle-concha': 'mucosaWet',
  'superior-concha': 'mucosaWet',
  'inferior-meatus': 'air',
  'middle-meatus': 'air',
  'superior-meatus': 'air',
  'lateral-wall': 'mucosa',
  'uncinate-process': 'bone',
  'ethmoid-bulla': 'sinus',
  'sphenoethmoidal-recess': 'air',
  choanae: 'air',
  'frontal-sinus': 'sinus',
  'maxillary-sinus': 'sinus',
  'anterior-ethmoid-cells': 'sinus',
  'posterior-ethmoid-cells': 'sinus',
  'sphenoid-sinus': 'sinus',
  'frontonasal-duct': 'air',
  'maxillary-ostium': 'air',
  'respiratory-mucosa': 'mucosaWet',
  'cavernous-plexus': 'vein',
  'seromucous-glands': 'gland',
  'kiesselbach-plexus': 'artery',
  'olfactory-epithelium': 'olfactory',
  'olfactory-filaments': 'nerve',
  'olfactory-bulb': 'bulb',
  'olfactory-tract': 'bulb',
  'sphenopalatine-artery': 'artery',
  'anterior-ethmoidal-artery': 'artery',
  'posterior-ethmoidal-artery': 'artery',
  'greater-palatine-artery': 'artery',
  'angular-artery': 'artery',
  'nasopalatine-nerve': 'nerve',
  'anterior-ethmoidal-nerve': 'nerve',
  'pterygopalatine-ganglion': 'ganglion',
  'infraorbital-nerve': 'nerve',
  procerus: 'muscle',
  nasalis: 'muscle',
  'levator-labii-alaeque-nasi': 'muscle',
  'depressor-septi': 'muscle',
  face: 'ghostFace',
  'hard-palate': 'bone',
  'soft-palate': 'mucosa',
  uvula: 'mucosa',
  nasopharynx: 'mucosa',
  'pharyngeal-tonsil': 'tonsil',
  'torus-tubarius': 'mucosaWet',
  'lacrimal-sac': 'lymph',
  'nasolacrimal-duct': 'lymph',
  orbit: 'eye',
  maxilla: 'boneGhost',
};

/** Собирает геометрию всех частей. Ключи — id частей; у некоторых частей несколько мешей. */
export function buildNose(): Record<string, MeshDef[]> {
  const raw: Record<string, BufferGeometry> = {
    ...buildExternal(),
    ...buildSkeleton(),
    ...buildCavity(),
    ...buildSinuses(),
    ...buildMucosa(),
    ...buildOlfactory(),
    ...buildVessels(),
    ...buildNerves(),
    ...buildMuscles(),
    ...buildNeighbors(),
  };
  const out: Record<string, MeshDef[]> = {};
  for (const id of NOSE_PART_IDS) {
    const g = raw[id] ?? empty();
    out[id] = [{ g, m: MATERIAL[id] ?? 'mucosa' }];
  }
  return out;
}

/** Для тестов: оценка объёма по ограничивающему параллелепипеду (мм). */
export function bbox(g: BufferGeometry): { min: V3; max: V3 } {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
}

export { ring };
