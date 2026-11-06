/**
 * Зуб в челюсти: первый моляр нижней челюсти в блоке кости с десной, периодонтом,
 * нижнечелюстным каналом. Кость — корковый слой снаружи и губчатая (трабекулярная) внутри.
 */
import { makeToothField, SPECS } from './anatomy';
import { enamelColors, gridFor, insetCut, meshLayer, sampleTooth, toothLayerValue, toothSampler, TOOTH_LAYERS, type LayerMesh, type LayerSet, type ToothLayer } from './build';
import { gyroid, smax, smin, smoothstep, valueNoise } from './sdf';

export const JAW_TOOTH = 'l-m1';
export const JAW_LAYERS = ['gingiva', 'pdl', 'bone', 'spongy'] as const;
export type JawLayer = (typeof JAW_LAYERS)[number];

/** Полуширина блока по x и нижняя граница челюсти. */
export const JAW_HALF_X = 0.98;
export const JAW_BOTTOM = -2.75;
/** Нижнечелюстной канал: ось вдоль x. */
export const CANAL = { y: -1.95, z: -0.06, r: 0.13 };
const PDL = 0.03;

/** Внешняя форма тела нижней челюсти в сечении (y, z) и альвеолярный гребень. */
export function boneOuter(x: number, y: number, z: number): number {
  // сечение: узкий альвеолярный отросток сверху, широкое тело ниже, скруглённый низ
  const u = smoothstep(-0.1, -1.4, y);
  const half = 0.6 + 0.12 * u - 0.06 * smoothstep(-1.9, -2.75, y);
  const zc = -0.04 - 0.06 * u;
  const side = Math.abs(z - zc) - half;
  const bottom = JAW_BOTTOM - y;
  // гребень межзубных перегородок выше, над корнями — ниже ЭЦГ на 1,3–1,5 мм
  let d = smax(side, bottom, 0.28);
  d = smax(d, y - crestAt(x, z), 0.05);
  return smax(d, Math.abs(x) - JAW_HALF_X, 0.006);
}

/** Альвеолярный гребень: межзубные перегородки выше, над корнями — на 1,3–1,5 мм ниже ЭЦГ. */
export function crestAt(x: number, z: number): number {
  return -0.14 + 0.09 * smoothstep(0.5, 0.8, Math.abs(x)) + 0.03 * smoothstep(0.2, 0.0, Math.abs(z));
}

/** То же сечение без торцов блока: от него считаем корковый слой (на торцах видна губчатая кость). */
function boneSides(y: number, z: number): number {
  const u = smoothstep(-0.1, -1.4, y);
  const half = 0.6 + 0.12 * u - 0.06 * smoothstep(-1.9, -2.75, y);
  const zc = -0.04 - 0.06 * u;
  return smax(Math.abs(z - zc) - half, JAW_BOTTOM - y, 0.28);
}

export interface JawBuild {
  full: LayerSet<ToothLayer | JawLayer>;
  cut: LayerSet<ToothLayer | JawLayer>;
}

