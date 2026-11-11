import { Vector3 } from 'three';
import { clamp, curveOf, lerp, smooth, type V3 } from './geometry';

/*
  Язык — две сцены одной модели.
  - tongue: язык взрослого в сантиметрах. +x — вперёд (к зубам), +y — вверх, +z — влево у человека (к зрителю сбоку).
    Ось языка идёт от корня у подъязычной кости (u = 0) к верхушке (u = 1): ротовая часть лежит почти горизонтально,
    глоточная (корень) уходит вниз почти вертикально. Сечение — суперэллипс с плоской спинкой и более округлой нижней стороной.
  - bud: грибовидный сосочек под микроскопом в условных единицах (около 0,1 мм): эпителий, соединительнотканный стержень,
    вкусовые почки с клетками, пора, нервные волокна. Пропорции почки немного увеличены, чтобы клетки были видны.
*/

export type SceneId = 'tongue' | 'bud';
export type CutKind = 'side' | 'fundus' | 'coronal';

/** По умолчанию: сагиттальный срез чуть сбоку от перегородки, поперечный — через тело, горизонтальный — через середину толщи. */
export const CUT_DEFAULT_T: Record<CutKind, number> = { side: 0.42, fundus: 0.36, coronal: 0.3 };

/* ───────────────────────────── Ось и сечение языка ───────────────────────────── */

/** Средняя линия языка (центр сечения) от корня к верхушке. */
export const MID_PTS: V3[] = [
  [-2.3, -2.95, 0],
  [-2.22, -1.95, 0],
  [-1.78, -0.9, 0],
  [-0.95, -0.15, 0],
  [0.35, 0.22, 0],
  [1.95, 0.28, 0],
  [3.55, 0.08, 0],
  [4.75, -0.2, 0],
];
export const MID = curveOf(MID_PTS);
export const MID_LEN = MID.getLength();

const knots = (u: number, table: [number, number][]): number => {
  if (u <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [u1, v1] = table[i];
    const [u0, v0] = table[i - 1];
    if (u <= u1) return lerp(v0, v1, smooth(u0, u1, u));
  }
  return table[table.length - 1][1];
};

/** Полуширина языка вдоль оси. */
export const halfWidth = (u: number): number =>
  knots(u, [
    [0, 1.35],
    [0.22, 1.85],
    [0.45, 2.25],
    [0.7, 2.25],
    [0.88, 1.75],
    [1, 0.95],
  ]);
/** Расстояние от оси до спинки. */
export const halfTop = (u: number): number =>
  knots(u, [
    [0, 0.85],
    [0.25, 1.05],
    [0.45, 0.98],
    [0.7, 0.74],
    [0.88, 0.44],
    [1, 0.24],
  ]);
/** Расстояние от оси до нижней поверхности. */
export const halfBottom = (u: number): number =>
  knots(u, [
    [0, 0.8],
    [0.25, 1.1],
    [0.45, 1.22],
    [0.7, 0.9],
    [0.88, 0.45],
    [1, 0.24],
  ]);

/** Показатели суперэллипса: сбоку (ширина), сверху (спинка плоская) и снизу. */
const E_SIDE = 0.86;
const E_TOP = 0.62;
const E_BOT = 0.9;

const sgnPow = (v: number, p: number): number => Math.sign(v) * Math.abs(v) ** p;

export interface Frame {
  c: Vector3;
  t: Vector3;
  n: Vector3;
}

const _frames = new Map<number, Frame>();
/** Точка оси, касательная и «верх» сечения (к спинке) на доле длины u. */
export function frameAt(u: number): Frame {
  const key = Math.round(clamp(u) * 4000);
  const hit = _frames.get(key);
  if (hit) return hit;
  const uu = key / 4000;
  const c = MID.getPointAt(uu);
  const t = MID.getTangentAt(uu).normalize();
  const n = new Vector3(-t.y, t.x, 0).normalize();
  const f = { c, t, n };
  _frames.set(key, f);
  return f;
}

/** Слепое отверстие и пограничная борозда: V, открытая вперёд, вершина сзади на средней линии. */
export const U_FORAMEN = 0.405;
export const uSulcus = (z: number): number => U_FORAMEN + 0.052 * Math.min(2.1, Math.abs(z));

