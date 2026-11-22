import type { V3 } from '../body/geo';

/*
  Анатомические карты «Путь в теле» для каждого гормона (в дециметрах фигуры тела body/skin.ts):
  где гормон вырабатывается (body-source), к каким органам-мишеням доставляется по крови (body-targets)
  и какой контур торможения/выведения его нивелирует (body-brake).
*/

export type OrganNodeId =
  | 'brain'
  | 'hypothalamus'
  | 'pituitary'
  | 'pineal'
  | 'eye'
  | 'thyroid'
  | 'parathyroids'
  | 'heart'
  | 'lungs'
  | 'liver'
  | 'pancreas'
  | 'adrenal-cortex'
  | 'adrenal-medulla'
  | 'kidneys'
  | 'gut'
  | 'muscles'
  | 'bones'
  | 'vessels'
  | 'adipose'
  | 'ovaries'
  | 'testes'
  | 'uterus';

export interface OrganNodeSpec {
  pos: V3;
  r: V3;
  /** Парный орган (зеркалируется по x). */
  mirror?: boolean;
}

/** Точные анатомические координаты органов-источников и органов-мишеней в теле (дм). */
export const ORGAN_NODES: Record<OrganNodeId, OrganNodeSpec> = {
  brain: { pos: [0, 16.72, -0.05], r: [0.56, 0.44, 0.64] },
  hypothalamus: { pos: [0, 16.24, 0.04], r: [0.16, 0.11, 0.14] },
  pituitary: { pos: [0, 15.96, 0.13], r: [0.12, 0.09, 0.10] },
  pineal: { pos: [0, 16.30, -0.34], r: [0.09, 0.08, 0.11] },
  eye: { pos: [0.30, 16.33, 0.74], r: [0.11, 0.11, 0.11], mirror: true },
  thyroid: { pos: [0, 14.62, 0.24], r: [0.28, 0.24, 0.14] },
  parathyroids: { pos: [0.21, 14.62, 0.09], r: [0.06, 0.14, 0.06], mirror: true },
  heart: { pos: [0.32, 12.68, 0.30], r: [0.42, 0.46, 0.36] },
  lungs: { pos: [0.85, 13.05, -0.05], r: [0.46, 0.92, 0.50], mirror: true },
  liver: { pos: [-0.52, 11.65, 0.24], r: [0.68, 0.44, 0.46] },
  pancreas: { pos: [0.34, 10.92, 0.06], r: [0.62, 0.20, 0.18] },
  'adrenal-cortex': { pos: [0.68, 11.34, -0.48], r: [0.18, 0.14, 0.12], mirror: true },
  'adrenal-medulla': { pos: [0.68, 11.32, -0.48], r: [0.14, 0.12, 0.10], mirror: true },
  kidneys: { pos: [0.84, 10.70, -0.52], r: [0.26, 0.48, 0.22], mirror: true },
  gut: { pos: [0.0, 9.95, 0.35], r: [0.85, 0.62, 0.36] },
  muscles: { pos: [1.62, 12.45, -0.05], r: [0.28, 0.85, 0.28], mirror: true },
  bones: { pos: [0.76, 7.60, 0.0], r: [0.18, 1.35, 0.18], mirror: true },
  vessels: { pos: [0.22, 11.65, -0.22], r: [0.14, 1.65, 0.14] },
  adipose: { pos: [1.18, 10.05, 0.22], r: [0.32, 0.56, 0.42], mirror: true },
  ovaries: { pos: [0.50, 9.15, 0.08], r: [0.13, 0.16, 0.11], mirror: true },
  testes: { pos: [0.16, 8.36, 0.34], r: [0.12, 0.16, 0.12], mirror: true },
  uterus: { pos: [0, 9.18, 0.12], r: [0.24, 0.30, 0.18] },
};

export interface HormonePathwaySpec {
  sources: OrganNodeId[];
  targets: OrganNodeId[];
  /** Точка торможения / выведения (печень, почки, гипофиз, блуждающий нерв и т. п.). */
  brakes: OrganNodeId[];
  deliveryPaths: V3[][];
  brakePaths: V3[][];
  labelAt: {
    'body-source': V3;
    'body-targets': V3;
    'body-brake': V3;
  };
}