export function buildJaw(step: number): JawBuild {
  const spec = SPECS[JAW_TOOTH];
  const f = makeToothField(spec);
  const g = gridFor([-JAW_HALF_X, JAW_BOTTOM, -1.0], [JAW_HALF_X, spec.h + 0.1, 0.95], step);
  const N = g.nx * g.ny * g.nz;
  const T = new Float32Array(N);
  const D = new Float32Array(N);
  const Pf = new Float32Array(N);
  const C = new Float32Array(N);
  const Tn = new Float32Array(N);
  sampleTooth(f, g, 0, T, D, Pf, C, Tn);

  const B = new Float32Array(N); // внешняя форма кости
  const Bone = new Float32Array(N); // кость с лункой и каналом
  const Cort = new Float32Array(N); // насколько глубоко под поверхностью кости (для коркового слоя)
  const Tr = new Float32Array(N); // трабекулы
  const G = new Float32Array(N); // десна
  const freq = (2 * Math.PI) / 0.2;
  let p = 0;
  for (let k = 0; k < g.nz; k++) {
    const z = g.z0 + k * g.h;
    for (let j = 0; j < g.ny; j++) {
      const y = g.y0 + j * g.h;
      for (let i = 0; i < g.nx; i++, p++) {
        const x = g.x0 + i * g.h;
        const b = boneOuter(x, y, z);
        B[p] = b;
        const t = Tn[p];
        const sock = t - PDL;
        const cy = y - CANAL.y;
        const cz = z - CANAL.z;
        const canal = Math.sqrt(cy * cy + cz * cz) - CANAL.r;
        const bone = Math.max(b, -sock, -canal);
        Bone[p] = bone;
        // корковая пластинка: снаружи ~1,2 мм (снизу толще), стенка лунки и канала ~0,3 мм
        const outerT = 0.11 + 0.1 * smoothstep(-2.1, -2.75, y);
        const sides = smax(boneSides(y, z), y - crestAt(x, z), 0.05);
        Cort[p] = Math.min(-sides - outerT, sock - 0.03, canal - 0.03);
        if (bone < 0.05) {
          // трабекулы: гироид с искажённым шумом пространством — неправильная сеть перекладин и ячеек
          const wx = x + 0.05 * (valueNoise(x * 7, y * 7, z * 7) - 0.5);
          const wy = y + 0.05 * (valueNoise(x * 7 + 31, y * 7, z * 7) - 0.5);
          const wz = z + 0.05 * (valueNoise(x * 7, y * 7 + 17, z * 7) - 0.5);
          const n = valueNoise(x * 14, y * 14, z * 14);
          const gy = gyroid(wx * freq + 1.3, wy * freq * 0.85, wz * freq + 0.7);
          Tr[p] = (Math.abs(gy) - 0.62 - 0.5 * (n - 0.5)) / freq;
        } else Tr[p] = 1;
        // десна: воротник вокруг шейки (край на 1–1,5 мм выше ЭЦГ, сходит на нет к зубу) и пласт над гребнем
        // воротник десны считаем по «сырому» полю: оно непрерывно и вдали от зуба
        const tr = T[p];
        const tPos = tr > 0 ? tr : 0;
        const gumTop = Math.max(crestAt(x, z) + 0.13, 0.13 - 1.25 * tPos);
        let gum = smin(b - 0.13, tr - 0.12, 0.08);
        gum = smax(gum, y - gumTop, 0.05);
        gum = smax(gum, -0.78 - y, 0.12);
        gum = smax(gum, Math.abs(x) - JAW_HALF_X, 0.006);
        G[p] = Math.max(gum, -b, -(t - 0.002));
      }
    }
  }

  const field = new Float32Array(N);
  const sampler = toothSampler(f, 0);
  const res: JawBuild = { full: {}, cut: {} };
  for (const variant of ['full', 'cut'] as const) {
    const cutZ = variant === 'cut' ? 0.0 : null;
    for (const layer of TOOTH_LAYERS) {
      const m: LayerMesh = meshLayer(g, (q, y) => toothLayerValue(layer, q, y, spec.chamberFloor, T, D, Pf, C), insetCut(layer, cutZ), field);
      if (layer === 'enamel') m.colors = enamelColors(m.positions, sampler, spec);
      res[variant][layer] = m;
    }
    res[variant].gingiva = meshLayer(g, (q) => G[q], cutZ, field);
    // периодонт: щель между корнем и стенкой лунки ниже гребня
    res[variant].pdl = meshLayer(g, (q) => Math.max(Tn[q] - PDL, -T[q], B[q] - 0.01), cutZ, field);
    if (variant === 'full') {
      // целиком кость видна только снаружи: одно сплошное тело, без внутренних трабекул
      res.full.bone = meshLayer(g, (q) => Bone[q], null, field);
    } else {
      res.cut.bone = meshLayer(g, (q) => Math.max(Bone[q], Cort[q]), cutZ, field);
      res.cut.spongy = meshLayer(g, (q) => Math.max(Bone[q], -Cort[q], Tr[q]), cutZ, field);
    }
  }
  return res;
}
