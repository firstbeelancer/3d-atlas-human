import { CircleGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import {
  COLON_MARKS,
  MESENTERY_ROOT,
  PYLORUS,
  SMALL_MARKS,
  TAENIA_THETA,
  WALL_COLON,
  WALL_SMALL,
  WALL_THIN,
  analColumnDepth,
  appendixPath,
  appendixR,
  buildPath,
  colonBaseR,
  colonFoldInward,
  colonOuterR,
  colonPath,
  cum,
  haustraFold,
  haustraAmount,
  haustraPositions,
  lerp,
  mulberry32,
  pathPoint,
  plicaDepth,
  ringPoint,
  smallBaseR,
  smallPath,
  smoothstep,
  type GutPath,
  type V3,
} from './anatomy';
import { gridSurface, merge, ringArc, sweep, tubeGeo } from './geometry';
import { INTESTINE_PART_IDS, type SegmentId } from './parts';

export type MatKey =
  | 'smallSkin' | 'smallSerosa' | 'smallMuscleA' | 'smallMuscleB' | 'smallSub' | 'smallMucosa'
  | 'colonSkin' | 'colonSerosa' | 'colonMuscleA' | 'colonMuscleB' | 'colonSub' | 'colonMucosa'
  | 'analSkin' | 'analMucosa'
  | 'taenia' | 'fold' | 'appendage' | 'feces' | 'valve' | 'valveDark' | 'papilla' | 'sphincterIn' | 'striated'
  | 'mesentery' | 'omentum' | 'artery' | 'vein' | 'nerve' | 'lymph' | 'ligament'
  | 'stomach' | 'pancreas' | 'bile' | 'pancDuct' | 'aorta' | 'ivc';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Отдел, с которым геометрия ездит при разносе. */
  seg?: SegmentId;
  /** Внутренний слой или содержимое: виден только на разрезе, при разносе и в «призрачном» режиме. */
  inner?: boolean;
  /** Не принимает клики. */
  noPick?: boolean;
  /** Лёгкая геометрия для наведения мыши. */
  proxy?: BufferGeometry;
}

export type IntestineGeometry = Record<string, MeshDef[]>;

/* ---------- Стенка отдела: пять поверхностей ---------- */

interface SegSpec {
  id: SegmentId;
  path: GutPath;
  i0: number;
  i1: number;
  region: 'small' | 'colon';
  wall: readonly number[];
  radial: number;
  outer: (i: number, theta: number) => number;
  nominal: (i: number) => number;
  /** Дополнительный выступ слизистой внутрь (складки, столбы). */
  inward?: (i: number, theta: number) => number;
  skin: MatKey;
  mucosa: MatKey;
  sBase?: number;
  uvLen: number;
  uvAround: number;
  /** Шаги по точкам пути для разных поверхностей. */
  strides: { skin: number; sero: number; mid: number; muc: number };
}

function addWall(out: IntestineGeometry, sp: SegSpec) {
  const small = sp.region === 'small';
  const pre = small ? 'small' : 'colon';
  const push = (id: string, d: MeshDef) => (out[id] ??= []).push(d);
  const layerR = (l: number) => (i: number, th: number) => {
    const o = sp.outer(i, th);
    const k = Math.min(1, o / sp.nominal(i));
    return Math.max(0.012, o - cum(sp.wall, l) * k);
  };
  const common = { path: sp.path, i0: sp.i0, i1: sp.i1, radial: sp.radial, attrs: small, sBase: sp.sBase ?? 0, uvLen: sp.uvLen, uvAround: sp.uvAround };
  const proxyFor = (l: number) =>
    sweep({ path: sp.path, i0: sp.i0, i1: sp.i1, stride: 5, radial: 8, radius: (i) => Math.max(0.012, layerR(l)(i, 0)) });

  // наружная поверхность — то, что видно снаружи
  push(sp.id, { g: sweep({ ...common, stride: sp.strides.skin, radius: layerR(0) }), m: sp.skin, seg: sp.id, proxy: proxyFor(0) });
  // брюшина — тончайшая глянцевая плёнка поверх
  push('serosa', {
    g: sweep({ ...common, stride: sp.strides.sero, radius: (i, th) => layerR(0)(i, th) + 0.014 }),
    m: `${pre}Serosa` as MatKey,
    seg: sp.id,
    noPick: true,
  });
  // границы слоёв внутрь: круговая мышца, подслизистая, слизистая
  push('muscularis', {
    g: sweep({ ...common, inward: true, stride: sp.strides.mid, radius: layerR(1) }),
    m: `${pre}MuscleA` as MatKey,
    seg: sp.id,
    inner: true,
    proxy: proxyFor(1),
  });
  push('muscularis', {
    g: sweep({ ...common, inward: true, stride: sp.strides.mid, radius: layerR(2) }),
    m: `${pre}MuscleB` as MatKey,
    seg: sp.id,
    inner: true,
    noPick: true,
  });
  push('submucosa', {
    g: sweep({ ...common, inward: true, stride: sp.strides.mid, radius: layerR(3) }),
    m: `${pre}Sub` as MatKey,
    seg: sp.id,
    inner: true,
    proxy: proxyFor(3),
  });
  const extra = sp.inward ?? (() => 0);
  push('mucosa', {
    g: sweep({ ...common, inward: true, stride: sp.strides.muc, radius: (i, th) => Math.max(0.012, layerR(4)(i, th) - extra(i, th)), uvAround: sp.uvAround }),
    m: sp.mucosa,
    seg: sp.id,
    inner: true,
    proxy: proxyFor(4),
  });
}

