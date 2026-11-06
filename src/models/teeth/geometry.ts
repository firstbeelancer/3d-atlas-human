import { BufferGeometry, Float32BufferAttribute } from 'three';

export type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar';
export const TYPES: ToothKind[] = ['incisor', 'canine', 'premolar', 'molar'];

export interface RootSpec {
  /** Смещение оси корня от центра зуба и длина корня вниз от шейки (y = 0). */
  dx: number;
  dz: number;
  len: number;
  /** Полуоси сечения корня. */
  rx: number;
  rz: number;
}

export interface ToothSpec {
  /** Полуширина коронки: по оси x (мезиодистально) и по оси z (щёчно-язычно). */
  w: number;
  d: number;
  /** Высота коронки над шейкой (шейка — y = 0, корень уходит вниз). */
  crownH: number;
  /** Показатель «суперэллипса» сечения коронки: меньше — прямоугольнее. */
  power: number;
  roots: RootSpec[];
}

/** Учебные постоянные зубы верхней челюсти; размеры приблизительные, не привязаны к пациенту. */
export const DIMENSIONS: Record<ToothKind, ToothSpec> = {
  incisor: {
    w: 0.46, d: 0.30, crownH: 1.02, power: 0.55,
    roots: [{ dx: 0, dz: 0.02, len: 1.42, rx: 0.155, rz: 0.2 }],
  },
  canine: {
    w: 0.41, d: 0.37, crownH: 1.14, power: 0.62,
    roots: [{ dx: 0, dz: 0.02, len: 1.86, rx: 0.165, rz: 0.205 }],
  },
  premolar: {
    w: 0.44, d: 0.50, crownH: 0.88, power: 0.68,
    roots: [
      { dx: 0, dz: -0.19, len: 1.34, rx: 0.145, rz: 0.125 }, // щёчный
      { dx: 0, dz: 0.22, len: 1.52, rx: 0.155, rz: 0.14 }, // нёбный
    ],
  },
  molar: {
    w: 0.66, d: 0.58, crownH: 0.82, power: 0.72,
    roots: [
      { dx: -0.25, dz: -0.21, len: 1.32, rx: 0.15, rz: 0.13 }, // передний щёчный
      { dx: 0.25, dz: -0.19, len: 1.22, rx: 0.14, rz: 0.12 }, // задний щёчный
      { dx: 0.02, dz: 0.31, len: 1.62, rx: 0.17, rz: 0.21 }, // нёбный
    ],
  },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const gauss = (v: number, c: number, s: number) => Math.exp(-(((v - c) / s) ** 2));

/**
 * Высота режущей/жевательной поверхности коронки над шейкой в точке (x, z):
 * у резца — плоский край с мамелонами, у клыка — один бугор, у премоляра — два,
 * у моляра — четыре бугра, краевые валики и крестообразная борозда.
 */
export function occlusalTop(kind: ToothKind, x: number, z: number): number {
  const { w, d, crownH } = DIMENSIONS[kind];
  const nx = x / w;
  const nz = z / d;
  let y: number;
  if (kind === 'incisor') {
    const edge = Math.max(0, 1 - Math.abs(nz) ** 2.3);
    const corner = 1 - smooth(0.72, 1.0, Math.abs(nx));
    y = crownH * (0.14 + 0.86 * edge * corner);
    for (const mx of [-0.55, 0, 0.55]) y += crownH * 0.055 * gauss(nx, mx, 0.17) * gauss(nz, 0, 0.3);
  } else if (kind === 'canine') {
    const cusp = Math.exp(-(nx ** 2 / 0.14 + nz ** 2 / 0.2));
    const ridge = gauss(nz, 0, 0.15) * Math.max(0, 1 - Math.abs(nx) ** 3);
    y = crownH * (0.1 + 0.92 * cusp + 0.3 * ridge * (1 - cusp));
  } else if (kind === 'premolar') {
    const buccal = Math.exp(-(nx ** 2 / 0.18 + ((nz + 0.4) / 0.3) ** 2));
    const lingual = Math.exp(-(nx ** 2 / 0.16 + ((nz - 0.46) / 0.26) ** 2));
    const groove = gauss(nz, 0, 0.09) * (1 - buccal) * (1 - lingual);
    y = crownH * (0.16 + 0.78 * buccal + 0.6 * lingual - 0.22 * groove);
  } else {
    const mb = 0.78 * Math.exp(-((nx + 0.5) ** 2 / 0.16 + ((nz + 0.5) / 0.28) ** 2));
    const db = 0.66 * Math.exp(-((nx - 0.52) ** 2 / 0.15 + ((nz + 0.42) / 0.24) ** 2));
    const mp = 0.9 * Math.exp(-((nx + 0.55) ** 2 / 0.17 + ((nz - 0.52) / 0.28) ** 2));
    const dp = 0.7 * Math.exp(-((nx - 0.55) ** 2 / 0.15 + ((nz - 0.45) / 0.25) ** 2));
    const cusps = mb + db + mp + dp;
    const rim = 0.1 * Math.exp(-(((Math.hypot(nx, nz) - 1) / 0.12) ** 2));
    const fissure = Math.min(1, gauss(nx, 0, 0.1) + gauss(nz, 0, 0.1)) * (1 - Math.min(1, cusps));
    y = crownH * (0.1 + cusps + rim - 0.3 * fissure);
  }
  return Math.max(y, crownH * 0.05);
}

/** Точка контура коронки: «суперэллипс» с показателем power, параметризованный углом phi. */
function outline(kind: ToothKind, phi: number, s: number): [number, number] {
  const { w, d, power } = DIMENSIONS[kind];
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  return [Math.sign(c) * Math.abs(c) ** power * w * s, Math.sign(sn) * Math.abs(sn) ** power * d * s];
}

/** Сетка rows x cols с quad-индексацией; возвращает базу для следующей латки. */
function gridPatch(
  rows: number,
  cols: number,
  pos: number[],
  idx: number[],
  base: number,
  at: (i: number, j: number) => number[],
): number {
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) pos.push(...at(i, j));
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = base + i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return base + (rows + 1) * (cols + 1);
}

