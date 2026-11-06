import { BASE_R, LENGTH, sAt } from './shape';
import type { Win } from './grid';

/* Окна на передней стенке (в ячейках опорной сетки 120 x 72; столбец 18 — середина передней стенки). */

const rowOf = (k: number) => Math.round((sAt(k) / LENGTH) * BASE_R);

const CENTER = 18;

/** Разрез: снята вся передняя стенка от дна до луковицы двенадцатиперстной кишки. */
export const CUT_WINDOW: Win = { r0: 0, r1: rowOf(9.05), c0: 1, c1: 35 };

/** Ступенчатая препаровка тела желудка: каждое следующее окно меньше предыдущего и снимает ещё один слой. */
const STEPS: [number, number, number][] = [
  [1.3, 3.8, 12],
  [1.48, 3.62, 10],
  [1.66, 3.44, 8],
  [1.84, 3.26, 6],
  [2.02, 3.08, 4],
];

/** Окно удаления каждого из пяти внешних слоёв (серозная, три мышечных, подслизистая). */
export const LAYER_WINDOWS: Win[] = STEPS.map(([k0, k1, half]) => ({
  r0: rowOf(k0),
  r1: rowOf(k1),
  c0: CENTER - half,
  c1: CENTER + half,
}));
