import { flipX, type V3 } from '../body/geo';
import { armPoint, fingerChains } from '../body/skin';
import { RIB_END_Y, spineZ, sternumZ, VERTEBRAE } from '../skeleton/anatomy';

/*
  Нервная система всего тела в тех же координатах, что фигура на главной и кровеносная система:
  дециметры, рост 17,5, начало — пол между стопами; +x — левая сторона человека, +y — вверх, +z — вперёд.
  Парные нервы задаются для левой стороны и отражаются. Модуль — чистая математика без three-сцены:
  пути нервов, уровни 31 пары спинномозговых нервов, узлы, рефлекторная дуга. Покрыт тестами.
  Толщины мелких ветвей утрированы, чтобы их было видно; ход нервов упрощён до главных стволов.
*/

export const GROUPS = {
  'g-cns': ['brain', 'cerebellum', 'spinal-cord', 'cervical-enlargement', 'lumbar-enlargement', 'cauda-equina'],
  'g-cranial': [
    'olfactory-nerve', 'optic-nerve', 'oculomotor-nerve', 'trochlear-nerve', 'trigeminal-nerve', 'abducens-nerve',
    'facial-nerve', 'vestibulocochlear-nerve', 'glossopharyngeal-nerve', 'vagus-nerve', 'accessory-nerve', 'hypoglossal-nerve',
  ],
  'g-spinal': ['cervical-nerves', 'thoracic-nerves', 'lumbar-nerves', 'sacral-nerves', 'coccygeal-nerve', 'spinal-ganglia'],
  'g-plexus': ['cervical-plexus', 'brachial-plexus', 'lumbar-plexus', 'sacral-plexus'],
  'g-upper': ['phrenic-nerve', 'intercostal-nerves', 'axillary-nerve', 'musculocutaneous-nerve', 'radial-nerve', 'median-nerve', 'ulnar-nerve'],
  'g-lower': ['femoral-nerve', 'obturator-nerve', 'sciatic-nerve', 'tibial-nerve', 'common-peroneal-nerve'],
  'g-autonomic': ['sympathetic-trunk', 'sympathetic-ganglia', 'celiac-plexus'],
  'g-reflex': ['skin-receptor', 'sensory-neuron', 'interneuron', 'motor-neuron', 'effector-muscle'],
  'g-neuron': ['neuron-body', 'nucleus', 'dendrites', 'axon-hillock', 'axon', 'myelin', 'ranvier-nodes', 'axon-terminals', 'synapse'],
} as const;

export type GroupId = keyof typeof GROUPS;
export const REFLEX_GROUP: GroupId = 'g-reflex';
export const NEURON_GROUP: GroupId = 'g-neuron';
export const CRANIAL_GROUP: GroupId = 'g-cranial';

export const PART_IDS: string[] = Object.values(GROUPS).flat();
export const PART_GROUPS: Record<string, string> = Object.fromEntries(
  (Object.entries(GROUPS) as [string, readonly string[]][]).flatMap(([g, ids]) => ids.map((id) => [id, g])),
);

export type View = 'body' | 'reflex' | 'neuron';

/** Какую сцену показывать: выбор части рефлекса или нейрона включает её сцену сам. */
export function viewOf(modes: Record<string, boolean>, group: string | undefined): View {
  if (group === NEURON_GROUP || (modes.neuron && !group)) return 'neuron';
  if (group === REFLEX_GROUP || (modes.reflex && group !== NEURON_GROUP)) return 'reflex';
  return 'body';
}

/** Часть нервного «дерева»: трубка по точкам с радиусом от начала к концу (дм). */
export interface NervePath {
  part: string;
  points: V3[];
  r: [number, number];
}

/** Утолщение на нерве: узел (ганглий) или рецептор. */
export interface Knot {
  part: string;
  at: V3;
  r: V3;
}

/* ---------------- Позвоночный канал и уровни ---------------- */

/** Передняя поверхность крестца: от L5 он уходит назад и вниз до копчика. */
export function sacrumZ(y: number): number {
  return spineZ(9.95) - 0.05 - (9.95 - y) * 0.42;
}

/** z оси позвоночного канала (там лежат спинной мозг и конский хвост). */
export function canalZ(y: number): number {
  return y >= 9.9 ? spineZ(y) - 0.27 : sacrumZ(y) - 0.22;
}

/** z межпозвонкового (у крестца — переднего крестцового) отверстия. */
export function foramenZ(y: number): number {
  return y >= 9.9 ? spineZ(y) - 0.18 : sacrumZ(y) + 0.03;
}

export const CORD_TOP = 15.92;
/** Конец спинного мозга (мозговой конус) — на уровне L1–L2 позвонков. */
export const CONUS_Y = 11.05;

export type Region = 'cervical' | 'thoracic' | 'lumbar' | 'sacral' | 'coccygeal';

export interface SpinalNerve {
  name: string;
  region: Region;
  /** Где корешки выходят из спинного мозга (сегмент выше позвонка, особенно внизу). */
  originY: number;
  /** Где нерв выходит из позвоночника (межпозвонковое отверстие). */
  exitY: number;
}

const spread = (n: number, from: number, to: number) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));

