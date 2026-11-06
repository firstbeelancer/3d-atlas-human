/**
 * Анатомия постоянных зубов в виде неявных полей.
 *
 * Система координат зуба: единица = 10 мм; y — вверх от эмалево-цементной границы (ЭЦГ) на середине
 * губной поверхности (коронка y > 0, корни y < 0); x — мезиодистально (мезиальная сторона x < 0);
 * z — щёчно-язычно (щёчная/губная сторона z > 0). Размеры — средние учебные (Wheeler's Dental Anatomy),
 * форма упрощена, но сохраняет то, по чему зубы узнают: контуры коронки, бугры и борозды, ЭЦГ, корни.
 */
import { clamp01, lerp, smax, smin, smoothstep, softMax } from './sdf';

export type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar';
export type Jaw = 'upper' | 'lower';

/** Профиль полуширины коронки по высоте: у шейки, на высоте экватора (u = at) и у жевательной поверхности. */
export interface Profile {
  cerv: number;
  max: number;
  at: number;
  top: number;
}

/** Бугор (или валик): конус со скруглённой вершиной; сумма бугров даёт борозды между ними. */
export interface Cusp {
  x: number;
  z: number;
  h: number;
  /** Масштабы основания по x и z (вытянутый бугор — валик). */
  sx: number;
  sz: number;
  /** Крутизна склона. */
  slope?: number;
}

export interface RootSpec {
  /** Начало оси корня (внутри шейки) и вершина. */
  sx: number;
  sz: number;
  ax: number;
  az: number;
  /** Длина от ЭЦГ до верхушки. */
  len: number;
  /** Полуоси сечения корня у шейки. */
  rx: number;
  rz: number;
  /** Изгиб верхушки по x (дистальный наклон корня). */
  bend?: number;
  /** Глубина продольной борозды на апроксимальных (x) сторонах — «восьмёрка» в сечении. */
  groove?: number;
  /** Каналы внутри корня: смещение по z от оси (два канала в широком корне). */
  canals?: number[];
}

export interface ToothSpec {
  id: string;
  kind: ToothKind;
  jaw: Jaw;
  /** Высота коронки (от ЭЦГ до режущего края / вершины бугра). */
  h: number;
  md: Profile;
  lab: Profile;
  ling: Profile;
  /** Показатель суперэллипса сечения: 2 — эллипс, больше — прямоугольнее. */
  n: number;
  /** Режущий край (резцы), вершина клыка или бугры (премоляры, моляры). */
  edge?: { mesialDrop: number; distalDrop: number; mamelons?: number };
  canineTip?: { x: number; mesial: number; distal: number };
  cusps?: Cusp[];
  /** Язычная ямка и краевые валики резцов/клыков. */
  fossa?: number;
  /** Подъём ЭЦГ на апроксимальных сторонах. */
  cejRise: number;
  /** Глубина корневого ствола до фуркации (0 — однокорневой). */
  trunk: number;
  roots: RootSpec[];
  /** Толщина эмали на боковых стенках и на буграх/режущем крае. */
  enamelSide: number;
  enamelTop: number;
  /** На сколько пульпа отступает от поверхности (толщина эмали + дентина). */
  pulpDepth: number;
  /** Уровень дна пульповой камеры (ниже — корневые каналы). */
  chamberFloor: number;
}

const P = (cerv: number, max: number, at: number, top: number): Profile => ({ cerv, max, at, top });

/** Полуширина по профилю на относительной высоте u (0 — шейка, 1 — верх коронки). */
export function profileAt(p: Profile, u: number): number {
  if (u <= 0) return p.cerv;
  if (u < p.at) {
    const t = u / p.at;
    // плавный выход из шейки: без «бортика» на эмалево-цементной границе
    return lerp(p.cerv, p.max, t * t * (3 - 2 * t));
  }
  const t = clamp01((u - p.at) / (1 - p.at));
  return lerp(p.max, p.top, t * t);
}

