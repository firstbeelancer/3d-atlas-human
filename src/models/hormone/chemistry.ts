import type { MessageKey } from '../../i18n';
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

/** Ставит заместитель радиально наружу от центра наклонённого бензольного кольца. */
function addRingSub(m: MolBuilder, atomIdx: number, center: V3, el: ElementKey, partId: string, dist: number): number {
  const p = m.atoms[atomIdx].pos;
  const dx = p[0] - center[0];
  const dy = p[1] - center[1];
  const dz = p[2] - center[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const id = m.add(el, [p[0] + (dx / len) * dist, p[1] + (dy / len) * dist, p[2] + (dz / len) * dist], partId);
  m.bond(atomIdx, id, 1, partId);
  return id;
}

function addRingH(m: MolBuilder, atomIdx: number, center: V3, partId: string, dist = 1.08) {
  addRingSub(m, atomIdx, center, 'H', partId, dist);
}

/** Вычисляет два единичных тетраэдрических луча (~109.5°) от узла `c`, уже связанного с `a` и `b`. */
function tetraRays(a: V3, b: V3, c: V3): [V3, V3] {
  const u1x = a[0] - c[0], u1y = a[1] - c[1], u1z = a[2] - c[2];
  const l1 = Math.hypot(u1x, u1y, u1z) || 1;
  const n1x = u1x / l1, n1y = u1y / l1, n1z = u1z / l1;

  const u2x = b[0] - c[0], u2y = b[1] - c[1], u2z = b[2] - c[2];
  const l2 = Math.hypot(u2x, u2y, u2z) || 1;
  const n2x = u2x / l2, n2y = u2y / l2, n2z = u2z / l2;

  let bx = -(n1x + n2x), by = -(n1y + n2y), bz = -(n1z + n2z);
  const bl = Math.hypot(bx, by, bz) || 1;
  bx /= bl; by /= bl; bz /= bl;

  let nx = n1y * n2z - n1z * n2y;
  let ny = n1z * n2x - n1x * n2z;
  let nz = n1x * n2y - n1y * n2x;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;

  const cs = Math.cos((54.735 * Math.PI) / 180);
  const sn = Math.sin((54.735 * Math.PI) / 180);
  return [
    [bx * cs + nx * sn, by * cs + ny * sn, bz * cs + nz * sn],
    [bx * cs - nx * sn, by * cs - ny * sn, bz * cs - nz * sn],
  ];
}

function stepPos(base: V3, dir: V3, dist: number): V3 {
  return [base[0] + dir[0] * dist, base[1] + dir[1] * dist, base[2] + dir[2] * dist];
}

/** Присоединяет 3 тетраэдрических атома H (-CH3) к углероду `cIdx`, связанному с `parentIdx`. */
function addMethylH(m: MolBuilder, parentIdx: number, cIdx: number, partId: string, phase = 0.4) {
  const p = m.atoms[parentIdx].pos;
  const c = m.atoms[cIdx].pos;
  const ax = c[0] - p[0], ay = c[1] - p[1], az = c[2] - p[2];
  const al = Math.hypot(ax, ay, az) || 1;
  const dx = ax / al, dy = ay / al, dz = az / al;
  const ref: V3 = Math.abs(dy) < 0.85 ? [0, 1, 0] : [1, 0, 0];
  let ux = dy * ref[2] - dz * ref[1];
  let uy = dz * ref[0] - dx * ref[2];
  let uz = dx * ref[1] - dy * ref[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;
  const fwd = 0.3338; // cos(70.5°)
  const rad = 0.9426; // sin(70.5°)
  for (let i = 0; i < 3; i++) {
    const ang = phase + (i * Math.PI * 2) / 3;
    const cs = Math.cos(ang) * rad;
    const sn = Math.sin(ang) * rad;
    const dir: V3 = [dx * fwd + ux * cs + vx * sn, dy * fwd + uy * cs + vy * sn, dz * fwd + uz * cs + vz * sn];
    m.bond(cIdx, m.add('H', stepPos(c, dir, 1.09), partId), 1, partId);
  }
}

/**
 * Строит 3D-геометрию катехоламинов (дофамин, (R)-норадреналин, (R)-адреналин)
 * с точными длинами связей (Å), тетраэдрическими углами 109.5° и биологически активной (R)-хиральностью.
 */
function buildCatecholamine(mode: 'adrenalin' | 'noradrenalin' | 'dofamin'): MoleculeSpec {
  const m = new MolBuilder();
  const center: V3 = [-1.75, 0, 0];
  const ring = addBenzene(m, center[0], center[1], center[2], 1.39, 'mol-core', 0.06, 0.08);
  // 3 атома H на свободных позициях бензольного кольца под точным углом 120°
  addRingH(m, ring[1], center, 'mol-core');
  addRingH(m, ring[4], center, 'mol-core');
  addRingH(m, ring[5], center, 'mol-core');

  // две орто-гидроксильные группы (-OH) при C3 и C4 (катехольное кольцо)
  const o3 = addRingSub(m, ring[2], center, 'O', 'mol-core', 1.37);
  const o3p = m.atoms[o3].pos;
  m.bond(o3, m.add('H', [o3p[0] - 0.86, o3p[1] + 0.34, o3p[2] + 0.30], 'mol-core'), 1, 'mol-core');

  const o4 = addRingSub(m, ring[3], center, 'O', 'mol-core', 1.37);
  const o4p = m.atoms[o4].pos;
  m.bond(o4, m.add('H', [o4p[0] - 0.56, o4p[1] - 0.74, o4p[2] + 0.28], 'mol-core'), 1, 'mol-core');

  // боковая цепь C_beta — C_alpha — N в естественной зигзаг-конформации
  const r0p = m.atoms[ring[0]].pos;
  const cbPos: V3 = [r0p[0] + 1.50, r0p[1] + 0.04, r0p[2] - 0.11];
  const cb = m.add('C', cbPos, 'mol-active');
  m.bond(ring[0], cb, 1, 'mol-active');

  const caPos: V3 = [cbPos[0] + 0.94, cbPos[1] - 0.98, cbPos[2] + 0.66];
  const ca = m.add('C', caPos, 'mol-tail');

  // два точных тетраэдрических луча от C_beta (rayUp смотрит вверх-вперёд -> даёт (R)-конфигурацию!)
  const [rayUp, rayBack] = tetraRays(r0p, caPos, cbPos);
  if (mode === 'dofamin') {
    // у дофамина на C_beta два атома водорода (-CH2-), без гидроксила!
    m.bond(cb, m.add('H', stepPos(cbPos, rayUp, 1.09), 'mol-active'), 1, 'mol-active');
    m.bond(cb, m.add('H', stepPos(cbPos, rayBack, 1.09), 'mol-active'), 1, 'mol-active');
  } else {
    // природный биологически активный (R)-изомер: хиральная бета-OH группа открыто смотрит вверх-вперёд!
    const obPos = stepPos(cbPos, rayUp, 1.43);
    const ob = m.add('O', obPos, 'mol-active');
    const hob = m.add('H', [obPos[0] + 0.80, obPos[1] + 0.42, obPos[2] + 0.36], 'mol-active');
    const hb = m.add('H', stepPos(cbPos, rayBack, 1.09), 'mol-active');
    m.bond(cb, ob, 1, 'mol-active');
    m.bond(ob, hob, 1, 'mol-active');
    m.bond(cb, hb, 1, 'mol-active');
  }

  m.bond(cb, ca, 1, 'mol-tail');

  // синий атом азота аминогруппы (зигзаг вверх-вправо от C_alpha)
  const nPos: V3 = [caPos[0] + 1.34, caPos[1] + 0.56, caPos[2] - 0.22];
  const n = m.add('N', nPos, 'mol-tail');
  m.bond(ca, n, 1, 'mol-tail');

  const [caH1, caH2] = tetraRays(cbPos, nPos, caPos);
  m.bond(ca, m.add('H', stepPos(caPos, caH1, 1.09), 'mol-tail'), 1, 'mol-tail');
  m.bond(ca, m.add('H', stepPos(caPos, caH2, 1.09), 'mol-tail'), 1, 'mol-tail');

  if (mode === 'adrenalin') {
    // N-метильный хвост (-NH-CH3) — второе главное отличие адреналина от дофамина и норадреналина!
    const cmPos: V3 = [nPos[0] + 1.12, nPos[1] - 0.86, nPos[2] + 0.40];
    const cm = m.add('C', cmPos, 'mol-tail');
    m.bond(n, cm, 1, 'mol-tail');
    const [nhRay] = tetraRays(caPos, cmPos, nPos);
    m.bond(n, m.add('H', stepPos(nPos, nhRay, 1.01), 'mol-tail'), 1, 'mol-tail');
    addMethylH(m, n, cm, 'mol-tail', 0.3);
  } else {
    // первичная аминогруппа (-NH2) у дофамина и норадреналина под тетраэдрическим углом ~109.5°
    const dx = nPos[0] - caPos[0], dy = nPos[1] - caPos[1], dz = nPos[2] - caPos[2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    const ax = dx / dl, ay = dy / dl, az = dz / dl;
    const ref: V3 = [0, 0, 1];
    let ux = ay * ref[2] - az * ref[1], uy = az * ref[0] - ax * ref[2], uz = ax * ref[1] - ay * ref[0];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
    const fwd = 0.3338, rad = 0.9426;
    for (const ang of [0.95, 3.05]) {
      const cs = Math.cos(ang) * rad, sn = Math.sin(ang) * rad;
      const dir: V3 = [ax * fwd + ux * cs + vx * sn, ay * fwd + uy * cs + vy * sn, az * fwd + uz * cs + vz * sn];
      m.bond(n, m.add('H', stepPos(nPos, dir, 1.01), 'mol-tail'), 1, 'mol-tail');
    }
  }

  return m.build({
    'mol-core': [-3.30, 2.70, 0.25],
    'mol-active': mode === 'dofamin' ? [0.65, 1.35, 0.45] : [1.05, 2.05, 0.65],
    'mol-tail': mode === 'adrenalin' ? [4.75, -1.95, 0.45] : [3.75, -1.55, 0.35],
  });
}

/** Индольное бициклическое ядро (бензол + правильный планарный пиррол с N) для серотонина и мелатонина. */
function buildIndoleamine(mode: 'serotonin' | 'melatonin'): MoleculeSpec {
  const m = new MolBuilder();
  const cx = -1.95, cy = 0, cz = 0, r = 1.38, tiltX = 0.06, tiltY = 0.05;
  const ring = addBenzene(m, cx, cy, cz, r, 'mol-core', tiltX, tiltY);
  const csX = Math.cos(tiltX), snX = Math.sin(tiltX);
  const csY = Math.cos(tiltY), snY = Math.sin(tiltY);
  const toWorld = (lx: number, ly: number, lz = 0): V3 => {
    const y1 = ly * csX - lz * snX;
    const z1 = ly * snX + lz * csX;
    const x2 = lx * csY + z1 * snY;
    const z2 = -lx * snY + z1 * csY;
    return [cx + x2, cy + y1, cz + z2];
  };
  // правильный пятиугольник пиррола, точно пристыкованный к ребру ring[0](r,0) — ring[5](0.5r, -0.866r)
  const p0x = r, p0y = 0;
  const p5x = 0.5 * r, p5y = -0.8660254 * r;
  const aTop = (-12 * Math.PI) / 180;
  const aBot = (-48 * Math.PI) / 180;
  const c3x = p0x + Math.cos(aTop) * r, c3y = p0y + Math.sin(aTop) * r;
  const n1x = p5x + Math.cos(aBot) * r, n1y = p5y + Math.sin(aBot) * r;
  // противоположная вершина C2 на расстоянии r от C3 и N1
  const midX = 0.5 * (p0x + p5x), midY = 0.5 * (p0y + p5y);
  const c2x = midX + 0.8660254 * 1.5388418 * r;
  const c2y = midY - 0.5 * 1.5388418 * r;
  const pyrCx = midX + 0.8660254 * 0.688191 * r;
  const pyrCy = midY - 0.5 * 0.688191 * r;

  const c3 = m.add('C', toWorld(c3x, c3y), 'mol-core');
  const c2 = m.add('C', toWorld(c2x, c2y), 'mol-core');
  const n1 = m.add('N', toWorld(n1x, n1y), 'mol-core');
  m.bond(ring[0], c3, 1, 'mol-core');
  m.bond(c3, c2, 2, 'mol-core');
  m.bond(c2, n1, 1, 'mol-core');
  m.bond(n1, ring[5], 1, 'mol-core');

  const pyrCenter = toWorld(pyrCx, pyrCy);
  addRingSub(m, n1, pyrCenter, 'H', 'mol-core', 1.01);
  addRingSub(m, c2, pyrCenter, 'H', 'mol-core', 1.08);
  addRingH(m, ring[1], [cx, cy, cz], 'mol-core');
  addRingH(m, ring[3], [cx, cy, cz], 'mol-core');
  addRingH(m, ring[4], [cx, cy, cz], 'mol-core');

  // 5-гидроксигруппа (-OH у серотонина) или 5-метоксигруппа (-OCH3 у мелатонина!)
  const o5 = addRingSub(m, ring[2], [cx, cy, cz], 'O', 'mol-active', 1.37);
  const o5p = m.atoms[o5].pos;
  if (mode === 'serotonin') {
    m.bond(o5, m.add('H', [o5p[0] - 0.86, o5p[1] + 0.34, o5p[2] + 0.30], 'mol-active'), 1, 'mol-active');
  } else {
    const cme = m.add('C', [o5p[0] - 1.24, o5p[1] + 0.32, o5p[2] + 0.62], 'mol-active');
    m.bond(o5, cme, 1, 'mol-active');
    addMethylH(m, o5, cme, 'mol-active', 0.2);
  }

  // боковая этиламиновая цепь от C3 (вверх-вправо от индола)
  const c3p = m.atoms[c3].pos;
  const cbPos: V3 = [c3p[0] + 0.68, c3p[1] + 1.32, c3p[2] + 0.22];
  const cb = m.add('C', cbPos, 'mol-tail');
  const caPos: V3 = [cbPos[0] + 1.36, cbPos[1] + 0.14, cbPos[2] - 0.66];
  const ca = m.add('C', caPos, 'mol-tail');
  const ntPos: V3 = [caPos[0] + 0.78, caPos[1] + 1.18, caPos[2] + 0.42];
  const nt = m.add('N', ntPos, 'mol-tail');
  m.bond(c3, cb, 1, 'mol-tail');
  m.bond(cb, ca, 1, 'mol-tail');
  m.bond(ca, nt, 1, 'mol-tail');
  const [cbH1, cbH2] = tetraRays(c3p, caPos, cbPos);
  m.bond(cb, m.add('H', stepPos(cbPos, cbH1, 1.09), 'mol-tail'), 1, 'mol-tail');
  m.bond(cb, m.add('H', stepPos(cbPos, cbH2, 1.09), 'mol-tail'), 1, 'mol-tail');
  const [caH1, caH2] = tetraRays(cbPos, ntPos, caPos);
  m.bond(ca, m.add('H', stepPos(caPos, caH1, 1.09), 'mol-tail'), 1, 'mol-tail');
  m.bond(ca, m.add('H', stepPos(caPos, caH2, 1.09), 'mol-tail'), 1, 'mol-tail');

  if (mode === 'serotonin') {
    m.bond(nt, m.add('H', [ntPos[0] - 0.42, ntPos[1] + 0.88, ntPos[2] - 0.26], 'mol-tail'), 1, 'mol-tail');
    m.bond(nt, m.add('H', [ntPos[0] + 0.96, ntPos[1] - 0.04, ntPos[2] - 0.30], 'mol-tail'), 1, 'mol-tail');
  } else {
    // N-ацетильная группа (-CO-CH3) — ключевой признак мелатонина!
    const cCarbPos: V3 = [ntPos[0] + 1.24, ntPos[1] - 0.04, ntPos[2] + 0.56];
    const cCarb = m.add('C', cCarbPos, 'mol-tail');
    const oCarb = m.add('O', [cCarbPos[0] + 0.58, cCarbPos[1] - 1.04, cCarbPos[2] + 0.24], 'mol-tail');
    const cMetPos: V3 = [cCarbPos[0] + 0.72, cCarbPos[1] + 1.28, cCarbPos[2] + 0.36];
    const cMet = m.add('C', cMetPos, 'mol-tail');
    const [nhRay] = tetraRays(caPos, cCarbPos, ntPos);
    m.bond(nt, m.add('H', stepPos(ntPos, nhRay, 1.01), 'mol-tail'), 1, 'mol-tail');
    m.bond(nt, cCarb, 1, 'mol-tail');
    m.bond(cCarb, oCarb, 2, 'mol-tail');
    m.bond(cCarb, cMet, 1, 'mol-tail');
    addMethylH(m, cCarb, cMet, 'mol-tail', 0.5);
  }

  return m.build({
    'mol-core': [-1.4, -1.95, 0.25],
    'mol-active': [-3.85, 2.45, 0.6],
    'mol-tail': [3.85, 3.65, 0.55],
  });
}

/** Тироксин (T4): два повёрнутых фенильных кольца через эфирный кислород + 4 крупных фиолетовых атома йода! */
function buildThyroxine(): MoleculeSpec {
  const m = new MolBuilder();
  const outerC: V3 = [-3.36, 0.35, 0.25];
  const innerC: V3 = [1.84, -0.25, -0.18];
  // внешнее кольцо (несёт 4'-OH и атомы йода 3', 5')
  const outer = addBenzene(m, outerC[0], outerC[1], outerC[2], 1.38, 'mol-core', 0.28, 0.42);
  // внутреннее кольцо (несёт аланиновый хвост и атомы йода 3, 5)
  const inner = addBenzene(m, innerC[0], innerC[1], innerC[2], 1.38, 'mol-core', -0.22, -0.34);
  // эфирный кислород-мостик между двумя кольцами под углом ~118°
  const pOut0 = m.atoms[outer[0]].pos;
  const pIn3 = m.atoms[inner[3]].pos;
  const oBridge = m.add(
    'O',
    [(pOut0[0] + pIn3[0]) * 0.5, (pOut0[1] + pIn3[1]) * 0.5 + 0.52, (pOut0[2] + pIn3[2]) * 0.5 + 0.08],
    'mol-core',
  );
  m.bond(outer[0], oBridge, 1, 'mol-core');
  m.bond(oBridge, inner[3], 1, 'mol-core');

  // 4'-OH группа на внешнем кольце и 4 ароматических атома водорода на свободных позициях колец
  const o4p = addRingSub(m, outer[3], outerC, 'O', 'mol-core', 1.37);
  const o4pp = m.atoms[o4p].pos;
  m.bond(o4p, m.add('H', [o4pp[0] - 0.60, o4pp[1] - 0.64, o4pp[2] + 0.42], 'mol-core'), 1, 'mol-core');
  addRingH(m, outer[1], outerC, 'mol-core');
  addRingH(m, outer[5], outerC, 'mol-core');
  addRingH(m, inner[1], innerC, 'mol-core');
  addRingH(m, inner[5], innerC, 'mol-core');

  // 4 характерных крупных атома ЙОДА (I) радиально на точной длине C–I = 2.08 Å в положениях 3', 5', 3, 5!
  addRingSub(m, outer[2], outerC, 'I', 'mol-active', 2.08);
  addRingSub(m, outer[4], outerC, 'I', 'mol-active', 2.08);
  addRingSub(m, inner[2], innerC, 'I', 'mol-active', 2.08);
  addRingSub(m, inner[4], innerC, 'I', 'mol-active', 2.08);

  // аланиновая аминокислотная цепь L-тироксина ((S)-конфигурация у C_alpha) справа
  const pIn0 = m.atoms[inner[0]].pos;
  const cbPos: V3 = [pIn0[0] + 1.44, pIn0[1] - 0.24, pIn0[2] + 0.42];
  const cb = m.add('C', cbPos, 'mol-tail');
  const caPos: V3 = [cbPos[0] + 0.94, cbPos[1] + 1.08, cbPos[2] + 0.56];
  const ca = m.add('C', caPos, 'mol-tail');
  const nPos: V3 = [caPos[0] - 0.26, caPos[1] + 1.30, caPos[2] - 0.62];
  const n = m.add('N', nPos, 'mol-tail');
  const cAcidPos: V3 = [caPos[0] + 1.44, caPos[1] - 0.36, caPos[2] - 0.22];
  const cAcid = m.add('C', cAcidPos, 'mol-tail');
  const o1 = m.add('O', [cAcidPos[0] + 0.44, cAcidPos[1] - 1.10, cAcidPos[2] - 0.34], 'mol-tail');
  const o2Pos: V3 = [cAcidPos[0] + 0.82, cAcidPos[1] + 1.04, cAcidPos[2] + 0.26];
  const o2 = m.add('O', o2Pos, 'mol-tail');
  m.bond(inner[0], cb, 1, 'mol-tail');
  m.bond(cb, ca, 1, 'mol-tail');
  m.bond(ca, n, 1, 'mol-tail');
  m.bond(ca, cAcid, 1, 'mol-tail');
  m.bond(cAcid, o1, 2, 'mol-tail');
  m.bond(cAcid, o2, 1, 'mol-tail');
  m.bond(o2, m.add('H', [o2Pos[0] + 0.92, o2Pos[1] - 0.28, o2Pos[2] - 0.10], 'mol-tail'), 1, 'mol-tail');
  m.bond(n, m.add('H', [nPos[0] + 0.52, nPos[1] + 0.74, nPos[2] + 0.42], 'mol-tail'), 1, 'mol-tail');
  m.bond(n, m.add('H', [nPos[0] - 0.94, nPos[1] + 0.28, nPos[2] + 0.08], 'mol-tail'), 1, 'mol-tail');
  const [cbH1, cbH2] = tetraRays(pIn0, caPos, cbPos);
  m.bond(cb, m.add('H', stepPos(cbPos, cbH1, 1.09), 'mol-tail'), 1, 'mol-tail');
  m.bond(cb, m.add('H', stepPos(cbPos, cbH2, 1.09), 'mol-tail'), 1, 'mol-tail');
  m.bond(ca, m.add('H', [caPos[0] - 0.12, caPos[1] + 0.08, caPos[2] + 1.08], 'mol-tail'), 1, 'mol-tail');

  return m.build({
    'mol-core': [-1.0, -0.85, 0.65],
    'mol-active': [-4.45, 3.25, 1.35],
    'mol-tail': [5.85, 1.65, 0.55],
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
    m.bond(c19, m.add('H', [-1.86, 1.38, -1.84], 'mol-core'), 1, 'mol-core');
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
    m.bond(c18, m.add('H', [1.74, 3.52, -1.80], 'mol-core'), 1, 'mol-core');
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
    m.bond(c21, m.add('H', [5.78, 3.16, -0.20], 'mol-tail'), 1, 'mol-tail');
    m.bond(c21, m.add('H', [5.28, 3.06, -1.84], 'mol-tail'), 1, 'mol-tail');
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

const ELEMENT_ORDER: readonly ElementKey[] = ['C', 'H', 'N', 'O', 'S', 'I'];

const ELEMENT_LABELS: Record<ElementKey, MessageKey> = {
  C: 'hormone.legend.carbon',
  H: 'hormone.legend.hydrogen',
  N: 'hormone.legend.nitrogen',
  O: 'hormone.legend.oxygen',
  S: 'hormone.legend.sulfur',
  I: 'hormone.legend.iodine',
};

export interface HormoneLegendItem {
  label: MessageKey;
  color: string;
}

/**
 * Точная легенда цветов для 3D-сцены конкретного гормона:
 * - в режиме «Путь в теле» — источник, органы-мишени и контур торможения;
 * - для атомных молекул — строго те элементы (C, H, N, O, S, I), что есть в 3D-модели;
 * - для пептидов и белков — точные цвета цепей, активного центра / S—S и петель.
 */
export function getHormoneLegend(slug: string, accent: string, isPathway: boolean): HormoneLegendItem[] {
  if (isPathway) {
    return [
      { label: 'hormone.legend.source', color: '#f5b832' },
      { label: 'hormone.legend.targets', color: accent },
      { label: 'hormone.legend.brake', color: '#2dc4b6' },
    ];
  }
  const spec = getMoleculeSpec(slug);
  if (spec.kind === 'atomic') {
    const present = new Set(spec.atoms.map((a) => a.el));
    return ELEMENT_ORDER.filter((el) => present.has(el)).map((el) => ({
      label: ELEMENT_LABELS[el],
      color: CPK_COLORS[el],
    }));
  }
  if (slug === 'insulin') {
    return [
      { label: 'hormone.legend.chainA', color: '#2ea888' },
      { label: 'hormone.legend.chainB', color: '#e06458' },
      { label: 'hormone.legend.activeSite', color: '#f2c428' },
    ];
  }
  if (slug === 'paratgormon') {
    return [
      { label: 'hormone.legend.activeSite', color: '#e6aa28' },
      { label: 'hormone.legend.hinge', color: '#d4be86' },
      { label: 'hormone.legend.tail', color: '#8ca8ba' },
    ];
  }
  const colorOf = (partId: string, fallback: string) =>
    spec.ribbons.find((r) => r.partId === partId)?.color ??
    spec.markers.find((m) => m.partId === partId)?.color ??
    fallback;
  return [
    { label: 'hormone.legend.backbone', color: colorOf('mol-core', accent) },
    { label: 'hormone.legend.activeSite', color: colorOf('mol-active', '#f5b832') },
    { label: 'hormone.legend.tail', color: colorOf('mol-tail', '#58b8cc') },
  ];
}
