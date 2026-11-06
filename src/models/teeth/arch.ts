/**
 * Зубной ряд: 32 постоянных зуба на верхней и нижней дугах с десной.
 * Каждый зуб строится из того же поля, что и крупные модели, но на более грубой сетке и одной сеткой:
 * коронка окрашена как эмаль, корень — как цемент.
 */
import { LOWER, makeToothField, SPECS, UPPER, type ToothSpec } from './anatomy';
import { gridFor, meshLayer, sampleTooth, type LayerMesh } from './build';
import { smax, smoothstep } from './sdf';
import type { MeshData } from './surfaceNets';

export interface Placement {
  specId: string;
  jaw: 'upper' | 'lower';
  /** Сторона: 1 — правая половина сцены, -1 — левая (зеркально). */
  side: 1 | -1;
  /** Номер от центра (0 — центральный резец). */
  index: number;
  pos: [number, number, number];
  /** Поворот вокруг вертикали. */
  yaw: number;
}

/** Окклюзионная плоскость (где смыкаются зубы). */
export const OCCLUSAL_Y = 0.0;

/** Дуга: точка на расстоянии s от середины вдоль кривой (правая половина), касательная и нормаль. */
function archCurve(jaw: 'upper' | 'lower') {
  // U-образная дуга: x = A sin(t), z = B cos(t)^1.4 — плоская спереди, почти параллельные ветви сзади
  const A = jaw === 'upper' ? 2.45 : 2.25;
  const Bz = jaw === 'upper' ? 4.3 : 4.0;
  const pts: [number, number][] = [];
  const M = 400;
  for (let i = 0; i <= M; i++) {
    const t = (i / M) * (Math.PI / 2) * 0.98;
    pts.push([A * Math.sin(t), Bz * Math.pow(Math.cos(t), 1.4) - Bz + 1.6]);
  }
  const len: number[] = [0];
  for (let i = 1; i < pts.length; i++)
    len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = (s: number) => {
    let i = 1;
    while (i < len.length - 1 && len[i] < s) i++;
    const t = (s - len[i - 1]) / (len[i] - len[i - 1] || 1);
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
    const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
    const dx = pts[i][0] - pts[i - 1][0];
    const dz = pts[i][1] - pts[i - 1][1];
    const l = Math.hypot(dx, dz) || 1;
    return { x, z, tx: dx / l, tz: dz / l };
  };
  return { at, pts, total: len[len.length - 1] };
}

export function archLayout(): Placement[] {
  const out: Placement[] = [];
  for (const jaw of ['upper', 'lower'] as const) {
    const list = jaw === 'upper' ? UPPER : LOWER;
    const curve = archCurve(jaw);
    let s = 0;
    list.forEach((spec, index) => {
      const w = spec.md.max * 2 * 0.97;
      const c = curve.at(s + w / 2);
      s += w;
      for (const side of [1, -1] as const) {
        // касательная направлена дистально (+x зуба), нормаль наружу (+z зуба)
        const yaw = Math.atan2(-c.tz, c.tx);
        const overlap = spec.kind === 'incisor' || spec.kind === 'canine' ? 0.2 : 0.1;
        const y = jaw === 'lower' ? OCCLUSAL_Y - spec.h + overlap * 0.5 : OCCLUSAL_Y + spec.h - overlap * 0.5;
        out.push({
          specId: spec.id,
          jaw,
          side,
          index,
          pos: [c.x * side, y, c.z],
          yaw: side === 1 ? yaw : -yaw,
        });
      }
    });
  }
  return out;
}

/** Сетка одного зуба ряда: только наружная поверхность, цвет — эмаль над ЭЦГ, цемент под ней. */
export function buildArchTooth(spec: ToothSpec, step: number): LayerMesh {
  const f = makeToothField(spec);
  const g = gridFor(f.box.min, f.box.max, step);
  const N = g.nx * g.ny * g.nz;
  const T = new Float32Array(N);
  const D = new Float32Array(N);
  const Pf = new Float32Array(N);
  const C = new Float32Array(N);
  sampleTooth(f, g, 0, T, D, Pf, C);
  const field = new Float32Array(N);
  const m: LayerMesh = meshLayer(g, (p) => T[p], null, field);
  const col = new Float32Array(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i];
    const y = m.positions[i + 1];
    const z = m.positions[i + 2];
    const e = smoothstep(-0.015, 0.015, y - f.cej(x, z));
    const up = smoothstep(0.0, spec.h, y);
    col[i] = 0.84 + (0.95 - 0.84) * e;
    col[i + 1] = 0.72 + (0.92 - 0.72) * e + 0.02 * up * e;
    col[i + 2] = 0.52 + (0.84 - 0.52) * e + 0.05 * up * e;
  }
  m.colors = col;
  return m;
}

