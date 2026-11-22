import type { V3 } from '../body/geo';

/*
  Точные 3D-структуры молекул 18 основных гормонов человека:
  - 10 низкомолекулярных гормонов (амины, йодтиронины, стероиды): реальная 3D-геометрия колец,
    двойных связей и функциональных групп в цветах CPK (C, H, N, O, S, I).
  - 8 пептидных и белковых гормонов: 3D-ленты альфа-спиралей, циклические петли, золотистые
    дисульфидные мостики (S-S) и выделенные активные центры связывания с рецептором.
*/

export type ElementKey = 'C' | 'H' | 'N' | 'O' | 'S' | 'I';

export interface AtomSpec {
  id: number;
  el: ElementKey;
  pos: V3;
  partId: string;
}

export interface BondSpec {
  a: number;
  b: number;
  order: 1 | 2;
  partId: string;
}

export interface RibbonSegmentSpec {
  points: V3[];
  radius: number | [number, number];
  color: string;
  partId: string;
  /** Поперечное сечение ленты-спирали или тонкой петли. */
  kind: 'helix' | 'loop' | 'disulfide' | 'motif';
}

export interface ResidueMarkerSpec {
  pos: V3;
  radius: number;
  color: string;
  partId: string;
}

export interface MoleculeSpec {
  kind: 'atomic' | 'peptide';
  atoms: AtomSpec[];
  bonds: BondSpec[];
  ribbons: RibbonSegmentSpec[];
  markers: ResidueMarkerSpec[];
  /** Точки привязки 3D-подписей для каждой кликабельной части молекулы. */
  labelAt: Record<string, V3>;
}

export const CPK_COLORS: Record<ElementKey, string> = {
  C: '#444c5e',
  H: '#edf2f7',
  N: '#3474e6',
  O: '#e03e3e',
  S: '#ebc026',
  I: '#8f3ad4',
};

export const CPK_RADII: Record<ElementKey, number> = {
  C: 0.36,
  H: 0.21,
  N: 0.35,
  O: 0.33,
  S: 0.44,
  I: 0.54,
};

/* ---------------- Конструктор атомных молекул ---------------- */

class MolBuilder {
  atoms: AtomSpec[] = [];
  bonds: BondSpec[] = [];

  add(el: ElementKey, pos: V3, partId: string): number {
    const id = this.atoms.length;
    this.atoms.push({ id, el, pos, partId });
    return id;
  }

  bond(a: number, b: number, order: 1 | 2 = 1, partId?: string) {
    this.bonds.push({ a, b, order, partId: partId ?? this.atoms[a].partId });
  }

  /** Смещает центр масс молекулы в начало координат (0,0,0). */
  build(labelAt: Record<string, V3>): MoleculeSpec {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const a of this.atoms) {
      cx += a.pos[0];
      cy += a.pos[1];
      cz += a.pos[2];
    }
    const n = Math.max(1, this.atoms.length);
    cx /= n;
    cy /= n;
    cz /= n;
    const atoms = this.atoms.map((a) => ({
      ...a,
      pos: [a.pos[0] - cx, a.pos[1] - cy, a.pos[2] - cz] as V3,
    }));
    const shifted: Record<string, V3> = {};
    for (const [k, p] of Object.entries(labelAt)) {
      shifted[k] = [p[0] - cx, p[1] - cy, p[2] - cz];
    }
    return { kind: 'atomic', atoms, bonds: this.bonds, ribbons: [], markers: [], labelAt: shifted };
  }
}

/** Добавляет правильный бензольный цикл (6 атомов C с чередующимися двойными связями). */
function addBenzene(
  m: MolBuilder,
  cx: number,
  cy: number,
  cz: number,
  r: number,
  partId: string,
  tiltX = 0,
  tiltY = 0,
): number[] {
  const ids: number[] = [];
  const csX = Math.cos(tiltX);
  const snX = Math.sin(tiltX);
  const csY = Math.cos(tiltY);
  const snY = Math.sin(tiltY);
  for (let i = 0; i < 6; i++) {
    const ang = (i * Math.PI) / 3;
    const lx = Math.cos(ang) * r;
    const ly = Math.sin(ang) * r;
    const lz = 0;
    const y1 = ly * csX - lz * snX;
    const z1 = ly * snX + lz * csX;
    const x2 = lx * csY + z1 * snY;
    const z2 = -lx * snY + z1 * csY;
    ids.push(m.add('C', [cx + x2, cy + y1, cz + z2], partId));
  }
  for (let i = 0; i < 6; i++) {
    m.bond(ids[i], ids[(i + 1) % 6], i % 2 === 0 ? 2 : 1, partId);
  }
  return ids;
}

