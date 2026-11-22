import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { capsule, meshSdf, smooth, smoothSubtract, sphere, union, type Sdf, type V3 } from '../skeleton/sdf';
import { above, E, Er, eTube, loft, mirrored } from './sdfx';
import { handDigits } from '../skeleton/hand';

/*
  Кожа — «стеклянная» оболочка тела: одно гладкое поле расстояний (голова с чертами лица, шея, торс,
  руки с пальцами, ноги со стопами), из которого строится сетка. Строится по левой половине и
  отражается относительно x = 0. Координаты — дециметры (рост 17,5), как у скелета.
*/

/** Отведение руки от туловища (рад): между рукой и бедром остаётся воздух. */
export const ARM_ABDUCTION = 0.13;
export const SHOULDER: V3 = [1.6, 14.02, -0.28];

/** Поворот точки вокруг оси z через плечевой сустав: так же вращаются кости руки. */
export function armPoint(p: V3, pivot: V3 = SHOULDER, a = ARM_ABDUCTION): V3 {
  const dx = p[0] - pivot[0];
  const dy = p[1] - pivot[1];
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c, p[2]];
}

/** Цепочки суставов пальцев кисти (те же, что у костей кисти), в системе кисти до отведения. */
export function fingerChains(): V3[][] {
  return handDigits().map((d) => d.points);
}

function chainTube(pts: V3[], r0: number, r1: number): Sdf {
  const parts: Sdf[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = r0 + ((r1 - r0) * i) / (pts.length - 1);
    const b = r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1);
    parts.push(capsule(pts[i], pts[i + 1], a, b));
  }
  return union(...parts);
}

function head(): Sdf {
  const scalp = smooth(
    0.18,
    E([0, 16.7, -0.12], [0.84, 0.93, 1.06]),
    E([0, 16.2, 0.2], [0.72, 0.98, 0.8]),
    E([0, 16.1, -0.75], [0.66, 0.6, 0.5]),
  );
  const lowerFace = smooth(
    0.16,
    E([0, 15.72, 0.28], [0.66, 0.62, 0.72]),
    E([0, 15.18, 0.7], [0.3, 0.2, 0.26]),
    E([0.5, 15.98, 0.5], [0.28, 0.24, 0.22]),
    E([0.5, 15.5, 0.08], [0.2, 0.42, 0.45]),
  );
  // на уровне ушей голова шире черепа внутри (ширина головы около 15 см), иначе скуловые дуги выглядывают наружу
  const temples = E([0, 16.08, -0.16], [0.74, 0.42, 0.72]);
  let face = smooth(0.2, scalp, lowerFace, temples);
  // брови, переносица, нос, губы
  const brow = capsule([0.05, 16.52, 0.93], [0.48, 16.5, 0.8], 0.085, 0.07);
  // нос выступает от лица на 2–3 см: спинка, кончик и крылья, без провала под кончиком
  const nose = smooth(
    0.08,
    capsule([0, 16.3, 0.98], [0, 15.95, 1.2], 0.075, 0.1),
    sphere([0, 15.9, 1.2], 0.1),
    sphere([0.11, 15.88, 1.08], 0.085),
    sphere([-0.11, 15.88, 1.08], 0.085),
  );
  const lipUpper = E([0, 15.56, 0.94], [0.3, 0.075, 0.13], 0.2);
  const lipLower = E([0, 15.4, 0.9], [0.26, 0.075, 0.12], 0.2);
  const cheek = E([0.46, 16.0, 0.74], [0.24, 0.2, 0.2], 0.3);
  face = smooth(0.06, face, brow, nose, lipUpper, lipLower, cheek);
  // впадины глазниц и веки над глазными яблоками
  face = smoothSubtract(0.1, face, sphere([0.3, 16.36, 1.18], 0.2));
  const lid = E([0.3, 16.33, 0.78], [0.2, 0.17, 0.2], 0.2);
  return smooth(0.04, face, lid);
}

