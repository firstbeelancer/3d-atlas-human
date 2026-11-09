import { CatmullRomCurve3, Vector3 } from 'three';
import { lerp, smoothstep, type V3 } from '../gallbladder/anatomy';

export { lerp, smoothstep };
export type { V3 };

/*
  Селезёнка. Единица — примерно 1 см. Начало координат — центр органа.
  Мировые оси: +x — налево от пациента (вправо на экране при взгляде спереди), +y — вверх, +z — вперёд, к животу.
  У селезёнки есть собственная система (l, w, d):
    l — длинная ось вдоль X ребра: от заднего (верхнего, у позвоночника) конца к переднему (нижнему, боковому);
    w — поперёк, к верхнему (переднему) краю с вырезками; в противоположную сторону — тупой нижний край;
    d — от внутренностной поверхности (к желудку) к диафрагмальной (к рёбрам и диафрагме).
  Селезёнка — «долька апельсина»: снаружи выпуклая, изнутри слегка вогнутая, ворота — щель на внутренней стороне.
*/

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const AX_L: V3 = norm([0.4, -0.68, 0.61]);
export const AX_D: V3 = (() => {
  const d0: V3 = [0.78, 0.1, -0.62];
  const k = dot(d0, AX_L);
  return norm([d0[0] - AX_L[0] * k, d0[1] - AX_L[1] * k, d0[2] - AX_L[2] * k]);
})();
export const AX_W: V3 = (() => {
  const w = cross(AX_L, AX_D);
  return w[1] < 0 ? norm([-w[0], -w[1], -w[2]]) : norm(w);
})();

export const toLocal = (p: V3): V3 => [dot(p, AX_L), dot(p, AX_W), dot(p, AX_D)];
export const fromLocal = (l: number, w: number, d: number): V3 => [
  AX_L[0] * l + AX_W[0] * w + AX_D[0] * d,
  AX_L[1] * l + AX_W[1] * w + AX_D[1] * d,
  AX_L[2] * l + AX_W[2] * w + AX_D[2] * d,
];
/** Вектор из местной системы в мировую (без сдвига — сдвига нет, начало общее). */
export const P = fromLocal;

export const curveOf = (pts: V3[], type: 'centripetal' | 'catmullrom' = 'centripetal'): CatmullRomCurve3 =>
  new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, type);

/* ---------- Форма органа ---------- */

export const BODY = {
  /** Наружный эллипсоид: выпуклая диафрагмальная сторона и скруглённые концы. */
  outer: { c: [0, 0, -0.1] as V3, r: [6.1, 3.6, 2.45] as V3 },
  /** «Вырезка» изнутри: верхушка этого эллипсоида даёт слегка вогнутую внутренностную поверхность. */
  cut: { c: [0.5, 0.8, -6.1] as V3, r: [9.2, 6.2, 4.9] as V3 },
  /** Селезёночные вырезки на верхнем крае: положение по l и радиус. */
  notches: [
    { l: 0.6, r: 0.4 },
    { l: 2.2, r: 0.5 },
    { l: 3.6, r: 0.34 },
  ],
};

/** Высота внутренностной поверхности в точке (l, w): верхушка «вырезающего» эллипсоида. */
export function visD(l: number, w: number): number {
  const { c, r } = BODY.cut;
  const q = 1 - ((l - c[0]) / r[0]) ** 2 - ((w - c[1]) / r[1]) ** 2;
  return c[2] + r[2] * Math.sqrt(Math.max(0, q));
}

/** Линия ворот на внутренностной поверхности: w от l (чуть наклонена). */
export const hilumW = (l: number): number => 0.25 - 0.07 * l;
export const HILUM_HALF_LEN = 3.9;

/** Ворота: центр и точки входа сосудов (семь по длине щели). */
export const HILUM_C: V3 = P(0, hilumW(0), visD(0, hilumW(0)) + 0.1);
const HILUM_L = [-3.4, -2.3, -1.2, -0.1, 1.0, 2.1, 3.2];
export const entryPoint = (l: number, dw = 0, up = 0.1): V3 => P(l, hilumW(l) + dw, visD(l, hilumW(l) + dw) + up);
export const HILAR_ENTRIES: V3[] = HILUM_L.map((l) => entryPoint(l, 0, -0.05));

