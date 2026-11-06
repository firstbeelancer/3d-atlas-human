import { CatmullRomCurve3, Vector3 } from 'three';
import type { V3 } from './sdf';

/*
  Опорные точки скелета взрослого ростом 175 см. Единица — 1 дм (10 см), начало — пол между стопами.
  Оси: +x — левая сторона человека (справа для зрителя), +y — вверх, +z — вперёд.
  Пропорции по канону: голова ~ 1/7,5 роста, лобок — середина роста, кончики пальцев — середина бедра.
*/

export const HEIGHT = 17.5;

/** Шарниры, вокруг которых двигаются части скелета (левая сторона; правая — зеркально). */
export const JOINTS = {
  head: [0, 15.9, -0.2] as V3,
  sternoclavicular: [0.15, 14.25, 0.88] as V3,
  shoulder: [1.6, 14.02, -0.28] as V3,
  elbow: [1.82, 10.88, -0.3] as V3,
  wrist: [2.0, 8.38, -0.15] as V3,
  hip: [0.88, 9.15, 0.02] as V3,
  knee: [0.57, 4.76, -0.03] as V3,
  ankle: [0.58, 0.62, -0.02] as V3,
};

/** Центр головы для построения черепа (уровень глаз). */
export const SKULL_ORIGIN: V3 = [0, 16.35, 0.05];

/** Ось позвоночника по центрам тел позвонков (y, z): шейный и поясничный лордоз, грудной кифоз. */
const SPINE_YZ: [number, number][] = [
  [15.85, -0.2], [15.3, -0.07], [14.8, -0.2], [14.3, -0.42], [13.5, -0.62], [12.6, -0.64],
  [11.8, -0.48], [11.0, -0.22], [10.4, -0.12], [9.95, -0.25],
];

export const SPINE = new CatmullRomCurve3(
  SPINE_YZ.map(([y, z]) => new Vector3(0, y, z)),
  false,
  'centripetal',
);

/** z оси позвоночника на высоте y. */
export function spineZ(y: number): number {
  for (let i = 0; i < SPINE_YZ.length - 1; i++) {
    const [y0, z0] = SPINE_YZ[i];
    const [y1, z1] = SPINE_YZ[i + 1];
    if (y <= y0 && y >= y1) {
      const t = (y0 - y) / (y0 - y1);
      // сглаженная интерполяция, чтобы ось не ломалась
      const s = t * t * (3 - 2 * t);
      const lin = z0 + (z1 - z0) * t;
      return lin * 0.5 + (z0 + (z1 - z0) * s) * 0.5;
    }
  }
  return y > SPINE_YZ[0][0] ? SPINE_YZ[0][1] : SPINE_YZ[SPINE_YZ.length - 1][1];
}

export interface VertebraSpot {
  y: number;
  z: number;
  /** Наклон тела позвонка вокруг оси x (по касательной к оси позвоночника). */
  tilt: number;
  scale: number;
}

function tiltAt(y: number): number {
  const d = 0.08;
  const dz = spineZ(y + d) - spineZ(y - d);
  return Math.atan2(dz, 2 * d);
}

function spots(top: number, step: number, count: number, s0: number, s1: number): VertebraSpot[] {
  return Array.from({ length: count }, (_, i) => {
    const y = top - i * step;
    return { y, z: spineZ(y), tilt: tiltAt(y), scale: s0 + ((s1 - s0) * i) / Math.max(1, count - 1) };
  });
}

/** 7 шейных, 12 грудных, 5 поясничных позвонков. */
export const VERTEBRAE = {
  cervical: spots(15.78, 0.17, 7, 0.82, 1.05),
  thoracic: spots(14.55, 0.27, 12, 0.82, 1.15),
  lumbar: spots(11.27, 0.33, 5, 0.9, 1.08),
};

/** Высоты задних концов рёбер (у грудных позвонков) и передних костных концов. */
export const RIB_Y = VERTEBRAE.thoracic.map((v) => v.y);
export const RIB_END_Y = [14.0, 13.65, 13.32, 13.0, 12.68, 12.36, 12.05, 11.8, 11.6, 11.42, 11.25, 11.15];
/** Где хрящ ребра крепится к грудине (для истинных рёбер 1–7). */
export const STERNAL_Y = [14.12, 13.86, 13.58, 13.32, 13.07, 12.88, 12.76];

export const STERNUM = { top: 14.28, topZ: 0.93, bottom: 12.36, bottomZ: 1.24 };

export function sternumZ(y: number): number {
  const t = (STERNUM.top - y) / (STERNUM.top - STERNUM.bottom);
  return STERNUM.topZ + (STERNUM.bottomZ - STERNUM.topZ) * t;
}