function neckAndShoulders(): Sdf {
  const neck = eTube(
    [[0, 15.5, -0.1], [0, 14.7, -0.12], [0, 14.2, -0.18]],
    [0.58, 0.6, 0.72],
    [0.55, 0.57, 0.66],
  );
  const trapezius = eTube([[0.28, 14.62, -0.28], [1.1, 14.4, -0.3], [1.55, 14.18, -0.3]], [0.5, 0.5, 0.52], [0.55, 0.52, 0.5]);
  const adam = E([0, 15.0, 0.38], [0.14, 0.17, 0.14], 0.2);
  return smooth(0.15, neck, trapezius, adam);
}

function torso(): Sdf {
  const body = loft({
    y: [8.55, 8.9, 9.3, 9.8, 10.4, 11.0, 11.6, 12.3, 13.0, 13.7, 14.2, 14.55, 14.85],
    w: [1.1, 1.62, 1.78, 1.7, 1.54, 1.5, 1.64, 1.78, 1.78, 1.7, 1.45, 0.92, 0.64],
    zf: [0.8, 1.0, 1.1, 1.18, 1.22, 1.28, 1.34, 1.42, 1.38, 1.25, 1.0, 0.82, 0.55],
    zb: [-0.9, -1.2, -1.3, -1.12, -1.0, -0.96, -1.06, -1.2, -1.26, -1.2, -1.0, -0.7, -0.55],
    n: [2.2, 2.3, 2.3, 2.3, 2.4, 2.4, 2.5, 2.5, 2.5, 2.4, 2.3, 2.2, 2],
  });
  const pecs = E([0.62, 13.2, 1.0], [0.7, 0.55, 0.42], 0.3);
  const abs = E([0.3, 10.7, 1.05], [0.5, 1.0, 0.3], 0.3);
  const glute = E([0.72, 9.25, -0.62], [0.78, 0.8, 0.68], 0.3);
  const iliac = E([1.2, 9.9, 0.1], [0.5, 0.5, 0.8], 0.3);
  return smooth(0.3, body, pecs, abs, glute, iliac);
}

function arm(): Sdf {
  const a = (p: V3) => armPoint(p);
  const deltoid = E(a([1.78, 13.85, -0.28]), [0.74, 0.8, 0.72], 0.3);
  const upper = eTube(
    [a([1.64, 13.9, -0.28]), a([1.7, 12.5, -0.3]), a([1.82, 10.9, -0.3])],
    [0.72, 0.62, 0.47],
    [0.68, 0.6, 0.45],
  );
  const biceps = Er(a([1.74, 12.6, -0.02]), [0.42, 0.9, 0.38], [0, 0, ARM_ABDUCTION]);
  const fore = eTube(
    [a([1.82, 10.9, -0.3]), a([1.9, 10.0, -0.28]), a([2.0, 8.5, -0.16])],
    [0.47, 0.46, 0.28],
    [0.45, 0.42, 0.2],
  );
  // ладонь лежит над пястными костями и кончается у костяшек; большой палец растёт из возвышения,
  // а с указательным его связывает тонкая межпальцевая складка, а не сплошная «лопата»
  const palm = eTube(
    [a([1.99, 8.46, -0.15]), a([2.0, 7.98, -0.12]), a([1.99, 7.56, -0.11])],
    [0.25, 0.3, 0.28],
    [0.15, 0.15, 0.12],
  );
  const chains = fingerChains();
  const [thumbBase, thumbMcp] = chains[4];
  const indexMcp = chains[0][1];
  // возвышение большого пальца: от середины ладони к его пястно-фаланговому суставу
  const thenar = smooth(
    0.06,
    capsule(a([thumbBase[0] - 0.1, thumbBase[1] - 0.04, thumbBase[2] - 0.03]), a(thumbMcp), 0.13, 0.08),
    capsule(a([thumbBase[0] - 0.12, thumbBase[1] - 0.22, thumbBase[2] - 0.02]), a(thumbMcp), 0.1, 0.07),
  );
  const web = capsule(a(thumbMcp), a([indexMcp[0] + 0.02, indexMcp[1] + 0.12, indexMcp[2] + 0.02]), 0.045, 0.05);
  // кожа подушечки чуть длиннее кости: кончик фаланги не выглядывает наружу
  const tube = (c: V3[], r0: number, r1: number) => {
    const [p, q] = [c[c.length - 2], c[c.length - 1]];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) || 1;
    const tip: V3 = [q[0] + ((q[0] - p[0]) / d) * 0.03, q[1] + ((q[1] - p[1]) / d) * 0.03, q[2] + ((q[2] - p[2]) / d) * 0.03];
    return chainTube([...c.slice(0, -1), tip].map(a), r0, r1);
  };
  const fingers = chains.slice(0, 4).map((c) => tube(c, 0.088, 0.064));
  const thumb = tube(chains[4], 0.095, 0.07);
  const hand = smooth(0.04, smooth(0.09, palm, thenar, web, thumb), ...fingers);
  return smooth(0.22, deltoid, upper, biceps, fore, hand);
}