/** Точка на внутренностной стороне на заданной глубине вглубь тела (в сторону желудка и сосудов). */
const out = (l: number, w: number, depth: number): V3 => P(l, w, visD(l, w) - depth);

/* ---------- Сосуды ---------- */

/** Аорта и позвоночник — ориентир сзади-медиально. */
export const SPINE_X = -9.2;
export const SPINE_Z = -4.8;
export const SPINE_LEVELS = [5.6, 2.8, 0.0, -2.8, -5.6];
export const AORTA_X = -8.0;
export const AORTA_Z = -1.75;
export const AORTA_R = 1.12;
export const AORTA_PTS: V3[] = [
  [AORTA_X - 0.25, 10.5, AORTA_Z - 0.2],
  [AORTA_X - 0.1, 4.0, AORTA_Z - 0.05],
  [AORTA_X, -2.0, AORTA_Z],
  [AORTA_X + 0.05, -9.0, AORTA_Z + 0.05],
];

/** Чревный ствол: от передней стенки аорты вперёд, затем делится. */
export const CELIAC_PTS: V3[] = [
  [AORTA_X + 0.1, -0.5, AORTA_Z + AORTA_R - 0.15],
  [AORTA_X + 0.25, -0.55, AORTA_Z + AORTA_R + 0.55],
  [AORTA_X + 0.55, -0.4, AORTA_Z + AORTA_R + 1.25],
];

const BIF: V3 = [HILUM_C[0] - 2.5, HILUM_C[1] + 0.15, HILUM_C[2] + 0.55];
/** Селезёночная артерия: извилистая, идёт вдоль верхнего края поджелудочной железы к воротам. */
export const SPLENIC_ARTERY_PTS: V3[] = [
  CELIAC_PTS[2],
  [-6.6, 0.15, 0.85],
  [-6.0, 0.75, 0.55],
  [-5.4, 0.1, 1.15],
  [-4.8, 0.85, 0.7],
  [-4.2, 0.25, 1.25],
  [-3.7, 0.7, 1.0],
  BIF,
];

/** Селезёночная вена: сзади и ниже артерии, к воротной вене. */
export const SPLENIC_VEIN_PTS: V3[] = [
  [BIF[0] + 0.1, BIF[1] - 0.55, BIF[2] - 0.45],
  [-4.1, -0.15, 0.5],
  [-5.2, -0.45, 0.35],
  [-6.4, -0.75, 0.45],
  [-7.4, -1.05, 0.8],
  [-8.0, -1.35, 1.25],
];
/** Воротная вена: от слияния селезёночной и верхней брыжеечной вдоль печёночно-двенадцатиперстной связки. */
export const PORTAL_PTS: V3[] = [
  [-8.0, -1.35, 1.25],
  [-9.2, -0.7, 1.9],
  [-10.4, 0.4, 2.2],
  [-11.4, 1.6, 2.1],
];
/** Нижняя брыжеечная вена впадает в селезёночную. */
export const IMV_PTS: V3[] = [
  [-4.6, -9.0, 1.3],
  [-4.9, -6.2, 1.1],
  [-5.6, -3.4, 0.7],
  [-6.4, -1.3, 0.45],
  [-6.6, -0.72, 0.46],
];

/** Три конечные ветви артерии (верхняя, средняя, нижняя): сегментарные, конечные артерии органа. */
export interface Branch {
  id: 'sup' | 'mid' | 'inf';
  /** Ствол ветви от места деления до входа в ворота. */
  trunk: V3[];
  /** Номера точек входа (из HILAR_ENTRIES), которые кормит ветвь. */
  entries: number[];
}
const branchTrunk = (l: number, dw: number, depths: [number, number]): V3[] => [BIF, out(l * 0.6, hilumW(l) + dw * 1.2, depths[0]), out(l, hilumW(l) + dw, depths[1])];
export const BRANCHES: Branch[] = [
  { id: 'sup', trunk: branchTrunk(-2.2, -0.7, [2.1, 1.2]), entries: [0, 1, 2] },
  { id: 'mid', trunk: branchTrunk(-0.1, -0.5, [2.0, 1.1]), entries: [3] },
  { id: 'inf', trunk: branchTrunk(2.0, -0.7, [2.0, 1.1]), entries: [4, 5, 6] },
];
export const branchPts = (b: Branch): V3[] => b.trunk;