/** Глубина бороздок на спинке: срединная и пограничная. */
export function grooveDepth(u: number, z: number): number {
  const median = 0.07 * Math.exp(-((z / 0.2) ** 2)) * smooth(U_FORAMEN + 0.05, 0.6, u) * (1 - smooth(0.9, 0.97, u));
  const terminal = Math.abs(z) < 2.1 ? 0.045 * Math.exp(-((((u - uSulcus(z)) * MID_LEN) / 0.09) ** 2)) : 0;
  const cecum = 0.12 * Math.exp(-((((u - U_FORAMEN) * MID_LEN) ** 2 + z * z) / 0.012));
  return median + terminal + cecum;
}

/**
 * Точка поверхности языка: u — доля длины, a — угол сечения (0 — левый край, π/2 — спинка, −π/2 — низ),
 * off — смещение наружу (отрицательное — вглубь).
 */
export function surface(u: number, a: number, off = 0, grooves = true): Vector3 {
  const f = frameAt(u);
  const w = halfWidth(u) + off;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const z = w * sgnPow(ca, E_SIDE);
  let v = sa >= 0 ? (halfTop(u) + off) * sgnPow(sa, E_TOP) : (halfBottom(u) + off) * sgnPow(sa, E_BOT);
  if (grooves && sa > 0) v -= grooveDepth(u, z) * smooth(0.3, 0.8, sa);
  return f.c.clone().addScaledVector(f.n, v).add(new Vector3(0, 0, z));
}

/** Высота спинки над осью при боковом смещении z (с бороздами). */
export function topV(u: number, z: number, off = 0, grooves = true): number {
  const w = halfWidth(u) + off;
  const cz = clamp(Math.abs(z) / w);
  const ca = cz ** (1 / E_SIDE);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  let v = (halfTop(u) + off) * sa ** E_TOP;
  if (grooves) v -= grooveDepth(u, z) * smooth(0.3, 0.8, sa);
  return v;
}

/** Глубина нижней поверхности под осью при боковом смещении z (отрицательная). */
export function botV(u: number, z: number, off = 0): number {
  const w = halfWidth(u) + off;
  const cz = clamp(Math.abs(z) / w);
  const ca = cz ** (1 / E_SIDE);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  return -(halfBottom(u) + off) * sa ** E_BOT;
}

/** Точка в толще языка: u — доля длины, z — сбоку (см), v — вверх от оси (см). */
export function inside(u: number, z: number, v: number): Vector3 {
  const f = frameAt(u);
  return f.c.clone().addScaledVector(f.n, v).add(new Vector3(0, 0, z));
}

/** Точка на спинке и нормаль к ней (для сосочков). */
export function dorsal(u: number, z: number, lift = 0): { p: Vector3; n: Vector3 } {
  const f = frameAt(u);
  const h = 0.01;
  const p = inside(u, z, topV(u, z));
  const pu = inside(Math.min(1, u + h / MID_LEN), z, topV(Math.min(1, u + h / MID_LEN), z));
  const pz = inside(u, z + h, topV(u, z + h));
  const du = pu.sub(p);
  const dz = pz.sub(p);
  const n = new Vector3().crossVectors(dz, du).normalize();
  if (n.dot(f.n) < 0) n.negate();
  return { p: p.addScaledVector(n, lift), n };
}

/** Точка на нижней поверхности и нормаль наружу (вниз). */
export function ventral(u: number, z: number, lift = 0): { p: Vector3; n: Vector3 } {
  const f = frameAt(u);
  const h = 0.01;
  const p = inside(u, z, botV(u, z));
  const pu = inside(Math.min(1, u + h / MID_LEN), z, botV(Math.min(1, u + h / MID_LEN), z));
  const pz = inside(u, z + h, botV(u, z + h));
  const n = new Vector3().crossVectors(pu.sub(p), pz.sub(p)).normalize();
  if (n.dot(f.n) > 0) n.negate();
  return { p: p.addScaledVector(n, lift), n };
}

/* ───────────────────────────── Кости и ориентиры ───────────────────────────── */

/** Подъязычная кость: тело спереди, большие рога уходят назад. Точки для правой (+z) половины. */
export const HYOID_PTS: V3[] = [
  [-2.62, -3.98, 0],
  [-2.75, -3.93, 0.95],
  [-3.25, -3.82, 1.6],
  [-4.1, -3.6, 2.0],
  [-4.85, -3.38, 2.18],
];

