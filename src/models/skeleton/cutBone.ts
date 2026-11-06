import {
  BufferGeometry, CylinderGeometry, LatheGeometry, Quaternion, RingGeometry, Shape, ShapeGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
  «Кость в разрезе» — верхний конец длинной (трубчатой) кости, распиленный вдоль.
  Сзади — объёмная половина кости, спереди — плоскость разреза с её слоями:
  суставной хрящ, надкостница, компактное вещество, губчатое вещество с красным мозгом,
  костномозговая полость с жёлтым мозгом. Единицы — единицы сцены.
*/

export const CUT = { top: 2.2, bottom: -1.6, spongyBottom: 0.3, yellowTop: 0.5 };

/** Головка кости — почти шар радиусом HEAD.r с центром на высоте HEAD.y. */
const HEAD = { y: 1.4, r: 0.8 };

const OUTER: [number, number][] = [
  [-1.6, 0.36], [-0.4, 0.36], [0.2, 0.38], [0.5, 0.42], [0.8, 0.52], [1.05, 0.66], [1.25, 0.76], [1.4, 0.8],
];

function interp(table: [number, number][], y: number): number {
  if (y <= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [y0, r0] = table[i];
    const [y1, r1] = table[i + 1];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      const s = t * t * (3 - 2 * t);
      return r0 + (r1 - r0) * (0.4 * t + 0.6 * s);
    }
  }
  return table[table.length - 1][1];
}

/** Наружный радиус кости на высоте y. */
export function outerR(y: number): number {
  if (y >= CUT.top) return 0;
  // купол головки — дуга окружности
  if (y > HEAD.y) return Math.sqrt(Math.max(0, HEAD.r ** 2 - (y - HEAD.y) ** 2));
  return interp(OUTER, y);
}

/** Толщина компактного слоя: толстая стенка в теле кости, тонкая корка в головке. */
function cortex(y: number): number {
  const t = Math.min(1, Math.max(0, (y - 0.2) / 0.8));
  const s = t * t * (3 - 2 * t);
  return 0.13 + (0.045 - 0.13) * s;
}

export function innerR(y: number): number {
  return Math.max(0, outerR(y) - cortex(y));
}

const STEPS = 90;
const ys = (from: number, to: number, n = STEPS) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);

function lathe(profile: (y: number) => number, from: number, to: number, phiStart: number, phiLength: number, closeTop = false): BufferGeometry {
  const pts = ys(from, to).map((y) => new Vector2(Math.max(0.0001, profile(y)), y));
  if (closeTop) pts.push(new Vector2(0.0001, to + 0.0001));
  return new LatheGeometry(pts, 64, phiStart, phiLength);
}

/** Задняя (объёмная) половина кости. */
export function backHalf(): BufferGeometry {
  return lathe(outerR, CUT.bottom, CUT.top, Math.PI / 2, Math.PI, true);
}

/** Передняя половина — отъезжает при включении разреза. */
export function frontHalf(): BufferGeometry {
  return lathe(outerR, CUT.bottom, CUT.top, -Math.PI / 2, Math.PI, true);
}

/** Плоская фигура между двумя профилями по обе стороны оси (полоса в форме перевёрнутой «П»). */
function band(outer: (y: number) => number, inner: (y: number) => number, from: number, to: number, innerTop: number): Shape {
  const s = new Shape();
  const up = ys(from, to);
  s.moveTo(-outer(from), from);
  up.forEach((y) => s.lineTo(-outer(y), y));
  [...up].reverse().forEach((y) => s.lineTo(outer(y), y));
  const inUp = ys(from, innerTop);
  inUp.forEach((y) => s.lineTo(inner(y), y));
  [...inUp].reverse().forEach((y) => s.lineTo(-inner(y), y));
  s.closePath();
  return s;
}

function region(profile: (y: number) => number, from: number, to: number, bottomCurve = 0): Shape {
  const s = new Shape();
  const up = ys(from, to);
  s.moveTo(-profile(from), from);
  up.forEach((y) => s.lineTo(-profile(y), y));
  [...up].reverse().forEach((y) => s.lineTo(profile(y), y));
  // нижний край: слегка вогнутая линия
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const x = profile(from) * (1 - (2 * i) / n);
    s.lineTo(x, from - bottomCurve * (1 - (x / profile(from)) ** 2));
  }
  s.closePath();
  return s;
}

const flat = (shape: Shape, z: number) => {
  const g = new ShapeGeometry(shape, 1);
  g.deleteAttribute('uv');
  g.translate(0, 0, z);
  return g;
};

export function compactFace(): BufferGeometry {
  const innerTop = CUT.top - 0.05;
  return flat(band(outerR, innerR, CUT.bottom, CUT.top, innerTop), 0.0);
}

export function spongyFace(): BufferGeometry {
  return flat(region(innerR, CUT.spongyBottom, CUT.top - 0.05, -0.12), 0.003);
}