/** Конечные веточки у ворот: от развилки ветви к точке входа. Артерии входят чуть впереди линии, вены — сзади. */
export function twigs(kind: 'artery' | 'vein'): V3[][] {
  const artery = kind === 'artery';
  const dw = artery ? 0.22 : -0.26;
  const bend = artery ? 0.22 : -0.28;
  const res: V3[][] = [];
  for (const [index, b] of BRANCHES.entries()) {
    const trunk = artery ? b.trunk : VEIN_BRANCHES[index];
    const from = trunk[trunk.length - 1];
    for (const i of b.entries) {
      const l = HILUM_L[i];
      const end = entryPoint(l, dw, -0.08);
      const mid: V3 = [
        (from[0] + end[0]) / 2 + AX_W[0] * bend,
        (from[1] + end[1]) / 2 + AX_W[1] * bend,
        (from[2] + end[2]) / 2 + AX_W[2] * bend,
      ];
      const inner = P(l, hilumW(l) + dw, visD(l, hilumW(l) + dw) - 1.4);
      res.push([from, mid, inner, end]);
    }
  }
  return res;
}

/** Венозные ветви: параллельны артериальным, чуть ниже и сзади. */
export const VEIN_BRANCHES: V3[][] = BRANCHES.map((b) => {
  const first = b.trunk[1];
  const last = b.trunk[2];
  const sh = (p: V3, k: number): V3 => [p[0] + AX_W[0] * -0.6 * k, p[1] + AX_W[1] * -0.6 * k - 0.2, p[2] + AX_W[2] * -0.6 * k - 0.25];
  return [SPLENIC_VEIN_PTS[0], sh(first, 1), sh(last, 1)];
});

/* ---------- Соседи (в местной системе — для эллипсоидов) ---------- */

export interface Ell {
  c: V3;
  r: V3;
}
/** Желудок: задняя стенка и большая кривизна у желудочной поверхности. */
export const STOMACH: Ell = { c: [1.4, 3.3, -7.0], r: [6.6, 5.9, 5.0] };
/** Точка на поверхности желудка в направлении u (местные оси); возвращает мировую точку. */
export function stomachPoint(u: V3): V3 {
  const n = norm(u);
  return P(STOMACH.c[0] + STOMACH.r[0] * n[0], STOMACH.c[1] + STOMACH.r[1] * n[1], STOMACH.c[2] + STOMACH.r[2] * n[2]);
}

/** Диафрагма: купол, прилегающий к диафрагмальной стороне и полюсам. */
export const DIAPHRAGM: Ell = { c: [0.1, 0.2, -0.3], r: [8.8, 6.5, 3.9] };

/** Левая почка (мировые оси): передняя поверхность — почечная поверхность селезёнки. */
export const KIDNEY = { c: [-3.1, -6.1, -4.3] as V3, r: [2.7, 5.4, 2.35] as V3, tilt: 0.16 };
export const ADRENAL = { c: [-4.7, -1.55, -3.55] as V3, r: [1.15, 0.6, 0.9] as V3 };

/** Хвост поджелудочной железы: идёт к воротам в селезёночно-почечной связке. */
export const PANCREAS_TAIL_PTS: V3[] = [
  out(0.5, hilumW(0.5) - 1.15, 0.95),
  out(-0.9, hilumW(-0.9) - 1.45, 1.35),
  [-3.3, -1.55, 1.15],
  [-5.2, -1.85, 0.75],
  [-7.2, -1.9, 0.5],
];

/** Селезёночный изгиб ободочной кишки: поперечная ободочная поднимается к нижнему полюсу и переходит в нисходящую. */
export const COLON_PTS: V3[] = [
  [-6.5, -7.6, 5.8],
  [-3.2, -6.0, 6.7],
  [0.6, -4.6, 6.2],
  [3.6, -4.4, 4.4],
  [4.9, -6.1, 1.4],
  [4.1, -9.0, -2.2],
  [2.7, -12.0, -3.4],
];
export const COLON_R = 1.55;

