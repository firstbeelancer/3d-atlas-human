/** Сосуды, нервы и листки оболочек: строятся в основном потоке, привязаны к форме мозга из field.ts. */
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, SphereGeometry, Vector3 } from 'three';
import { ccY, cerebellumTopY, cortexBottomY, cortexTopY, baseHemi, snapToCortex, stemFrontZ } from './field';

export type TubeKind = 'artery' | 'vein' | 'nerve' | 'dura';
export interface Piece {
  id: string;
  /** 0 — по средней линии, ±1 — привязано к полушарию. */
  side: -1 | 0 | 1;
  kind: TubeKind;
  geo: BufferGeometry;
}

/** Трубка с меняющимся радиусом по ломаной (x, y, z, r); концы закрыты. */
export function taperTube(points: number[][], radial = 10, perPoint = 8): BufferGeometry {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(p[0], p[1], p[2])),
    false,
    'centripetal',
  );
  const n = Math.max(6, (points.length - 1) * perPoint);
  const frames = curve.computeFrenetFrames(n, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const radiusAt = (t: number) => {
    const s = t * (points.length - 1);
    const i = Math.min(points.length - 2, Math.floor(s));
    return points[i][3] + (points[i + 1][3] - points[i][3]) * (s - i);
  };
  const ring = (i: number, scale: number, shift = 0) => {
    const t = i / n;
    const c = curve.getPointAt(Math.min(1, Math.max(0, t)));
    const r = radiusAt(t) * scale;
    const tan = frames.tangents[i];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const nx = frames.normals[i].x * Math.cos(a) + frames.binormals[i].x * Math.sin(a);
      const ny = frames.normals[i].y * Math.cos(a) + frames.binormals[i].y * Math.sin(a);
      const nz = frames.normals[i].z * Math.cos(a) + frames.binormals[i].z * Math.sin(a);
      pos.push(c.x + nx * r + tan.x * shift, c.y + ny * r + tan.y * shift, c.z + nz * r + tan.z * shift);
    }
  };
  // колпачок в начале, кольца, колпачок в конце
  ring(0, 0.01, -radiusAt(0) * 0.6);
  ring(0, 0.8, -radiusAt(0) * 0.25);
  for (let i = 0; i <= n; i++) ring(i, 1);
  ring(n, 0.8, radiusAt(1) * 0.25);
  ring(n, 0.01, radiusAt(1) * 0.6);
  const rings = n + 5;
  for (let i = 0; i < rings - 1; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      idx.push(a, a + radial, b, b, a + radial, b + radial);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const mir = (pts: number[][], s: number) => pts.map((p) => [p[0] * s, p[1], p[2], p[3]]);

/** Лист по сетке: вершины могут отсутствовать (null), треугольники берутся только из полных ячеек. */
function sheet(nu: number, nv: number, at: (i: number, j: number) => number[] | null): BufferGeometry {
  const pos: number[] = [];
  const ok: number[] = [];
  const map = new Int32Array((nu + 1) * (nv + 1)).fill(-1);
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const p = at(i, j);
      if (!p) continue;
      map[i * (nv + 1) + j] = pos.length / 3;
      pos.push(p[0], p[1], p[2]);
    }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = map[i * (nv + 1) + j];
      const b = map[(i + 1) * (nv + 1) + j];
      const c = map[(i + 1) * (nv + 1) + j + 1];
      const d = map[i * (nv + 1) + j + 1];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      ok.push(a, b, c, a, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(ok);
  g.computeVertexNormals();
  return g;
}

/** Высота намёта мозжечка: посередине между низом затылочной доли и верхом мозжечка. */
function tentY(x: number, z: number): number | null {
  const b = cortexBottomY(Math.abs(x), z);
  const c = cerebellumTopY(x, z);
  if (b !== null && c !== null) return (b + c) / 2;
  if (c !== null) return c + 3;
  return null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function freeEdge(z: number): number {
  const T: [number, number][] = [[-44, tentY(0, -44) ?? -14], [-30, 20], [-16, 34], [0, 38], [14, 36], [28, 28], [42, 8], [58, -14], [72, -26]];
  if (z <= T[0][0]) return T[0][1];
  for (let i = 0; i < T.length - 1; i++)
    if (z <= T[i + 1][0]) return lerp(T[i][1], T[i + 1][1], (z - T[i][0]) / (T[i + 1][0] - T[i][0]));
  return T[T.length - 1][1];
}

export function buildPieces(): Piece[] {
  const out: Piece[] = [];
  const add = (id: string, side: -1 | 0 | 1, kind: TubeKind, pts: number[][], radial = 10) => pts.length >= 2 && out.push({ id, side, kind, geo: taperTube(pts, radial) });

  for (const s of [1, -1] as const) {
    // внутренние сонные и позвоночные артерии
    add('carotid-arteries', 0, 'artery', mir([[20, -80, 4, 2.7], [18, -62, 12, 2.7], [15, -48, 16, 2.6], [13, -38, 14, 2.4], [13, -31, 15, 2.2]], s));
    const fy = (y: number) => stemFrontZ(0, y) ?? -20;
    add('carotid-arteries', 0, 'artery', [[s * 15, -104, -34, 2.1], [s * 10, -92, fy(-90) - 1, 2.2], [s * 5, -80, fy(-78) + 1.5, 2.3], [s * 1.5, -70, fy(-68) + 2.2, 2.3]]);
    // артериальный круг
    add('circle-of-willis', 0, 'artery', mir([[13, -31, 15, 1.7], [8, -29, 20, 1.6], [2.4, -27.5, 25, 1.4]], s));
    add('circle-of-willis', 0, 'artery', mir([[13, -31, 14, 1.0], [14, -33, 3, 1.0], [13, -35, -6, 1.1]], s));
    add('circle-of-willis', 0, 'artery', mir([[0.5, -38, fy(-38) + 2, 1.9], [7, -37, -6, 1.8], [14, -35, -8, 1.8]], s));
    // передняя мозговая: по медиальной стенке вокруг мозолистого тела
    const A: number[][] = [[s * 1.2, -27, 26, 1.3], [s * 1.2, -18, 35, 1.2], [s * 1.2, -4, 45, 1.1], [s * 1.2, 12, 48, 1.1], [s * 1.2, 26, 41, 1.0]];
    for (const z of [26, 10, -10, -26, -38]) A.push([s * 1.2, ccY(z) + 5, z, 0.9]);
    add('anterior-cerebral-artery', 0, 'artery', A);
    for (const z of [30, 14, -4, -22, -34]) {
      const top = cortexTopY(1.6, z) - 2;
      add('anterior-cerebral-artery', 0, 'artery', [[s * 1.2, ccY(z) + 6, z, 0.7], [s * 1.2, lerp(ccY(z) + 6, top, 0.5), z - 3, 0.6], [s * 1.2, top, z - 6, 0.5]], 8);
    }
    // средняя мозговая: ствол в борозде и веер ветвей по поверхности
    add('middle-cerebral-artery', s, 'artery', mir([[13, -31, 15, 1.9], [26, -30, 17, 1.8], [40, -26, 16, 1.7], [52, -14, 12, 1.5]], s));
    const base = snapToCortex(s * 70, 2, 8, 1);
    for (const [y, z, r] of [[46, -10, 0.9], [40, -30, 0.8], [30, -50, 0.7], [34, 30, 0.9], [44, 14, 0.9], [18, 44, 0.8], [-12, -4, 0.8], [-8, -28, 0.7], [-16, 14, 0.7]] as number[][]) {
      const end: number[] = snapToCortex(s * 66, y, z, 1);
      const pts: number[][] = [[...base, 1.3]];
      for (let k = 1; k <= 4; k++) {
        const t = k / 4;
        const p = snapToCortex(lerp(base[0], end[0], t), lerp(base[1], end[1], t), lerp(base[2], end[2], t), 1);
        pts.push([p[0], p[1], p[2], lerp(1.1, r * 0.6, t)]);
      }
      add('middle-cerebral-artery', s, 'artery', pts, 8);
    }
    // задняя мозговая
    const pc: number[][] = [[s * 14, -35, -8, 1.7], [s * 20, -32, -16, 1.6], [s * 21, -27, -30, 1.4]];
    for (const [y, z, r] of [[-12, -52, 1.2], [-2, -66, 1.0], [4, -80, 0.8]]) {
      const p = snapToCortex(s * 8, y, z, 0.8);
      pc.push([p[0], p[1], p[2], r]);
    }
    add('posterior-cerebral-artery', s, 'artery', pc);
    // обонятельные луковицы и тракты
    const by = (z: number) => (cortexBottomY(10, z) ?? -26) - 1.2;
    add('olfactory-bulbs', 0, 'nerve', mir([[10, by(66), 66, 3.4], [10, by(56), 56, 2.4], [10, by(44), 44, 1.6], [11, by(30), 30, 1.2]], s));
    // зрительные нервы и тракты
    add('optic-nerves', 0, 'nerve', mir([[3, -30, 21, 2.2], [8, -30, 32, 2.1], [13, -31, 46, 2.0], [15, -31, 58, 1.9]], s));
    add('optic-nerves', 0, 'nerve', mir([[3, -30, 21, 2.2], [10, -27, 16, 2.0], [17, -24, 6, 1.9], [22, -16, -4, 1.8], [24, -8, -12, 1.8]], s));
    // черепные нервы
    add('cranial-nerves', 0, 'nerve', mir([[19, -48, -6, 2.5], [30, -52, 6, 2.5], [40, -56, 14, 2.1]], s));
    add('cranial-nerves', 0, 'nerve', mir([[10, -62, -18, 1.5], [22, -64, -14, 1.4], [34, -62, -10, 1.3]], s));
    add('cranial-nerves', 0, 'nerve', mir([[7, -74, -26, 1.1], [18, -80, -22, 1.0], [28, -86, -20, 0.9]], s));
    add('cranial-nerves', 0, 'nerve', mir([[6, -78, -26, 0.9], [16, -86, -24, 0.8], [26, -92, -22, 0.8]], s));
    add('cranial-nerves', 0, 'nerve', mir([[4, -72, -18, 0.9], [10, -80, -12, 0.8], [16, -88, -8, 0.8]], s));
    add('cranial-nerves', 0, 'nerve', mir([[4, -32, -6, 1.0], [7, -32, 4, 1.0], [11, -31, 18, 0.9], [15, -30, 32, 0.9]], s));
    // поперечные и сигмовидные синусы
    const ty = (x: number, z: number) => (tentY(x, z) ?? -30) + 1.5;
    add('dural-sinuses', 0, 'vein', [[0, ty(0, -86), -86, 2.8], [s * 20, ty(20, -84), -84, 2.7], [s * 40, ty(40, -72), -72, 2.7], [s * 54, ty(54, -52), -52, 2.7], [s * 56, -46, -44, 2.7], [s * 50, -62, -42, 2.7], [s * 44, -82, -42, 2.6]]);
  }
  // базилярная артерия по передней поверхности моста
  const bas: number[][] = [];
  for (let y = -68; y <= -38; y += 5) bas.push([0, y, (stemFrontZ(0, y) ?? -10) + 2.3, 2.4]);
  add('basilar-artery', 0, 'artery', bas);
  add('circle-of-willis', 0, 'artery', [[-2.2, -27, 25, 0.9], [0, -27, 25.6, 0.9], [2.2, -27, 25, 0.9]], 8);
  // верхний сагиттальный и прямой синусы
  const sss: number[][] = [];
  for (let z = 72; z >= -84; z -= 12) if (baseHemi(1.6, 8, z) < 0) sss.push([0, cortexTopY(1.6, z) + 3.4, z, 2.7]);
  add('dural-sinuses', 0, 'vein', sss);
  const st: number[][] = [];
  for (let z = -44; z >= -86; z -= 7) st.push([0, ty0(z), z, 2.2]);
  add('dural-sinuses', 0, 'vein', st);

  // серп мозга
  const zs: number[] = [];
  for (let z = -82; z <= 74; z += 2) if (baseHemi(1.6, 8, z) < 0) zs.push(z);
  const falx = sheet(zs.length - 1, 14, (i, j) => {
    const z = zs[i];
    const top = cortexTopY(1.6, z) + 3.6;
    const bot = z < -44 ? (tentY(0, z) ?? -30) + 1 : freeEdge(z);
    return [0.25 * Math.sin(z * 0.2 + j * 0.3), lerp(bot, top, j / 14), z];
  });
  out.push({ id: 'falx-cerebri', side: 0, kind: 'dura', geo: falx });
  // намёт мозжечка
  const nx = 44;
  const nz = 34;
  const tent = sheet(nx, nz, (i, j) => {
    const x = -62 + (124 * i) / nx;
    const z = -90 + (80 * j) / nz;
    if ((x / 16) ** 2 + ((z + 10) / 26) ** 2 < 1) return null;
    if ((x / 66) ** 2 + ((z + 50) / 42) ** 2 > 1) return null;
    const y = tentY(x, z);
    return y === null ? null : [x, y, z];
  });
  out.push({ id: 'tentorium', side: 0, kind: 'dura', geo: tent });
  return out;
}

function ty0(z: number): number {
  return (tentY(0, z) ?? -24) + 1.5;
}

/** Хиазма — отдельная небольшая сфера, чтобы нервы сходились в одном узле. */
export function chiasmGeometry(): BufferGeometry {
  const g = new SphereGeometry(1, 20, 14);
  g.scale(5.2, 1.7, 2.8);
  g.translate(0, -30, 21);
  return g;
}