/**
 * Десна одной челюсти (в координатах нижней; верхнюю отражаем по y): подкова вдоль дуги,
 * край десны с межзубными сосочками, корни спрятаны внутри.
 */
export function buildGum(jaw: 'upper' | 'lower', step: number): MeshData {
  const curve = archCurve(jaw);
  const list = jaw === 'upper' ? UPPER : LOWER;
  // центры зубов и межзубные контакты вдоль дуги, высота ЭЦГ каждого зуба
  const centers: number[] = [];
  const cej: number[] = [];
  const contacts: number[] = [0];
  let s = 0;
  for (const spec of list) {
    const w = spec.md.max * 2 * 0.97;
    centers.push(s + w / 2);
    s += w;
    contacts.push(s);
    const overlap = spec.kind === 'incisor' || spec.kind === 'canine' ? 0.2 : 0.1;
    cej.push(-spec.h + overlap * 0.5);
  }
  const total = s;
  const cejAt = (a: number) => {
    if (a <= centers[0]) return cej[0];
    for (let q = 1; q < centers.length; q++)
      if (a <= centers[q]) {
        const t = (a - centers[q - 1]) / (centers[q] - centers[q - 1]);
        return cej[q - 1] + (cej[q] - cej[q - 1]) * t * t * (3 - 2 * t);
      }
    return cej[cej.length - 1];
  };
  const pts = curve.pts;
  const acc: number[] = [0];
  for (let q = 1; q < pts.length; q++) acc.push(acc[q - 1] + Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]));
  const g = gridFor([-3.0, -3.1, -2.9], [3.0, 0.0, 2.7], step);
  const N = g.nx * g.ny * g.nz;
  const field = new Float32Array(N);
  const cols = g.nx * g.nz;
  const dist = new Float32Array(cols);
  const arc = new Float32Array(cols);
  for (let k = 0; k < g.nz; k++)
    for (let i = 0; i < g.nx; i++) {
      const x = Math.abs(g.x0 + i * g.h);
      const z = g.z0 + k * g.h;
      let best = 1e9;
      let bs = 0;
      for (let q = 1; q < pts.length; q++) {
        const ax = pts[q - 1][0];
        const az = pts[q - 1][1];
        const dx = pts[q][0] - ax;
        const dz = pts[q][1] - az;
        const l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const ex = ax + dx * t - x;
        const ez = az + dz * t - z;
        const d = ex * ex + ez * ez;
        if (d < best) {
          best = d;
          bs = acc[q - 1] + Math.sqrt(l2) * t;
        }
      }
      let d = Math.sqrt(best);
      // за последним зубом десна закругляется
      if (bs > total + 0.1) d = Math.hypot(d, bs - total - 0.1);
      dist[i + g.nx * k] = d;
      arc[i + g.nx * k] = bs;
    }
  let p = 0;
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++) {
      const y = g.y0 + j * g.h;
      for (let i = 0; i < g.nx; i++, p++) {
        const c = i + g.nx * k;
        const a = arc[c];
        let near = 1e9;
        for (let q = 0; q < contacts.length; q++) near = Math.min(near, Math.abs(a - contacts[q]));
        const papilla = a > total + 0.05 ? 0 : Math.exp(-((near / 0.13) ** 2));
        const base = cejAt(Math.min(a, total));
        // край десны на 1–1,5 мм выше ЭЦГ, межзубные сосочки поднимаются выше
        const margin = base + 0.1 + 0.2 * papilla;
        const half = 0.6 + 0.08 * smoothstep(-0.1, -1.0, y - base);
        let d = dist[c] - half;
        d = smax(d, y - margin, 0.08);
        d = smax(d, base - 1.55 - y, 0.3);
        field[p] = d;
      }
    }
  return meshLayer(g, (q) => field[q], null, new Float32Array(N));
}

export const ARCH_SPECS = [...UPPER, ...LOWER].map((s) => s.id);
export { SPECS };