/* ------------------------------------------------------------------ */
/* Верхняя челюсть                                                     */
/* ------------------------------------------------------------------ */

const U_I1: ToothSpec = {
  id: 'u-i1', kind: 'incisor', jaw: 'upper',
  h: 1.05, n: 2.6,
  md: P(0.33, 0.43, 0.78, 0.42), lab: P(0.17, 0.185, 0.18, 0.03), ling: P(0.17, 0.2, 0.2, 0.03),
  edge: { mesialDrop: 0.03, distalDrop: 0.12, mamelons: 0.012 }, fossa: 0.32,
  cejRise: 0.32, trunk: 0,
  roots: [{ sx: 0, sz: 0, ax: 0.02, az: -0.04, len: 1.3, rx: 0.29, rz: 0.27, bend: 0.03 }],
  enamelSide: 0.09, enamelTop: 0.1, pulpDepth: 0.2, chamberFloor: -0.05,
};

const U_I2: ToothSpec = {
  ...U_I1, id: 'u-i2',
  h: 0.92, md: P(0.25, 0.33, 0.75, 0.31), lab: P(0.15, 0.165, 0.2, 0.03), ling: P(0.15, 0.18, 0.22, 0.03),
  edge: { mesialDrop: 0.05, distalDrop: 0.17, mamelons: 0.008 },
  roots: [{ sx: 0, sz: 0, ax: 0.06, az: -0.03, len: 1.3, rx: 0.22, rz: 0.24, bend: 0.06 }],
  cejRise: 0.28, enamelSide: 0.08, pulpDepth: 0.18,
};

const U_C: ToothSpec = {
  id: 'u-c', kind: 'canine', jaw: 'upper',
  h: 1.05, n: 2.3,
  md: P(0.28, 0.38, 0.62, 0.3), lab: P(0.2, 0.22, 0.25, 0.05), ling: P(0.2, 0.23, 0.28, 0.05),
  canineTip: { x: -0.02, mesial: 0.85, distal: 0.62 }, fossa: 0.18,
  cejRise: 0.24, trunk: 0,
  roots: [{ sx: 0, sz: 0, ax: 0.05, az: -0.05, len: 1.7, rx: 0.26, rz: 0.31, bend: 0.05, groove: 0.12 }],
  enamelSide: 0.1, enamelTop: 0.15, pulpDepth: 0.22, chamberFloor: -0.05,
};

const U_P1: ToothSpec = {
  id: 'u-p1', kind: 'premolar', jaw: 'upper',
  h: 0.85, n: 2.5,
  md: P(0.25, 0.35, 0.55, 0.27), lab: P(0.4, 0.45, 0.28, 0.3), ling: P(0.38, 0.44, 0.45, 0.27),
  cusps: [
    { x: 0.02, z: 0.22, h: 0.85, sx: 0.24, sz: 0.18 },
    { x: 0.03, z: -0.2, h: 0.76, sx: 0.2, sz: 0.16 },
    { x: -0.24, z: 0, h: 0.62, sx: 0.05, sz: 0.34, slope: 0.1 },
    { x: 0.24, z: 0, h: 0.62, sx: 0.05, sz: 0.34, slope: 0.1 },
  ],
  cejRise: 0.1, trunk: 0.55,
  roots: [
    { sx: 0, sz: 0.18, ax: 0.03, az: 0.3, len: 1.3, rx: 0.232, rz: 0.207, bend: 0.04 },
    { sx: 0, sz: -0.18, ax: 0.03, az: -0.3, len: 1.3, rx: 0.232, rz: 0.207, bend: 0.04 },
  ],
  enamelSide: 0.11, enamelTop: 0.19, pulpDepth: 0.27, chamberFloor: -0.15,
};

