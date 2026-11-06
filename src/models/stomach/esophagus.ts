import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { StripBuilder, type RGB } from './grid';
import { TAU, noise3, smooth, type V3 } from './shape';

/*
  Брюшная часть пищевода: трубка с мышечной стенкой и звёздчатым просветом (продольные складки слизистой).
  Нижний конец входит в желудок через кардию и выступает в его просвет «розеткой»; у самой границы
  бледная слизистая пищевода сменяется красной слизистой желудка зубчатой линией (Z-линия).
*/

export const ESO_PATH: V3[] = [
  [-0.62, 3.75, -0.58],
  [-0.58, 3.05, -0.52],
  [-0.44, 2.35, -0.44],
  [-0.18, 1.8, -0.36],
  [0.12, 1.46, -0.31],
  [0.5, 1.18, -0.27],
];

const curve = new CatmullRomCurve3(ESO_PATH.map((p) => new Vector3(...p)), false, 'centripetal');
export const ESO_LENGTH = curve.getLength();

/** Радиус снаружи вдоль пищевода: воронка у входа в желудок. */
const radius = (t: number) => 0.2 + 0.07 * smooth(0.55, 0.88, t) - 0.04 * smooth(0.9, 1, t);

/** Доля длины, начиная с которой пищевод уже внутри желудка. */
export const ESO_INSIDE = 0.86;

const T_MUSCLE = 0.05;
const T_SUB = 0.03;
const T_MUC = 0.035;
const FOLD = 0.075;

export const ESO_COLORS = {
  muscle: [0.71, 0.29, 0.25] as RGB,
  mucosaEso: [0.93, 0.7, 0.66] as RGB,
  mucosaGastric: [0.88, 0.42, 0.4] as RGB,
};

const ROWS = 150;
const COLS = 72;

interface Frame {
  c: Vector3;
  n: Vector3;
  b: Vector3;
  t: Vector3;
}

function frames(): Frame[] {
  const fr = curve.computeFrenetFrames(ROWS, false);
  const out: Frame[] = [];
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS;
    out.push({ c: curve.getPointAt(t), n: fr.normals[i], b: fr.binormals[i], t: curve.getTangentAt(t) });
  }
  return out;
}

const star = (t: number, v: number) => {
  const w = noise3(t * 6, Math.cos(v) * 1.3, Math.sin(v) * 1.3);
  const q = 0.5 + 0.5 * Math.cos(7 * v + (w * 2 - 1) * 1.4);
  return (1 - (1 - q) ** 2.2) * (0.55 + 0.45 * smooth(0, 0.08, t));
};

/** Глубина поверхности слоя: 0 снаружи, 1 мышца изнутри, 2 подслизистая изнутри, 3 просвет. */
function depth(layer: number, t: number, v: number): number {
  const base = [0, T_MUSCLE, T_MUSCLE + T_SUB, T_MUSCLE + T_SUB + T_MUC];
  if (layer < 3) return base[layer];
  return base[3] + FOLD * star(t, v);
}

function point(f: Frame, t: number, v: number, layer: number): V3 {
  const r = radius(t) - depth(layer, t, v);
  const cv = Math.cos(v);
  const sv = Math.sin(v);
  // чуть приплюснутое сечение
  return [f.c.x + (f.n.x * cv * r + f.b.x * sv * r * 0.9), f.c.y + (f.n.y * cv * r + f.b.y * sv * r * 0.9), f.c.z + (f.n.z * cv * r + f.b.z * sv * r * 0.9)];
}