/** Добавляет катехольное кольцо (бензол + две орто-гидроксильные группы -OH) для катехоламинов. */
function buildCatecholamine(mode: 'adrenalin' | 'noradrenalin' | 'dofamin'): MoleculeSpec {
  const m = new MolBuilder();
  const ring = addBenzene(m, -1.65, 0, 0, 1.38, 'mol-core', 0.08, 0.06);
  // атомы H на свободных позициях бензольного кольца
  const hPos: [number, V3][] = [
    [1, [-0.95, 2.08, 0.14]],
    [5, [-0.95, -2.08, -0.14]],
    [4, [-3.02, -2.08, -0.14]],
  ];
  for (const [idx, p] of hPos) {
    const h = m.add('H', p, 'mol-core');
    m.bond(ring[idx], h, 1, 'mol-core');
  }
  // две гидроксильные группы (-OH) при C3 и C4 (отличительная черта катехоламинов!)
  const o3 = m.add('O', [-3.02, 2.25, 0.18], 'mol-core');
  const h3 = m.add('H', [-3.82, 2.55, 0.44], 'mol-core');
  m.bond(ring[2], o3, 1, 'mol-core');
  m.bond(o3, h3, 1, 'mol-core');

  const o4 = m.add('O', [-4.32, 0.04, 0.12], 'mol-core');
  const h4 = m.add('H', [-4.86, -0.68, 0.36], 'mol-core');
  m.bond(ring[3], o4, 1, 'mol-core');
  m.bond(o4, h4, 1, 'mol-core');

  // боковая этиловая цепь C_beta — C_alpha
  const cb = m.add('C', [1.05, 0.08, 0.16], 'mol-active');
  m.bond(ring[0], cb, 1, 'mol-active');
  if (mode === 'dofamin') {
    const hb1 = m.add('H', [1.18, 0.96, 0.72], 'mol-active');
    const hb2 = m.add('H', [1.22, -0.78, 0.76], 'mol-active');
    m.bond(cb, hb1, 1, 'mol-active');
    m.bond(cb, hb2, 1, 'mol-active');
  } else {
    // хиральная бета-гидроксильная группа -OH (у адреналина и норадреналина)
    const ob = m.add('O', [1.25, 1.38, 0.68], 'mol-active');
    const hob = m.add('H', [2.02, 1.66, 0.96], 'mol-active');
    const hb = m.add('H', [1.14, -0.74, 0.84], 'mol-active');
    m.bond(cb, ob, 1, 'mol-active');
    m.bond(ob, hob, 1, 'mol-active');
    m.bond(cb, hb, 1, 'mol-active');
  }

  const ca = m.add('C', [2.20, -0.26, -0.80], 'mol-tail');
  m.bond(cb, ca, 1, 'mol-tail');
  m.bond(ca, m.add('H', [2.16, -1.28, -1.16], 'mol-tail'), 1, 'mol-tail');
  m.bond(ca, m.add('H', [2.08, 0.42, -1.62], 'mol-tail'), 1, 'mol-tail');

  // аминогруппа (-NH2 у дофамина/норадреналина или -NH-CH3 у адреналина!)
  const n = m.add('N', [3.50, 0.06, -0.22], 'mol-tail');
  m.bond(ca, n, 1, 'mol-tail');
  m.bond(n, m.add('H', [3.62, 1.02, -0.02], 'mol-tail'), 1, 'mol-tail');

  if (mode === 'adrenalin') {
    // метильная группа -CH3 отличает адреналин от норадреналина и даёт мощное сродство к бета-2 рецепторам!
    const cm = m.add('C', [4.62, -0.45, -1.00], 'mol-tail');
    m.bond(n, cm, 1, 'mol-tail');
    m.bond(cm, m.add('H', [5.52, -0.18, -0.50], 'mol-tail'), 1, 'mol-tail');
    m.bond(cm, m.add('H', [4.58, -1.50, -1.10], 'mol-tail'), 1, 'mol-tail');
    m.bond(cm, m.add('H', [4.60, 0.02, -1.96], 'mol-tail'), 1, 'mol-tail');
  } else {
    m.bond(n, m.add('H', [4.26, -0.32, -0.78], 'mol-tail'), 1, 'mol-tail');
  }

  return m.build({
    'mol-core': [-2.6, 1.85, 0.4],
    'mol-active': [1.15, 1.55, 0.85],
    'mol-tail': [3.95, -0.95, -0.5],
  });
}