const U_P2: ToothSpec = {
  ...U_P1, id: 'u-p2',
  md: P(0.24, 0.33, 0.55, 0.26),
  cusps: [
    { x: 0.0, z: 0.21, h: 0.82, sx: 0.24, sz: 0.18 },
    { x: 0.0, z: -0.2, h: 0.8, sx: 0.22, sz: 0.17 },
    { x: -0.23, z: 0, h: 0.62, sx: 0.05, sz: 0.34, slope: 0.1 },
    { x: 0.23, z: 0, h: 0.62, sx: 0.05, sz: 0.34, slope: 0.1 },
  ],
  trunk: 0,
  roots: [{ sx: 0, sz: 0, ax: 0.04, az: 0, len: 1.4, rx: 0.2, rz: 0.36, bend: 0.05, groove: 0.22, canals: [0.12, -0.12] }],
  chamberFloor: -0.05,
};

const U_M1: ToothSpec = {
  id: 'u-m1', kind: 'molar', jaw: 'upper',
  h: 0.75, n: 2.7,
  md: P(0.4, 0.5, 0.45, 0.42), lab: P(0.48, 0.54, 0.3, 0.4), ling: P(0.47, 0.56, 0.5, 0.42),
  cusps: [
    { x: -0.24, z: 0.27, h: 0.73, sx: 0.22, sz: 0.2 }, // мезиощёчный
    { x: 0.24, z: 0.25, h: 0.68, sx: 0.2, sz: 0.19 }, // дистощёчный
    { x: -0.22, z: -0.26, h: 0.77, sx: 0.26, sz: 0.23 }, // мезионёбный (самый крупный)
    { x: 0.28, z: -0.3, h: 0.6, sx: 0.17, sz: 0.17 }, // дистонёбный
    { x: 0.03, z: -0.02, h: 0.56, sx: 0.32, sz: 0.06, slope: 0.1 }, // косой валик
    { x: -0.42, z: 0, h: 0.54, sx: 0.05, sz: 0.4, slope: 0.1 }, // краевые валики
    { x: 0.42, z: 0, h: 0.5, sx: 0.05, sz: 0.4, slope: 0.1 },
    { x: -0.18, z: -0.52, h: 0.4, sx: 0.08, sz: 0.06, slope: 0.1 }, // бугорок Карабелли
  ],
  cejRise: 0.08, trunk: 0.3,
  roots: [
    { sx: -0.22, sz: 0.24, ax: -0.32, az: 0.36, len: 1.25, rx: 0.183, rz: 0.244, bend: 0.12, groove: 0.15, canals: [0.07, -0.07] },
    { sx: 0.24, sz: 0.24, ax: 0.32, az: 0.33, len: 1.18, rx: 0.171, rz: 0.183, bend: 0.06 },
    { sx: 0, sz: -0.24, ax: 0.0, az: -0.5, len: 1.32, rx: 0.244, rz: 0.207 },
  ],
  enamelSide: 0.12, enamelTop: 0.21, pulpDepth: 0.29, chamberFloor: -0.22,
};

const U_M2: ToothSpec = {
  ...U_M1, id: 'u-m2', h: 0.72,
  md: P(0.37, 0.46, 0.45, 0.38), lab: P(0.47, 0.53, 0.3, 0.38), ling: P(0.44, 0.52, 0.5, 0.38),
  cusps: U_M1.cusps!.slice(0, 7).map((c, i) => (i === 3 ? { ...c, h: 0.5, sx: 0.13, sz: 0.13 } : c)),
  roots: [
    { sx: -0.18, sz: 0.22, ax: -0.18, az: 0.3, len: 1.2, rx: 0.183, rz: 0.232, bend: 0.12 },
    { sx: 0.2, sz: 0.22, ax: 0.2, az: 0.28, len: 1.1, rx: 0.159, rz: 0.171, bend: 0.08 },
    { sx: 0, sz: -0.22, ax: 0.02, az: -0.38, len: 1.25, rx: 0.232, rz: 0.195 },
  ],
};