function spinalNerves(): SpinalNerve[] {
  const list: SpinalNerve[] = [];
  const c = VERTEBRAE.cervical.map((v) => v.y);
  const t = VERTEBRAE.thoracic.map((v) => v.y);
  const l = VERTEBRAE.lumbar.map((v) => v.y);
  // C1 выходит между затылочной костью и атлантом, C2–C7 — над своим позвонком, C8 — под C7
  const cExit = [c[0] + 0.09, ...c.slice(1).map((y, i) => (c[i] + y) / 2), (c[6] + t[0]) / 2];
  const cOrigin = spread(8, 15.82, 14.9);
  cExit.forEach((exitY, i) => list.push({ name: `C${i + 1}`, region: 'cervical', originY: cOrigin[i], exitY }));
  // грудные и поясничные выходят под своим позвонком
  const tOrigin = spread(12, 14.8, 12.3);
  t.forEach((y, i) => list.push({ name: `T${i + 1}`, region: 'thoracic', originY: tOrigin[i], exitY: y - 0.135 }));
  const lOrigin = spread(5, 12.2, 11.65);
  l.forEach((y, i) => list.push({ name: `L${i + 1}`, region: 'lumbar', originY: lOrigin[i], exitY: y - 0.165 }));
  const sOrigin = spread(5, 11.56, 11.2);
  spread(5, 9.62, 9.08).forEach((exitY, i) => list.push({ name: `S${i + 1}`, region: 'sacral', originY: sOrigin[i], exitY }));
  list.push({ name: 'Co1', region: 'coccygeal', originY: 11.12, exitY: 8.98 });
  return list;
}

/** 31 пара: 8 шейных, 12 грудных, 5 поясничных, 5 крестцовых, 1 копчиковая. */
export const SPINAL_NERVES: SpinalNerve[] = spinalNerves();
const nerve = (name: string) => SPINAL_NERVES.find((n) => n.name === name)!;

/** Радиус спинного мозга по высоте: шейное и поясничное утолщения, конус внизу. */
export function cordRadius(y: number): number {
  const bump = (c: number, w: number, a: number) => a * Math.exp(-(((y - c) / w) ** 2));
  const base = 0.045 + bump(14.85, 0.32, 0.019) + bump(11.75, 0.25, 0.016);
  const conus = y < 11.45 ? Math.max(0.22, (y - CONUS_Y) / 0.4) : 1;
  return base * conus;
}

export const cordPoint = (y: number): V3 => [0, y, canalZ(y)];

/** Отверстие, через которое нерв выходит из позвоночника (левая сторона). */
export function foramenOf(n: SpinalNerve): V3 {
  const x = n.region === 'coccygeal' ? 0.08 : n.region === 'sacral' ? 0.18 - (9.62 - n.exitY) * 0.08 : 0.21;
  return [x, n.exitY, foramenZ(n.exitY)];
}

/** Конец короткого ствола спинномозгового нерва: отсюда начинаются его ветви (передняя ветвь). */
export function outerOf(n: SpinalNerve): V3 {
  if (n.region === 'coccygeal') return [0.12, n.exitY - 0.08, sacrumZ(n.exitY) + 0.06];
  if (n.region === 'sacral') return [0.3, n.exitY - 0.06, sacrumZ(n.exitY) + 0.1];
  return [0.37, n.exitY - 0.04, spineZ(n.exitY) - 0.1];
}

/* ---------------- Поза руки и стопы ---------------- */

/** Точки руки задаются до отведения: всё ниже плеча поворачивается вместе с рукой, как у кожи и сосудов. */
export const armPose = (pts: V3[]): V3[] => pts.map((p) => (p[1] < 14.0 ? armPoint(p) : p));

/** Стопа в своей системе (как у кожи): x — к мизинцу, y — вверх, z — к пальцам. */
export function footPoint(x: number, y: number, z: number): V3 {
  const turn = 0.12;
  const A: V3 = [0.58, 0.6, -0.02];
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return [A[0] + x * c + z * s, A[1] + y, A[2] - x * s + z * c];
}

/** Пальцы кисти (до отведения руки): 0 — указательный, 1 — средний, 2 — безымянный, 3 — мизинец, 4 — большой. */
const FINGERS = fingerChains();
const digital = (finger: number, side: number, from: V3): V3[] => [
  from,
  ...FINGERS[finger].map(([x, y, z], i): V3 => [x + side * 0.035, y, z + 0.055 - i * 0.004]),
];

/* ---------------- Узловые точки сплетений (левая сторона) ---------------- */

const out = (name: string) => outerOf(nerve(name));
const UPPER_TRUNK: V3 = [0.72, 14.88, -0.12];
const MIDDLE_TRUNK: V3 = [0.76, 14.72, -0.13];
const LOWER_TRUNK: V3 = [0.76, 14.55, -0.16];
const LATERAL_CORD: V3 = [1.26, 14.26, -0.05];
const POSTERIOR_CORD: V3 = [1.25, 14.2, -0.22];
const MEDIAL_CORD: V3 = [1.2, 14.14, -0.12];
const ERB_POINT: V3 = [0.56, 15.15, 0.0];
const FEMORAL_ROOT: V3 = [0.52, 10.2, -0.25];
const OBTURATOR_ROOT: V3 = [0.42, 10.08, -0.22];
const SACRAL_ROOT: V3 = [0.45, 9.35, -0.5];
const SCIATIC_SPLIT: V3 = [0.64, 5.6, -0.33];
const PALM: V3 = [2.03, 8.16, -0.06];
const ULNAR_WRIST: V3 = [1.84, 8.36, -0.06];
const BICEPS: V3 = [1.76, 12.55, 0.04];