/** Нижняя челюсть: центр тела по дуге от левого угла до правого; ветви поднимаются вверх. */
export const MANDIBLE_BODY_PTS: V3[] = [
  [-3.5, -2.95, -4.15],
  [-1.2, -3.15, -4.0],
  [1.6, -3.0, -3.35],
  [3.9, -2.85, -2.1],
  [5.15, -2.75, 0],
  [3.9, -2.85, 2.1],
  [1.6, -3.0, 3.35],
  [-1.2, -3.15, 4.0],
  [-3.5, -2.95, 4.15],
];
export const RAMUS_PTS = (s: 1 | -1): V3[] => [
  [-3.5, -2.95, 4.15 * s],
  [-3.75, -1.2, 4.3 * s],
  [-3.85, 0.6, 4.35 * s],
  [-4.1, 2.0, 4.4 * s],
];
/** Подбородочная ость: начало подбородочно-язычной мышцы. */
export const GENIAL: V3 = [4.62, -3.05, 0];
/** Кончик шиловидного отростка. */
export const STYLOID_TIP: V3 = [-4.35, 0.75, 2.95];
export const STYLOID_BASE: V3 = [-5.55, 2.85, 3.35];
/** Точка мягкого нёба, откуда спускается нёбно-язычная мышца. */
export const PALATE: V3 = [-0.75, 2.65, 1.2];

/** Надгортанник: лист за корнем языка. s — от черешка (0) к свободному краю (1), q — поперёк (−1..1). */
export function epiglottisPoint(s: number, q: number, off = 0): Vector3 {
  const hw = 0.95 * Math.sin(Math.PI * (0.18 + 0.62 * s)) * (0.35 + 0.65 * smooth(0, 0.5, s));
  const x = -4.05 - 0.55 * s * s + 0.42 * (q * q) + off;
  const y = -4.0 + 3.35 * s;
  return new Vector3(x, y, q * hw);
}

/* ───────────────────────────── Сосуды, нервы, протоки ───────────────────────────── */

const mir = (pts: V3[], s: 1 | -1): V3[] => pts.map((p) => [p[0], p[1], p[2] * s]);
const at = (u: number, z: number, v: number): V3 => {
  const p = inside(u, z, v);
  return [p.x, p.y, p.z];
};

/** Язычная артерия от наружной сонной до начала глубокой артерии языка. */
export const lingualArteryPts = (s: 1 | -1): V3[] =>
  mir(
    [
      [-5.6, -3.3, 2.75],
      [-4.95, -2.95, 2.45],
      [-4.25, -3.15, 1.7],
      [-3.35, -3.25, 1.2],
      [-2.45, -2.75, 1.05],
    ],
    s,
  );
/** Глубокая артерия языка: извилисто к верхушке вдоль нижней поверхности. */
export const deepArteryPts = (s: 1 | -1): V3[] => {
  const out: V3[] = [[-2.45, -2.75, 1.05 * s]];
  for (let i = 0; i <= 18; i++) {
    const u = lerp(0.24, 0.97, i / 18);
    const wig = 0.12 * Math.sin(i * 1.7) * smooth(0.4, 0.6, u);
    const z = (halfWidth(u) * 0.36 + wig) * s;
    out.push(at(u, z, botV(u, z) * 0.62 + 0.05 * Math.cos(i * 1.7)));
  }
  return out;
};
/** Дорсальные ветви к корню и подъязычная артерия к железе. */
export const dorsalBranchPts = (s: 1 | -1): V3[][] => [
  [[-3.35, -3.25, 1.2 * s], at(0.1, 0.9 * s, -0.2), at(0.2, 0.75 * s, 0.4), at(0.3, 0.55 * s, 0.7)],
  [[-2.9, -3.05, 1.12 * s], at(0.16, 0.5 * s, -0.4), at(0.28, 0.35 * s, 0.55)],
];
export const sublingualArteryPts = (s: 1 | -1): V3[] => mir([[-2.45, -2.75, 1.05], [-0.8, -2.45, 1.35], [0.9, -2.2, 1.55], [2.6, -2.05, 1.55], [3.6, -1.95, 1.1]], s);