const U_M3: ToothSpec = {
  ...U_M2, id: 'u-m3', h: 0.66,
  md: P(0.35, 0.43, 0.45, 0.35), lab: P(0.45, 0.5, 0.3, 0.35), ling: P(0.4, 0.47, 0.5, 0.34),
  cusps: [
    { x: -0.2, z: 0.24, h: 0.66, sx: 0.22, sz: 0.2 },
    { x: 0.2, z: 0.22, h: 0.6, sx: 0.2, sz: 0.19 },
    { x: -0.12, z: -0.24, h: 0.66, sx: 0.28, sz: 0.24 },
    { x: -0.38, z: 0, h: 0.5, sx: 0.05, sz: 0.36, slope: 0.1 },
    { x: 0.38, z: 0, h: 0.46, sx: 0.05, sz: 0.36, slope: 0.1 },
  ],
  trunk: 0.7,
  roots: [
    { sx: -0.1, sz: 0.12, ax: 0.0, az: 0.12, len: 1.05, rx: 0.22, rz: 0.22, bend: 0.14 },
    { sx: 0.1, sz: -0.12, ax: 0.08, az: -0.12, len: 1.05, rx: 0.22, rz: 0.22, bend: 0.14 },
  ],
};

/* ------------------------------------------------------------------ */
/* Нижняя челюсть                                                      */
/* ------------------------------------------------------------------ */

const L_I1: ToothSpec = {
  ...U_I1, id: 'l-i1', jaw: 'lower',
  h: 0.9, md: P(0.18, 0.26, 0.8, 0.26), lab: P(0.15, 0.16, 0.2, 0.025), ling: P(0.15, 0.17, 0.2, 0.025),
  edge: { mesialDrop: 0.01, distalDrop: 0.02, mamelons: 0.006 }, fossa: 0.15,
  roots: [{ sx: 0, sz: 0, ax: 0.0, az: 0, len: 1.25, rx: 0.15, rz: 0.29, groove: 0.2, canals: [0.06, -0.06] }],
  cejRise: 0.25, enamelSide: 0.07, pulpDepth: 0.15,
};

const L_I2: ToothSpec = {
  ...L_I1, id: 'l-i2',
  h: 0.95, md: P(0.19, 0.28, 0.78, 0.28),
  edge: { mesialDrop: 0.02, distalDrop: 0.06, mamelons: 0.006 },
  roots: [{ sx: 0, sz: 0, ax: 0.02, az: 0, len: 1.4, rx: 0.16, rz: 0.3, groove: 0.2, bend: 0.03, canals: [0.06, -0.06] }],
};

const L_C: ToothSpec = {
  ...U_C, id: 'l-c', jaw: 'lower',
  h: 1.1, md: P(0.26, 0.34, 0.68, 0.27), lab: P(0.19, 0.2, 0.25, 0.04), ling: P(0.19, 0.2, 0.28, 0.04),
  canineTip: { x: -0.06, mesial: 1.0, distal: 0.62 }, fossa: 0.1,
  roots: [{ sx: 0, sz: 0, ax: 0.03, az: 0, len: 1.6, rx: 0.24, rz: 0.36, bend: 0.04, groove: 0.16 }],
};

const L_P1: ToothSpec = {
  id: 'l-p1', kind: 'premolar', jaw: 'lower',
  h: 0.85, n: 2.2,
  md: P(0.24, 0.35, 0.55, 0.25), lab: P(0.36, 0.4, 0.3, 0.2), ling: P(0.3, 0.32, 0.45, 0.2),
  cusps: [
    { x: 0, z: 0.1, h: 0.85, sx: 0.24, sz: 0.2 },
    { x: 0, z: -0.24, h: 0.55, sx: 0.12, sz: 0.1 },
    { x: -0.22, z: -0.06, h: 0.5, sx: 0.05, sz: 0.24, slope: 0.1 },
    { x: 0.22, z: -0.06, h: 0.5, sx: 0.05, sz: 0.24, slope: 0.1 },
  ],
  cejRise: 0.1, trunk: 0,
  roots: [{ sx: 0, sz: 0, ax: 0.03, az: 0, len: 1.4, rx: 0.22, rz: 0.3, bend: 0.04, groove: 0.1 }],
  enamelSide: 0.1, enamelTop: 0.18, pulpDepth: 0.26, chamberFloor: -0.05,
};

