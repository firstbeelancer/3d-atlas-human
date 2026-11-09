import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
  Строительные блоки мышц (единицы — дециметры, как у скелета).
  Веретеновидная мышца — труба вокруг линии «начало — прикрепление» с переменным сечением:
  тонкие сухожилия на концах, тело посередине, пучки волокон лёгкой рябью по окружности.
  Плоская мышца — оболочка из двух поверхностей (верх и низ) над поверхностью туловища, края сходят на нет.
  У каждой вершины есть цвет (тело/сухожилие, лёгкий разброс) и вес «брюшка» (0..1) для анимации сокращения.
*/

export type V3 = [number, number, number];

const MUSCLE_RGB: [number, number, number] = [0.66, 0.2, 0.17];
const TENDON_RGB: [number, number, number] = [0.93, 0.86, 0.74];

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** Детерминированный шум 0..1 по трём числам — для вариаций цвета и пучков. */
export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface FusiformSpec {
  /** Опорные точки линии мышцы от начала к прикреплению (минимум две). */
  path: V3[];
  /** Куда «смотрит» наружу сечение (направление от кости к коже). */
  out?: V3;
  /** Наибольшие полуширина и полутолщина тела. */
  w: number;
  h?: number;
  /** Где начинается и кончается тело (доли длины), остальное — сухожилия. */
  a?: number;
  b?: number;
  /** Положение максимума внутри тела: 0.5 — по центру. */
  peak?: number;
  /** Сухожилие плоское (апоневроз) или круглое. */
  flatTendon?: boolean;
  /** Толщина сухожилия. */
  rt?: number;
  /** Только сухожилие (труба без тела). */
  tendon?: boolean;
  /** Число пучков по окружности. */
  bundles?: number;
  /** Оттенок мышцы: <1 темнее, >1 светлее. */
  tone?: number;
  /** Сегменты по длине. */
  rings?: number;
  /** Закрытые концы: 0 — остроконечно, 1 — тупо. */
  blunt?: number;
}

const RADIAL = 20;

/** Профиль тела: 0 на концах, 1 в максимуме. */
function bellyShape(u: number, peak: number): number {
  if (u <= 0 || u >= 1) return 0;
  const k = Math.log(0.5) / Math.log(peak);
  const x = Math.pow(u, k);
  return Math.pow(Math.sin(Math.PI * x), 0.62);
}