function leg(): Sdf {
  const turn = 0.12;
  const A: V3 = [0.58, 0.6, -0.02];
  const f = (x: number, y: number, z: number): V3 => {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    return [A[0] + x * c + z * s, A[1] + y, A[2] - x * s + z * c];
  };
  const thigh = eTube(
    [[0.92, 9.4, 0.0], [0.84, 7.3, 0.02], [0.62, 5.1, -0.02]],
    [0.9, 0.82, 0.58],
    [0.96, 0.8, 0.58],
  );
  const quad = E([0.82, 7.3, 0.36], [0.5, 1.5, 0.34], 0.3);
  const ham = E([0.78, 7.2, -0.36], [0.46, 1.5, 0.34], 0.3);
  const knee = E([0.6, 4.92, 0.08], [0.5, 0.5, 0.5], 0.3);
  const shin = eTube(
    [[0.6, 4.7, -0.04], [0.66, 3.4, -0.12], [0.62, 1.4, -0.04], [0.58, 0.8, -0.02]],
    [0.5, 0.5, 0.3, 0.31],
    [0.5, 0.52, 0.3, 0.3],
  );
  const calf = E([0.7, 3.6, -0.36], [0.44, 0.95, 0.4], 0.3);
  const malleoli = smooth(0.04, E([0.98, 0.78, -0.02], [0.13, 0.15, 0.15], 0.2), E([0.24, 0.8, -0.02], [0.12, 0.14, 0.14], 0.2));
  const heel = E(f(0, -0.25, -0.18), [0.38, 0.42, 0.5], 0.3);
  const arch = E(f(0.04, -0.34, 0.5), [0.4, 0.26, 0.55], 0.3);
  const instep = E(f(0, -0.15, 0.3), [0.34, 0.24, 0.6], 0.3);
  const ball = E(f(0.02, -0.48, 1.08), [0.5, 0.15, 0.3], 0.3);
  const toeSpec: [number, number, number, number][] = [
    [-0.2, 1.3, 1.85, 0.115],
    [-0.07, 1.34, 1.8, 0.085],
    [0.05, 1.27, 1.7, 0.08],
    [0.16, 1.18, 1.55, 0.075],
    [0.27, 1.05, 1.4, 0.07],
  ];
  const toes = toeSpec.map(([x, z0, z1, r]) => capsule(f(x, -0.5, z0), f(x * 1.04, -0.53, z1), r, r * 0.9));
  const foot = smooth(0.12, heel, arch, instep, ball, ...toes);
  return smooth(0.22, thigh, quad, ham, knee, shin, calf, malleoli, foot);
}

