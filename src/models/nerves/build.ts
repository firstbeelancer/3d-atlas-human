import { SphereGeometry, type BufferGeometry } from 'three';
import { curveOf, merge, sdfMesh, tint, tube, wave, type V3 } from '../body/geo';
import { cerebellumField, cerebrumField } from '../body/thorax';
import type { GeometrySet } from '../body/transfer';
import { CONUS_Y, CORD_TOP, KNOTS, NERVES, REFLEX, cordPoint, cordRadius, type NervePath } from './anatomy';

/*
  Сетки нервной системы. Всё, кроме мозга, — трубки по путям из anatomy.ts. Сечение у мелких ветвей
  делается грубым (5–6 граней) и короткими отрезками, чтобы десятки веточек не раздували сцену.
  Мозг — упрощённые поля той же фигуры, что на главной, с более крупной ячейкой.
*/

/** Сколько граней и отрезков дать трубке: по толщине и длине. */
export function tubeDetail(radius: number, length: number): { radial: number; segments: number } {
  const radial = radius >= 0.06 ? 12 : radius >= 0.03 ? 9 : radius >= 0.015 ? 7 : 5;
  const perUnit = radius >= 0.03 ? 18 : 11;
  return { radial, segments: Math.max(6, Math.min(160, Math.round(length * perUnit))) };
}

export function nerveTube({ points, r: [a, b] }: NervePath): BufferGeometry {
  const length = curveOf(points).getLength();
  return tube(points, (t) => a + (b - a) * t, tubeDetail(Math.max(a, b), length));
}

function knot(at: V3, r: V3): BufferGeometry {
  const g = new SphereGeometry(1, 10, 7);
  g.scale(r[0], r[1], r[2]);
  g.translate(at[0], at[1], at[2]);
  return g;
}

function cordSegment(top: number, bottom: number, extra = 0): BufferGeometry {
  const pts: V3[] = [];
  const n = Math.max(3, Math.round((top - bottom) / 0.08));
  for (let i = 0; i <= n; i++) pts.push(cordPoint(top + ((bottom - top) * i) / n));
  const length = curveOf(pts).getLength();
  return tube(pts, (t) => cordRadius(top + (bottom - top) * t) + extra, { radial: 14, segments: Math.max(12, Math.round(length * 30)) });
}

/** Лёгкий оттенок вдоль нерва, как продольные пучки волокон. */
const fibres = (g: BufferGeometry) => tint(g, (x, y, z) => {
  const w = 0.92 + 0.08 * wave(y * 2.2 + x + z, 9, 3);
  return [w, w, w * 0.94];
});

/** Все трубки и узлы, по частям: id части → одна сетка. */
export function buildNerveSet(): GeometrySet {
  const byPart = new Map<string, BufferGeometry[]>();
  const push = (part: string, g: BufferGeometry) => {
    const list = byPart.get(part) ?? [];
    list.push(g);
    byPart.set(part, list);
  };
  for (const path of NERVES) push(path.part, nerveTube(path));
  for (const k of KNOTS) push(k.part, knot(k.at, k.r));

  // спинной мозг: верх, грудной отдел и конус — одна часть; утолщения — свои части чуть толще
  push('spinal-cord', cordSegment(CORD_TOP, 15.2));
  push('spinal-cord', cordSegment(14.5, 12.15));
  push('spinal-cord', cordSegment(11.4, CONUS_Y));
  push('cervical-enlargement', cordSegment(15.25, 14.45, 0.002));
  push('lumbar-enlargement', cordSegment(12.2, 11.35, 0.002));

  // рефлекторная дуга
  const arc = (pts: V3[], r: number) => tube(pts, r, { radial: 7, segments: Math.max(10, Math.round(curveOf(pts).getLength() * 14)) });
  push('sensory-neuron', arc(REFLEX.sensory, 0.017));
  push('interneuron', arc(REFLEX.inter, 0.012));
  push('motor-neuron', arc(REFLEX.motor, 0.019));
  push('skin-receptor', knot(REFLEX.receptor, [0.035, 0.035, 0.035]));
  push('effector-muscle', knot(REFLEX.muscle, REFLEX.muscleRadius));

  const out: GeometrySet = {};
  for (const [part, list] of byPart) {
    const g = list.length === 1 ? list[0] : merge(list);
    out[part] = part === 'effector-muscle' || part === 'skin-receptor' ? g : fibres(g);
  }
  return out;
}

/** Упрощённый головной мозг и мозжечок со стволом (ячейка 2,2 мм). */
export function buildBrainSet(cell = 0.022): GeometrySet {
  return {
    brain: sdfMesh(cerebrumField(), [-0.78, 15.9, -1.05], [0.78, 17.45, 0.9], cell, 0.02),
    cerebellum: sdfMesh(cerebellumField(), [-0.7, 15.4, -1.2], [0.7, 16.5, -0.1], cell, 0.03),
  };
}

export function buildAll(): GeometrySet {
  return { ...buildBrainSet(), ...buildNerveSet() };
}