/** Индольное бициклическое ядро (бензол + пиррол с N) для серотонина и мелатонина. */
function buildIndoleamine(mode: 'serotonin' | 'melatonin'): MoleculeSpec {
  const m = new MolBuilder();
  const ring = addBenzene(m, -1.95, 0, 0, 1.38, 'mol-core', 0.06, 0.05);
  // конденсированное пятичленное пиррольное кольцо справа от ребра ring[0]—ring[5]
  const c3 = m.add('C', [0.68, 0.92, 0.08], 'mol-core');
  const c2 = m.add('C', [1.46, -0.22, -0.04], 'mol-core');
  const n1 = m.add('N', [0.64, -1.36, -0.14], 'mol-core');
  m.bond(ring[0], c3, 1, 'mol-core');
  m.bond(c3, c2, 2, 'mol-core');
  m.bond(c2, n1, 1, 'mol-core');
  m.bond(n1, ring[5], 1, 'mol-core');
  m.bond(n1, m.add('H', [0.92, -2.30, -0.24], 'mol-core'), 1, 'mol-core');
  m.bond(c2, m.add('H', [2.52, -0.24, -0.06], 'mol-core'), 1, 'mol-core');
  m.bond(ring[1], m.add('H', [-1.22, 2.08, 0.14], 'mol-core'), 1, 'mol-core');
  m.bond(ring[3], m.add('H', [-4.30, 0.04, 0.12], 'mol-core'), 1, 'mol-core');
  m.bond(ring[4], m.add('H', [-3.30, -2.08, -0.12], 'mol-core'), 1, 'mol-core');

  // 5-гидроксигруппа (-OH у серотонина) или 5-метоксигруппа (-OCH3 у мелатонина!)
  const o5 = m.add('O', [-3.36, 2.22, 0.22], 'mol-active');
  m.bond(ring[2], o5, 1, 'mol-active');
  if (mode === 'serotonin') {
    m.bond(o5, m.add('H', [-4.22, 2.48, 0.44], 'mol-active'), 1, 'mol-active');
  } else {
    const cme = m.add('C', [-4.58, 2.42, 0.88], 'mol-active');
    m.bond(o5, cme, 1, 'mol-active');
    m.bond(cme, m.add('H', [-5.30, 2.84, 0.24], 'mol-active'), 1, 'mol-active');
    m.bond(cme, m.add('H', [-4.94, 1.48, 1.24], 'mol-active'), 1, 'mol-active');
    m.bond(cme, m.add('H', [-4.44, 3.10, 1.70], 'mol-active'), 1, 'mol-active');
  }

  // боковая этиламиновая цепь от C3
  const cb = m.add('C', [1.34, 2.24, 0.36], 'mol-tail');
  const ca = m.add('C', [2.72, 2.28, -0.26], 'mol-tail');
  const nt = m.add('N', [3.46, 3.46, 0.18], 'mol-tail');
  m.bond(c3, cb, 1, 'mol-tail');
  m.bond(cb, ca, 1, 'mol-tail');
  m.bond(ca, nt, 1, 'mol-tail');
  m.bond(cb, m.add('H', [1.44, 2.38, 1.42], 'mol-tail'), 1, 'mol-tail');
  m.bond(cb, m.add('H', [0.74, 3.04, -0.02], 'mol-tail'), 1, 'mol-tail');
  m.bond(ca, m.add('H', [3.26, 1.40, 0.04], 'mol-tail'), 1, 'mol-tail');
  m.bond(ca, m.add('H', [2.64, 2.22, -1.32], 'mol-tail'), 1, 'mol-tail');
  m.bond(nt, m.add('H', [3.02, 4.32, -0.06], 'mol-tail'), 1, 'mol-tail');

  if (mode === 'serotonin') {
    m.bond(nt, m.add('H', [4.42, 3.44, -0.10], 'mol-tail'), 1, 'mol-tail');
  } else {
    // N-ацетильная группа (-CO-CH3) — ключевой признак мелатонина!
    const cCarb = m.add('C', [4.70, 3.44, 0.72], 'mol-tail');
    const oCarb = m.add('O', [5.26, 2.40, 0.96], 'mol-tail');
    const cMet = m.add('C', [5.38, 4.74, 1.04], 'mol-tail');
    m.bond(nt, cCarb, 1, 'mol-tail');
    m.bond(cCarb, oCarb, 2, 'mol-tail');
    m.bond(cCarb, cMet, 1, 'mol-tail');
    m.bond(cMet, m.add('H', [6.36, 4.60, 1.44], 'mol-tail'), 1, 'mol-tail');
    m.bond(cMet, m.add('H', [5.46, 5.34, 0.16], 'mol-tail'), 1, 'mol-tail');
    m.bond(cMet, m.add('H', [4.80, 5.26, 1.78], 'mol-tail'), 1, 'mol-tail');
  }

  return m.build({
    'mol-core': [-1.4, -1.65, 0.25],
    'mol-active': [-3.85, 2.45, 0.6],
    'mol-tail': [3.85, 3.65, 0.55],
  });
}

/** Тироксин (T4): два повёрнутых фенильных кольца через эфирный кислород + 4 крупных фиолетовых атома йода! */
function buildThyroxine(): MoleculeSpec {
  const m = new MolBuilder();
  // внешнее кольцо (несёт 4'-OH и атомы йода 3', 5')
  const outer = addBenzene(m, -2.85, 0.55, 0.35, 1.36, 'mol-core', 0.35, 0.55);
  // внутреннее кольцо (несёт аланиновый хвост и атомы йода 3, 5)
  const inner = addBenzene(m, 1.45, -0.35, -0.25, 1.36, 'mol-core', -0.25, -0.38);
  // эфирный кислород-мостик между двумя кольцами под углом ~120°
  const oBridge = m.add('O', [-0.72, 0.35, 0.12], 'mol-core');
  m.bond(outer[0], oBridge, 1, 'mol-core');
  m.bond(oBridge, inner[3], 1, 'mol-core');

  // 4'-OH группа на внешнем кольце
  const o4p = m.add('O', [-5.35, 0.85, 0.85], 'mol-core');
  m.bond(outer[3], o4p, 1, 'mol-core');
  m.bond(o4p, m.add('H', [-5.95, 0.22, 1.25], 'mol-core'), 1, 'mol-core');

  // 4 характерных крупных атома ЙОДА (I) в положениях 3', 5', 3, 5 — главная особенность тироксина!
  const i1 = m.add('I', [-3.98, 2.86, 1.18], 'mol-active');
  const i2 = m.add('I', [-3.82, -1.78, -0.38], 'mol-active');
  const i3 = m.add('I', [0.32, 1.98, -1.02], 'mol-active');
  const i4 = m.add('I', [0.46, -2.68, 0.52], 'mol-active');
  m.bond(outer[2], i1, 1, 'mol-active');
  m.bond(outer[4], i2, 1, 'mol-active');
  m.bond(inner[2], i3, 1, 'mol-active');
  m.bond(inner[4], i4, 1, 'mol-active');

  // аланиновая аминокислотная цепь (-CH2-CH(NH2)-COOH) справа
  const cb = m.add('C', [3.95, -0.56, -0.58], 'mol-tail');
  const ca = m.add('C', [4.88, 0.55, 0.02], 'mol-tail');
  const n = m.add('N', [4.62, 1.84, -0.60], 'mol-tail');
  const cAcid = m.add('C', [6.32, 0.18, -0.18], 'mol-tail');
  const o1 = m.add('O', [6.76, -0.92, -0.52], 'mol-tail');
  const o2 = m.add('O', [7.14, 1.22, 0.08], 'mol-tail');
  m.bond(inner[0], cb, 1, 'mol-tail');
  m.bond(cb, ca, 1, 'mol-tail');
  m.bond(ca, n, 1, 'mol-tail');
  m.bond(ca, cAcid, 1, 'mol-tail');
  m.bond(cAcid, o1, 2, 'mol-tail');
  m.bond(cAcid, o2, 1, 'mol-tail');
  m.bond(o2, m.add('H', [8.06, 0.94, -0.02], 'mol-tail'), 1, 'mol-tail');
  m.bond(n, m.add('H', [5.14, 2.58, -0.18], 'mol-tail'), 1, 'mol-tail');
  m.bond(n, m.add('H', [3.66, 2.08, -0.56], 'mol-tail'), 1, 'mol-tail');

  return m.build({
    'mol-core': [-1.0, -0.75, 0.65],
    'mol-active': [-3.95, 2.95, 1.25],
    'mol-tail': [5.45, 1.55, 0.35],
  });
}