/** Пути нервов левой стороны; правая — зеркально (кроме несимметричных, они помечены). */
function leftPaths(): NervePath[] {
  const paths: NervePath[] = [];
  const add = (part: string, points: V3[], r0: number, r1 = r0) => paths.push({ part, points, r: [r0, r1] });
  const arm = (part: string, points: V3[], r0: number, r1 = r0) => add(part, armPose(points), r0, r1);

  /* --- спинномозговые нервы: корешки в канале, короткий ствол наружу --- */
  for (const n of SPINAL_NERVES) {
    const part = n.region === 'coccygeal' ? 'coccygeal-nerve' : `${n.region}-nerves`;
    const f = foramenOf(n);
    const o = cordPoint(n.originY);
    const r0 = cordRadius(n.originY);
    const drop = n.originY - n.exitY;
    const root: V3[] = drop > 0.5
      ? [[0.03, n.originY, o[2]], [0.06, n.originY - drop * 0.3, canalZ(n.originY - drop * 0.3)],
        [0.1, n.exitY + 0.25, canalZ(n.exitY + 0.25)], [f[0] * 0.6, n.exitY + 0.06, (canalZ(n.exitY) + f[2]) / 2], f]
      : [[r0 * 0.7, n.originY, o[2]], [(r0 + f[0]) / 2, (n.originY + n.exitY) / 2, (o[2] + f[2]) / 2 - 0.01], f];
    // ниже L1 корешки длинные и идут в канале пучком — это и есть конский хвост
    const caudal = n.region !== 'cervical' && n.region !== 'thoracic' && n.name !== 'L1';
    add(caudal ? 'cauda-equina' : part, root, 0.011, 0.014);
    add(part, [f, outerOf(n)], n.region === 'thoracic' ? 0.018 : 0.022, n.region === 'thoracic' ? 0.016 : 0.022);
  }

  /* --- шейное сплетение C1–C4 и его кожные ветви --- */
  const c = [1, 2, 3, 4].map((i) => out(`C${i}`));
  for (let i = 0; i < 3; i++) add('cervical-plexus', [c[i], [0.44, (c[i][1] + c[i + 1][1]) / 2, -0.12], c[i + 1]], 0.013);
  add('cervical-plexus', [c[1], [0.5, 15.4, -0.08], ERB_POINT], 0.015);
  add('cervical-plexus', [c[2], [0.5, 15.22, -0.06], ERB_POINT], 0.015);
  add('cervical-plexus', [ERB_POINT, [0.66, 15.5, -0.05], [0.72, 15.85, -0.12]], 0.011, 0.007); // большой ушной
  add('cervical-plexus', [ERB_POINT, [0.55, 15.6, -0.3], [0.42, 16.05, -0.6]], 0.01, 0.006); // малый затылочный
  add('cervical-plexus', [ERB_POINT, [0.45, 15.15, 0.25], [0.18, 15.1, 0.42]], 0.01, 0.006); // поперечный нерв шеи
  add('cervical-plexus', [ERB_POINT, [0.62, 14.8, 0.15], [0.7, 14.45, 0.4]], 0.01, 0.006); // надключичные
  add('cervical-plexus', [ERB_POINT, [0.85, 14.8, -0.05], [1.1, 14.45, 0.05]], 0.01, 0.006);

  /* --- плечевое сплетение C5–T1: корешки, стволы, пучки --- */
  add('brachial-plexus', [out('C5'), [0.55, 14.98, -0.15], UPPER_TRUNK], 0.022);
  add('brachial-plexus', [out('C6'), [0.56, 14.86, -0.15], UPPER_TRUNK], 0.024);
  add('brachial-plexus', [out('C7'), [0.58, 14.74, -0.16], MIDDLE_TRUNK], 0.025);
  add('brachial-plexus', [out('C8'), [0.58, 14.6, -0.2], LOWER_TRUNK], 0.024);
  add('brachial-plexus', [out('T1'), [0.56, 14.45, -0.24], LOWER_TRUNK], 0.022);
  add('brachial-plexus', [UPPER_TRUNK, [1.0, 14.55, -0.06], LATERAL_CORD], 0.026);
  add('brachial-plexus', [UPPER_TRUNK, [1.0, 14.5, -0.18], POSTERIOR_CORD], 0.022);
  add('brachial-plexus', [MIDDLE_TRUNK, [1.02, 14.42, -0.1], LATERAL_CORD], 0.02);
  add('brachial-plexus', [MIDDLE_TRUNK, [1.02, 14.4, -0.2], POSTERIOR_CORD], 0.02);
  add('brachial-plexus', [LOWER_TRUNK, [1.0, 14.32, -0.2], POSTERIOR_CORD], 0.018);
  add('brachial-plexus', [LOWER_TRUNK, [1.0, 14.3, -0.13], MEDIAL_CORD], 0.024);

  /* --- нервы руки --- */
  arm('musculocutaneous-nerve', [LATERAL_CORD, [1.5, 13.92, 0.0], [1.62, 13.4, 0.08], [1.75, 12.4, 0.12], [1.9, 11.2, 0.08], [2.02, 10.4, 0.02], [2.12, 9.4, -0.02]], 0.022, 0.011);
  const median: V3[] = [[1.3, 14.15, -0.07], [1.38, 13.7, -0.1], [1.42, 13.0, -0.12], [1.52, 12.0, -0.12], [1.7, 10.95, -0.06], [1.86, 10.2, -0.16], [1.94, 9.4, -0.17], [2.0, 8.62, -0.08], PALM];
  arm('median-nerve', [LATERAL_CORD, [1.28, 14.22, -0.06], ...median], 0.028, 0.02);
  arm('median-nerve', [MEDIAL_CORD, [1.25, 14.18, -0.09], median[0]], 0.02);
  for (const [finger, side] of [[4, 1], [4, -1], [0, 1], [0, -1], [1, 1], [1, -1], [2, 1]] as const) arm('median-nerve', digital(finger, side, PALM), 0.012, 0.007);
  arm('ulnar-nerve', [MEDIAL_CORD, [1.3, 13.9, -0.2], [1.33, 13.3, -0.3], [1.38, 12.2, -0.4], [1.47, 11.0, -0.52], [1.58, 10.3, -0.4], [1.68, 9.4, -0.28], [1.79, 8.65, -0.12], ULNAR_WRIST], 0.024, 0.017);
  for (const [finger, side] of [[2, -1], [3, 1], [3, -1]] as const) arm('ulnar-nerve', digital(finger, side, ULNAR_WRIST), 0.011, 0.007);
  arm('radial-nerve', [POSTERIOR_CORD, [1.42, 13.85, -0.42], [1.62, 13.3, -0.6], [1.86, 12.5, -0.62], [2.12, 11.8, -0.4], [2.14, 11.0, -0.2], [2.2, 9.9, -0.15], [2.19, 8.9, -0.22], [2.16, 8.35, -0.3]], 0.028, 0.012);
  arm('radial-nerve', [[2.14, 11.0, -0.2], [2.12, 10.6, -0.36], [2.05, 9.9, -0.5], [2.02, 9.0, -0.42]], 0.016, 0.009);
  for (const finger of [4, 0]) {
    const [x, y, z] = FINGERS[finger][1];
    arm('radial-nerve', [[2.16, 8.35, -0.3], [(x + 2.16) / 2, (y + 8.35) / 2, -0.31], [x + 0.03, y, z - 0.07]], 0.009, 0.006);
  }
  arm('axillary-nerve', [POSTERIOR_CORD, [1.45, 13.98, -0.42], [1.66, 13.78, -0.6], [1.96, 13.66, -0.46], [2.14, 13.52, -0.2], [2.12, 13.4, 0.08]], 0.022, 0.01);

  /* --- диафрагмальный нерв C3–C5 (левый огибает сердце) --- */
  add('phrenic-nerve', [out('C3'), [0.43, 15.1, -0.05], out('C4')], 0.013);
  add('phrenic-nerve', [out('C5'), [0.45, 15.02, -0.02], [0.42, 14.9, 0.04]], 0.012);
  add('phrenic-nerve', [out('C4'), [0.42, 14.9, 0.04], [0.38, 14.4, 0.2]], 0.015);

  /* --- межрёберные нервы T1–T11 и подрёберный T12 --- */
  SPINAL_NERVES.filter((n) => n.region === 'thoracic').forEach((n, i) => {
    const o = outerOf(n);
    const zs = spineZ(n.exitY);
    const yEnd = RIB_END_Y[i];
    const pts: V3[] = [o, [0.78, n.exitY - 0.06, zs - 0.32], [1.22, n.exitY - 0.24, zs + 0.02], [1.42, (n.exitY + yEnd) / 2 - 0.2, 0.3]];
    if (i < 7) pts.push([1.12, yEnd - 0.04, 0.88], [0.2, yEnd + 0.06, sternumZ(Math.max(12.4, yEnd)) - 0.06]);
    else pts.push([1.2, yEnd - 0.25, 0.85], [0.42, yEnd - 0.75 - i * 0.04, 1.05]);
    add('intercostal-nerves', pts, 0.015, 0.008);
  });

  /* --- поясничное сплетение L1–L4 --- */
  add('lumbar-plexus', [out('L1'), [0.75, 10.7, -0.42], [1.25, 10.1, -0.05], [1.12, 9.66, 0.72], [0.45, 9.32, 1.0]], 0.014, 0.007); // подвздошно-подчревный и подвздошно-паховый
  add('lumbar-plexus', [out('L1'), [0.45, 10.75, -0.28], out('L2')], 0.012);
  for (const name of ['L2', 'L3', 'L4']) {
    const o = out(name);
    add('lumbar-plexus', [o, [(o[0] + FEMORAL_ROOT[0]) / 2 + 0.04, (o[1] + FEMORAL_ROOT[1]) / 2, -0.26], FEMORAL_ROOT], 0.022);
    add('lumbar-plexus', [o, [(o[0] + OBTURATOR_ROOT[0]) / 2, (o[1] + OBTURATOR_ROOT[1]) / 2, -0.24], OBTURATOR_ROOT], 0.016);
  }
  add('lumbar-plexus', [out('L2'), [0.72, 10.3, -0.15], [1.18, 9.6, 0.25], [1.12, 8.6, 0.45]], 0.011, 0.007); // латеральный кожный нерв бедра

  /* --- нервы бедра --- */
  const femoralEnd: V3 = [0.98, 8.92, 0.5];
  add('femoral-nerve', [FEMORAL_ROOT, [0.7, 9.7, -0.08], [0.98, 9.15, 0.42], femoralEnd], 0.036, 0.032);
  for (const end of [[1.16, 7.9, 0.42], [0.95, 7.5, 0.62], [0.68, 7.9, 0.56]] as V3[]) add('femoral-nerve', [femoralEnd, [(end[0] + 0.98) / 2, 8.4, 0.55], end], 0.016, 0.008);
  add('femoral-nerve', [femoralEnd, [0.84, 8.5, 0.36], [0.64, 7.0, 0.32], [0.44, 5.0, 0.06], [0.4, 3.0, 0.14], [0.34, 0.92, 0.12]], 0.014, 0.008); // подкожный нерв
  add('obturator-nerve', [OBTURATOR_ROOT, [0.5, 9.62, -0.16], [0.6, 9.1, 0.12], [0.55, 8.6, 0.24], [0.5, 7.6, 0.16]], 0.022, 0.01);
  add('obturator-nerve', [[0.55, 8.6, 0.24], [0.45, 8.1, 0.32], [0.4, 7.2, 0.28]], 0.012, 0.007);

  /* --- крестцовое сплетение L4–S4 и седалищный нерв --- */
  for (const name of ['L4', 'L5', 'S1', 'S2', 'S3', 'S4']) {
    const o = out(name);
    add('sacral-plexus', [o, [(o[0] + SACRAL_ROOT[0]) / 2 + 0.03, (o[1] + SACRAL_ROOT[1]) / 2, (o[2] + SACRAL_ROOT[2]) / 2], SACRAL_ROOT], name === 'S4' ? 0.014 : 0.028);
  }
  add('sacral-plexus', [SACRAL_ROOT, [0.4, 9.1, -0.42], [0.36, 8.8, -0.25], [0.25, 8.7, 0.05]], 0.012, 0.007); // половой нерв
  add('sciatic-nerve', [SACRAL_ROOT, [0.62, 9.16, -0.68], [0.78, 8.6, -0.62], [0.82, 7.6, -0.46], [0.72, 6.4, -0.38], SCIATIC_SPLIT], 0.075, 0.065);

  /* --- нервы голени и стопы --- */
  const ankle: V3 = [0.33, 0.74, -0.14];
  add('tibial-nerve', [SCIATIC_SPLIT, [0.6, 4.8, -0.38], [0.62, 3.4, -0.3], [0.56, 1.5, -0.2], ankle], 0.045, 0.026);
  add('tibial-nerve', [ankle, footPoint(-0.14, -0.42, 0.3), footPoint(-0.18, -0.48, 1.0), footPoint(-0.2, -0.5, 1.6)], 0.022, 0.01); // медиальный подошвенный
  add('tibial-nerve', [ankle, footPoint(0.05, -0.44, 0.3), footPoint(0.16, -0.48, 0.75), footPoint(0.24, -0.5, 1.3)], 0.018, 0.009); // латеральный подошвенный
  add('tibial-nerve', [footPoint(-0.18, -0.48, 1.0), footPoint(-0.05, -0.5, 1.25), footPoint(0.04, -0.52, 1.62)], 0.01, 0.007);
  add('common-peroneal-nerve', [SCIATIC_SPLIT, [0.78, 5.1, -0.36], [0.94, 4.5, -0.18], [0.96, 4.25, 0.02]], 0.034, 0.03);
  add('common-peroneal-nerve', [[0.96, 4.25, 0.02], [0.98, 3.0, 0.08], [0.86, 1.2, 0.26], footPoint(0.06, -0.24, 0.6), footPoint(0.1, -0.36, 1.25)], 0.02, 0.009); // поверхностный малоберцовый
  add('common-peroneal-nerve', [[0.96, 4.25, 0.02], [0.86, 4.0, 0.18], [0.74, 2.5, 0.2], [0.63, 0.9, 0.3], footPoint(-0.12, -0.34, 1.05), footPoint(-0.13, -0.44, 1.4)], 0.018, 0.008); // глубокий малоберцовый

  /* --- черепные нервы у основания мозга (упрощённо: выход из мозга и главное направление) --- */
  add('olfactory-nerve', [[0.06, 16.18, -0.02], [0.07, 16.2, 0.3], [0.06, 16.22, 0.58]], 0.014, 0.022);
  add('optic-nerve', [[0.31, 16.33, 0.66], [0.22, 16.29, 0.42], [0.09, 16.16, 0.2], [0.0, 16.12, 0.15]], 0.028);
  add('optic-nerve', [[0.0, 16.12, 0.15], [0.1, 16.13, 0.06], [0.2, 16.16, -0.06]], 0.022);
  add('oculomotor-nerve', [[0.04, 16.1, -0.12], [0.1, 16.13, 0.05], [0.2, 16.22, 0.3], [0.27, 16.3, 0.5]], 0.014, 0.01);
  add('trochlear-nerve', [[0.07, 16.15, -0.32], [0.2, 16.12, -0.2], [0.18, 16.18, 0.1], [0.24, 16.38, 0.48]], 0.007, 0.006);
  const gasser: V3 = [0.3, 16.0, 0.02];
  add('trigeminal-nerve', [[0.13, 15.98, -0.2], [0.22, 15.99, -0.1], gasser], 0.03, 0.034);
  add('trigeminal-nerve', [gasser, [0.3, 16.22, 0.4], [0.3, 16.5, 0.82]], 0.014, 0.007); // глазной
  add('trigeminal-nerve', [gasser, [0.36, 16.02, 0.4], [0.42, 16.0, 0.76]], 0.015, 0.008); // верхнечелюстной
  add('trigeminal-nerve', [gasser, [0.38, 15.75, 0.12], [0.42, 15.5, 0.45], [0.2, 15.38, 0.74]], 0.017, 0.008); // нижнечелюстной
  add('abducens-nerve', [[0.04, 15.92, -0.16], [0.12, 16.05, 0.0], [0.22, 16.24, 0.3], [0.31, 16.3, 0.5]], 0.008, 0.007);
  const stylomastoid: V3 = [0.6, 15.72, -0.12];
  add('facial-nerve', [[0.15, 15.9, -0.22], [0.42, 15.95, -0.2], [0.58, 15.92, -0.16], stylomastoid], 0.014);
  for (const end of [[0.58, 16.3, 0.5], [0.6, 15.95, 0.62], [0.52, 15.6, 0.62], [0.42, 15.3, 0.5]] as V3[]) add('facial-nerve', [stylomastoid, [0.66, (stylomastoid[1] + end[1]) / 2, 0.2], end], 0.009, 0.006);
  add('vestibulocochlear-nerve', [[0.16, 15.9, -0.25], [0.4, 15.96, -0.23], [0.62, 15.98, -0.22]], 0.016, 0.014);
  const jugularForamen: V3 = [0.38, 15.73, -0.34];
  add('glossopharyngeal-nerve', [[0.1, 15.8, -0.28], [0.24, 15.76, -0.32], jugularForamen, [0.36, 15.5, -0.05], [0.24, 15.35, 0.2]], 0.011, 0.008);
  add('accessory-nerve', [cordPoint(15.2), [0.07, 15.5, canalZ(15.5)], [0.12, 15.72, -0.36], jugularForamen, [0.52, 15.3, -0.25], [0.66, 14.9, -0.32], [1.0, 14.55, -0.48]], 0.011, 0.009);
  add('hypoglossal-nerve', [[0.06, 15.72, -0.3], [0.25, 15.68, -0.3], [0.36, 15.48, -0.05], [0.26, 15.36, 0.3], [0.12, 15.42, 0.56]], 0.012, 0.009);

  /* --- блуждающий нерв: общий участок шеи; дальше левый и правый идут по-разному --- */
  add('vagus-nerve', [[0.1, 15.77, -0.3], [0.26, 15.74, -0.34], jugularForamen, [0.46, 15.4, -0.02], [0.44, 14.6, 0.04]], 0.019, 0.017);

  /* --- симпатический ствол и узлы --- */
  const chain: V3[] = [];
  for (let y = 15.6; y > 9.95; y -= 0.15) {
    const x = y > 14.6 ? 0.26 : y > 11.4 ? 0.31 : 0.21;
    const z = y > 14.6 ? spineZ(y) + 0.12 : y > 11.4 ? spineZ(y) + 0.02 : spineZ(y) + 0.18;
    chain.push([x, y, z]);
  }
  for (const y of [9.8, 9.5, 9.2]) chain.push([0.13 - (9.8 - y) * 0.12, y, sacrumZ(y) + 0.05]);
  chain.push([0, 8.95, sacrumZ(8.95) + 0.03]);
  add('sympathetic-trunk', chain, 0.011);
  // соединительные ветви от узлов к грудным спинномозговым нервам
  for (const n of SPINAL_NERVES.filter((s) => s.region === 'thoracic' || s.name === 'L1' || s.name === 'L2')) {
    const o = outerOf(n);
    const g = chainAt(n.exitY);
    add('sympathetic-trunk', [o, [(o[0] + g[0]) / 2, (o[1] + g[1]) / 2 + 0.02, (o[2] + g[2]) / 2], g], 0.007);
  }
  // большой внутренностный нерв (T5–T9) к чревному узлу
  const celiacGanglion: V3 = [0.13, 11.3, -0.08];
  for (const name of ['T5', 'T7', 'T9']) {
    const g = chainAt(nerve(name).exitY);
    add('celiac-plexus', [g, [0.2, (g[1] + 11.3) / 2, spineZ((g[1] + 11.3) / 2) + 0.12], celiacGanglion], 0.009);
  }
  return paths;

  function chainAt(y: number): V3 {
    let best = chain[0];
    for (const p of chain) if (Math.abs(p[1] - y) < Math.abs(best[1] - y)) best = p;
    return best;
  }
}

