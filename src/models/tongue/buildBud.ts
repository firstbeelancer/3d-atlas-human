import { BufferGeometry, CylinderGeometry, LatheGeometry, Matrix4, Quaternion, RingGeometry, SphereGeometry, Vector2, Vector3 } from 'three';
import { Batch, alignMatrix, curveOf, lerp, merge, orientOutward, rng, tube, type V3 } from './geometry';
import type { Parts } from './types';

/*
  Грибовидный сосочек под микроскопом, условные единицы около 0,1 мм. Ось сосочка — +y.
  Эпителий — тело вращения между наружной поверхностью и границей соединительнотканного стержня.
  В эпителии шляпки сидят вкусовые почки: в центре, по бокам (в плоскости среза) и одна сзади.
*/

/** Наружный профиль (r, y): шляпка, ножка, плоская слизистая вокруг. */
export const OUTER: [number, number][] = [
  [0, 4.6],
  [1.2, 4.55],
  [2.4, 4.38],
  [3.4, 4.05],
  [4.1, 3.55],
  [4.45, 3.0],
  [4.35, 2.45],
  [3.6, 2.05],
  [2.75, 1.75],
  [2.55, 1.0],
  [2.75, 0.35],
  [3.4, 0.05],
  [4.4, 0],
  [7, 0],
  [10, 0],
];
/** Граница эпителия и стержня (базальная мембрана). */
export const INNER: [number, number][] = [
  [0, 2.6],
  [1.2, 2.57],
  [2.2, 2.45],
  [2.9, 2.15],
  [3.05, 1.75],
  [2.55, 1.38],
  [1.35, 1.08],
  [1.05, 0.45],
  [1.05, -0.65],
  [1.5, -1.3],
  [2.6, -1.6],
  [7, -1.6],
  [10, -1.6],
];
const BOTTOM = -6;
const BUD_DEPTH = 1.95;

const v2 = (pts: [number, number][]) => pts.map(([r, y]) => new Vector2(r, y));

function lathe(pts: [number, number][], seg = 72): BufferGeometry {
  return orientOutward(new LatheGeometry(v2(pts), seg));
}

/** Точка и нормаль наружного профиля на радиусе r и угле phi. */
function onOuter(r: number, phi: number): { p: Vector3; n: Vector3 } {
  for (let k = 1; k < OUTER.length; k++) {
    const [r0, y0] = OUTER[k - 1];
    const [r1, y1] = OUTER[k];
    if (r <= r1 || k === OUTER.length - 1) {
      const t = (r - r0) / (r1 - r0 || 1);
      const y = lerp(y0, y1, t);
      const dr = r1 - r0;
      const dy = y1 - y0;
      const n2 = new Vector2(-dy, dr).normalize();
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      return { p: new Vector3(r * c, y, -r * s), n: new Vector3(n2.x * c, n2.y, -n2.x * s).normalize() };
    }
  }
  return { p: new Vector3(0, OUTER[0][1], 0), n: new Vector3(0, 1, 0) };
}

/** Вкусовые почки: в центре, справа и слева (в плоскости среза) и сзади. */
export const BUDS: { r: number; phi: number }[] = [
  { r: 0, phi: 0 },
  { r: 2.3, phi: 0 },
  { r: 2.3, phi: Math.PI },
  { r: 2.0, phi: Math.PI / 2 },
];
export const BUD_AXES = BUDS.map(({ r, phi }) => onOuter(r, phi));

const SPH = new SphereGeometry(1, 12, 10);
const CYL = new CylinderGeometry(1, 1, 1, 6, 1, false);
const BUD_PROFILE: [number, number][] = [
  [0, -BUD_DEPTH],
  [0.5, -BUD_DEPTH],
  [0.72, -1.45],
  [0.78, -0.95],
  [0.62, -0.45],
  [0.3, -0.13],
  [0.12, -0.03],
  [0, -0.03],
];