/** Полоса, замыкающая разрезанную половину по плоскости сечения. */
function cutStrip(rows: number, cols: number, base: number, idx: number[]): void {
  for (let i = 0; i < rows; i++) {
    const a = base + i * (cols + 1);
    const b = a + cols;
    const c = a + cols + 1;
    const d = c + cols;
    idx.push(a, b, c, b, d, c);
  }
}

function finish(pos: number[], idx: number[]): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export interface CrownOpts {
  /** Масштаб контура (внутренние слои меньше наружных). */
  s?: number;
  /** Масштаб высоты жевательной поверхности. */
  topScale?: number;
  /** Сколько снять с высоты сверху (толщина слоя на жевательной стороне). */
  topDrop?: number;
  /** Высота дна оболочки (шейка зуба). */
  floor?: number;
  /** Разрезать вдоль плоскости z = 0 и замкнуть срез. */
  cut?: boolean;
  sectors?: number;
  ringsTop?: number;
  ringsSide?: number;
}

/**
 * Оболочка коронки: сверху — рельефная жевательная поверхность (полюс в центре),
 * ниже — боковые стенки с экватором, сужением к шейке и cingulum у резца и клыка.
 * В режиме cut строится половина z <= 0 с замкнутой плоскостью среза.
 */
export function crownSurface(kind: ToothKind, o: CrownOpts = {}): BufferGeometry {
  const s = o.s ?? 1;
  const topScale = o.topScale ?? 1;
  const topDrop = o.topDrop ?? 0;
  const floor = o.floor ?? 0;
  const cut = !!o.cut;
  const sectors = o.sectors ?? 128;
  const ringsTop = o.ringsTop ?? 72;
  const ringsSide = o.ringsSide ?? 40;
  const span = cut ? Math.PI : Math.PI * 2;
  const phiAt = (j: number) => Math.PI + (span * j) / sectors;
  const topAt = (x: number, z: number) => Math.max(floor + 0.02, occlusalTop(kind, x, z) * topScale - topDrop);

  const pos: number[] = [];
  const idx: number[] = [];
  let base = gridPatch(ringsTop, sectors, pos, idx, 0, (i, j) => {
    const rho = i / ringsTop;
    const [ox, oz] = outline(kind, phiAt(j), s);
    const x = ox * rho;
    const z = oz * rho;
    return [x, topAt(x, z), z];
  });
  const sideBase = base;
  base = gridPatch(ringsSide, sectors, pos, idx, base, (i, j) => {
    const u = i / ringsSide;
    const phi = phiAt(j);
    const [ox, oz] = outline(kind, phi, s);
    const bulge = 0.05 * Math.exp(-(((u - 0.22) / 0.2) ** 2));
    const cingulum =
      (kind === 'incisor' || kind === 'canine') && Math.sin(phi) > 0
        ? 0.1 * Math.exp(-(((phi - Math.PI / 2) / 0.8) ** 2))
        : 0;
    const rs = 1 - 0.16 * smooth(0, 1, u) + bulge + cingulum * (1 - u);
    const edgeY = topAt(ox, oz);
    const y = edgeY + (floor - edgeY) * Math.pow(u, 0.85);
    return [ox * rs, y, oz * rs];
  });
  // дно оболочки — веер к центру
  const center = pos.length / 3;
  pos.push(0, floor, 0);
  for (let j = 0; j < sectors; j++) {
    const a = sideBase + ringsSide * (sectors + 1) + j;
    idx.push(center, a + 1, a);
  }
  if (cut) {
    cutStrip(ringsTop, sectors, 0, idx);
    cutStrip(ringsSide, sectors, sideBase, idx);
  }
  return finish(pos, idx);
}