/** Несимметричные пути: блуждающие нервы в груди и животе, чревное сплетение. */
function unpairedPaths(): NervePath[] {
  const paths: NervePath[] = [];
  const add = (part: string, points: V3[], r0: number, r1 = r0) => paths.push({ part, points, r: [r0, r1] });
  // концевая нить — продолжение мягкой оболочки от конуса до копчика
  add('cauda-equina', [cordPoint(CONUS_Y), cordPoint(10.4), [0, 9.6, canalZ(9.6)], [0, 9.0, sacrumZ(9.0) - 0.12]], 0.006);
  // диафрагмальные нервы в груди: левый огибает сердце по перикарду, правый идёт вдоль верхней полой вены
  const phrenicLeft: V3 = [0.92, 11.92, 0.02];
  const phrenicRight: V3 = [-0.8, 12.06, -0.08];
  add('phrenic-nerve', [[0.38, 14.4, 0.2], [0.72, 13.6, 0.34], [1.06, 12.8, 0.38], [1.08, 12.15, 0.22], phrenicLeft], 0.015, 0.012);
  add('phrenic-nerve', [[-0.38, 14.4, 0.2], [-0.56, 13.6, 0.22], [-0.74, 12.8, 0.16], [-0.76, 12.3, 0.04], phrenicRight], 0.015, 0.012);
  for (const [hub, s] of [[phrenicLeft, 1], [phrenicRight, -1]] as const) {
    for (const [x, z] of [[1.3, 0.1], [0.6, 0.25], [0.95, -0.4]] as const) {
      const end: V3 = [s * x, hub[1] - 0.14, z];
      add('phrenic-nerve', [hub, [(hub[0] + end[0]) / 2, hub[1] - 0.02, (hub[2] + end[2]) / 2], end], 0.008, 0.005);
    }
  }
  // левый блуждающий: через дугу аорты, позади корня лёгкого, по пищеводу, к передней стенке желудка
  add('vagus-nerve', [[0.44, 14.6, 0.04], [0.47, 14.05, 0.02], [0.38, 13.35, -0.3], [0.14, 12.55, -0.32], [0.08, 11.78, -0.18], [0.36, 11.3, 0.24], [0.66, 11.15, 0.42]], 0.016, 0.01);
  // возвратный гортанный нерв огибает дугу аорты и поднимается к гортани
  add('vagus-nerve', [[0.47, 14.05, 0.02], [0.4, 13.92, -0.2], [0.22, 14.1, -0.05], [0.12, 14.7, 0.15], [0.12, 15.05, 0.3]], 0.008);
  // правый блуждающий: позади корня лёгкого, по пищеводу, к задней стенке желудка и чревному сплетению
  add('vagus-nerve', [[-0.44, 14.6, 0.04], [-0.42, 14.1, 0.0], [-0.3, 13.35, -0.32], [-0.1, 12.55, -0.36], [-0.04, 11.78, -0.26], [0.18, 11.3, -0.02]], 0.016, 0.011);
  add('vagus-nerve', [[-0.45, 14.48, 0.02], [-0.5, 14.36, -0.12], [-0.3, 14.45, -0.05], [-0.12, 14.8, 0.15], [-0.12, 15.05, 0.3]], 0.008);
  // сердечные и лёгочные ветви
  for (const s of [1, -1]) {
    add('vagus-nerve', [[s * 0.44, 14.3, 0.03], [s * 0.3, 13.7, 0.1], [0.25, 13.25, 0.18]], 0.007);
    add('vagus-nerve', [[s * 0.37, 13.3, -0.3], [s * 0.6, 13.2, -0.25], [s * 0.85, 13.1, -0.15]], 0.007);
  }
  // чревное сплетение: два узла по бокам аорты у начала чревного ствола и лучи к органам
  const hub: V3 = [0.3, 11.3, -0.02];
  add('celiac-plexus', [[0.13, 11.3, -0.08], hub, [0.48, 11.3, -0.08]], 0.016);
  add('celiac-plexus', [[-0.13, 11.3, -0.1], [0.13, 11.3, -0.08]], 0.014);
  for (const end of [[0.62, 11.42, 0.36], [-0.62, 11.45, 0.38], [1.02, 11.34, -0.36], [0.78, 10.7, -0.5], [-0.72, 10.7, -0.5], [0.1, 10.4, 0.5]] as V3[]) {
    add('celiac-plexus', [hub, [(hub[0] + end[0]) / 2, (hub[1] + end[1]) / 2 + 0.03, (hub[2] + end[2]) / 2], end], 0.009, 0.005);
  }
  return paths;
}