export function skinField(): Sdf {
  const half = smooth(0.28, torso(), neckAndShoulders(), head(), arm(), leg());
  return above(mirrored(half), 0.0);
}

/** Мелкая сетка кистей: пальцы тоньше двух ячеек основной сетки и иначе рвутся или слипаются перемычками. */
const HAND_CELL = 0.028;
/** Шов между сетками — поперёк предплечья, выше запястья (в системе руки до отведения). */
const HAND_SEAM_Y = 8.9;

/** Знаковое расстояние до плоскости шва: меньше нуля — кисть. У туловища и ног всегда больше нуля. */
function seamSide(x: number, y: number, z: number): number {
  const [lx, ly] = armPoint([Math.abs(x), y, z], SHOULDER, -ARM_ABDUCTION);
  return lx > 1.5 ? ly - HAND_SEAM_Y : 1;
}

/**
 * Обрезает сетку ровно по плоскости шва (треугольники на границе делятся), так что края сетки тела
 * и сетки кисти совпадают без щели и без нахлёста.
 */
function clipAtSeam(g: BufferGeometry, hand: boolean): BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const index = g.getIndex()!;
  const outP = Array.from(pos.array as Float32Array);
  const outN = Array.from(nor.array as Float32Array);
  const sign = hand ? -1 : 1;
  const d = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) d[i] = sign * seamSide(pos.getX(i), pos.getY(i), pos.getZ(i));
  const kept: number[] = [];
  // точка на ребре a–b, где оно пересекает шов (новая вершина в конце буфера)
  const cut = (a: number, b: number): number => {
    const t = d[a] / (d[a] - d[b]);
    for (let c = 0; c < 3; c++) {
      outP.push(outP[a * 3 + c] + (outP[b * 3 + c] - outP[a * 3 + c]) * t);
      outN.push(outN[a * 3 + c] + (outN[b * 3 + c] - outN[a * 3 + c]) * t);
    }
    return outP.length / 3 - 1;
  };
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    const inside = tri.map((v) => d[v] >= 0);
    if (inside.every(Boolean)) {
      kept.push(...tri);
      continue;
    }
    if (!inside.some(Boolean)) continue;
    // Сазерленд — Ходжмен для одной плоскости
    const poly: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k];
      const b = tri[(k + 1) % 3];
      if (inside[k]) poly.push(a);
      if (inside[k] !== inside[(k + 1) % 3]) poly.push(cut(a, b));
    }
    for (let k = 1; k + 1 < poly.length; k++) kept.push(poly[0], poly[k], poly[k + 1]);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(outP, 3));
  out.setAttribute('normal', new Float32BufferAttribute(outN, 3));
  out.setIndex(kept);
  return out;
}

/** Сетка кожи: тело — ячейка 6 мм, кисти — около 3 мм, сшиты посередине предплечья. */
export function skinGeometry(cell = 0.06): BufferGeometry {
  const field = skinField();
  const body = clipAtSeam(meshSdf(field, { min: [-3.75, -0.05, -1.75], max: [3.75, 17.75, 2.15], cell }), false);
  // рамка кисти в системе руки, повёрнутая вместе с рукой
  const corners: V3[] = [];
  for (const x of [1.5, 2.85]) for (const y of [6.1, HAND_SEAM_Y + 0.15]) corners.push(armPoint([x, y, 0]));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const box = { min: Math.min(...xs), max: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const hands = [1, -1].map((side) =>
    clipAtSeam(
      meshSdf(field, {
        min: [side > 0 ? box.min : -box.max, box.y0, -0.75],
        max: [side > 0 ? box.max : -box.min, box.y1, 0.85],
        cell: HAND_CELL,
      }),
      true,
    ),
  );
  const merged = mergeGeometries([body, ...hands], false);
  if (!merged) throw new Error('skin merge failed');
  merged.computeBoundingSphere();
  return merged;
}
