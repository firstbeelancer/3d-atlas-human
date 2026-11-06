/*
  Анатомия мочевого пузыря, размеры — в условных сантиметрах сцены.
  Оси: +y — вверх (к верхушке), +z — вперёд (к лобку), +x — вправо от зрителя.
  Передняя стенка смотрит на зрителя, дно (fundus) — назад и вниз, там изнутри
  лежит мочепузырный треугольник, шейка — внизу, выход в уретру — снизу по центру.

  Форма — поверхность по профилю радиуса R(y): грушевидный резервуар,
  широкий в теле, сужающийся книзу в шейку и округлый у верхушки.
  Поперечное сечение — эллипс (глубина меньше ширины, коэффициент Z_SCALE),
  задняя нижняя часть слегка уплощена. Стенка взрослого пузыря в наполненном
  состоянии около 2–3 мм, в пустом — до 15 мм со складками; здесь толщина
  слоёв намеренно увеличена для наглядности, как у остальных разделов атласа.
*/

export type V3 = [number, number, number];

/** Глубина пузыря относительно ширины. */
export const Z_SCALE = 0.84;

/** Нижняя и верхняя границы стенки по y. */
export const Y_BOTTOM = -3.0;
export const Y_TOP = 3.22;

/** Контрольные точки профиля: [y, радиус]. */
export const PROFILE: [number, number][] = [
  [Y_BOTTOM, 0.4],
  [-2.8, 0.74],
  [-2.45, 1.32],
  [-1.9, 1.97],
  [-1.2, 2.52],
  [-0.4, 2.87],
  [0.4, 3.0],
  [1.2, 2.92],
  [1.9, 2.62],
  [2.55, 2.06],
  [2.95, 1.32],
  [3.15, 0.56],
  [Y_TOP, 0.03],
];

/** Плавная интерполяция Кэтмулла–Рома по контрольным точкам профиля. */
export function radiusAt(y: number): number {
  const pts = PROFILE;
  if (y <= pts[0][0]) return pts[0][1];
  if (y >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  let i = 0;
  while (i < pts.length - 2 && y > pts[i + 1][0]) i++;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];
  const t = (y - p1[0]) / (p2[0] - p1[0]);
  const t2 = t * t;
  const t3 = t2 * t;
  // радиусы соседних сегментов приводим к локальному шагу — профиль неравномерный
  const catmull = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return Math.max(0.02, catmull(p0[1], p1[1], p2[1], p3[1]));
}

/** Смещение оси пузыря по z: шейка и верхушка поданы вперёд, к лобку. */
export function centerZAt(y: number): number {
  const t = (y - Y_BOTTOM) / (Y_TOP - Y_BOTTOM);
  return 0.34 - 0.22 * t;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Точка стенки пузыря. theta: 0 — спереди (+z), pi/2 — справа (+x), pi — сзади.
 * off — смещение вдоль радиуса наружу от наружной поверхности (для слоёв стенки).
 */
export function wallPoint(y: number, theta: number, off = 0): V3 {
  const r = Math.max(0.02, radiusAt(y) + off);
  const cz = centerZAt(y);
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  let z = r * Z_SCALE * cos;
  // задняя нижняя часть (дно) слегка уплощена — пузырь лежит на тазовом дне
  if (cos < 0 && y < -0.5) z *= 1 - 0.09 * smoothstep(-0.5, -2.2, y) * -cos;
  return [r * sin, y, cz + z];
}

/* ---------- Ключевые точки внутри пузыря ---------- */

/** Углы устьев мочеточников на задней стенке (правый и левый). */
export const ORIFICE_THETA_R = 2.47;
export const ORIFICE_THETA_L = Math.PI * 2 - 2.47;
export const ORIFICE_Y = -1.55;

/** Точка устья мочеточника на внутренней поверхности (слой слизистой). */
export function orificePoint(side: 1 | -1): V3 {
  return wallPoint(ORIFICE_Y, side === 1 ? ORIFICE_THETA_R : ORIFICE_THETA_L, -0.5);
}

/** Точка входа мочеточника в стенку снаружи. */
export function ureterEntryPoint(side: 1 | -1): V3 {
  return wallPoint(-1.02, side === 1 ? 2.32 : Math.PI * 2 - 2.32, 0.12);
}

/** Центр внутреннего отверстия уретры (дно шейки, вид изнутри). */
export const URETHRAL_ORIFICE: V3 = [0, -2.74, 0.16];

/** Толщина слоёв стенки от наружной поверхности внутрь (наглядная, увеличенная). */
export const WALL_OFF = {
  serosa: 0.045,
  adventitia: 0.04,
  detrusor: -0.21,
  submucosa: -0.36,
  mucosa: -0.46,
  lumen: -0.56,
} as const;

/** Наполнение пузыря за цикл анимации: доля объёма 0..1 по времени (с). */
export function fillFraction(time: number): number {
  const period = 30;
  const p = ((time % period) + period) % period / period;
  if (p < 0.55) return 0.22 + 0.68 * smoothstep(0, 1, p / 0.55);
  if (p < 0.7) return 0.9;
  if (p < 0.8) return 0.9 - 0.68 * smoothstep(0, 1, (p - 0.7) / 0.1);
  return 0.22;
}

/** Высота уровня мочи по доле наполнения. */
export function urineLevelY(fill: number): number {
  return lerp(-1.5, 2.15, fill);
}