/** Глубокая вена языка видна на нижней поверхности под слизистой. */
export const deepVeinPts = (s: 1 | -1): V3[] => {
  const out: V3[] = [];
  for (let i = 0; i <= 14; i++) {
    const u = lerp(0.56, 0.95, i / 14);
    const z = (0.33 + 0.08 * Math.sin(i * 0.9)) * halfWidth(u) * 0.75 * s;
    const q = ventral(u, z, 0.045);
    out.push([q.p.x, q.p.y, q.p.z]);
  }
  return out;
};
/** Язычная вена: от нижней поверхности назад вдоль подъязычно-язычной мышцы к внутренней яремной вене. */
export const lingualVeinPts = (s: 1 | -1): V3[] => {
  const d = deepVeinPts(s);
  return [d[0], at(0.45, 1.35 * s, botV(0.45, 1.35) * 0.85), [-1.2, -2.75, 1.95 * s], [-2.9, -3.2, 2.25 * s], [-4.4, -3.1, 2.75 * s], [-5.5, -3.55, 3.05 * s], [-6.1, -4.4, 3.15 * s]];
};

/** Подъязычный нерв (XII): спускается позади, огибает сосуды, идёт вперёд над большим рогом подъязычной кости. */
export const hypoglossalPts = (s: 1 | -1): V3[] =>
  mir(
    [
      [-6.0, 0.4, 2.95],
      [-5.85, -1.4, 2.95],
      [-5.35, -2.85, 2.8],
      [-4.45, -3.05, 2.35],
      [-3.35, -2.95, 1.98],
      [-2.05, -2.55, 1.7],
      [-0.85, -1.85, 1.25],
    ],
    s,
  );
export const hypoglossalBranches = (s: 1 | -1): V3[][] =>
  [0.42, 0.55, 0.68, 0.8, 0.9].map((u, i) => [[-0.85, -1.85, 1.25 * s], at(lerp(0.3, u, 0.5), (0.95 - 0.08 * i) * s, -0.5), at(u, (0.75 - 0.1 * i) * s, -0.15 + 0.08 * i)]);

/** Язычный нерв (V3): с боковой стороны сверху вниз, петля под протоком поднижнечелюстной железы, вверх в тело языка. */
export const lingualNervePts = (s: 1 | -1): V3[] =>
  mir(
    [
      [-4.5, 2.95, 3.35],
      [-3.9, 1.2, 3.25],
      [-3.0, -0.55, 2.9],
      [-1.8, -1.85, 2.55],
      [-0.6, -2.55, 2.05],
      [0.45, -2.45, 1.5],
      [1.2, -1.75, 1.25],
    ],
    s,
  );
export const lingualNerveBranches = (s: 1 | -1): V3[][] =>
  [0.6, 0.7, 0.8, 0.9, 0.96].map((u, i) => [[1.2, -1.75, 1.25 * s], at(lerp(0.62, u, 0.4), (1.05 - 0.06 * i) * s, -0.35), at(u, (0.95 - 0.12 * i) * halfWidth(u) * 0.5 * s, topV(u, 0.6) - 0.22)]);

/** Барабанная струна (VII): из барабанной полости вниз и вперёд, присоединяется к язычному нерву. */
export const chordaPts = (s: 1 | -1): V3[] =>
  mir(
    [
      [-6.05, 3.85, 3.6],
      [-5.45, 3.05, 3.5],
      [-4.75, 2.2, 3.35],
      [-4.15, 1.75, 3.27],
    ],
    s,
  );

/** Языкоглоточный нерв (IX): вокруг шилоглоточной мышцы к корню, ветви к желобовидным сосочкам и миндалине. */
export const glossopharyngealPts = (s: 1 | -1): V3[] =>
  mir(
    [
      [-6.3, 1.3, 2.7],
      [-5.75, 0.3, 2.55],
      [-5.0, -0.95, 2.2],
      [-4.15, -1.5, 1.75],
    ],
    s,
  );
export const glossopharyngealBranches = (s: 1 | -1): V3[][] =>
  [
    [0.12, 0.5],
    [0.22, 0.35],
    [0.33, 0.2],
    [0.4, 0.9],
    [0.44, 0.45],
  ].map(([u, z]) => [[-4.15, -1.5, 1.75 * s], at(lerp(0.12, u, 0.5), (z + 0.6) * s, 0.15), at(u, z * s, topV(u, z) - 0.2)]);