/** Ход части, если правая её копия зеркальна: тогда путь задан один раз. */
export const NERVES: NervePath[] = (() => {
  const left = leftPaths();
  return [...left, ...left.map((p) => ({ ...p, points: flipX(p.points) })), ...unpairedPaths()];
})();

/* ---------------- Утолщения: узлы, рецепторы ---------------- */

function knots(): Knot[] {
  const list: Knot[] = [];
  const both = (part: string, at: V3, r: V3) => list.push({ part, at, r }, { part, at: [-at[0], at[1], at[2]], r });
  for (const n of SPINAL_NERVES) both('spinal-ganglia', foramenOf(n), [0.03, 0.026, 0.026]);
  // шейные узлы: верхний (крупный, веретеновидный), средний, звёздчатый
  both('sympathetic-ganglia', [0.26, 15.55, spineZ(15.55) + 0.12], [0.03, 0.08, 0.03]);
  both('sympathetic-ganglia', [0.26, 15.05, spineZ(15.05) + 0.12], [0.024, 0.03, 0.024]);
  both('sympathetic-ganglia', [0.3, 14.55, spineZ(14.55) + 0.08], [0.035, 0.045, 0.03]);
  for (const v of VERTEBRAE.thoracic.slice(1)) both('sympathetic-ganglia', [0.31, v.y - 0.12, spineZ(v.y - 0.12) + 0.02], [0.026, 0.03, 0.024]);
  for (const v of VERTEBRAE.lumbar.slice(0, 4)) both('sympathetic-ganglia', [0.21, v.y - 0.1, spineZ(v.y - 0.1) + 0.18], [0.024, 0.03, 0.024]);
  for (const y of [9.7, 9.5, 9.3, 9.15]) both('sympathetic-ganglia', [0.13 - (9.8 - y) * 0.12, y, sacrumZ(y) + 0.05], [0.02, 0.022, 0.02]);
  list.push({ part: 'sympathetic-ganglia', at: [0, 8.95, sacrumZ(8.95) + 0.03], r: [0.022, 0.02, 0.02] });
  // чревные узлы
  list.push({ part: 'celiac-plexus', at: [0.13, 11.3, -0.08], r: [0.05, 0.035, 0.03] });
  list.push({ part: 'celiac-plexus', at: [-0.13, 11.3, -0.1], r: [0.05, 0.035, 0.03] });
  // тройничный узел, обонятельные луковицы
  both('trigeminal-nerve', [0.3, 16.0, 0.02], [0.05, 0.03, 0.035]);
  both('olfactory-nerve', [0.06, 16.22, 0.6], [0.03, 0.022, 0.05]);
  return list;
}