export interface RootOpts {
  /** Масштаб сечения корня (канал тоньше, дентин чуть тоньше цемента). */
  rScale?: number;
  /** Верх корня: чуть выше шейки, чтобы корень «врос» в коронку. */
  top?: number;
  cut?: boolean;
  sectors?: number;
  rings?: number;
}

/**
 * Корень: трубка от шейки до сужающегося закрытого кончика (апикальное отверстие),
 * ось слегка изогнута и смещена к (dx, dz). В режиме cut — половина с замкнутым срезом
 * по плоскости, проходящей через ось корня.
 */
export function rootSurface(kind: ToothKind, rootIndex: number, o: RootOpts = {}): BufferGeometry {
  const r = DIMENSIONS[kind].roots[rootIndex];
  const rScale = o.rScale ?? 1;
  const top = o.top ?? 0.08;
  const cut = !!o.cut;
  const sectors = o.sectors ?? 96;
  const rings = o.rings ?? 64;
  const span = cut ? Math.PI : Math.PI * 2;

  const pos: number[] = [];
  const idx: number[] = [];
  gridPatch(rings, sectors, pos, idx, 0, (i, j) => {
    const t = i / rings;
    const phi = Math.PI + (span * j) / sectors;
    const profile = Math.pow(1 - t, 0.8) * (1 + 0.22 * Math.exp(-(((t - 0.06) / 0.1) ** 2)));
    const ax = r.dx * (0.35 + 0.65 * t * t);
    const az = r.dz * (0.35 + 0.65 * t);
    const y = top - r.len * Math.pow(t, 1.03);
    return [ax + Math.cos(phi) * r.rx * rScale * profile, y, az + Math.sin(phi) * r.rz * rScale * profile];
  });
  if (cut) cutStrip(rings, sectors, 0, idx);
  return finish(pos, idx);
}