const L_P2: ToothSpec = {
  ...L_P1, id: 'l-p2',
  md: P(0.25, 0.36, 0.55, 0.28), lab: P(0.38, 0.41, 0.3, 0.27), ling: P(0.36, 0.4, 0.45, 0.27),
  cusps: [
    { x: 0, z: 0.16, h: 0.8, sx: 0.24, sz: 0.19 },
    { x: -0.12, z: -0.22, h: 0.7, sx: 0.15, sz: 0.14 },
    { x: 0.14, z: -0.22, h: 0.64, sx: 0.12, sz: 0.13 },
    { x: -0.25, z: 0, h: 0.55, sx: 0.05, sz: 0.3, slope: 0.1 },
    { x: 0.25, z: 0, h: 0.55, sx: 0.05, sz: 0.3, slope: 0.1 },
  ],
  roots: [{ sx: 0, sz: 0, ax: 0.04, az: 0, len: 1.45, rx: 0.23, rz: 0.29, bend: 0.04 }],
};

const L_M1: ToothSpec = {
  id: 'l-m1', kind: 'molar', jaw: 'lower',
  h: 0.75, n: 2.6,
  md: P(0.45, 0.55, 0.45, 0.48), lab: P(0.44, 0.5, 0.25, 0.36), ling: P(0.43, 0.49, 0.5, 0.4),
  cusps: [
    { x: -0.3, z: 0.24, h: 0.68, sx: 0.2, sz: 0.19 }, // мезиощёчный
    { x: 0.04, z: 0.27, h: 0.64, sx: 0.18, sz: 0.18 }, // дистощёчный
    { x: 0.36, z: 0.18, h: 0.56, sx: 0.13, sz: 0.14 }, // дистальный
    { x: -0.28, z: -0.24, h: 0.76, sx: 0.21, sz: 0.19 }, // мезиоязычный
    { x: 0.16, z: -0.25, h: 0.72, sx: 0.2, sz: 0.19 }, // дистоязычный
    { x: -0.47, z: 0, h: 0.54, sx: 0.05, sz: 0.38, slope: 0.1 }, // краевые валики
    { x: 0.47, z: 0, h: 0.5, sx: 0.05, sz: 0.34, slope: 0.1 },
  ],
  cejRise: 0.08, trunk: 0.32,
  roots: [
    { sx: -0.28, sz: 0, ax: -0.3, az: 0, len: 1.4, rx: 0.183, rz: 0.4, bend: 0.14, groove: 0.3, canals: [0.17, -0.17] },
    { sx: 0.28, sz: 0, ax: 0.36, az: 0, len: 1.3, rx: 0.183, rz: 0.36, bend: 0.1, groove: 0.12 },
  ],
  enamelSide: 0.12, enamelTop: 0.2, pulpDepth: 0.29, chamberFloor: -0.2,
};