/** 4-кольцевой стероидный скелет (A-B-C-D из холестерина) в объёмной конформации кресла для кортизола, альдостерона, тестостерона и эстрадиола. */
function buildSteroid(kind: 'kortizol' | 'aldosteron' | 'testosteron' | 'estrogeny'): MoleculeSpec {
  const m = new MolBuilder();
  const aromaticA = kind === 'estrogeny';
  // 17 атомов углерода стероидного ядра (циклопентанпергидрофенантрен) с реалистичным 3D-изгибом
  const coords: V3[] = [
    [-3.18, 0.88, aromaticA ? 0.0 : 0.24],   // 0: C1
    [-4.46, 0.32, aromaticA ? 0.0 : -0.18],  // 1: C2
    [-4.54, -1.06, aromaticA ? 0.0 : 0.05],  // 2: C3
    [-3.32, -1.82, aromaticA ? 0.0 : 0.04],  // 3: C4
    [-2.04, -1.24, aromaticA ? 0.0 : 0.02],  // 4: C5
    [-0.78, -2.02, -0.22],                   // 5: C6
    [0.50, -1.36, 0.14],                     // 6: C7
    [0.48, 0.08, -0.22],                     // 7: C8
    [-0.76, 0.78, 0.18],                     // 8: C9
    [-1.98, 0.12, aromaticA ? 0.0 : -0.12],  // 9: C10
    [-0.78, 2.24, -0.16],                    // 10: C11
    [0.50, 2.90, 0.20],                      // 11: C12
    [1.76, 2.18, -0.14],                     // 12: C13
    [1.70, 0.76, 0.20],                      // 13: C14
    [3.04, 0.24, -0.08],                     // 14: C15
    [3.88, 1.44, 0.22],                      // 15: C16
    [3.08, 2.66, -0.06],                     // 16: C17
  ];
  const c = coords.map((p) => m.add('C', p, 'mol-core'));

  // связи 4 сочленённых колец A, B, C, D
  const ringBonds: [number, number, 1 | 2][] = [
    [0, 1, aromaticA ? 2 : 1],
    [1, 2, 1],
    [2, 3, aromaticA ? 2 : 1],
    [3, 4, aromaticA ? 1 : 2], // C4=C5 у тестостерона, кортизола, альдостерона
    [4, 9, aromaticA ? 2 : 1],
    [9, 0, 1],
    [4, 5, 1],
    [5, 6, 1],
    [6, 7, 1],
    [7, 8, 1],
    [8, 9, 1],
    [8, 10, 1],
    [10, 11, 1],
    [11, 12, 1],
    [12, 13, 1],
    [13, 7, 1],
    [13, 14, 1],
    [14, 15, 1],
    [15, 16, 1],
    [16, 12, 1],
  ];
  for (const [a, b, ord] of ringBonds) m.bond(c[a], c[b], ord, 'mol-core');

  // угловая метильная группа C19 на C10 (у эстрадиола отсутствует из-за ароматизации кольца A!)
  if (!aromaticA) {
    const c19 = m.add('C', [-1.96, 0.34, -1.58], 'mol-core');
    m.bond(c[9], c19, 1, 'mol-core');
    m.bond(c19, m.add('H', [-2.82, 0.02, -2.06], 'mol-core'), 1, 'mol-core');
    m.bond(c19, m.add('H', [-1.14, -0.14, -2.02], 'mol-core'), 1, 'mol-core');
  }

  // угловая группа C18 на C13 (метил, а у альдостерона — знаменитая альдегидная группа -CHO!)
  const c18 = m.add('C', [1.80, 2.46, -1.62], kind === 'aldosteron' ? 'mol-active' : 'mol-core');
  m.bond(c[12], c18, 1, kind === 'aldosteron' ? 'mol-active' : 'mol-core');
  if (kind === 'aldosteron') {
    const o18 = m.add('O', [1.02, 3.16, -2.26], 'mol-active');
    const h18 = m.add('H', [2.56, 2.02, -2.18], 'mol-active');
    m.bond(c18, o18, 2, 'mol-active');
    m.bond(c18, h18, 1, 'mol-active');
  } else {
    m.bond(c18, m.add('H', [1.02, 2.04, -2.16], 'mol-core'), 1, 'mol-core');
    m.bond(c18, m.add('H', [2.70, 2.10, -2.04], 'mol-core'), 1, 'mol-core');
  }

  // группа при C3 на кольце A: фенольный -OH у эстрадиола, кетон =O у остальных
  const o3 = m.add('O', [-5.72, -1.56, 0.14], 'mol-active');
  m.bond(c[2], o3, aromaticA ? 1 : 2, 'mol-active');
  if (aromaticA) {
    m.bond(o3, m.add('H', [-5.78, -2.50, 0.24], 'mol-active'), 1, 'mol-active');
  }

  // 11β-OH группа (ключевая для кортизола и альдостерона!)
  if (kind === 'kortizol' || kind === 'aldosteron') {
    const o11 = m.add('O', [-1.02, 2.66, -1.48], 'mol-active');
    m.bond(c[10], o11, 1, 'mol-active');
    m.bond(o11, m.add('H', [-1.84, 3.10, -1.64], 'mol-active'), 1, 'mol-active');
  }

  // заместители при C17 на кольце D
  if (kind === 'testosteron' || kind === 'estrogeny') {
    const o17 = m.add('O', [3.74, 3.84, -0.46], 'mol-tail');
    m.bond(c[16], o17, 1, 'mol-tail');
    m.bond(o17, m.add('H', [4.58, 3.68, -0.88], 'mol-tail'), 1, 'mol-tail');
  } else {
    // 2-углеродная кортикостероидная цепь (-CO-CH2OH) при C17
    const c20 = m.add('C', [3.78, 3.86, -0.58], 'mol-tail');
    const o20 = m.add('O', [3.20, 4.92, -0.68], 'mol-tail');
    const c21 = m.add('C', [5.22, 3.68, -0.96], 'mol-tail');
    const o21 = m.add('O', [5.86, 4.86, -1.38], 'mol-tail');
    m.bond(c[16], c20, 1, 'mol-tail');
    m.bond(c20, o20, 2, 'mol-tail');
    m.bond(c20, c21, 1, 'mol-tail');
    m.bond(c21, o21, 1, 'mol-tail');
    m.bond(o21, m.add('H', [6.76, 4.70, -1.62], 'mol-tail'), 1, 'mol-tail');
    if (kind === 'kortizol') {
      // 17α-гидроксильная группа (отличает глюкокортикоид кортизол)
      const o17a = m.add('O', [3.16, 3.06, 1.28], 'mol-tail');
      m.bond(c[16], o17a, 1, 'mol-tail');
      m.bond(o17a, m.add('H', [2.46, 3.62, 1.58], 'mol-tail'), 1, 'mol-tail');
    }
  }

  return m.build({
    'mol-core': [-0.6, -1.65, 0.35],
    'mol-active': kind === 'aldosteron' ? [1.1, 3.35, -2.1] : [-5.1, -1.75, 0.35],
    'mol-tail': [4.2, 4.05, -0.55],
  });
}

