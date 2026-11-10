import { SphereGeometry, type BufferGeometry } from 'three';
import { curveOf, merge, tube, type V3 } from '../body/geo';

/*
  «Нейрон под микроскопом»: двигательный нейрон схематично, не в масштабе (настоящий аксон может быть
  длиной до метра, а тело — около 0,1 мм). Тело с ядром, ветвистые дендриты, аксонный холмик, аксон
  в миелиновых муфтах с перехватами Ранвье, концевые веточки с бляшками и синапс на дендрите соседней клетки.
  Сцена в своих единицах, центр — начало координат.
*/

export const SOMA: V3 = [-2.6, 0.05, 0];
export const SOMA_R = 0.5;
const AXON_START = -2.05;
const AXON_END = 2.55;
export const SHEATH = { count: 7, length: 0.5, gap: 0.1, radius: 0.12 };
export const AXON_R = 0.045;

/** Ось аксона: лёгкая волна, как у настоящего волокна. */
export const axonPoint = (x: number): V3 => [x, 0.05 + 0.06 * Math.sin(x * 1.3), 0.04 * Math.sin(x * 0.9 + 1)];

/** Где начинается и заканчивается каждая миелиновая муфта (по x). */
export function sheaths(): [number, number][] {
  const { count, length, gap } = SHEATH;
  const start = AXON_START + 0.38;
  return Array.from({ length: count }, (_, i) => [start + i * (length + gap), start + i * (length + gap) + length]);
}

/** Перехваты Ранвье — промежутки между муфтами: по ним импульс «перепрыгивает». */
export function nodes(): number[] {
  const s = sheaths();
  return s.slice(0, -1).map(([, end], i) => (end + s[i + 1][0]) / 2);
}

const axonPath = (from: number, to: number, n = 12): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => axonPoint(from + ((to - from) * i) / n));

function ball(at: V3, r: number | V3, detail: [number, number] = [14, 10]): BufferGeometry {
  const g = new SphereGeometry(1, detail[0], detail[1]);
  const [rx, ry, rz] = typeof r === 'number' ? [r, r, r] : r;
  g.scale(rx, ry, rz);
  g.translate(...at);
  return g;
}