const L_M2: ToothSpec = {
  ...L_M1, id: 'l-m2', h: 0.72,
  md: P(0.42, 0.52, 0.45, 0.45),
  cusps: [
    { x: -0.24, z: 0.24, h: 0.66, sx: 0.22, sz: 0.2 },
    { x: 0.24, z: 0.24, h: 0.62, sx: 0.21, sz: 0.2 },
    { x: -0.24, z: -0.24, h: 0.72, sx: 0.22, sz: 0.2 },
    { x: 0.24, z: -0.24, h: 0.68, sx: 0.21, sz: 0.2 },
    { x: -0.44, z: 0, h: 0.52, sx: 0.05, sz: 0.36, slope: 0.1 },
    { x: 0.44, z: 0, h: 0.48, sx: 0.05, sz: 0.34, slope: 0.1 },
  ],
  roots: [
    { sx: -0.24, sz: 0, ax: -0.18, az: 0, len: 1.3, rx: 0.183, rz: 0.464, bend: 0.16, groove: 0.22, canals: [0.15, -0.15] },
    { sx: 0.24, sz: 0, ax: 0.24, az: 0, len: 1.22, rx: 0.183, rz: 0.415, bend: 0.12, groove: 0.1 },
  ],
};

const L_M3: ToothSpec = {
  ...L_M2, id: 'l-m3', h: 0.68,
  md: P(0.4, 0.5, 0.45, 0.42),
  trunk: 0.55,
  roots: [
    { sx: -0.18, sz: 0, ax: -0.06, az: 0, len: 1.1, rx: 0.2, rz: 0.36, bend: 0.2, groove: 0.1 },
    { sx: 0.18, sz: 0, ax: 0.18, az: 0, len: 1.05, rx: 0.18, rz: 0.33, bend: 0.2 },
  ],
};

/** Половина зубного ряда от центра назад: резцы, клык, премоляры, моляры. */
export const UPPER: ToothSpec[] = [U_I1, U_I2, U_C, U_P1, U_P2, U_M1, U_M2, U_M3];
export const LOWER: ToothSpec[] = [L_I1, L_I2, L_C, L_P1, L_P2, L_M1, L_M2, L_M3];
export const SPECS: Record<string, ToothSpec> = Object.fromEntries([...UPPER, ...LOWER].map((s) => [s.id, s]));

/** Четыре «эталонных» зуба для витрины типов. */
export const SHOWCASE: Record<ToothKind, ToothSpec> = { incisor: U_I1, canine: U_C, premolar: U_P1, molar: U_M1 };

/* ------------------------------------------------------------------ */
/* Поля                                                                */
/* ------------------------------------------------------------------ */

export interface ToothField {
  spec: ToothSpec;
  /** Поле всего зуба (приблизительное расстояние). */
  outer(x: number, y: number, z: number): number;
  /** Высота ЭЦГ над точкой (x, z). */
  cej(x: number, z: number): number;
  /** Толщина эмали (над ЭЦГ) или цемента (под ней). */
  shell(x: number, y: number, z: number): number;
  /** Поле корневых каналов. */
  canals(x: number, y: number, z: number): number;
  /** Габариты зуба. */
  box: { min: [number, number, number]; max: [number, number, number] };
}

const SMOOTH_ROOT = 0.13;