/* ---------------- Конструктор пептидных и белковых 3D-лент ---------------- */

/** Генерирует плавную 3D-альфа-спираль между точками a и b с реалистичным шагом витка. */
function helixCurve(a: V3, b: V3, turns: number, amp = 0.44, phase = 0): V3[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const tx = dx / len;
  const ty = dy / len;
  const tz = dz / len;
  // ортонормированный базис вокруг оси спирали
  const ref: V3 = Math.abs(ty) < 0.85 ? [0, 1, 0] : [1, 0, 0];
  let ux = ty * ref[2] - tz * ref[1];
  let uy = tz * ref[0] - tx * ref[2];
  let uz = tx * ref[1] - ty * ref[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = ty * uz - tz * uy;
  const vy = tz * ux - tx * uz;
  const vz = tx * uy - ty * ux;

  const steps = Math.max(24, Math.round(turns * 16));
  const pts: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = phase + t * turns * Math.PI * 2;
    const cs = Math.cos(ang) * amp;
    const sn = Math.sin(ang) * amp;
    pts.push([
      a[0] + dx * t + ux * cs + vx * sn,
      a[1] + dy * t + uy * cs + vy * sn,
      a[2] + dz * t + uz * cs + vz * sn,
    ]);
  }
  return pts;
}

function buildEndorphin(): MoleculeSpec {
  // Бета-эндорфин (31 аминокислота): N-концевой опиоидный ключ Tyr-Gly-Gly-Phe-Met + амфипатическая альфа-спираль!
  const motifPts: V3[] = [
    [-3.65, -0.55, 0.40],
    [-3.15, 0.28, 0.65],
    [-2.42, 0.72, 0.35],
    [-1.78, 0.20, -0.15],
    [-1.12, -0.10, 0.10],
  ];
  const helixPts = helixCurve([-1.12, -0.10, 0.10], [2.45, 0.52, -0.12], 4.2, 0.46, 0.2);
  const tailPts: V3[] = [
    helixPts[helixPts.length - 1],
    [3.12, 0.28, 0.42],
    [3.72, -0.35, 0.24],
    [4.12, -0.78, -0.22],
  ];
  // выделенные бусины остатков Tyr1 и Phe4 (опиоидный «ключ» к мю-рецептору)
  const markers: ResidueMarkerSpec[] = [
    { pos: [-3.65, -0.55, 0.40], radius: 0.34, color: '#f5b832', partId: 'mol-active' },
    { pos: [-2.42, 0.72, 0.35], radius: 0.28, color: '#f5b832', partId: 'mol-active' },
    { pos: [-1.78, 0.20, -0.15], radius: 0.26, color: '#ff9642', partId: 'mol-active' },
    { pos: [0.35, 0.68, 0.36], radius: 0.22, color: '#b482f0', partId: 'mol-core' },
    { pos: [1.55, -0.16, 0.38], radius: 0.22, color: '#b482f0', partId: 'mol-core' },
    { pos: [4.12, -0.78, -0.22], radius: 0.24, color: '#64c6d8', partId: 'mol-tail' },
  ];
  return {
    kind: 'peptide',
    atoms: [],
    bonds: [],
    ribbons: [
      { points: motifPts, radius: 0.19, color: '#f5b832', partId: 'mol-active', kind: 'motif' },
      { points: helixPts, radius: [0.22, 0.11], color: '#9155d6', partId: 'mol-core', kind: 'helix' },
      { points: tailPts, radius: 0.14, color: '#58b8cc', partId: 'mol-tail', kind: 'loop' },
    ],
    markers,
    labelAt: {
      'mol-active': [-3.1, 0.35, 0.65],
      'mol-core': [0.65, 1.35, 0.45],
      'mol-tail': [3.75, -0.85, 0.35],
    },
  };
}