function normalsOf(position: Float32Array, I: number, J: number, inward: boolean): Float32Array {
  const W = J + 1;
  const normal = new Float32Array(position.length);
  const acc = (a: number, b: number, c: number) => {
    const ux = position[b * 3] - position[a * 3];
    const uy = position[b * 3 + 1] - position[a * 3 + 1];
    const uz = position[b * 3 + 2] - position[a * 3 + 2];
    const wx = position[c * 3] - position[a * 3];
    const wy = position[c * 3 + 1] - position[a * 3 + 1];
    const wz = position[c * 3 + 2] - position[a * 3 + 2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    for (const q of [a, b, c]) {
      normal[q * 3] += nx;
      normal[q * 3 + 1] += ny;
      normal[q * 3 + 2] += nz;
    }
  };
  for (let i = 0; i < I; i++) {
    for (let j = 0; j < J; j++) {
      const a = i * W + j;
      acc(a, a + 1, a + W);
      acc(a + 1, a + W + 1, a + W);
    }
  }
  for (let i = 0; i <= I; i++) {
    for (let q = 0; q < 3; q++) {
      const m = normal[i * W * 3 + q] + normal[(i * W + J) * 3 + q];
      normal[i * W * 3 + q] = m;
      normal[(i * W + J) * 3 + q] = m;
    }
  }
  const sg = inward ? -1 : 1;
  for (let n = 0; n < normal.length / 3; n++) {
    const l = Math.hypot(normal[n * 3], normal[n * 3 + 1], normal[n * 3 + 2]) || 1;
    for (let q = 0; q < 3; q++) normal[n * 3 + q] = (sg * normal[n * 3 + q]) / l;
  }
  return normal;
}

function surface(layer: number, color: (t: number, v: number) => RGB, inward: boolean, fr: Frame[]): BufferGeometry {
  const W = COLS + 1;
  const position = new Float32Array((ROWS + 1) * W * 3);
  const col = new Float32Array((ROWS + 1) * W * 3);
  for (let i = 0; i <= ROWS; i++) {
    for (let j = 0; j < W; j++) {
      const v = (j / COLS) * TAU;
      const t = i / ROWS;
      const p = point(fr[i], t, v, layer);
      const n = i * W + j;
      position.set(p, n * 3);
      col.set(color(t, v), n * 3);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < COLS; j++) {
      const a = i * W + j;
      if (inward) index.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
      else index.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('normal', new BufferAttribute(normalsOf(position, ROWS, COLS, inward), 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(Uint32Array.from(index), 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export interface EsophagusGeometry {
  outer: BufferGeometry;
  lumen: BufferGeometry;
  cut: BufferGeometry;
  /** Точка на оси пищевода по доле длины. */
  at: (t: number) => V3;
}

export function esophagusGeometry(): EsophagusGeometry {
  const fr = frames();
  const zLine = (t: number, v: number) => smooth(-0.02, 0.02, t - (ESO_INSIDE + 0.045 + 0.02 * Math.sin(8 * v + 0.7)));
  const outer = surface(
    0,
    (t, v) => {
      const inside = smooth(-0.015, 0.015, t - (ESO_INSIDE + 0.0));
      const m = mix(ESO_COLORS.muscle, ESO_COLORS.mucosaEso, inside);
      const sh = 0.92 + 0.08 * noise3(t * 40, Math.cos(v) * 4, Math.sin(v) * 4);
      const c = mix(m, ESO_COLORS.mucosaGastric, zLine(t, v));
      return [c[0] * sh, c[1] * sh, c[2] * sh];
    },
    false,
    fr,
  );
  const lumen = surface(
    3,
    (t, v) => {
      const h = star(t, v);
      const ao = 0.5 + 0.5 * h ** 0.8;
      const c = mix(ESO_COLORS.mucosaEso, ESO_COLORS.mucosaGastric, zLine(t, v));
      return [c[0] * ao, c[1] * ao, c[2] * ao];
    },
    true,
    fr,
  );

  // срезы: верхний конец (разрез пищевода) и кромка в просвете желудка
  const sb = new StripBuilder();
  const layerColors: RGB[] = [ESO_COLORS.muscle, [0.96, 0.89, 0.76], ESO_COLORS.mucosaEso];
  for (const end of [0, ROWS]) {
    const f = fr[end];
    const t = end / ROWS;
    const hint: V3 = end === 0 ? [-f.t.x, -f.t.y, -f.t.z] : [f.t.x, f.t.y, f.t.z];
    const STEPS = 288;
    for (let j = 0; j < STEPS; j++) {
      const v0 = (j / STEPS) * TAU;
      const v1 = ((j + 1) / STEPS) * TAU;
      for (let l = 0; l < 3; l++) {
        const colr = end === ROWS && l === 2 ? ESO_COLORS.mucosaGastric : layerColors[l];
        sb.quad(point(f, t, v0, l), point(f, t, v1, l), point(f, t, v1, l + 1), point(f, t, v0, l + 1), hint, colr);
      }
    }
  }
  const cut = new BufferGeometry();
  cut.setAttribute('position', new BufferAttribute(new Float32Array(sb.pos), 3));
  cut.setAttribute('normal', new BufferAttribute(new Float32Array(sb.nrm), 3));
  cut.setAttribute('color', new BufferAttribute(new Float32Array(sb.col), 3));
  cut.computeBoundingBox();
  cut.computeBoundingSphere();
  return {
    outer,
    lumen,
    cut,
    at: (t) => {
      const p = curve.getPointAt(Math.min(1, Math.max(0, t)));
      return [p.x, p.y, p.z];
    },
  };
}