export const KNOTS: Knot[] = knots();

/* ---------------- Рефлекторная дуга (левая рука) ---------------- */

/*
  Отдёргивание руки при уколе пальца, упрощённо до одного сегмента C6: чувствительный нейрон несёт
  сигнал от кожи указательного пальца в составе срединного нерва, его тело лежит в спинномозговом узле;
  в сером веществе спинного мозга сигнал переходит на вставочный нейрон, затем на двигательный,
  чей аксон идёт через плечевое сплетение и мышечно-кожный нерв к двуглавой мышце плеча — она сгибает руку.
*/
const shift = (pts: V3[], d: V3): V3[] => pts.map(([x, y, z]) => [x + d[0], y + d[1], z + d[2]]);
const C6 = nerve('C6');
const c6Cord = cordPoint(C6.originY);
const c6Foramen = foramenOf(C6);
const c6Outer = outerOf(C6);
const fingertip = FINGERS[0][FINGERS[0].length - 1];

export const REFLEX = (() => {
  const tip: V3 = [fingertip[0] + 0.03, fingertip[1] - 0.01, fingertip[2] + 0.06];
  const finger: V3[] = [...FINGERS[0]].reverse().slice(1).map(([x, y, z]): V3 => [x + 0.035, y, z + 0.06]);
  const sensoryArm = shift([
    tip, ...finger, PALM, [2.0, 8.62, -0.04], [1.94, 9.4, -0.13], [1.86, 10.2, -0.12], [1.7, 10.95, -0.02],
    [1.52, 12.0, -0.08], [1.42, 13.0, -0.08], [1.38, 13.7, -0.06], [1.3, 14.15, -0.03],
  ], [0, 0, 0]);
  const sensory: V3[] = [
    ...armPose(sensoryArm),
    [1.2, 14.3, -0.02], [0.98, 14.58, -0.02], [0.7, 14.92, -0.08], [0.55, 14.92, -0.12], c6Outer,
    [c6Foramen[0], c6Foramen[1] + 0.012, c6Foramen[2] - 0.02], [0.07, c6Cord[1] + 0.02, c6Cord[2] - 0.035], [0.025, c6Cord[1] + 0.01, c6Cord[2] - 0.02],
  ];
  const inter: V3[] = [[0.025, c6Cord[1] + 0.01, c6Cord[2] - 0.02], [0.02, c6Cord[1] - 0.005, c6Cord[2]], [0.028, c6Cord[1] - 0.012, c6Cord[2] + 0.022]];
  const motor: V3[] = [
    [0.028, c6Cord[1] - 0.012, c6Cord[2] + 0.022], [0.08, c6Cord[1] - 0.02, c6Cord[2] + 0.03],
    [c6Foramen[0], c6Foramen[1] - 0.012, c6Foramen[2] + 0.025], [c6Outer[0], c6Outer[1] - 0.015, c6Outer[2] + 0.03],
    [0.56, 14.84, -0.1], [0.74, 14.86, -0.08], [1.02, 14.53, -0.02], [1.27, 14.24, 0.0],
    ...armPose([[1.5, 13.9, 0.04], [1.62, 13.4, 0.12], [1.7, 12.9, 0.12], BICEPS]),
  ];
  return {
    receptor: armPoint(tip),
    sensory,
    inter,
    motor,
    muscle: armPoint(BICEPS),
    muscleRadius: [0.2, 0.62, 0.19] as V3,
    /** Доли цикла: укол, бег по чувствительному нейрону, переключение в мозге, бег к мышце, сокращение. */
    timing: { period: 4.2, sensory: [0.05, 0.5], inter: [0.5, 0.58], motor: [0.58, 0.9] },
  };
})();