/** Окситоцин и вазопрессин (близнецы из 9 аминокислот с кольцом Cys1-Cys6 и хвостом из 3 остатков). */
function buildNonapeptide(kind: 'oksitocin' | 'vazopressin'): MoleculeSpec {
  const accent = kind === 'oksitocin' ? '#d95788' : '#2c82b8';
  const tailCol = kind === 'oksitocin' ? '#f29cb8' : '#5cb6e6';
  // 6-членное кольцо из остатков 1..6
  const ringPts: V3[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const ang = -0.35 + t * Math.PI * 1.72;
    ringPts.push([
      -0.85 + Math.cos(ang) * 1.68,
      Math.sin(ang) * 1.52,
      0.34 * Math.sin(ang * 2),
    ]);
  }
  const cys1 = ringPts[0];
  const cys6 = ringPts[ringPts.length - 1];
  // дисульфидный мостик S—S, замыкающий кольцо!
  const midS1: V3 = [
    cys1[0] * 0.65 + cys6[0] * 0.35 + 0.18,
    cys1[1] * 0.65 + cys6[1] * 0.35,
    0.25,
  ];
  const midS2: V3 = [
    cys1[0] * 0.35 + cys6[0] * 0.65 + 0.18,
    cys1[1] * 0.35 + cys6[1] * 0.65,
    0.25,
  ];
  const ssPts: V3[] = [cys1, midS1, midS2, cys6];
  // хвост из 3 аминокислот (Pro7-Leu8/Arg8-Gly9)
  const tailPts: V3[] = [
    cys6,
    [cys6[0] + 0.95, cys6[1] - 0.58, 0.32],
    [cys6[0] + 1.98, cys6[1] - 0.24, -0.18],
    [cys6[0] + 2.75, cys6[1] - 0.96, 0.15],
  ];
  // бусины ключевых аминокислот (в позиции 3 и 8 — главные 2 отличия между окситоцином и вазопрессином!)
  const markers: ResidueMarkerSpec[] = [
    { pos: midS1, radius: 0.26, color: '#f2c428', partId: 'mol-active' },
    { pos: midS2, radius: 0.26, color: '#f2c428', partId: 'mol-active' },
    // позиция 3 (Ile3 у окситоцина, Phe3 у вазопрессина)
    { pos: ringPts[11], radius: 0.30, color: kind === 'oksitocin' ? '#ff92b8' : '#78d4ff', partId: 'mol-core' },
    { pos: ringPts[20], radius: 0.24, color: accent, partId: 'mol-core' },
    // позиция 8 в хвосте (Leu8 у окситоцина, заряженный Arg8 у вазопрессина — ключ к почкам!)
    { pos: tailPts[2], radius: 0.34, color: kind === 'oksitocin' ? '#f5b842' : '#42c4ff', partId: 'mol-tail' },
    { pos: tailPts[3], radius: 0.24, color: tailCol, partId: 'mol-tail' },
  ];
  return {
    kind: 'peptide',
    atoms: [],
    bonds: [],
    ribbons: [
      { points: ringPts, radius: [0.22, 0.13], color: accent, partId: 'mol-core', kind: 'helix' },
      { points: ssPts, radius: 0.14, color: '#f2c428', partId: 'mol-active', kind: 'disulfide' },
      { points: tailPts, radius: 0.15, color: tailCol, partId: 'mol-tail', kind: 'loop' },
    ],
    markers,
    labelAt: {
      'mol-core': [-2.1, 1.35, 0.35],
      'mol-active': [0.85, -0.35, 0.45],
      'mol-tail': [2.55, -1.65, 0.25],
    },
  };
}