export function fusiform(s: FusiformSpec): BufferGeometry {
  const pts = s.path.map((p) => new Vector3(...p));
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  const rings = s.rings ?? Math.max(24, Math.min(56, Math.round(curve.getLength() * 12)));
  const a = s.tendon ? 0 : s.a ?? 0.08;
  const b = s.tendon ? 1 : s.b ?? 0.92;
  const peak = s.peak ?? 0.5;
  const rt = s.rt ?? 0.035;
  const h0 = s.h ?? s.w * 0.82;
  const hint = new Vector3(...(s.out ?? [0, 0, 1]));
  const bundles = s.bundles ?? 9;
  const tone = s.tone ?? 1;
  const blunt = s.blunt ?? 0.55;
  const total = rings + 3;
  const count = total * (RADIAL + 1);
  const pos = new Float32Array(count * 3);
  const out = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const belly = new Float32Array(count);
  const uv = new Float32Array(count * 2);
  const T = new Vector3();
  const N = new Vector3();
  const B = new Vector3();
  const C = new Vector3();
  const seed = (s.path[0][0] + 3) * 1.7 + s.path[0][1] * 0.37 + s.path[0][2];
  let v = 0;
  for (let r = 0; r < total; r++) {
    // кольца 0 и total-1 — «колпачки» нулевого радиуса
    const cap = r === 0 || r === total - 1;
    const t = Math.min(rings, Math.max(0, r - 1)) / rings;
    curve.getPointAt(t, C);
    curve.getTangentAt(t, T);
    N.copy(hint).addScaledVector(T, -hint.dot(T));
    if (N.lengthSq() < 1e-6) N.set(0, 0, 1).addScaledVector(T, -T.z);
    N.normalize();
    B.crossVectors(T, N).normalize();
    const u = (t - a) / Math.max(1e-6, b - a);
    const shape = s.tendon ? 0 : bellyShape(u, peak);
    const flat = s.flatTendon ? 2.1 : 1;
    const endFade = smooth(Math.min(t, 1 - t) / 0.03);
    const tipScale = cap ? 0 : blunt + (1 - blunt) * endFade;
    const rw = (rt * flat + (s.w - rt * flat) * shape) * tipScale;
    const rh = (rt * (s.flatTendon ? 0.55 : 1) + (h0 - rt * 0.5) * shape) * tipScale;
    const m = s.tendon ? 0 : smooth(shape * 1.6);
    for (let k = 0; k <= RADIAL; k++) {
      const th = ((k % RADIAL) / RADIAL) * Math.PI * 2;
      const rip = 1 + (0.045 * Math.sin(th * bundles + seed + t * 2.2) + 0.02 * Math.sin(th * bundles * 2.3 + seed * 2)) * m;
      const cx = Math.cos(th);
      const sy = Math.sin(th);
      const px = C.x + (B.x * cx * rw + N.x * sy * rh) * rip;
      const py = C.y + (B.y * cx * rw + N.y * sy * rh) * rip;
      const pz = C.z + (B.z * cx * rw + N.z * sy * rh) * rip;
      pos[v * 3] = px;
      pos[v * 3 + 1] = py;
      pos[v * 3 + 2] = pz;
      out[v * 3] = B.x * cx + N.x * sy;
      out[v * 3 + 1] = B.y * cx + N.y * sy;
      out[v * 3 + 2] = B.z * cx + N.z * sy;
      const n = hash3(Math.floor(t * 40), k % RADIAL, seed);
      const mix = s.tendon ? 0 : smooth(shape * 3.2 - 0.25);
      const g = tone * (0.9 + 0.2 * n) * (0.88 + 0.12 * Math.sin(th * bundles + seed));
      for (let c = 0; c < 3; c++) {
        col[v * 3 + c] = TENDON_RGB[c] * (1 - mix) * (0.94 + 0.06 * n) + MUSCLE_RGB[c] * g * mix;
      }
      belly[v] = shape * m;
      uv[v * 2] = (k / RADIAL) * Math.max(2, bundles * 0.5);
      uv[v * 2 + 1] = t * 3;
      v++;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < total - 1; r++) {
    for (let k = 0; k < RADIAL; k++) {
      const i0 = r * (RADIAL + 1) + k;
      const i1 = i0 + 1;
      const i2 = i0 + RADIAL + 1;
      const i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  return finish(pos, col, belly, uv, idx, out, true);
}

function finish(pos: Float32Array, col: Float32Array, belly: Float32Array, uv: Float32Array, idx: number[], outward: Float32Array, seam: boolean): BufferGeometry {
  // ориентируем треугольники наружу
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const e1x = pos[b] - pos[a];
    const e1y = pos[b + 1] - pos[a + 1];
    const e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a];
    const e2y = pos[c + 1] - pos[a + 1];
    const e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const ox = outward[a] + outward[b] + outward[c];
    const oy = outward[a + 1] + outward[b + 1] + outward[c + 1];
    const oz = outward[a + 2] + outward[b + 2] + outward[c + 2];
    if (nx * ox + ny * oy + nz * oz < 0) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('belly', new BufferAttribute(belly, 1));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (seam) {
    const nrm = g.attributes.normal as BufferAttribute;
    const rows = pos.length / 3 / (RADIAL + 1);
    for (let r = 0; r < rows; r++) {
      const i = r * (RADIAL + 1);
      const j = i + RADIAL;
      const x = nrm.getX(i) + nrm.getX(j);
      const y = nrm.getY(i) + nrm.getY(j);
      const z = nrm.getZ(i) + nrm.getZ(j);
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(i, x / l, y / l, z / l);
      nrm.setXYZ(j, x / l, y / l, z / l);
    }
  }
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export interface SheetSpec {
  nu: number;
  nv: number;
  /** Точка опорной поверхности при (u, v) ∈ [0,1]². */
  point: (u: number, v: number) => V3;
  /** Наружная нормаль поверхности в этой точке. */
  normal: (u: number, v: number) => V3;
  /** Толщина мышцы. */
  thick: number;
  /** Подъём нижней поверхности над опорной. */
  lift?: number;
  /** Ширина скругления краёв (доля 0..0.5). */
  rim?: number;
  /** Число пучков вдоль u: рябь толщины. */
  fascicles?: number;
  tone?: number;
  /** Дополнительный множитель толщины от (u, v). */
  profile?: (u: number, v: number) => number;
  /** Доля сухожильного (светлого) края вдоль v: от начала и от конца. */
  tendonEnds?: [number, number];
  /** Сухожильные полосы поперёк (для прямой мышцы живота): позиции по v. */
  bands?: number[];
}

export function sheet(s: SheetSpec): BufferGeometry {
  const { nu, nv } = s;
  const rim = s.rim ?? 0.2;
  const lift = s.lift ?? 0;
  const tone = s.tone ?? 1;
  const fasc = s.fascicles ?? 14;
  const [te0, te1] = s.tendonEnds ?? [0, 0];
  const per = (nu + 1) * (nv + 1);
  const pos = new Float32Array(per * 2 * 3);
  const out = new Float32Array(per * 2 * 3);
  const col = new Float32Array(per * 2 * 3);
  const belly = new Float32Array(per * 2);
  const uv = new Float32Array(per * 2 * 2);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      const base = s.point(u, v);
      const n = s.normal(u, v);
      const eu = smooth(Math.min(u, 1 - u) / rim);
      const ev = smooth(Math.min(v, 1 - v) / rim);
      const plateau = Math.pow(eu * ev, 0.55);
      const prof = s.profile ? s.profile(u, v) : 1;
      const rip = 1 + 0.07 * Math.sin(u * fasc * Math.PI * 2 + v * 1.7);
      const thick = Math.max(0.012, s.thick * plateau * prof * rip);
      const id = j * (nu + 1) + i;
      const tendon = Math.max(
        te0 > 0 ? smooth((te0 - v) / (te0 * 0.5)) : 0,
        te1 > 0 ? smooth((v - (1 - te1)) / (te1 * 0.5)) : 0,
      );
      let band = 0;
      if (s.bands) for (const bv of s.bands) band = Math.max(band, smooth(1 - Math.abs(v - bv) / 0.014));
      const mix = Math.max(tendon, band * 0.9);
      const nz = hash3(Math.floor(u * 60), Math.floor(v * 40), 3.3);
      for (let side = 0; side < 2; side++) {
        const k = (side * per + id) * 3;
        const off = lift + (side === 0 ? thick : 0);
        pos[k] = base[0] + n[0] * off;
        pos[k + 1] = base[1] + n[1] * off;
        pos[k + 2] = base[2] + n[2] * off;
        const sg = side === 0 ? 1 : -1;
        out[k] = n[0] * sg;
        out[k + 1] = n[1] * sg;
        out[k + 2] = n[2] * sg;
        const g = tone * (0.9 + 0.2 * nz) * (0.9 + 0.1 * Math.sin(u * fasc * Math.PI * 2));
        for (let c = 0; c < 3; c++) col[k + c] = TENDON_RGB[c] * mix * 0.97 + MUSCLE_RGB[c] * g * (1 - mix);
        belly[side * per + id] = side === 0 ? plateau * 0.8 : 0;
        const q = (side * per + id) * 2;
        uv[q] = u * fasc * 0.6;
        uv[q + 1] = v * 3;
      }
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i0 = j * (nu + 1) + i;
      const i1 = i0 + 1;
      const i2 = i0 + nu + 1;
      const i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
      idx.push(per + i0, per + i2, per + i1, per + i1, per + i2, per + i3);
    }
  }
  // боковая «юбка» по периметру, чтобы оболочка была замкнута
  const edge: number[][] = [];
  for (let i = 0; i < nu; i++) edge.push([i, i + 1]);
  for (let j = 0; j < nv; j++) edge.push([j * (nu + 1) + nu, (j + 1) * (nu + 1) + nu]);
  for (let i = nu; i > 0; i--) edge.push([nv * (nu + 1) + i, nv * (nu + 1) + i - 1]);
  for (let j = nv; j > 0; j--) edge.push([j * (nu + 1), (j - 1) * (nu + 1)]);
  for (const [p, q] of edge) idx.push(p, q, per + p, q, per + q, per + p);
  return finish(pos, col, belly, uv, idx, out, false);
}

/** Склеивает геометрии одной части (например, три пучка дельты). */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!g) throw new Error('muscle geometry merge failed');
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Катмулл-Ром по двумерным точкам (φ, y) — для краёв плоских мышц. */
export function poly2(points: [number, number][]): (s: number) => [number, number] {
  const c = new CatmullRomCurve3(points.map(([x, y]) => new Vector3(x, y, 0)), false, 'centripetal');
  const p = new Vector3();
  return (s: number) => {
    c.getPointAt(Math.min(1, Math.max(0, s)), p);
    return [p.x, p.y];
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