/* ---------------- Подписи и подлёт камеры ---------------- */

/** Где ставить подпись части, если её не взять из середины первого пути. */
export const LABEL_OVERRIDE: Record<string, V3> = {
  brain: [0.45, 17.1, 0.2],
  cerebellum: [0.4, 15.95, -0.75],
  'spinal-cord': [0.06, 13.2, canalZ(13.2)],
  'cervical-enlargement': [0.08, 14.85, canalZ(14.85)],
  'lumbar-enlargement': [0.08, 11.75, canalZ(11.75)],
  'cauda-equina': [0.1, 10.4, canalZ(10.4)],
  'brachial-plexus': [1.0, 14.5, -0.1],
  'sciatic-nerve': [0.82, 7.6, -0.46],
  'spinal-ganglia': foramenOf(nerve('T6')),
  'sympathetic-ganglia': [0.31, 13.2, spineZ(13.2) + 0.02],
  'celiac-plexus': [0.3, 11.3, -0.02],
  'effector-muscle': armPoint([1.95, 12.6, 0.1]),
  'skin-receptor': armPoint([fingertip[0] + 0.03, fingertip[1], fingertip[2] + 0.06]),
  interneuron: [0.03, c6Cord[1], c6Cord[2]],
};

/** Подписи, видимые по умолчанию (не загромождаем фигуру). */
export const MAIN_LABELS = new Set(['brain', 'spinal-cord', 'brachial-plexus', 'sciatic-nerve', 'vagus-nerve']);
export const REFLEX_LABELS = new Set(['skin-receptor', 'sensory-neuron', 'interneuron', 'motor-neuron', 'effector-muscle']);

/** Масштаб, пол и вид фигуры — те же, что у кровеносной системы. */
export { BODY_FLOOR, BODY_SCALE, OVERVIEW_CAMERA, OVERVIEW_TARGET } from '../circulation/appearance';
/** Плечо, шея и спинной мозг для режима рефлекса (дм фигуры). */
export const REFLEX_BOX: { min: V3; max: V3 } = { min: [-0.2, 6.3, -0.9], max: [2.7, 15.5, 0.5] };
export const HEAD_BOX: { min: V3; max: V3 } = { min: [-0.8, 15.2, -0.6], max: [0.8, 16.7, 0.9] };