function buildInsulin(): MoleculeSpec {
  // Инсулин (51 aa): две цепи — A (21 aa, бирюзовая) и B (30 aa, коралловая) + 3 золотистых S-S мостика!
  const aH1 = helixCurve([-2.15, 1.35, 0.45], [-0.42, 1.48, 0.85], 2.2, 0.36, 0);
  const aLoop: V3[] = [aH1[aH1.length - 1], [0.45, 1.65, 0.35], [0.78, 1.15, -0.25]];
  const aH2 = helixCurve([0.78, 1.15, -0.25], [2.35, 0.92, 0.38], 2.3, 0.36, 1.1);

  const bN: V3[] = [[-3.15, -0.65, 0.20], [-2.18, -0.32, 0.48], [-1.35, -0.58, 0.22]];
  const bHelix = helixCurve([-1.35, -0.58, 0.22], [1.62, -0.78, -0.20], 3.4, 0.42, 0.5);
  const bC: V3[] = [
    bHelix[bHelix.length - 1],
    [2.45, -1.05, 0.35],
    [3.18, -0.45, 0.65],
    [3.58, 0.25, 0.42],
  ];

  // 3 дисульфидных мостика: A7-B7, A20-B19 (межцепочечные) и A6-A11 (внутри цепи A)
  const ss1: V3[] = [[-1.12, 1.25, 0.62], [-1.18, 0.38, 0.50], [-1.15, -0.42, 0.35]];
  const ss2: V3[] = [[1.78, 0.88, 0.16], [1.74, 0.08, 0.02], [1.62, -0.68, -0.10]];
  const ss3: V3[] = [[-1.65, 1.62, 0.58], [-0.95, 2.02, 0.68], [-0.36, 1.62, 0.72]];

  const markers: ResidueMarkerSpec[] = [
    { pos: ss1[1], radius: 0.22, color: '#f2c428', partId: 'mol-active' },
    { pos: ss2[1], radius: 0.22, color: '#f2c428', partId: 'mol-active' },
    { pos: ss3[1], radius: 0.20, color: '#f2c428', partId: 'mol-active' },
    { pos: bC[2], radius: 0.28, color: '#ff8a70', partId: 'mol-tail' },
  ];

  return {
    kind: 'peptide',
    atoms: [],
    bonds: [],
    ribbons: [
      { points: aH1, radius: [0.20, 0.10], color: '#2ea888', partId: 'mol-core', kind: 'helix' },
      { points: aLoop, radius: 0.12, color: '#2ea888', partId: 'mol-core', kind: 'loop' },
      { points: aH2, radius: [0.20, 0.10], color: '#2ea888', partId: 'mol-core', kind: 'helix' },
      { points: bN, radius: 0.13, color: '#e06458', partId: 'mol-tail', kind: 'loop' },
      { points: bHelix, radius: [0.22, 0.11], color: '#e06458', partId: 'mol-tail', kind: 'helix' },
      { points: bC, radius: 0.14, color: '#f08268', partId: 'mol-tail', kind: 'motif' },
      { points: ss1, radius: 0.11, color: '#f2c428', partId: 'mol-active', kind: 'disulfide' },
      { points: ss2, radius: 0.11, color: '#f2c428', partId: 'mol-active', kind: 'disulfide' },
      { points: ss3, radius: 0.10, color: '#f2c428', partId: 'mol-active', kind: 'disulfide' },
    ],
    markers,
    labelAt: {
      'mol-core': [-1.45, 2.05, 0.65],
      'mol-active': [0.35, 0.28, 0.65],
      'mol-tail': [2.45, -1.35, 0.45],
    },
  };
}

function buildGlucagon(): MoleculeSpec {
  // Глюкагон (29 aa): элегантная изогнутая альфа-спираль с N-концевым активатором рецептора
  const nHead: V3[] = [[-3.45, 0.72, 0.35], [-2.72, 0.48, 0.52], [-2.05, 0.15, 0.18]];
  const helix = helixCurve([-2.05, 0.15, 0.18], [2.15, -0.35, -0.15], 5.2, 0.44, 0.4);
  const cEnd: V3[] = [helix[helix.length - 1], [2.95, -0.18, 0.32], [3.52, 0.35, 0.20]];
  return {
    kind: 'peptide',
    atoms: [],
    bonds: [],
    ribbons: [
      { points: nHead, radius: 0.17, color: '#f5b832', partId: 'mol-active', kind: 'motif' },
      { points: helix, radius: [0.22, 0.11], color: '#cc7c20', partId: 'mol-core', kind: 'helix' },
      { points: cEnd, radius: 0.16, color: '#e6a84c', partId: 'mol-tail', kind: 'loop' },
    ],
    markers: [
      { pos: nHead[0], radius: 0.32, color: '#f5b832', partId: 'mol-active' },
      { pos: cEnd[2], radius: 0.26, color: '#e6a84c', partId: 'mol-tail' },
    ],
    labelAt: {
      'mol-active': [-3.15, 1.05, 0.45],
      'mol-core': [0.1, 0.85, 0.45],
      'mol-tail': [3.35, 0.75, 0.35],
    },
  };
}