function arc(from: OrganNodeId, to: OrganNodeId, bendX = 0.25, bendZ = 0.22): V3[] {
  const a = ORGAN_NODES[from].pos;
  const b = ORGAN_NODES[to].pos;
  return [
    a,
    [(a[0] * 2 + b[0]) / 3 + bendX, (a[1] * 2 + b[1]) / 3, (a[2] * 2 + b[2]) / 3 + bendZ],
    [(a[0] + b[0] * 2) / 3 + bendX * 0.6, (a[1] + b[1] * 2) / 3, (a[2] + b[2] * 2) / 3 + bendZ * 0.8],
    b,
  ];
}

export const HORMONE_PATHWAYS: Record<string, HormonePathwaySpec> = {
  adrenalin: {
    sources: ['adrenal-medulla'],
    targets: ['heart', 'lungs', 'muscles', 'liver'],
    brakes: ['brain', 'liver'],
    deliveryPaths: [
      arc('adrenal-medulla', 'heart', -0.25, 0.28),
      arc('adrenal-medulla', 'lungs', 0.35, 0.18),
      arc('adrenal-medulla', 'muscles', 0.45, 0.20),
    ],
    brakePaths: [
      arc('brain', 'heart', -0.45, 0.22),
      arc('heart', 'liver', -0.35, 0.18),
    ],
    labelAt: { 'body-source': [-0.68, 11.32, -0.48], 'body-targets': [0.55, 13.15, 0.35], 'body-brake': [-0.28, 16.45, 0.15] },
  },
  noradrenalin: {
    sources: ['adrenal-medulla', 'brain'],
    targets: ['vessels', 'heart', 'brain'],
    brakes: ['liver', 'kidneys'],
    deliveryPaths: [
      arc('adrenal-medulla', 'heart', -0.20, 0.25),
      arc('brain', 'vessels', 0.35, 0.15),
      arc('adrenal-medulla', 'vessels', 0.15, 0.15),
    ],
    brakePaths: [arc('vessels', 'liver', -0.38, 0.22)],
    labelAt: { 'body-source': [0.75, 11.36, -0.45], 'body-targets': [0.35, 12.75, 0.36], 'body-brake': [-0.62, 11.68, 0.28] },
  },
  kortizol: {
    sources: ['adrenal-cortex'],
    targets: ['liver', 'muscles', 'brain'],
    brakes: ['hypothalamus', 'pituitary'],
    deliveryPaths: [
      arc('adrenal-cortex', 'liver', -0.35, 0.24),
      arc('adrenal-cortex', 'muscles', 0.42, 0.16),
      arc('pituitary', 'adrenal-cortex', 0.48, 0.08),
    ],
    brakePaths: [arc('adrenal-cortex', 'hypothalamus', -0.58, 0.22)],
    labelAt: { 'body-source': [0.76, 11.38, -0.45], 'body-targets': [-0.58, 11.70, 0.32], 'body-brake': [-0.25, 16.18, 0.16] },
  },
  serotonin: {
    sources: ['gut', 'brain'],
    targets: ['gut', 'brain', 'vessels'],
    brakes: ['liver', 'pineal'],
    deliveryPaths: [
      arc('gut', 'vessels', 0.32, 0.22),
      arc('brain', 'hypothalamus', 0.22, 0.16),
    ],
    brakePaths: [
      arc('gut', 'liver', -0.45, 0.22),
      arc('brain', 'pineal', -0.25, -0.18),
    ],
    labelAt: { 'body-source': [0.55, 9.95, 0.42], 'body-targets': [0.38, 16.68, 0.20], 'body-brake': [-0.58, 11.68, 0.28] },
  },
  dofamin: {
    sources: ['brain', 'hypothalamus'],
    targets: ['brain', 'pituitary', 'muscles'],
    brakes: ['liver', 'kidneys'],
    deliveryPaths: [
      arc('brain', 'pituitary', 0.25, 0.20),
      arc('brain', 'muscles', 0.55, 0.18),
    ],
    brakePaths: [arc('hypothalamus', 'liver', -0.48, 0.15)],
    labelAt: { 'body-source': [0.35, 16.65, 0.18], 'body-targets': [1.55, 12.50, 0.12], 'body-brake': [-0.58, 11.68, 0.28] },
  },
  endorfin: {
    sources: ['pituitary', 'hypothalamus'],
    targets: ['brain', 'muscles', 'heart'],
    brakes: ['liver', 'kidneys'],
    deliveryPaths: [
      arc('pituitary', 'brain', 0.30, 0.18),
      arc('pituitary', 'heart', 0.35, 0.24),
      arc('pituitary', 'muscles', 0.65, 0.22),
    ],
    brakePaths: [arc('heart', 'liver', -0.40, 0.20)],
    labelAt: { 'body-source': [0.18, 15.96, 0.20], 'body-targets': [1.55, 12.50, 0.12], 'body-brake': [-0.58, 11.68, 0.28] },
  },
  oksitocin: {
    sources: ['hypothalamus', 'pituitary'],
    targets: ['uterus', 'brain', 'heart'],
    brakes: ['liver', 'kidneys'],
    deliveryPaths: [
      arc('hypothalamus', 'pituitary', 0.12, 0.12),
      arc('pituitary', 'uterus', 0.42, 0.28),
      arc('pituitary', 'heart', 0.32, 0.26),
    ],
    brakePaths: [arc('uterus', 'kidneys', -0.45, -0.18)],
    labelAt: { 'body-source': [0.22, 16.24, 0.18], 'body-targets': [0.28, 9.22, 0.22], 'body-brake': [-0.75, 10.75, -0.35] },
  },
  melatonin: {
    sources: ['pineal'],
    targets: ['hypothalamus', 'brain', 'vessels'],
    brakes: ['eye', 'liver'],
    deliveryPaths: [
      arc('pineal', 'hypothalamus', 0.22, 0.10),
      arc('pineal', 'vessels', 0.42, 0.16),
    ],
    brakePaths: [
      arc('eye', 'pineal', -0.32, 0.12),
      arc('vessels', 'liver', -0.40, 0.22),
    ],
    labelAt: { 'body-source': [-0.20, 16.34, -0.30], 'body-targets': [0.35, 11.80, 0.10], 'body-brake': [0.42, 16.36, 0.72] },
  },
  tiroksin: {
    sources: ['thyroid'],
    targets: ['heart', 'brain', 'muscles', 'liver'],
    brakes: ['pituitary', 'hypothalamus'],
    deliveryPaths: [
      arc('thyroid', 'heart', 0.28, 0.22),
      arc('thyroid', 'muscles', 0.52, 0.18),
      arc('thyroid', 'liver', -0.32, 0.24),
    ],
    brakePaths: [arc('thyroid', 'pituitary', -0.36, 0.16)],
    labelAt: { 'body-source': [0.32, 14.66, 0.28], 'body-targets': [0.48, 12.70, 0.35], 'body-brake': [-0.24, 16.05, 0.20] },
  },
  somatotropin: {
    sources: ['pituitary'],
    targets: ['liver', 'bones', 'muscles'],
    brakes: ['hypothalamus'],
    deliveryPaths: [
      arc('pituitary', 'liver', -0.35, 0.26),
      arc('pituitary', 'muscles', 0.62, 0.20),
      arc('liver', 'bones', 0.36, 0.22),
    ],
    brakePaths: [arc('liver', 'hypothalamus', -0.62, 0.18)],
    labelAt: { 'body-source': [0.20, 15.96, 0.18], 'body-targets': [0.78, 8.20, 0.15], 'body-brake': [-0.24, 16.28, 0.16] },
  },
  insulin: {
    sources: ['pancreas'],
    targets: ['liver', 'muscles', 'adipose'],
    brakes: ['pancreas', 'liver', 'kidneys'],
    deliveryPaths: [
      arc('pancreas', 'liver', -0.25, 0.24),
      arc('pancreas', 'muscles', 0.45, 0.22),
      arc('pancreas', 'adipose', 0.35, 0.22),
    ],
    brakePaths: [arc('liver', 'pancreas', -0.15, 0.36)],
    labelAt: { 'body-source': [0.68, 11.00, 0.14], 'body-targets': [1.55, 12.40, 0.12], 'body-brake': [-0.58, 11.72, 0.30] },
  },
  glukagon: {
    sources: ['pancreas'],
    targets: ['liver', 'adipose'],
    brakes: ['pancreas', 'kidneys'],
    deliveryPaths: [
      arc('pancreas', 'liver', -0.22, 0.24),
      arc('pancreas', 'adipose', 0.36, 0.22),
    ],
    brakePaths: [arc('liver', 'kidneys', -0.45, -0.18)],
    labelAt: { 'body-source': [0.68, 11.00, 0.14], 'body-targets': [-0.58, 11.72, 0.30], 'body-brake': [0.88, 10.68, -0.42] },
  },
  leptin: {
    sources: ['adipose'],
    targets: ['hypothalamus', 'brain'],
    brakes: ['gut', 'kidneys'],
    deliveryPaths: [
      arc('adipose', 'hypothalamus', 0.55, 0.22),
      arc('adipose', 'brain', 0.45, 0.18),
    ],
    brakePaths: [
      arc('gut', 'hypothalamus', -0.48, 0.26),
      arc('adipose', 'kidneys', 0.22, -0.24),
    ],
    labelAt: { 'body-source': [1.18, 10.10, 0.35], 'body-targets': [0.22, 16.26, 0.18], 'body-brake': [-0.45, 9.95, 0.42] },
  },
  vazopressin: {
    sources: ['hypothalamus', 'pituitary'],
    targets: ['kidneys', 'vessels'],
    brakes: ['heart', 'hypothalamus'],
    deliveryPaths: [
      arc('hypothalamus', 'pituitary', 0.12, 0.12),
      arc('pituitary', 'kidneys', 0.48, 0.16),
      arc('pituitary', 'vessels', 0.32, 0.20),
    ],
    brakePaths: [arc('heart', 'kidneys', -0.35, 0.20)],
    labelAt: { 'body-source': [0.20, 16.10, 0.18], 'body-targets': [0.88, 10.72, -0.40], 'body-brake': [-0.32, 12.75, 0.35] },
  },
  aldosteron: {
    sources: ['adrenal-cortex'],
    targets: ['kidneys', 'vessels'],
    brakes: ['heart', 'liver'],
    deliveryPaths: [
      arc('adrenal-cortex', 'kidneys', 0.22, 0.14),
      arc('adrenal-cortex', 'vessels', -0.25, 0.18),
    ],
    brakePaths: [
      arc('heart', 'adrenal-cortex', -0.38, 0.24),
      arc('adrenal-cortex', 'liver', -0.32, 0.22),
    ],
    labelAt: { 'body-source': [0.76, 11.38, -0.45], 'body-targets': [0.92, 10.64, -0.44], 'body-brake': [-0.35, 12.72, 0.35] },
  },
  paratgormon: {
    sources: ['parathyroids'],
    targets: ['bones', 'kidneys', 'gut'],
    brakes: ['parathyroids', 'thyroid'],
    deliveryPaths: [
      arc('parathyroids', 'kidneys', 0.48, 0.18),
      arc('parathyroids', 'bones', 0.56, 0.22),
      arc('kidneys', 'gut', 0.28, 0.25),
    ],
    brakePaths: [arc('bones', 'parathyroids', -0.58, 0.20)],
    labelAt: { 'body-source': [0.30, 14.66, 0.16], 'body-targets': [0.80, 8.20, 0.16], 'body-brake': [-0.32, 14.62, 0.24] },
  },
  testosteron: {
    sources: ['testes'],
    targets: ['muscles', 'bones', 'brain'],
    brakes: ['hypothalamus', 'pituitary', 'liver'],
    deliveryPaths: [
      arc('testes', 'muscles', 0.58, 0.24),
      arc('testes', 'bones', 0.35, 0.16),
      arc('testes', 'brain', 0.45, 0.24),
    ],
    brakePaths: [arc('testes', 'hypothalamus', -0.56, 0.22)],
    labelAt: { 'body-source': [-0.24, 8.38, 0.40], 'body-targets': [1.58, 12.45, 0.14], 'body-brake': [-0.22, 16.20, 0.18] },
  },
  estrogeny: {
    sources: ['ovaries'],
    targets: ['uterus', 'bones', 'brain', 'vessels'],
    brakes: ['pituitary', 'liver'],
    deliveryPaths: [
      arc('ovaries', 'uterus', 0.12, 0.16),
      arc('ovaries', 'bones', 0.38, 0.16),
      arc('ovaries', 'brain', 0.48, 0.22),
    ],
    brakePaths: [
      arc('ovaries', 'pituitary', -0.52, 0.20),
      arc('ovaries', 'liver', -0.42, 0.24),
    ],
    labelAt: { 'body-source': [0.58, 9.18, 0.16], 'body-targets': [0.80, 8.20, 0.16], 'body-brake': [-0.58, 11.70, 0.30] },
  },
};