/** Ветвистое дерево дендритов: псевдослучайно, но одинаково при каждой сборке. */
function dendrites(): BufferGeometry {
  const list: BufferGeometry[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const grow = (from: V3, dir: V3, length: number, r: number, depth: number) => {
    const bend: V3 = [dir[0] + (rand() - 0.5) * 0.5, dir[1] + (rand() - 0.5) * 0.5, dir[2] + (rand() - 0.5) * 0.5];
    const l = Math.hypot(...bend);
    const d: V3 = [bend[0] / l, bend[1] / l, bend[2] / l];
    const mid: V3 = [from[0] + (dir[0] + d[0]) * length * 0.25, from[1] + (dir[1] + d[1]) * length * 0.25, from[2] + (dir[2] + d[2]) * length * 0.25];
    const end: V3 = [from[0] + d[0] * length, from[1] + d[1] * length, from[2] + d[2] * length];
    list.push(tube([from, mid, end], (t) => r * (1 - 0.45 * t), { radial: depth === 0 ? 8 : 6, segments: 10 }));
    if (depth >= 2) return;
    for (const s of [-1, 1]) {
      const turn: V3 = [d[0] + s * d[1] * 0.7, d[1] - s * d[0] * 0.7, d[2] + (rand() - 0.5) * 0.8];
      grow(end, turn, length * 0.68, r * 0.55, depth + 1);
    }
  };
  const primaries: V3[] = [[-1, 0.6, 0.2], [-0.7, -0.8, -0.1], [-0.2, 1, -0.4], [0.1, -1, 0.5], [-0.9, 0.1, -0.8], [-0.4, 0.3, 1]];
  for (const p of primaries) {
    const l = Math.hypot(...p);
    const d: V3 = [p[0] / l, p[1] / l, p[2] / l];
    grow([SOMA[0] + d[0] * SOMA_R * 0.8, SOMA[1] + d[1] * SOMA_R * 0.8, SOMA[2] + d[2] * SOMA_R * 0.8], d, 0.75, 0.085, 0);
  }
  return merge(list);
}

/** Концы веточек аксона с бляшками; одна из бляшек образует синапс. */
export const TERMINALS: V3[] = [[3.25, 0.62, 0.15], [3.4, 0.18, -0.2], [3.32, -0.32, 0.2], [3.1, -0.72, -0.1]];
export const SYNAPSE_BOUTON = TERMINALS[1];
export const POST_DENDRITE_X = SYNAPSE_BOUTON[0] + 0.2;

export function buildNeuron(): Record<string, BufferGeometry> {
  const out: Record<string, BufferGeometry> = {};
  // тело клетки — чуть вытянутое к аксону, с бугорками у начала дендритов
  const soma = new SphereGeometry(SOMA_R, 40, 28);
  const pos = soma.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 9 + y * 4) * Math.cos(z * 7) + (x > 0 ? 0.18 * (x / SOMA_R) ** 3 : 0);
    pos.setXYZ(i, x * k, y * k * 0.92, z * k * 0.92);
  }
  soma.translate(...SOMA);
  soma.computeVertexNormals();
  out['neuron-body'] = soma;
  out.nucleus = merge([ball([SOMA[0] - 0.04, SOMA[1] + 0.02, 0], 0.2), ball([SOMA[0] - 0.06, SOMA[1] + 0.07, 0.12], 0.06, [10, 8])]);
  out.dendrites = dendrites();
  const hillockFrom: V3 = [SOMA[0] + SOMA_R * 0.82, SOMA[1], 0];
  out['axon-hillock'] = tube([hillockFrom, [(hillockFrom[0] + AXON_START) / 2, 0.04, 0.01], axonPoint(AXON_START + 0.3)], (t) => 0.2 * (1 - t) + AXON_R * 1.1 * t, { radial: 14, segments: 16 });
  out.axon = tube(axonPath(AXON_START, AXON_END, 40), AXON_R, { radial: 10, segments: 120 });
  out.myelin = merge(sheaths().map(([a, b]) =>
    tube(axonPath(a, b, 6), (t) => SHEATH.radius * Math.min(1, Math.sin(Math.PI * t) * 2.4), { radial: 18, segments: 18 })));
  out['ranvier-nodes'] = merge(nodes().map((x) => tube(axonPath(x - 0.035, x + 0.035, 2), AXON_R * 1.35, { radial: 12, segments: 3 })));
  const fork = axonPoint(AXON_END);
  out['axon-terminals'] = merge(TERMINALS.flatMap((end, i) => [
    tube([fork, [(fork[0] + end[0]) / 2, (fork[1] + end[1]) / 2 + 0.05 * (i - 1.5), (fork[2] + end[2]) / 2], end], (t) => AXON_R * (1 - 0.4 * t), { radial: 7, segments: 12 }),
    ball(end, 0.085),
  ]));
  // синапс: дендрит соседнего нейрона и пузырьки медиатора у мембраны бляшки
  const post = tube([[POST_DENDRITE_X + 0.05, -1.1, -0.1], [POST_DENDRITE_X, SYNAPSE_BOUTON[1], SYNAPSE_BOUTON[2]], [POST_DENDRITE_X + 0.1, 1.2, 0.05]], 0.1, { radial: 12, segments: 24 });
  const vesicles: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    vesicles.push(ball([SYNAPSE_BOUTON[0] + 0.02 + 0.03 * Math.cos(a), SYNAPSE_BOUTON[1] + 0.045 * Math.sin(a), SYNAPSE_BOUTON[2] + 0.045 * Math.cos(a * 1.7)], 0.017, [6, 5]));
  }
  out.synapse = merge([post, ...vesicles]);
  for (const g of Object.values(out)) g.computeBoundingBox();
  return out;
}

/** Путь импульса для анимации: вдоль аксона от холмика до бляшки синапса. */
export const impulsePath = () => curveOf([...axonPath(AXON_START + 0.3, AXON_END, 20), SYNAPSE_BOUTON]);