/** Блуждающий нерв (X): ствол вниз по шее, внутренняя ветвь верхнего гортанного нерва к ямкам у надгортанника. */
export const vagusPts = (s: 1 | -1): V3[] => mir([[-6.55, 1.2, 3.05], [-6.6, -0.5, 3.1], [-6.55, -3.0, 3.1], [-6.5, -5.0, 3.05]], s);
export const vagusBranch = (s: 1 | -1): V3[] => mir([[-6.6, -0.6, 3.1], [-6.0, -2.0, 2.65], [-5.0, -3.0, 1.8], [-4.25, -3.15, 0.9], [-3.75, -2.95, 0.45]], s);

/** Поднижнечелюстная железа и её проток к подъязычному сосочку. */
export const SUBMANDIBULAR = { c: [-2.05, -3.6, 2.85] as V3, r: [1.15, 0.66, 0.58] as V3 };
export const submandibularDuctPts = (s: 1 | -1): V3[] =>
  mir(
    [
      [-1.05, -2.95, 2.35],
      [0.2, -2.4, 1.95],
      [1.5, -2.08, 1.3],
      [2.55, -1.95, 0.62],
      [3.18, -1.88, 0.27],
    ],
    s,
  );
export const SUBLINGUAL = { c: [1.95, -2.15, 1.6] as V3, r: [1.25, 0.32, 0.42] as V3 };
export const CARUNCLE = (s: 1 | -1): V3 => [3.25, -1.86, 0.25 * s];
export const FLOOR_Y = -1.95;

/* ───────────────────────────── Срезы ───────────────────────────── */

export function cutPlane(scene: SceneId, kind: CutKind, t: number): { n: V3; c: number } {
  if (scene === 'tongue') {
    if (kind === 'side') return { n: [0, 0, -1], c: lerp(2.6, -2.6, t) };
    if (kind === 'fundus') return { n: [-1, 0, 0], c: lerp(5.2, -4.2, t) };
    return { n: [0, -1, 0], c: lerp(1.3, -3.6, t) };
  }
  if (kind === 'side') return { n: [0, 0, -1], c: lerp(6, -6, t) };
  if (kind === 'fundus') return { n: [-1, 0, 0], c: lerp(7, -7, t) };
  return { n: [0, -1, 0], c: lerp(5.4, -3.5, t) };
}

/* ───────────────────────────── Движение языка ───────────────────────────── */

export interface Motion {
  /** Высовывание вперёд. */
  protrude: number;
  /** Подъём верхушки к нёбу. */
  tipUp: number;
  /** Отклонение в сторону (−1..1). */
  side: number;
  /** Желобок по спинке (подготовка к глотку). */
  groove: number;
}

const bump = (t: number, a: number, b: number) => smooth(a, a + 0.5, t) * (1 - smooth(b - 0.5, b, t));

/** Цикл движений около 12 секунд: вперёд, к нёбу, влево, вправо, желобок и глоток. */
export function motionAt(time: number): Motion {
  const t = ((time % 12) + 12) % 12;
  return {
    protrude: 0.95 * bump(t, 0.4, 2.6),
    tipUp: bump(t, 2.9, 5.0),
    side: bump(t, 5.3, 7.3) - bump(t, 7.4, 9.4),
    groove: bump(t, 9.6, 11.8),
  };
}

/** То же смещение, что в вершинном шейдере: нужно тестам и подписям. */
export function displace(p: V3, m: Motion): V3 {
  const [x, y, z] = p;
  const w = smooth(-2.6, 2.2, x) * smooth(-2.6, -1.0, y);
  const front = smooth(0.5, 5.2, x);
  const dx = (m.protrude * 1.35 - m.tipUp * 0.35 * front * front) * w;
  const dy = (m.tipUp * 1.55 * front * front - m.groove * 0.22 * Math.exp(-((z / 0.9) ** 2)) * smooth(-1, 2, x)) * w;
  const dz = m.side * 1.25 * front * front * w;
  const narrow = 1 - 0.16 * m.protrude * w * front;
  return [x + dx, y + dy, z * narrow + dz];
}