/** Рёбра IX–XI: три дуги над диафрагмальной стороной, параллельно длинной оси. */
export const RIBS = [
  { id: 'IX', w: 3.0 },
  { id: 'X', w: 0.4 },
  { id: 'XI', w: -2.3 },
];
export function ribPts(w: number): V3[] {
  const pts: V3[] = [];
  for (let k = -5; k <= 5; k++) {
    const l = k * 1.9;
    const d = 4.7 * Math.sqrt(Math.max(0.04, 1 - (l / 11.2) ** 2));
    pts.push(P(l, w - 0.0 * l + 0.05 * l, d + 0.0));
  }
  return pts;
}

/** Добавочные селезёнки: у ворот и в связке с ободочной кишкой, около сантиметра. */
export const ACCESSORY: { c: V3; r: number }[] = [
  { c: out(-0.6, hilumW(-0.6) - 2.3, 0.8), r: 0.42 },
  { c: P(5.9, -2.6, 1.6), r: 0.3 },
];

/* ---------- Связки ---------- */

/** Желудочно-селезёночная связка: от передней губы ворот к большой кривизне желудка; в ней идут короткие артерии желудка. */
const GS_L = [-3.2, -2.1, -1.0, 0.1, 1.2, 2.3, 3.4];
const gsTarget = (l: number): V3 => stomachPoint([(l - 1.4) / 6.6, (1.2 - 3.3) / 5.9, 0.95]);
export const LIG_GS = {
  a: GS_L.map((l) => entryPoint(l, 0.7, -0.05)),
  b: GS_L.map((l) => gsTarget(l)),
};
/** Короткие артерии желудка: из конечных ветвей у ворот, через связку к дну и большой кривизне. */
export const SHORT_GASTRIC: V3[][] = [0, 1, 3, 5, 6].map((i) => {
  const l = GS_L[i];
  const a = out(l, hilumW(l) + 0.5, 1.15);
  const e = gsTarget(l);
  const m: V3 = [(a[0] + e[0]) / 2 + AX_W[0] * 0.35, (a[1] + e[1]) / 2 + AX_W[1] * 0.35, (a[2] + e[2]) / 2 + AX_W[2] * 0.35];
  return [a, entryPoint(l, 0.75, -0.9), m, e];
});
export const SHORT_GASTRIC_VEINS: V3[][] = SHORT_GASTRIC.map((pts) => pts.map((p, i): V3 => [p[0] - AX_W[0] * 0.3 * (i > 0 ? 1 : 0), p[1] - AX_W[1] * 0.3 * (i > 0 ? 1 : 0) - 0.12, p[2] - AX_W[2] * 0.3 * (i > 0 ? 1 : 0)]));
/** Левая желудочно-сальниковая артерия и вена: вдоль большой кривизны от нижней ветви. */
export const GASTROEPIPLOIC_PTS: V3[] = (() => {
  const pts: V3[] = [BRANCHES[2].trunk[1], gsTarget(2.4)];
  for (let k = 0; k <= 5; k++) pts.push(stomachPoint([0.3 + 0.17 * k, -0.7 - 0.02 * k, 0.62 - 0.06 * k]));
  return pts;
})();
export const GASTROEPIPLOIC_VEIN_PTS: V3[] = GASTROEPIPLOIC_PTS.map((p, i): V3 => [p[0] + 0.28 * AX_W[0], p[1] + 0.28 * AX_W[1] - 0.1, p[2] + 0.28 * AX_W[2] + (i === 0 ? -0.2 : 0)]);
/** Ветви к хвосту поджелудочной железы. */
export const PANCREATIC_BRANCHES: V3[][] = [2, 4, 6].map((k, j) => {
  const a = SPLENIC_ARTERY_PTS[k];
  const t = PANCREAS_TAIL_PTS[Math.min(4, 2 + (j > 1 ? 0 : j))];
  return [a, [(a[0] + t[0]) / 2, (a[1] + t[1]) / 2 + 0.1, (a[2] + t[2]) / 2 - 0.1], [t[0], t[1] + 0.35, t[2] + 0.05]];
});