export function yellowFace(): BufferGeometry {
  return flat(region(innerR, CUT.bottom, CUT.yellowTop), 0.0015);
}

/** Суставной хрящ: шапочка на головке кости (объём сзади + полоса в плоскости разреза). */
export function cartilageCap(): { shell: BufferGeometry; face: BufferGeometry } {
  const from = 1.5;
  const f = 1.085;
  const top = HEAD.y + (CUT.top - HEAD.y) * f;
  const capR = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - from) / 0.25));
    const s = t * t * (3 - 2 * t);
    return outerR(y) * (1 - s) + f * outerR(HEAD.y + (y - HEAD.y) / f) * s;
  };
  const shell = lathe(capR, from, top, Math.PI / 2, Math.PI, true);
  const s = new Shape();
  const up = ys(from, top);
  s.moveTo(-outerR(from), from);
  up.forEach((y) => s.lineTo(-capR(y), y));
  [...up].reverse().forEach((y) => s.lineTo(capR(y), y));
  const inUp = ys(from, CUT.top);
  inUp.forEach((y) => s.lineTo(outerR(y), y));
  [...inUp].reverse().forEach((y) => s.lineTo(-outerR(y), y));
  s.closePath();
  return { shell, face: flat(s, 0.004) };
}

/** Надкостница: тонкая плёнка поверх тела кости (не покрывает суставной хрящ). */
export function periosteum(): { shell: BufferGeometry; face: BufferGeometry } {
  const from = CUT.bottom;
  const to = 1.5;
  const r = (y: number) => outerR(y) + 0.045;
  const shell = lathe(r, from, to, Math.PI / 2, Math.PI);
  const s = new Shape();
  const up = ys(from, to);
  s.moveTo(-outerR(from), from);
  up.forEach((y) => s.lineTo(-r(y), y));
  [...up].reverse().forEach((y) => s.lineTo(-outerR(y), y));
  s.closePath();
  const s2 = new Shape();
  s2.moveTo(outerR(from), from);
  up.forEach((y) => s2.lineTo(r(y), y));
  [...up].reverse().forEach((y) => s2.lineTo(outerR(y), y));
  s2.closePath();
  const face = mergeGeometries([flat(s, 0.004), flat(s2, 0.004)]);
  return { shell, face: face! };
}

/** Нижний поперечный срез тела кости: кольцо компактного вещества и жёлтый мозг внутри. */
export function bottomCaps(): { ring: BufferGeometry; marrow: BufferGeometry } {
  const ro = outerR(CUT.bottom);
  const ri = innerR(CUT.bottom);
  const ring = new RingGeometry(ri, ro, 48, 1, Math.PI, Math.PI);
  ring.deleteAttribute('uv');
  ring.rotateX(Math.PI / 2);
  ring.translate(0, CUT.bottom, 0);
  const marrow = new RingGeometry(0.0001, ri, 48, 1, Math.PI, Math.PI);
  marrow.deleteAttribute('uv');
  marrow.rotateX(Math.PI / 2);
  marrow.translate(0, CUT.bottom - 0.001, 0);
  return { ring, marrow };
}

/** Детерминированный генератор случайных чисел — сеть перекладин одинакова при каждом показе. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Перекладины (трабекулы) губчатого вещества: сеть тонких балок на плоскости разреза. */
export function trabeculae(): BufferGeometry {
  const rand = rng(7);
  const pts: Vector2[] = [];
  const step = 0.1;
  for (let y = CUT.spongyBottom - 0.02; y < CUT.top - 0.08; y += step) {
    const w = innerR(y) - 0.035;
    for (let x = -w; x <= w; x += step) {
      const px = x + (rand() - 0.5) * step * 0.7;
      const py = y + (rand() - 0.5) * step * 0.7;
      if (Math.abs(px) < innerR(py) - 0.03 && py > CUT.spongyBottom - 0.1 && py < CUT.top - 0.07) pts.push(new Vector2(px, py));
    }
  }
  const pieces: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  const seen = new Set<string>();
  pts.forEach((p, i) => {
    const near = pts
      .map((q, j) => ({ j, d: p.distanceTo(q) }))
      .filter((e) => e.j !== i && e.d < step * 1.7)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    near.forEach(({ j, d }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      const q = pts[j];
      const r = 0.009 + rand() * 0.009;
      const c = new CylinderGeometry(r, r, d, 6, 1, false);
      c.deleteAttribute('uv');
      const dir = new Vector3(q.x - p.x, q.y - p.y, 0).normalize();
      c.applyQuaternion(new Quaternion().setFromUnitVectors(up, dir));
      c.translate((p.x + q.x) / 2, (p.y + q.y) / 2, 0.012);
      pieces.push(c);
    });
  });
  return mergeGeometries(pieces)!;
}
