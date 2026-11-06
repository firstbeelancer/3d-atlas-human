import { BufferGeometry, Float32BufferAttribute, SphereGeometry, Matrix4, Euler, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildPath, lerp, type GutPath, type V3 } from './anatomy';

export interface SweepOpts {
  path: GutPath;
  i0: number;
  i1: number;
  /** Шаг по точкам пути (для лёгких копий, по которым считается наведение мыши). */
  stride?: number;
  radial: number;
  /** Радиус кольца в точке пути i под углом theta. */
  radius: (i: number, theta: number) => number;
  /** Нормали смотрят к оси (внутренние слои стенки). */
  inward?: boolean;
  /** Сдвиг длины вдоль кишки для атрибута перистальтики. */
  sBase?: number;
  uvLen?: number;
  uvAround?: number;
  /** Добавить атрибуты перистальтики: aC — точка оси, aS — длина вдоль кишки. */
  attrs?: boolean;
  /** Сплющивание сечения (для поджелудочной железы и мышц-«лент»). */
  squash?: number;
  /** Сплющивать вдоль нормали пути, а не бинормали. */
  squashN?: boolean;
}

/** Поверхность вращения вокруг центральной линии: ряды колец от i0 до i1. */
export function sweep(o: SweepOpts): BufferGeometry {
  const { path, radial } = o;
  const stride = Math.max(1, o.stride ?? 1);
  const rowsIdx: number[] = [];
  for (let i = o.i0; i < o.i1; i += stride) rowsIdx.push(i);
  rowsIdx.push(o.i1);
  const rows = rowsIdx.length;
  const cols = radial + 1;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const aC = o.attrs ? new Float32Array(rows * cols * 3) : null;
  const aS = o.attrs ? new Float32Array(rows * cols) : null;
  const uvLen = o.uvLen ?? 1;
  const uvAround = o.uvAround ?? 2;
  const squash = o.squash ?? 1;
  const sin: number[] = [];
  const cos: number[] = [];
  for (let j = 0; j < cols; j++) {
    const a = (j / radial) * Math.PI * 2;
    sin.push(Math.sin(a));
    cos.push(Math.cos(a));
  }
  for (let r = 0; r < rows; r++) {
    const i = rowsIdx[r];
    const k = i * 3;
    const px = path.P[k];
    const py = path.P[k + 1];
    const pz = path.P[k + 2];
    for (let j = 0; j < cols; j++) {
      const theta = (j / radial) * Math.PI * 2;
      const rad = o.radius(i, theta);
      const c = cos[j] * rad * (o.squashN ? squash : 1);
      const s = sin[j] * rad * (o.squashN ? 1 : squash);
      const v = r * cols + j;
      pos[v * 3] = px + c * path.N[k] + s * path.B[k];
      pos[v * 3 + 1] = py + c * path.N[k + 1] + s * path.B[k + 1];
      pos[v * 3 + 2] = pz + c * path.N[k + 2] + s * path.B[k + 2];
      uv[v * 2] = path.S[i] * uvLen;
      uv[v * 2 + 1] = (j / radial) * uvAround;
      if (aC && aS) {
        aC[v * 3] = px;
        aC[v * 3 + 1] = py;
        aC[v * 3 + 2] = pz;
        aS[v] = (o.sBase ?? 0) + path.S[i];
      }
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let j = 0; j < radial; j++) {
      const a = r * cols + j;
      const b = a + cols;
      if (o.inward) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (aC && aS) {
    g.setAttribute('aC', new Float32BufferAttribute(aC, 3));
    g.setAttribute('aS', new Float32BufferAttribute(aS, 1));
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  // шов вокруг кольца: первая и последняя колонка совпадают по месту — усредняем нормали
  const nrm = g.getAttribute('normal');
  for (let r = 0; r < rows; r++) {
    const a = r * cols;
    const b = a + radial;
    const x = nrm.getX(a) + nrm.getX(b);
    const y = nrm.getY(a) + nrm.getY(b);
    const z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l);
    nrm.setXYZ(b, x / l, y / l, z / l);
  }
  nrm.needsUpdate = true;
  return g;
}

/** Трубка по ломаной: сосуды, нервы, протоки, связки. Радиус плавно меняется от r0 до r1. */
export function tubeGeo(ctrl: V3[], r0: number, r1 = r0, radial = 6, spacing = 0.14): BufferGeometry {
  const path = buildPath(ctrl, spacing);
  return sweep({
    path,
    i0: 0,
    i1: path.n - 1,
    radial,
    radius: (i) => lerp(r0, r1, i / (path.n - 1)),
  });
}

/** Склеивает геометрии с одинаковым набором атрибутов в одну (меньше вызовов отрисовки). */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  return g ?? new BufferGeometry();
}

/** Эллипсоид с центром в точке: лимфоузлы, шишки, сосочки. */
export function ellipsoid(center: V3, radii: V3, rot: V3 = [0, 0, 0], seg: [number, number] = [12, 9]): BufferGeometry {
  const g = new SphereGeometry(1, seg[0], seg[1]);
  const m = new Matrix4().compose(
    new Vector3(...center),
    new Quaternion().setFromEuler(new Euler(...rot)),
    new Vector3(...radii),
  );
  g.applyMatrix4(m);
  return g;
}

/**
 * Дуга-валик по внутренней стенке: полулунная складка толстой кишки, складка прямой кишки.
 * Валик лежит на кольце радиуса R вокруг оси пути в точке i, от theta0 до theta1.
 */
export function ringArc(path: GutPath, i: number, theta0: number, theta1: number, R: number, tube: number, arcSegs = 10, radial = 6): BufferGeometry {
  const k = i * 3;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let a = 0; a <= arcSegs; a++) {
    const t = a / arcSegs;
    const theta = theta0 + (theta1 - theta0) * t;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // направление от оси к стенке и вдоль оси
    const ex = c * path.N[k] + s * path.B[k];
    const ey = c * path.N[k + 1] + s * path.B[k + 1];
    const ez = c * path.N[k + 2] + s * path.B[k + 2];
    const cx = path.P[k] + ex * R;
    const cy = path.P[k + 1] + ey * R;
    const cz = path.P[k + 2] + ez * R;
    const w = tube * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0.02, t))), 0.6);
    for (let b = 0; b <= radial; b++) {
      const phi = (b / radial) * Math.PI * 2;
      const cp = Math.cos(phi) * w;
      const sp = Math.sin(phi) * w * 1.35;
      pos.push(cx + ex * cp + path.T[k] * sp, cy + ey * cp + path.T[k + 1] * sp, cz + ez * cp + path.T[k + 2] * sp);
      uv.push(t, b / radial);
    }
  }
  const cols = radial + 1;
  for (let a = 0; a < arcSegs; a++) {
    for (let b = 0; b < radial; b++) {
      const p = a * cols + b;
      const q = p + cols;
      idx.push(p, p + 1, q, q, p + 1, q + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Параметрическая поверхность на сетке nu × nv: fn(u, v) возвращает точку. Для брыжейки и сальника. */
export function gridSurface(nu: number, nv: number, fn: (u: number, v: number) => V3, uvScale: [number, number] = [1, 1]): BufferGeometry {
  const cols = nu + 1;
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const p = fn(i / nu, j / nv);
      const k = j * cols + i;
      pos.set(p, k * 3);
      uv.set([(i / nu) * uvScale[0], (j / nv) * uvScale[1]], k * 2);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * cols + i;
      const b = a + cols;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