export function makeToothField(spec: ToothSpec): ToothField {
  const { h, md, lab, ling, n, roots, trunk } = spec;
  const cusps = spec.cusps ?? [];
  const cuspVals = new Float64Array(cusps.length);
  const wN = clamp01((n - 2) / 1.6);
  const minTop = cusps.length ? Math.min(...cusps.map((c) => c.h)) - 0.25 : h * 0.55;

  /** Высота жевательной поверхности / режущего края над шейкой. */
  const top = (x: number, z: number): number => {
    if (spec.edge) {
      const a = md.top;
      const xm = clamp01((-x / a - 0.55) / 0.45);
      const xd = clamp01((x / a - 0.45) / 0.55);
      let y = h - spec.edge.mesialDrop * xm * xm - spec.edge.distalDrop * xd * xd * (1 + xd);
      const m = spec.edge.mamelons ?? 0;
      if (m) for (const mx of [-0.55, 0, 0.55]) y += m * Math.exp(-(((x / a - mx) / 0.2) ** 2));
      return y;
    }
    if (spec.canineTip) {
      const t = spec.canineTip;
      const dx = x - t.x;
      const s = dx < 0 ? t.mesial : t.distal;
      return h - s * (Math.sqrt(dx * dx + 0.0016) - 0.04) - 0.9 * z * z;
    }
    for (let i = 0; i < cusps.length; i++) {
      const c = cusps[i];
      const dx = (x - c.x) / c.sx;
      const dz = (z - c.z) / c.sz;
      cuspVals[i] = c.h - (c.slope ?? 0.24) * (Math.sqrt(dx * dx + dz * dz + 0.18) - 0.42);
    }
    return softMax(cuspVals, cusps.length, 0.014);
  };

  /** Тело коронки и корневого ствола: суперэллипс по высоте, сверху срезан жевательной поверхностью. */
  // у однокорневых тело коронки уходит под шейку и сужается до толщины корня — переход без перетяжки
  const trunkEff = trunk > 0 ? trunk : 0.35;
  const shrink = trunk > 0 ? 0.2 : 0.3;
  const body = (x: number, y: number, z: number): number => {
    if (y < -trunkEff - 0.2) return -(trunkEff + 0.03) - y;
    const u = y / h;
    const a = profileAt(md, u);
    let b = profileAt(z > 0 ? lab : ling, u);
    let a2 = a;
    if (y < 0) {
      // корневой ствол сужается к фуркации
      const t = clamp01(-y / trunkEff);
      b *= 1 - shrink * t * t;
      a2 = a * (1 - shrink * 0.8 * t * t);
    }
    // язычная ямка с краевыми валиками у резцов и клыков
    if (spec.fossa && z < 0 && u > 0.3) {
      const w = smoothstep(0.3, 0.55, u) * (1 - smoothstep(0.85, 1.0, u));
      b *= 1 - spec.fossa * w * Math.exp(-((x / (a * 0.62)) ** 4));
    }
    // губной валик клыка
    if (spec.canineTip && z > 0) b *= 1 + 0.08 * Math.exp(-(((x - spec.canineTip.x) / 0.13) ** 2));
    const qx = Math.abs(x) / a2;
    const qz = Math.abs(z) / b;
    const x2 = qx * qx;
    const z2 = qz * qz;
    // смесь норм L2 и L4 вместо дорогого Math.pow: показатель n ~ 2..3 даёт «подушку» сечения
    const r = Math.sqrt(x2 + z2) * (1 - wN) + Math.sqrt(Math.sqrt(x2 * x2 + z2 * z2)) * wN;
    const side = (r - 1) * Math.min(a2, b);
    let d = side;
    if (y > minTop) d = smax(side, y - top(x, z), 0.035);
    // низ ствола: тело заканчивается в фуркации, дальше идут корни
    // однокорневой: тело уходит под ЭЦГ и плавно переходит в корень; многокорневой: скругление над фуркацией
    const bottom = -(trunkEff + 0.03) - y;
    return smax(d, bottom, trunk > 0 ? 0.12 : 0.08);
  };

  const ROOT_TOP = 0.12;

  const root = (r: RootSpec, x: number, y: number, z: number): number => {
    if (y > ROOT_TOP + 0.05) return y - ROOT_TOP;
    const t = clamp01((ROOT_TOP - y) / (ROOT_TOP + r.len));
    const cx = r.sx + (r.ax - r.sx) * t + (r.bend ?? 0) * t * t * t;
    const cz = r.sz + (r.az - r.sz) * t;
    // профиль сужения: почти цилиндр у шейки, конус к верхушке, кончик скруглён
    // корень сужается плавно (почти параболой), у верхушки скруглён
    const taper = Math.sqrt(1 - t) * (1 - 0.18 * t) + 0.02;
    const rx = r.rx * taper;
    let rz = r.rz * taper;
    const dx = x - cx;
    const dz = z - cz;
    let ex = rx;
    if (r.groove) ex *= 1 - r.groove * Math.exp(-((dz / (rz * 0.45)) ** 2));
    rz = Math.max(rz, 1e-3);
    const qa = dx / ex;
    const qb = dz / rz;
    const q = Math.sqrt(qa * qa + qb * qb);
    let d = (q - 1) * Math.min(ex, rz);
    const apexY = -r.len;
    d = smax(d, apexY - y - 0.01, 0.05);
    return d;
  };

  const outer = (x: number, y: number, z: number): number => {
    let d = body(x, y, z);
    // у шейки корни сливаются с коронкой почти без «наплыва», к фуркации — с мягким скруглением
    const k = 0.025 + (SMOOTH_ROOT - 0.025) * smoothstep(-0.04, -0.3, y);
    for (const r of roots) d = smin(d, root(r, x, y, z), k);
    return d;
  };

  const cej = (x: number, z: number): number => {
    const ang = (x * x) / (x * x + z * z + 1e-6);
    // ЭЦГ выше на апроксимальных сторонах; на язычной стороне чуть выше, чем на губной
    return spec.cejRise * ang * ang + (z < 0 ? 0.03 : 0);
  };

  const shell = (x: number, y: number, z: number): number => {
    const c = cej(x, z);
    if (y < c) {
      // цемент: тонкий у шейки, толще у верхушки
      const depth = clamp01((c - y) / 1.4);
      return 0.02 + 0.03 * depth;
    }
    const up = smoothstep(0, h * 0.45, y - c);
    const toTop = smoothstep(h * 0.55, h, y);
    return 0.02 + (spec.enamelSide - 0.02) * up + (spec.enamelTop - spec.enamelSide) * toTop * up;
  };

  const canalLists = roots.map((r) => r.canals ?? [0]);
  const canals = (x: number, y: number, z: number): number => {
    let d = 1e9;
    for (let ri = 0; ri < roots.length; ri++) {
      const r = roots[ri];
      const list = canalLists[ri];
      const t = clamp01((ROOT_TOP - y) / (ROOT_TOP + r.len));
      // у устья канал сворачивает к центру камеры
      const k = 0.35 + 0.65 * smoothstep(0, 0.3, t);
      const cx = (r.sx + (r.ax - r.sx) * t + (r.bend ?? 0) * t * t * t) * k;
      const cz = (r.sz + (r.az - r.sz) * t) * k;
      const rad = 0.045 * Math.sqrt(1 - t) + 0.011;
      for (let ci = 0; ci < list.length; ci++) {
        const off = list[ci];
        // два канала в широком корне сходятся к общей верхушке
        const oz = off * (1 - smoothstep(0.75, 1, t));
        const ux = x - cx;
        const uz = z - cz - oz;
        let c = Math.sqrt(ux * ux + uz * uz) - rad;
        c = smax(c, -r.len - 0.04 - y, 0.01);
        c = smax(c, y - (spec.chamberFloor + 0.14), 0.04);
        d = Math.min(d, c);
      }
    }
    return d;
  };

  const xr = Math.max(md.max, ...roots.map((r) => Math.abs(r.ax) + r.rx * 0.5 + 0.1)) + 0.08;
  const zr = Math.max(lab.max, ling.max, ...roots.map((r) => Math.abs(r.az) + r.rz * 0.5 + 0.1)) + 0.08;
  const maxLen = Math.max(...roots.map((r) => r.len));
  return {
    spec,
    outer,
    cej,
    shell,
    canals,
    box: { min: [-xr, -maxLen - 0.08, -zr], max: [xr, h + 0.1, zr] },
  };
}

/** Удобный экспорт для тестов: высота поверхности коронки в точке. */
export function crownTopAt(spec: ToothSpec, x: number, z: number): number {
  const f = makeToothField(spec);
  // ищем поверхность сверху вниз
  for (let y = spec.h + 0.1; y > -0.2; y -= 0.002) if (f.outer(x, y, z) < 0) return y;
  return -1;
}