/** Четырёхспиральный пучок цитокинового семейства: гормон роста (191 aa) и лептин (167 aa). */
function buildFourHelixBundle(kind: 'somatotropin' | 'leptin'): MoleculeSpec {
  const c1 = kind === 'somatotropin' ? '#3688c4' : '#469e46';
  const c2 = kind === 'somatotropin' ? '#4fa8db' : '#66b858';
  const cLoop = kind === 'somatotropin' ? '#8cc4e8' : '#96d482';

  const h1 = helixCurve([-1.12, -2.15, 0.75], [-1.05, 2.05, 0.65], 4.8, 0.34, 0);
  const h2 = helixCurve([1.05, -1.95, 0.82], [1.12, 1.98, 0.62], 4.6, 0.34, 1.2);
  const h3 = helixCurve([1.08, 1.92, -0.78], [0.95, -2.02, -0.72], 4.6, 0.34, 2.4);
  const h4 = helixCurve([-1.05, 2.08, -0.72], [-1.08, -1.98, -0.78], 4.8, 0.34, 3.6);

  // длинные перекрёстные петли (up-up-down-down архитектура!)
  const loop12: V3[] = [h1[h1.length - 1], [-0.45, 2.65, 1.15], [0.55, 0.45, 1.38], [0.92, -1.55, 1.15], h2[0]];
  const loop23: V3[] = [h2[h2.length - 1], [1.58, 2.42, 0.05], h3[0]];
  const loop34: V3[] = [h3[h3.length - 1], [0.35, -2.55, -1.18], [-0.55, 0.25, -1.35], [-0.95, 1.75, -1.15], h4[0]];

  // дисульфидные мостики
  const ss1: V3[] = [[-0.85, 0.55, 0.92], [-0.95, 0.55, -0.05], [-0.88, 0.45, -0.82]];
  const ss2: V3[] = [[0.92, -1.45, 0.85], [0.15, -1.85, 0.05], [-0.88, -1.65, -0.78]];

  const markers: ResidueMarkerSpec[] = [
    // активные площадки связывания с димером рецептора (Site 1 и Site 2)
    { pos: [-1.42, 0.85, 0.95], radius: 0.32, color: '#f5b832', partId: 'mol-active' },
    { pos: [1.42, -0.45, 0.98], radius: 0.30, color: '#f5b832', partId: 'mol-active' },
    { pos: ss1[1], radius: 0.22, color: '#f2c428', partId: 'mol-active' },
    { pos: ss2[1], radius: 0.22, color: '#f2c428', partId: 'mol-active' },
  ];

  return {
    kind: 'peptide',
    atoms: [],
    bonds: [],
    ribbons: [
      { points: h1, radius: [0.20, 0.10], color: c1, partId: 'mol-core', kind: 'helix' },
      { points: h2, radius: [0.20, 0.10], color: c2, partId: 'mol-core', kind: 'helix' },
      { points: h3, radius: [0.20, 0.10], color: c1, partId: 'mol-core', kind: 'helix' },
      { points: h4, radius: [0.20, 0.10], color: c2, partId: 'mol-core', kind: 'helix' },
      { points: loop12, radius: 0.12, color: cLoop, partId: 'mol-tail', kind: 'loop' },
      { points: loop23, radius: 0.12, color: cLoop, partId: 'mol-tail', kind: 'loop' },
      { points: loop34, radius: 0.12, color: cLoop, partId: 'mol-tail', kind: 'loop' },
      { points: ss1, radius: 0.11, color: '#f2c428', partId: 'mol-active', kind: 'disulfide' },
      ...(kind === 'somatotropin'
        ? [{ points: ss2, radius: 0.11, color: '#f2c428', partId: 'mol-active', kind: 'disulfide' as const }]
        : []),
    ],
    markers,
    labelAt: {
      'mol-core': [-1.45, 2.15, 0.65],
      'mol-active': [1.65, -0.45, 1.05],
      'mol-tail': [0.55, 0.65, 1.48],
    },
  };
}

function buildPth(): MoleculeSpec {
  // Паратгормон (84 aa): активная N-концевая спираль 1–34 (100% кальциевого действия) + гибкий шарнир + C-хвост!
  const activeHelix = helixCurve([-3.45, 0.85, 0.35], [-0.45, 0.35, 0.10], 4.2, 0.42, 0);
  const hinge: V3[] = [activeHelix[activeHelix.length - 1], [0.28, -0.05, -0.25], [0.92, -0.45, 0.15]];
  const cHelix = helixCurve([0.92, -0.45, 0.15], [3.45, -0.92, -0.18], 3.8, 0.36, 1.2);
  return {
    kind: 'peptide',
    atoms: [],
    bonds: [],
    ribbons: [
      { points: activeHelix, radius: [0.23, 0.12], color: '#e6aa28', partId: 'mol-active', kind: 'helix' },
      { points: hinge, radius: 0.13, color: '#d4be86', partId: 'mol-core', kind: 'loop' },
      { points: cHelix, radius: [0.19, 0.10], color: '#8ca8ba', partId: 'mol-tail', kind: 'helix' },
    ],
    markers: [
      { pos: activeHelix[0], radius: 0.30, color: '#ffcf48', partId: 'mol-active' },
      { pos: hinge[1], radius: 0.24, color: '#d4be86', partId: 'mol-core' },
    ],
    labelAt: {
      'mol-active': [-2.45, 1.25, 0.55],
      'mol-core': [0.35, 0.35, -0.15],
      'mol-tail': [2.85, -1.35, 0.25],
    },
  };
}

const BUILDERS: Record<string, () => MoleculeSpec> = {
  adrenalin: () => buildCatecholamine('adrenalin'),
  noradrenalin: () => buildCatecholamine('noradrenalin'),
  dofamin: () => buildCatecholamine('dofamin'),
  serotonin: () => buildIndoleamine('serotonin'),
  melatonin: () => buildIndoleamine('melatonin'),
  tiroksin: buildThyroxine,
  kortizol: () => buildSteroid('kortizol'),
  aldosteron: () => buildSteroid('aldosteron'),
  testosteron: () => buildSteroid('testosteron'),
  estrogeny: () => buildSteroid('estrogeny'),
  endorfin: buildEndorphin,
  oksitocin: () => buildNonapeptide('oksitocin'),
  vazopressin: () => buildNonapeptide('vazopressin'),
  insulin: buildInsulin,
  glukagon: buildGlucagon,
  somatotropin: () => buildFourHelixBundle('somatotropin'),
  leptin: () => buildFourHelixBundle('leptin'),
  paratgormon: buildPth,
};

export function getMoleculeSpec(slug: string): MoleculeSpec {
  const fn = BUILDERS[slug];
  if (!fn) throw new Error(`Unknown hormone molecule: ${slug}`);
  return fn();
}

export const MOLECULE_SLUGS = Object.keys(BUILDERS);