/** Селезёночно-почечная связка: от ворот назад, к левой почке и задней стенке брюшной полости. */
export const LIG_SR = {
  a: [-3.2, -2.1, -1.0, 0.1, 1.2, 2.3].map((l) => entryPoint(l, -0.7, -0.05)),
  b: [-3.2, -2.1, -1.0, 0.1, 1.2, 2.3].map((l, i): V3 => [-4.2 + 0.28 * l, -1.5 - 0.55 * i + 0.3 * l, -3.35 + 0.1 * i]),
};
/** Диафрагмально-селезёночная: от верхнего полюса к диафрагме. */
export const LIG_PS = {
  a: [P(-6.0, 0.9, 0.2), P(-6.2, 0.2, -0.3), P(-5.7, -0.7, -0.9), P(-5.0, -1.6, -1.4)],
  b: [P(-7.8, 1.9, 1.5), P(-8.2, 0.4, 0.4), P(-7.7, -1.0, -0.1), P(-6.9, -2.3, -0.6)],
};
/** Селезёночно-ободочная: от нижнего полюса к селезёночному изгибу. */
export const LIG_SC = {
  a: [P(6.0, -1.2, 0.0), P(6.2, -0.4, -0.7), P(5.8, 0.4, -1.3), P(5.0, 0.9, -1.8)],
  b: [P(5.0, -3.9, 0.6), P(6.0, -3.4, -0.9), P(6.4, -2.8, -2.0), P(5.8, -2.2, -2.6)],
};

/* ---------- Лимфа и нервы ---------- */

export const LYMPH_NODES: { c: V3; r: number }[] = [
  { c: out(-1.7, hilumW(-1.7) - 1.2, 1.9), r: 0.34 },
  { c: out(-0.2, hilumW(-0.2) - 1.7, 2.9), r: 0.4 },
  { c: [-3.7, -0.9, 0.35], r: 0.32 },
  { c: [-5.1, -1.2, 0.2], r: 0.38 },
  { c: [-6.5, -0.9, 0.55], r: 0.32 },
  { c: out(1.2, hilumW(1.2) - 1.6, 2.4), r: 0.29 },
];

/** Нервы: ветви чревного сплетения идут вместе с артерией (сплетение вокруг сосуда). */
export const CELIAC_GANGLION: V3 = [AORTA_X + 0.45, -0.6, AORTA_Z + AORTA_R + 0.2];

/* ---------- Срезы ---------- */

export const CUT_RANGE = {
  /** Параллельно поверхностям: убираем внутренностную сторону. */
  side: { from: -3.4, to: 2.8 },
  /** Поперёк длинной оси: убираем передний (нижний) конец. */
  fundus: { from: 7.4, to: -7.4 },
  /** От верхнего края: убираем верхнюю часть. */
  coronal: { from: 5.0, to: -5.0 },
} as const;
export const CUT_DEFAULT_T = { side: 0.57, fundus: 0.48, coronal: 0.46 } as const;

export type CutKindP = keyof typeof CUT_RANGE;
export const cutCoord = (kind: CutKindP, t: number): number => lerp(CUT_RANGE[kind].from, CUT_RANGE[kind].to, t);

/** Плоскость среза: остаётся сторона с dot(n, p) + c >= 0. */
export function cutPlane(kind: CutKindP, t: number): { n: V3; c: number } {
  const v = cutCoord(kind, t);
  if (kind === 'side') return { n: AX_D, c: -v };
  if (kind === 'fundus') return { n: [-AX_L[0], -AX_L[1], -AX_L[2]], c: v };
  return { n: [-AX_W[0], -AX_W[1], -AX_W[2]], c: v };
}

/* ---------- Время ---------- */

/** Цикл «нагрузка»: 0..1 — как сильно селезёнка сжимается и как быстро течёт кровь; период 32 с. */
export const LOAD_PERIOD = 32;
export function squeeze(time: number): number {
  const t = time % LOAD_PERIOD;
  return smoothstep(8, 11, t) * (1 - smoothstep(17, 24, t));
}