/* ---------- Вспомогательное ---------- */

const orient = (from: V3, to: V3): Quaternion =>
  new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize());

/** Эллипсоид, вытянутый вдоль направления dir (длина по оси z — radii[2]). */
function blob(center: V3, dir: V3, radii: V3, seg: [number, number] = [8, 6]): BufferGeometry {
  const g = new SphereGeometry(1, seg[0], seg[1]);
  const q = orient([0, 0, 0], dir);
  g.applyMatrix4(new Matrix4().compose(new Vector3(...center), q, new Vector3(...radii)));
  return g;
}

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mid3 = (a: V3, b: V3, k = 0.5): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Точка на кольце толстой кишки у внешней стенки (с отступом). */
const colonOut = (i: number, theta: number, off = 0): V3 => ringPoint(colonPath, i, theta, colonBaseR(i) + off);

/** Ориентиры толстой кишки как индексы. */
const M = COLON_MARKS;

/** Угол брыжеечного края толстой кишки (тения мезоколика). */
const MESO_THETA = TAENIA_THETA[1];

/* ---------- Главная сборка ---------- */

export function buildIntestine(): IntestineGeometry {
  const out: IntestineGeometry = {};
  for (const id of INTESTINE_PART_IDS) out[id] = [];
  const push = (id: string, d: MeshDef) => out[id].push(d);

  /* ----- Стенка по отделам ----- */

  const colonSeg = (id: SegmentId, i0: number, i1: number, extra?: Partial<SegSpec>) =>
    addWall(out, {
      id,
      path: colonPath,
      i0,
      i1,
      region: 'colon',
      wall: WALL_COLON,
      radial: 24,
      outer: colonOuterR,
      nominal: colonBaseR,
      inward: (i, th) => colonBaseR(i) * colonFoldInward(i, th) * 0.5,
      skin: 'colonSkin',
      mucosa: 'colonMucosa',
      uvLen: 0.4,
      uvAround: 2,
      strides: { skin: 1, sero: 1, mid: 2, muc: 1 },
      ...extra,
    });
  colonSeg('cecum', 0, M.icLevel);
  colonSeg('ascending', M.icLevel, M.ascEnd);
  colonSeg('hepatic-flexure', M.ascEnd, M.hepEnd);
  colonSeg('transverse', M.hepEnd, M.transEnd);
  colonSeg('splenic-flexure', M.transEnd, M.splEnd);
  colonSeg('descending', M.splEnd, M.sigStart);
  colonSeg('sigmoid', M.sigStart, M.rectoSigmoid);
  colonSeg('rectum', M.rectoSigmoid, M.anorectal, { inward: () => 0, uvAround: 2 });
  colonSeg('anal-canal', M.anorectal, M.anus, {
    radial: 20,
    skin: 'analSkin',
    mucosa: 'analMucosa',
    inward: (i, th) => analColumnDepth(i, th),
    strides: { skin: 1, sero: 1, mid: 1, muc: 1 },
  });

  const smallSeg = (id: SegmentId, i0: number, i1: number) =>
    addWall(out, {
      id,
      path: smallPath,
      i0,
      i1,
      region: 'small',
      wall: WALL_SMALL,
      radial: 14,
      outer: (i) => smallBaseR(i),
      nominal: smallBaseR,
      inward: (i, th) => plicaDepth(i, th),
      skin: 'smallSkin',
      mucosa: 'smallMucosa',
      uvLen: 0.45,
      uvAround: 1,
      strides: { skin: 2, sero: 3, mid: 3, muc: 1 },
    });
  smallSeg('duodenum', 0, SMALL_MARKS.dj);
  smallSeg('jejunum', SMALL_MARKS.dj, SMALL_MARKS.jejEnd);
  smallSeg('ileum', SMALL_MARKS.jejEnd, SMALL_MARKS.end);

  addWall(out, {
    id: 'appendix',
    path: appendixPath,
    i0: 0,
    i1: appendixPath.n - 1,
    region: 'colon',
    wall: WALL_THIN,
    radial: 12,
    outer: (i) => appendixR(i),
    nominal: () => 0.19,
    skin: 'colonSkin',
    mucosa: 'colonMucosa',
    uvLen: 0.8,
    uvAround: 1,
    strides: { skin: 1, sero: 1, mid: 1, muc: 1 },
  });

  /* ----- Тении: три ленты вдоль толстой кишки ----- */

  const colonSegs: [SegmentId, number, number][] = [
    ['cecum', 0, M.icLevel],
    ['ascending', M.icLevel, M.ascEnd],
    ['hepatic-flexure', M.ascEnd, M.hepEnd],
    ['transverse', M.hepEnd, M.transEnd],
    ['splenic-flexure', M.transEnd, M.splEnd],
    ['descending', M.splEnd, M.sigStart],
    ['sigmoid', M.sigStart, M.rectoSigmoid],
  ];
  for (const [seg, i0, i1] of colonSegs) {
    const start = Math.max(i0, 26);
    const ribbons = TAENIA_THETA.map((th) =>
      gridSurface(
        Math.max(2, Math.round((i1 - start) / 2)),
        4,
        (u, v) => {
          const i = Math.round(start + u * (i1 - start));
          const t = th + (v - 0.5) * 0.3;
          const lift = 0.006 + 0.016 * (1 - Math.pow(2 * v - 1, 2));
          return ringPoint(colonPath, i, t, colonOuterR(i, t) + lift);
        },
        [(i1 - start) * 0.2, 1],
      ),
    );
    if (i1 - start > 3) push('taeniae', { g: merge(ribbons), m: 'taenia', seg });
  }

  /* ----- Полулунные складки гаустр и содержимое ----- */

  const rand = mulberry32(77);
  for (const [seg, i0, i1] of colonSegs) {
    {
      const folds: BufferGeometry[] = [];
      for (const i of haustraPositions(Math.max(i0, 30), i1 - 1)) {
        for (const a of TAENIA_THETA) {
          const mid = a + Math.PI / 3;
          const th0 = mid - 0.78;
          const th1 = mid + 0.78;
          const R = Math.max(0.1, colonOuterR(i, mid) - cum(WALL_COLON, 4) - colonBaseR(i) * colonFoldInward(i, mid) * 0.5 - 0.004);
          folds.push(ringArc(colonPath, i, th0, th1, R, 0.055 * (colonBaseR(i) / 0.7), 8, 5));
        }
      }
      if (folds.length) push('haustra', { g: merge(folds), m: 'fold', seg, inner: true, noPick: false });
    }
    // каловые массы: цепочка «колбасок» по гаустрам, не заполняют просвет целиком
    push('feces', {
      g: sweep({
        path: colonPath,
        i0,
        i1,
        radial: 18,
        stride: 1,
        uvLen: 0.9,
        uvAround: 2,
        radius: (i) => {
          const nominal = colonBaseR(i) - cum(WALL_COLON, 4);
          const s = colonPath.S[i];
          let r = nominal * 0.62 * (1 - haustraAmount(i) * 0.3 * haustraFold(s));
          if (s < 1.3) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 1.3, 2))) * 0.8 + 0.2 * smoothstep(0.2, 1.3, s);
          return Math.max(0.01, r);
        },
      }),
      m: 'feces',
      seg,
      inner: true,
    });
  }
  // прямая кишка: плотный кал в ампуле
  push('feces', {
    g: sweep({
      path: colonPath,
      i0: M.rectoSigmoid,
      i1: M.anorectal - 6,
      radial: 18,
      uvLen: 0.9,
      uvAround: 2,
      radius: (i) => {
        const nominal = colonBaseR(i) - cum(WALL_COLON, 4);
        const rest = colonPath.S[M.anorectal - 6] - colonPath.S[i];
        return Math.max(0.01, nominal * 0.6 * Math.min(1, Math.sqrt(Math.max(0, rest / 0.7))));
      },
    }),
    m: 'feces',
    seg: 'rectum',
    inner: true,
  });

  /* ----- Сальниковые отростки ----- */

  const appendages: Partial<Record<SegmentId, BufferGeometry[]>> = {};
  for (const [seg, i0, i1] of colonSegs) {
    if (seg === 'cecum') continue;
    const list: BufferGeometry[] = [];
    const step = seg === 'sigmoid' ? 8 : seg === 'transverse' ? 9 : 11;
    for (let i = i0 + 8; i < i1 - 6; i += step + Math.floor(rand() * 4)) {
      const th = TAENIA_THETA[rand() > 0.5 ? 0 : 2] + (rand() - 0.5) * 0.3;
      const base = ringPoint(colonPath, i, th, colonOuterR(i, th) - 0.02);
      const dir = new Vector3(base[0] - colonPath.P[i * 3], base[1] - colonPath.P[i * 3 + 1], base[2] - colonPath.P[i * 3 + 2]).normalize();
      dir.x += (rand() - 0.5) * 0.4;
      dir.y += (rand() - 0.5) * 0.4;
      dir.z += (rand() - 0.5) * 0.4;
      dir.normalize();
      const len = 0.16 + rand() * 0.2;
      const tip: V3 = [base[0] + dir.x * len, base[1] + dir.y * len, base[2] + dir.z * len];
      list.push(blob(mid3(base, tip, 0.35), [dir.x, dir.y, dir.z], [0.035, 0.035, len * 0.5], [6, 5]));
      list.push(blob(add3(tip, [dir.x * 0.05, dir.y * 0.05, dir.z * 0.05]), [dir.x, dir.y, dir.z], [0.075 + rand() * 0.03, 0.065, 0.13 + rand() * 0.06], [8, 6]));
    }
    appendages[seg] = list;
  }
  for (const [seg, list] of Object.entries(appendages) as [SegmentId, BufferGeometry[]][]) {
    if (list.length) push('epiploic-appendages', { g: merge(list), m: 'appendage', seg });
  }

  /* ----- Прямая кишка: поперечные складки Хьюстона; анальный канал: сфинктеры ----- */

  {
    const R = colonPath;
    const span = M.anorectal - M.rectoSigmoid;
    const defs: [number, number, number][] = [
      [0.2, (Math.PI * 3) / 2, 1.5],
      [0.5, Math.PI / 2, 1.7],
      [0.76, (Math.PI * 3) / 2, 1.45],
    ];
    const arcs = defs.map(([f, th, w]) => {
      const i = Math.round(M.rectoSigmoid + span * f);
      const r = colonBaseR(i) - cum(WALL_COLON, 4) - 0.004;
      return ringArc(R, i, th - w, th + w, r, 0.085, 14, 6);
    });
    push('rectal-folds', { g: merge(arcs), m: 'fold', seg: 'rectum', inner: true });
  }

  {
    // внутренний сфинктер: утолщение круговой гладкой мышцы вокруг верхних двух третей канала
    const a0 = M.anorectal + 2;
    const a1 = Math.round(lerp(M.anorectal, M.anus, 0.78));
    push('internal-sphincter', {
      g: sweep({
        path: colonPath, i0: a0, i1: a1, radial: 22, uvLen: 1, uvAround: 2,
        radius: (i) => {
          const t = (i - a0) / (a1 - a0);
          return colonBaseR(i) + 0.15 * Math.sin(Math.PI * Math.min(1, Math.max(0.05, t)) * 0.9 + 0.2) + 0.02;
        },
      }),
      m: 'sphincterIn',
      seg: 'anal-canal',
    });
    // наружный сфинктер: поперечнополосатая мышца, кольцо снаружи нижних двух третей
    const b0 = Math.round(lerp(M.anorectal, M.anus, 0.3));
    push('external-sphincter', {
      g: sweep({
        path: colonPath, i0: b0, i1: M.anus, radial: 24, uvLen: 1.2, uvAround: 3,
        radius: (i) => {
          const t = (i - b0) / (M.anus - b0);
          const swell = Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.17;
          return colonBaseR(i) + 0.16 + swell * 0.6 + 0.05 * (1 - t);
        },
      }),
      m: 'striated',
      seg: 'anal-canal',
    });
    // лобково-прямокишечная мышца: петля сзади от анально-прямокишечного угла к лобку
    const y = colonPath.P[M.anorectal * 3 + 1] + 0.1;
    const sling = buildPath(
      [
        [0.95, y - 0.1, 1.15],
        [0.95, y - 0.05, 0.1],
        [0.78, y, -0.95],
        [0.0, y + 0.03, -1.3],
        [-0.78, y, -0.95],
        [-0.95, y - 0.05, 0.1],
        [-0.95, y - 0.1, 1.15],
      ],
      0.07,
      [0, 1, 0],
    );
    push('puborectalis', {
      g: sweep({ path: sling, i0: 0, i1: sling.n - 1, radial: 14, uvLen: 1.4, uvAround: 2, squash: 0.45, squashN: true, radius: () => 0.27 }),
      m: 'striated',
      seg: 'anal-canal',
    });
  }

  /* ----- Илеоцекальный клапан и большой сосочек двенадцатиперстной кишки ----- */

  {
    const c: V3 = [-2.86, -2.76, -0.1];
    const geos = [
      blob([c[0], c[1] + 0.13, c[2]], [1, 0, 0], [0.34, 0.14, 0.3], [14, 10]),
      blob([c[0], c[1] - 0.13, c[2]], [1, 0, 0], [0.34, 0.14, 0.3], [14, 10]),
    ];
    // коллар — кольцевое утолщение у основания
    const ring = new TorusGeometry(0.33, 0.055, 8, 22);
    ring.rotateY(Math.PI / 2);
    ring.translate(-2.64, -2.76, -0.1);
    geos.push(ring);
    const lips = merge(geos.map((g) => g));
    push('ileocecal-valve', { g: lips, m: 'valve', seg: 'cecum', inner: true });
    const slit = new CircleGeometry(1, 16);
    slit.scale(0.03, 0.16, 1);
    slit.rotateY(-Math.PI / 2);
    slit.translate(-3.12, -2.76, -0.1);
    push('ileocecal-valve', { g: slit, m: 'valveDark', seg: 'cecum', inner: true, noPick: true });
  }

  {
    const p = pathPoint(smallPath, SMALL_MARKS.papilla);
    const at: V3 = [p[0] + 0.28, p[1], p[2]];
    push('duodenal-papilla', { g: blob([at[0] - 0.07, at[1], at[2]], [-1, 0, 0], [0.085, 0.085, 0.11], [12, 8]), m: 'papilla', seg: 'duodenum', inner: true });
    const dot = new CircleGeometry(1, 12);
    dot.scale(0.028, 0.028, 1);
    dot.rotateY(-Math.PI / 2);
    dot.translate(at[0] - 0.185, at[1], at[2]);
    push('duodenal-papilla', { g: dot, m: 'valveDark', seg: 'duodenum', inner: true, noPick: true });
    // общий желчный проток сверху и проток поджелудочной железы слева: сливаются перед сосочком
    push('duodenal-papilla', { g: tubeGeo([[-1.25, 3.3, -1.35], [-1.4, 2.6, -1.22], [-1.52, 2.1, -1.14], [at[0] - 0.05, at[1], at[2]]], 0.05, 0.055, 8), m: 'bile', seg: 'duodenum' });
    push('duodenal-papilla', { g: tubeGeo([[-0.8, 1.86, -1.2], [-1.2, 1.84, -1.14], [-1.5, 1.86, -1.11], [at[0] - 0.05, at[1], at[2]]], 0.04, 0.045, 8), m: 'pancDuct', seg: 'duodenum' });
  }

  // связка Трейтца: тяж от двенадцатиперстно-тощего изгиба вверх к ножке диафрагмы
  push('treitz', {
    g: merge([
      tubeGeo([[0.9, 1.1, -1.12], [0.82, 1.8, -1.45], [0.62, 2.7, -1.95]], 0.05, 0.1, 8),
      tubeGeo([[0.92, 1.1, -1.1], [0.95, 1.9, -1.6], [0.9, 2.5, -2.0]], 0.035, 0.07, 6),
    ]),
    m: 'ligament',
    seg: 'duodenum',
  });

  /* ----- Брыжейка и сосуды ----- */

  const sm = SMALL_MARKS;
  const fan = (i: number) => {
    const G = pathPoint(smallPath, i);
    const u = (i - sm.dj) / (sm.end - sm.dj);
    const root = rootAt(u);
    return { G, u, root };
  };
  const rootPath = buildPath(MESENTERY_ROOT, 0.05);
  const rootAt = (u: number): V3 => {
    const k = Math.min(rootPath.n - 1, Math.max(0, Math.round(u * (rootPath.n - 1))));
    return pathPoint(rootPath, k);
  };
  const wpZ = (u: number, i: number) => -1.02 - 0.1 * u + 0.05 * Math.sin(i * 0.37);
  /** Точка веера брыжейки: v = 0 — у кишки, 1 — у корня. */
  const mesPoint = (i: number, v: number): V3 => {
    const { G, u, root } = fan(i);
    const b: V3 = [G[0], G[1], G[2] - 0.2];
    const w: V3 = [G[0], G[1] + 0.02, wpZ(u, i)];
    return v < 0.4 ? mid3(b, w, v / 0.4) : mid3(w, root, (v - 0.4) / 0.6);
  };
  const mesStep = 5;
  const mesCols = Math.round((sm.end - sm.dj) / mesStep);
  push('mesentery', {
    g: gridSurface(mesCols, 9, (u, v) => mesPoint(Math.round(sm.dj + u * (sm.end - sm.dj)), v), [mesCols * 0.05, 3]),
    m: 'mesentery',
    seg: undefined,
  });

  const arcadeV = 0.62;
  const rectaStep = 10;
  const sma: BufferGeometry[] = [];
  const smv: BufferGeometry[] = [];
  const smvOff: V3 = [-0.06, 0.035, -0.03];
  const offs = (pts: V3[], o: V3): V3[] => pts.map((p) => add3(p, o));
  // стволы
  const smaTrunk: V3[] = [[0.45, 2.1, -2.05], [0.5, 1.5, -1.65], [0.52, 0.9, -1.5], [0.36, 0.1, -1.42], [-0.2, -0.9, -1.4], [-1.0, -1.8, -1.2], [-1.8, -2.4, -0.9]];
  sma.push(tubeGeo(smaTrunk, 0.09, 0.045, 10, 0.15));
  smv.push(tubeGeo([[-1.9, -2.45, -0.82], [-1.2, -1.8, -1.15], [-0.5, -0.9, -1.4], [-0.1, 0.1, -1.52], [-0.05, 1.1, -1.65], [-0.3, 2.1, -1.72], [-0.6, 2.9, -1.62], [-1.0, 3.9, -1.45]], 0.1, 0.15, 12, 0.18));
  // тощие и подвздошные ветви, аркады и прямые сосуды
  const arcade: V3[] = [];
  for (let i = sm.dj + 4; i < sm.end - 8; i += 6) arcade.push(mesPoint(i, arcadeV));
  sma.push(tubeGeo(arcade, 0.026, 0.026, 5, 0.2));
  smv.push(tubeGeo(offs(arcade, smvOff), 0.03, 0.03, 5, 0.2));
  for (let i = sm.dj + 14; i < sm.end - 14; i += 42) {
    const path: V3[] = [mesPoint(i, 1), mesPoint(i, 0.8), mesPoint(i, arcadeV)];
    sma.push(tubeGeo(path, 0.032, 0.026, 5, 0.2));
    smv.push(tubeGeo(offs(path, smvOff), 0.036, 0.03, 5, 0.2));
  }
  for (let i = sm.dj + 6; i < sm.end - 6; i += rectaStep) {
    const path: V3[] = [mesPoint(i, arcadeV), mesPoint(i, 0.3), mesPoint(i, 0.02)];
    sma.push(tubeGeo(path, 0.016, 0.014, 4, 0.22));
    smv.push(tubeGeo(offs(path, [0, 0.045, 0]), 0.018, 0.016, 4, 0.22));
  }
  // краевая артерия вдоль брыжеечного края толстой кишки и ветви к ней
  const marginal = (i0: number, i1: number, step = 7): V3[] => {
    const pts: V3[] = [];
    for (let i = i0; i <= i1; i += step) pts.push(colonOut(i, MESO_THETA, 0.1));
    return pts;
  };
  const mgRight = marginal(M.icLevel - 14, M.splEnd - 20);
  sma.push(tubeGeo(mgRight, 0.028, 0.026, 5, 0.18));
  const toMarginal = (from: V3, i: number, r = 0.03, lift: V3 = [0, 0, -0.12]): BufferGeometry => {
    const to = colonOut(i, MESO_THETA, 0.1);
    return tubeGeo([from, add3(mid3(from, to), lift), to], r, r * 0.8, 6, 0.18);
  };
  sma.push(toMarginal([-1.8, -2.4, -0.9], M.icLevel - 14, 0.04, [0, -0.1, -0.1])); // подвздошно-ободочная
  sma.push(toMarginal([0.36, 0.1, -1.42], Math.round(lerp(M.icLevel, M.ascEnd, 0.5)), 0.035)); // правая ободочная
  sma.push(toMarginal([0.52, 1.0, -1.52], Math.round(lerp(M.hepEnd, M.transEnd, 0.5)), 0.04, [0, 0.2, -0.05])); // средняя ободочная
  sma.push(toMarginal([0.5, 1.4, -1.62], Math.round(lerp(M.hepEnd, M.transEnd, 0.12)), 0.03, [0, 0.3, -0.1]));
  // слепая кишка и червеобразный отросток: артерия отростка
  const appStart = pathPoint(appendixPath, 4);
  sma.push(tubeGeo([[-1.8, -2.4, -0.9], [-2.7, -3.2, -0.8], [appStart[0] - 0.02, appStart[1] + 0.06, appStart[2] - 0.2], [appStart[0] + 0.28, appStart[1] - 0.32, appStart[2] - 0.12], pathPoint(appendixPath, Math.round(appendixPath.n * 0.78))], 0.022, 0.012, 5, 0.12));
  push('sma', { g: merge(sma), m: 'artery' });
  // вены: те же ветви, и воротная вена вверх
  smv.push(tubeGeo(offs(mgRight, [-0.05, 0.03, -0.03]), 0.03, 0.028, 5, 0.18));
  smv.push(tubeGeo([[-1.9, -2.45, -0.82], [-2.7, -3.1, -0.8], colonOut(M.icLevel - 14, MESO_THETA, 0.14)], 0.04, 0.03, 6, 0.18));
  push('smv', { g: merge(smv), m: 'vein' });

  // нижняя брыжеечная артерия и вена к левой половине
  const ima: BufferGeometry[] = [];
  const imv: BufferGeometry[] = [];
  const imaTrunk: V3[] = [[0.45, -3.2, -2.1], [1.2, -3.5, -1.75], [2.0, -3.3, -1.45]];
  ima.push(tubeGeo(imaTrunk, 0.06, 0.04, 8, 0.15));
  const mgLeft = marginal(M.splEnd - 20, M.rectoSigmoid - 6);
  ima.push(tubeGeo(mgLeft, 0.026, 0.024, 5, 0.18));
  ima.push(toMarginal([1.2, -3.5, -1.75], Math.round(lerp(M.splEnd, M.sigStart, 0.55)), 0.035, [0, 0, -0.2])); // левая ободочная
  const sigA = [0.2, 0.5, 0.8];
  for (const f of sigA) ima.push(toMarginal([1.2, -3.5, -1.75], Math.round(lerp(M.sigStart, M.rectoSigmoid, f)), 0.026, [0, -0.1, -0.15]));
  ima.push(tubeGeo([[1.2, -3.5, -1.75], [0.5, -5.0, -1.55], [0.1, -6.2, -1.6], [0.0, -7.0, -1.78]], 0.03, 0.02, 6, 0.2)); // верхняя прямокишечная
  push('ima', { g: merge(ima), m: 'artery' });
  imv.push(tubeGeo([[1.0, -4.8, -1.0], [1.6, -3.3, -1.7], [1.0, -1.8, -2.05], [0.7, 0.2, -2.1], [0.9, 2.2, -1.85], [0.5, 3.2, -1.55]], 0.045, 0.06, 8, 0.2));
  imv.push(tubeGeo(offs(mgLeft, [-0.05, 0.03, -0.03]), 0.026, 0.024, 5, 0.18));
  push('ima', { g: merge(imv), m: 'vein' });

  // лимфатические узлы по ходу сосудов
  {
    const nodes: BufferGeometry[] = [];
    const rr = mulberry32(31);
    const place = (c: V3, s = 1) => {
      const dir: V3 = [rr() - 0.5, rr() - 0.5, rr() - 0.5];
      nodes.push(blob(c, dir, [0.085 * s, 0.085 * s, (0.13 + rr() * 0.07) * s], [10, 8]));
    };
    for (let i = sm.dj + 20; i < sm.end - 10; i += 62) place(add3(mesPoint(i, 0.72), [0, 0.06, 0.02]), 0.9 + rr() * 0.4);
    for (let k = 0; k < 9; k++) place(add3(pathPoint(rootPath, Math.round((k / 8) * (rootPath.n - 1))), [0.12 + rr() * 0.1, -0.1 + rr() * 0.2, 0.04]), 1.1);
    for (let i = M.icLevel - 10; i < M.splEnd - 10; i += 30) place(colonOut(i, MESO_THETA, 0.22), 0.8);
    for (let i = M.splEnd; i < M.rectoSigmoid; i += 24) place(colonOut(i, MESO_THETA, 0.22), 0.8);
    for (let k = 0; k < 4; k++) place([0.55 + k * 0.15, -3.0 - k * 0.5, -1.95], 1.1);
    push('lymph-nodes', { g: merge(nodes), m: 'lymph' });
  }

  // нервные сплетения по ходу артерий
  {
    const nv: BufferGeometry[] = [];
    nv.push(tubeGeo(offs(smaTrunk, [0.07, 0, 0.04]), 0.017, 0.012, 5, 0.2));
    nv.push(tubeGeo(offs(smaTrunk, [-0.05, 0.02, 0.07]), 0.015, 0.011, 5, 0.2));
    nv.push(tubeGeo(offs(imaTrunk, [0.0, 0.07, 0.06]), 0.014, 0.011, 5, 0.2));
    nv.push(tubeGeo([[0.45, -4.3, -2.0], [0.2, -5.6, -2.0], [0.55, -7.2, -1.85]], 0.016, 0.014, 5, 0.2)); // подчревные нервы
    nv.push(tubeGeo([[0.45, 2.5, -2.0], [0.6, 2.1, -1.9], [0.5, 1.5, -1.7]], 0.02, 0.016, 5, 0.2));
    for (let i = sm.dj + 30; i < sm.end - 30; i += 70) nv.push(tubeGeo([mesPoint(i, 1), mesPoint(i, 0.8), mesPoint(i, arcadeV)].map((p) => add3(p, [0.03, 0.03, 0.02])), 0.01, 0.008, 4, 0.22));
    nv.push(tubeGeo([[0.0, -7.9, -1.95], [0.0, -7.6, -1.55], [0, -7.5, -1.35]], 0.015, 0.012, 5, 0.1)); // тазовые нервы
    nv.push(tubeGeo([[0.9, -3.5, -1.7], [1.7, -3.2, -1.5], mid3(colonOut(Math.round(lerp(M.splEnd, M.sigStart, 0.55)), MESO_THETA, 0.1), [2.0, -3.3, -1.4])], 0.012, 0.01, 4, 0.2));
    push('nerves', { g: merge(nv), m: 'nerve' });
  }

  /* ----- Соседние органы ----- */

  {
    const sp = buildPath([PYLORUS, [-0.35, 3.75, -0.75], [0.5, 4.2, -0.65], [1.6, 4.75, -0.55], [2.7, 5.2, -0.5], [3.5, 5.3, -0.45]], 0.1, [0, 0, 1]);
    const prof = (t: number) => (t < 0.12 ? lerp(0.43, 0.6, t / 0.12) : t < 0.45 ? lerp(0.6, 1.0, (t - 0.12) / 0.33) : lerp(1.0, 1.5, smoothstep(0.45, 0.9, t)));
    push('stomach', {
      g: sweep({
        path: sp, i0: 0, i1: sp.n - 1, radial: 28, uvLen: 0.4, uvAround: 2, squash: 0.85, squashN: true,
        radius: (i) => {
          const t = i / (sp.n - 1);
          let r = prof(t);
          const rest = sp.len - sp.S[i];
          if (rest < 1.4) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - rest / 1.4, 2))) + 0.001;
          return r;
        },
      }),
      m: 'stomach',
    });

    const pp = buildPath([[3.3, 3.65, -1.45], [2.2, 3.4, -1.42], [1.2, 3.05, -1.38], [0.2, 2.55, -1.3], [-0.4, 2.0, -1.22], [-0.7, 1.3, -1.15], [-0.55, 0.45, -1.15]], 0.09, [0, 0, 1]);
    const pprof = (t: number) => (t < 0.55 ? lerp(0.26, 0.36, smoothstep(0, 0.55, t)) : lerp(0.36, 0.72, smoothstep(0.55, 0.78, t)) * (1 - 0.45 * smoothstep(0.86, 1, t)));
    push('pancreas', {
      g: sweep({
        path: pp, i0: 0, i1: pp.n - 1, radial: 22, uvLen: 0.8, uvAround: 2, squash: 0.62, squashN: true,
        radius: (i, th) => {
          const t = i / (pp.n - 1);
          const s = pp.S[i];
          let r = pprof(t) * (1 + 0.09 * (Math.sin(th * 5 + s * 7) + Math.sin(th * 3 - s * 11)) * 0.5);
          const rest = pp.len - s;
          if (rest < 0.3) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - rest / 0.3, 2))) + 0.001;
          if (s < 0.28) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 0.28, 2))) + 0.001;
          return r;
        },
      }),
      m: 'pancreas',
    });
  }

  // большой сальник — фартук поверх петель тонкой кишки
  {
    const topY = (x: number): number => {
      const pts: [number, number][] = [[-3.4, 2.7], [-2.4, 2.6], [-1.4, 2.1], [-0.4, 1.55], [0.6, 1.25], [1.7, 1.7], [2.8, 2.6], [3.6, 3.3]];
      if (x <= pts[0][0]) return pts[0][1];
      for (let k = 0; k < pts.length - 1; k++) {
        if (x <= pts[k + 1][0]) return lerp(pts[k][1], pts[k + 1][1], (x - pts[k][0]) / (pts[k + 1][0] - pts[k][0]));
      }
      return pts[pts.length - 1][1];
    };
    push('greater-omentum', {
      g: gridSurface(
        80,
        24,
        (u, v) => {
          const x = lerp(-3.4, 3.6, u);
          const edge = smoothstep(0, 0.1, u) * smoothstep(0, 0.1, 1 - u);
          const bottom = -2.7 + 0.5 * Math.sin(1.7 * x + 0.5) + 0.3 * Math.sin(4.1 * x);
          const yTop = topY(x);
          const yB = lerp(yTop - 0.4, bottom, edge);
          const y = lerp(yTop, yB, v);
          const zTop = 0.82 - 0.3 * smoothstep(2.0, 3.5, Math.abs(x));
          const z = zTop + 0.22 * Math.sin(v * Math.PI * 0.6) + 0.045 * Math.sin(x * 5.5 + v * 9);
          return [x + 0.04 * Math.sin(v * 12 + x * 3), y, z];
        },
        [8, 3],
      ),
      m: 'omentum',
    });
  }

  // брюшная аорта и нижняя полая вена
  push('aorta', {
    g: merge([
      tubeGeo([[0.42, 5.6, -2.1], [0.44, 2.1, -2.1], [0.45, -1.0, -2.12], [0.45, -4.4, -2.1]], 0.3, 0.28, 18, 0.3),
      tubeGeo([[0.45, -4.4, -2.1], [0.2, -5.3, -2.05], [-0.5, -6.8, -1.9]], 0.2, 0.17, 14, 0.25),
      tubeGeo([[0.45, -4.4, -2.1], [0.8, -5.3, -2.05], [1.45, -6.8, -1.9]], 0.2, 0.17, 14, 0.25),
    ]),
    m: 'aorta',
  });
  push('ivc', {
    g: merge([
      tubeGeo([[-0.6, 5.6, -2.15], [-0.58, -1.0, -2.2], [-0.52, -4.7, -2.15]], 0.36, 0.34, 18, 0.3),
      tubeGeo([[-0.52, -4.7, -2.15], [-0.9, -5.6, -2.05], [-1.5, -6.9, -1.95]], 0.23, 0.2, 14, 0.25),
      tubeGeo([[-0.52, -4.7, -2.15], [-0.1, -5.6, -2.05], [0.6, -6.9, -1.95]], 0.23, 0.2, 14, 0.25),
    ]),
    m: 'ivc',
  });

  return out;
}

/** Материалы без перистальтики и без текстур не нуждаются в aC/aS: проверка для тестов. */
export function triangleCount(g: IntestineGeometry): number {
  let n = 0;
  for (const defs of Object.values(g)) for (const d of defs) n += (d.g.index?.count ?? 0) / 3;
  return n;
}