export function buildBud(): Parts {
  const shell = new Batch();
  const pore = new Batch();
  const hairs = new Batch();
  const c1 = new Batch();
  const c2 = new Batch();
  const c3 = new Batch();
  const basal = new Batch();
  const nuclei = [new Batch(), new Batch(), new Batch()];
  const fibres: BufferGeometry[] = [];
  const rand = rng(77);
  const budShell = lathe(BUD_PROFILE, 28);
  const poreRing = new RingGeometry(0.07, 0.26, 24, 1).rotateX(-Math.PI / 2).translate(0, 0.015, 0);
  const poreCanal = new CylinderGeometry(0.11, 0.08, 0.2, 16, 1, true).translate(0, -0.08, 0);
  const tops: { p: Vector3; n: Vector3 }[] = [];

  for (const [budIndex, { p, n }] of BUD_AXES.entries()) {
    tops.push({ p, n });
    const M = alignMatrix([p.x, p.y, p.z], [n.x, n.y, n.z]);
    const L = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(M);
    shell.add(budShell, M);
    pore.add(poreRing, M).add(poreCanal, M);
    // вытянутые клетки сходятся от основания почки к поре
    const N = budIndex === 0 ? 48 : 36;
    for (let k = 0; k < N; k++) {
      const th = k * 2.39996 + rand() * 0.3;
      const rho = Math.sqrt((k + 0.5) / N);
      const base = L(Math.cos(th) * rho * 0.6, -BUD_DEPTH + 0.18, Math.sin(th) * rho * 0.6);
      const apex = L(Math.cos(th) * rho * 0.09, -0.16, Math.sin(th) * rho * 0.09);
      const mid = base.clone().lerp(apex, 0.48);
      const bulge = L(Math.cos(th) * rho * 0.72, -1.0, Math.sin(th) * rho * 0.72);
      mid.lerp(bulge, 0.35);
      const dir = apex.clone().sub(base);
      const len = dir.length();
      const roll = rand();
      const type = roll < 0.5 ? 0 : roll < 0.82 ? 1 : 2;
      const target = [c1, c2, c3][type];
      const thick = (type === 0 ? 0.069 : 0.089) * lerp(0.83, 1.18, rand());
      target.add(SPH, alignMatrix([mid.x, mid.y, mid.z], [dir.x, dir.y, dir.z], [thick, len / 2, thick]));
      const nuclear = mid.clone().addScaledVector(dir, (rand() - 0.65) * 0.34);
      const horizontal = nuclear.clone().sub(p).addScaledVector(n, -nuclear.clone().sub(p).dot(n)).normalize();
      nuclear.addScaledVector(horizontal, thick * 0.57);
      nuclei[type].add(SPH, alignMatrix(nuclear.toArray(), dir.toArray(), [thick * 0.62, 0.115 + rand() * 0.07, thick * 0.62]));
      if (roll >= 0.5 && k % 2 === 0) {
        // микроворсинки рецепторных клеток выходят в пору
        const tip = L(Math.cos(th) * 0.03, 0.06, Math.sin(th) * 0.03);
        const from = apex.clone();
        const d = tip.clone().sub(from);
        hairs.add(CYL, alignMatrix([(from.x + tip.x) / 2, (from.y + tip.y) / 2, (from.z + tip.z) / 2], [d.x, d.y, d.z], [0.014, d.length(), 0.014]));
      }
    }
    for (let k = 0; k < 9; k++) {
      const th = (k / 9) * Math.PI * 2 + rand() * 0.4;
      const q = L(Math.cos(th) * 0.42, -BUD_DEPTH + 0.14, Math.sin(th) * 0.42);
      basal.add(SPH, new Matrix4().compose(q, new Quaternion(), new Vector3(0.12, 0.1, 0.12)));
    }
    // нервные волокна входят снизу и оплетают клетки
    for (let k = 0; k < 7; k++) {
      const th = (k / 7) * Math.PI * 2;
      const pts: V3[] = [];
      for (let q = 0; q <= 8; q++) {
        const t = q / 8;
        const y = lerp(-BUD_DEPTH - 1.0, -0.7, t);
        const rr = lerp(0.15, 0.45, Math.min(1, t * 1.6)) * (1 + 0.15 * Math.sin(q * 2 + k));
        const a = th + 0.5 * Math.sin(q * 1.3 + k);
        const w = L(Math.cos(a) * rr, y, Math.sin(a) * rr);
        pts.push([w.x, w.y, w.z]);
      }
      fibres.push(tube(pts, 0.028, { m: 6, n: 40 }));
    }
  }

  // нерв в стержне сосочка: ствол снизу с ветвями к каждой почке
  const nerve: BufferGeometry[] = [tube([[-0.4, BOTTOM + 0.2, 0.3], [-0.3, -3.5, 0.2], [-0.2, -1.2, 0.1], [0, 0.6, 0]], (x) => lerp(0.3, 0.2, x), { m: 12, n: 40 })];
  tops.forEach((t, k) => {
    const base = t.p.clone().addScaledVector(t.n, -BUD_DEPTH - 1.0);
    nerve.push(tube([[0, 0.6, 0], [base.x * 0.5, lerp(0.6, base.y, 0.6), base.z * 0.5], [base.x, base.y, base.z]], (x) => lerp(0.13, 0.07, x) * (k === 0 ? 1.1 : 1), { m: 9, n: 24 }));
  });

  // капиллярные петли поднимаются в стержень шляпки
  const caps: BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const phi = (k / 7) * Math.PI * 2 + 0.3;
    const c = Math.cos(phi);
    const s = -Math.sin(phi);
    const rTop = k % 2 ? 2.0 : 1.2;
    const up: V3[] = [
      [0.55 * c, BOTTOM + 0.3, 0.55 * s],
      [0.75 * c, -2, 0.75 * s],
      [0.75 * c, 0.6, 0.75 * s],
      [rTop * c, 2.05, rTop * s],
      [(rTop + 0.25) * c, 2.3, (rTop + 0.25) * s],
    ];
    const down: V3[] = [
      [(rTop + 0.25) * c, 2.3, (rTop + 0.25) * s],
      [(rTop + 0.5) * c, 2.05, (rTop + 0.5) * s],
      [0.95 * c + 0.2 * s, 0.6, 0.95 * s - 0.2 * c],
      [0.85 * c + 0.2 * s, -2, 0.85 * s - 0.2 * c],
      [0.75 * c + 0.2 * s, BOTTOM + 0.3, 0.75 * s - 0.2 * c],
    ];
    caps.push(tube([...up, ...down.slice(1)], 0.075, { m: 7, n: 60 }));
  }
  // сеть под плоской слизистой
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const pts: V3[] = [];
    for (let q = 0; q <= 10; q++) {
      const r = lerp(3.4, 9.2, q / 10);
      const aa = a + 0.18 * Math.sin(q * 1.4 + k);
      pts.push([r * Math.cos(aa), -1.85 - 0.12 * Math.sin(q + k), -r * Math.sin(aa)]);
    }
    caps.push(tube(pts, 0.07, { m: 6, n: 40 }));
  }

  // слюна: тонкая плёнка над поверхностью и растворённые в ней молекулы вкусовых веществ
  const filmPts: [number, number][] = [
      [0, 4.82],
      ...OUTER.slice(1).map(([r, y]): [number, number] => [r, y + 0.2]),
      [10, 0.0],
      ...OUTER.slice(1)
        .reverse()
        .map(([r, y]): [number, number] => [r, y + 0.02]),
      [0, 4.62],
  ];
  const film = lathe(filmPts.filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]), 64);
  const mol = new Batch();
  for (let k = 0; k < 90; k++) {
    const r = Math.sqrt(rand()) * 8.5;
    const phi = rand() * Math.PI * 2;
    const { p, n } = onOuter(r, phi);
    const q = p.addScaledVector(n, 0.25 + rand() * 0.6);
    const s = 0.05 + rand() * 0.04;
    mol.add(SPH, new Matrix4().compose(q, new Quaternion(), new Vector3(s, s, s)));
  }

  const epithelium: [number, number][] = [...OUTER, [10, -1.6], ...INNER.slice(0, -1).reverse()];
  const core: [number, number][] = [...INNER, [10, BOTTOM], [0, BOTTOM]];
  const basement = lathe([...INNER.map(([r, y]): [number, number] => [r, y + 0.03]), [10, -1.6], ...INNER.slice(0, -1).reverse().map(([r, y]): [number, number] => [r, y - 0.03])], 72);

  return {
    'b-epithelium': [{ g: lathe(epithelium, 96), m: 'epithelium' }],
    'b-basement': [{ g: basement, m: 'basement' }],
    'b-core': [{ g: lathe(core, 72), m: 'lamina' }],
    'b-capillaries': [{ g: merge(caps), m: 'capillary' }],
    'b-nerve': [{ g: merge(nerve), m: 'fibre' }],
    'taste-bud': [{ g: shell.build(), m: 'budShell' }],
    'taste-pore': [{ g: pore.build(), m: 'pore' }],
    'taste-hairs': [{ g: hairs.build(), m: 'hairs' }],
    'cell-type1': [{ g: c1.build(), m: 'cell1' }, { g: nuclei[0].build(), m: 'nucleus', noPick: true }],
    'cell-type2': [{ g: c2.build(), m: 'cell2' }, { g: nuclei[1].build(), m: 'nucleus', noPick: true }],
    'cell-type3': [{ g: c3.build(), m: 'cell3' }, { g: nuclei[2].build(), m: 'nucleus', noPick: true }],
    'cell-basal': [{ g: basal.build(), m: 'basal' }],
    'b-fibers': [{ g: merge(fibres), m: 'fibre' }],
    'b-saliva': [
      { g: film, m: 'saliva' },
      { g: mol.build(), m: 'molecule' },
    ],
  };
}

/** Путь молекул вкусового вещества: из слюны в пору центральной почки. */
export const MOLECULE_PATH = curveOf([
  [-1.6, 6.4, 0.6],
  [-0.9, 5.6, 0.35],
  [-0.3, 4.95, 0.1],
  [0, 4.65, 0],
  [0, 4.45, 0],
]);
/** Путь нервного сигнала: от центральной почки вниз по стволу. */
export const SIGNAL_PATH = curveOf([
  [0, 4.6 - BUD_DEPTH - 0.6, 0.05],
  [0, 1.4, 0.05],
  [-0.2, -1.2, 0.15],
  [-0.3, -3.5, 0.25],
  [-0.4, BOTTOM + 0.3, 0.35],
]);
