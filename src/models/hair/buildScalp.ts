import { Float32BufferAttribute, type BufferGeometry } from 'three';
import { meshSdf } from '../skeleton/sdf';
import { AX, R, SK, epiBottom, poreDepression } from './anatomy';
import { clamp, lerp, smooth } from './geometry';

const top = (x: number, z: number) =>
  0.075 * Math.sin((x - 4) * 0.63) + 0.048 * Math.sin((x - 4) * 1.2 + z * 1.8)
  + 0.057 * Math.sin(z * 0.6) + 0.72 * poreDepression(x, z);
const papillaryBase = (x: number, z: number) => SK.papillary + 0.11 * Math.sin(0.81 * x + 1.28 * z);
const dermisBase = (x: number, z: number) => SK.reticular + 0.22 * Math.sin(0.65 * x + 0.4 * z)
  + 0.11 * Math.sin(1.41 * x - z);
const deepBase = (x: number, z: number) => SK.bottom + 0.18 * Math.sin(x + 0.7 * z);

/** Контур образца по глубине с закруглённым краем и небольшим скосом. */
export function scalpMargin(x: number, y: number, z: number): number {
  const depth = clamp(-y / 9.6);
  const halfX = 8.6 - 0.94 * depth + 0.14 * Math.sin(z * 0.96 + depth * 4);
  const halfZ = 4.48 - 0.43 * depth + 0.15 * Math.sin(x * 0.65 + 0.3);
  const sx = (x + 0.24 + depth * 0.31) / halfX;
  const sz = (z + 0.25 + 0.22 * Math.sin(x * 0.46)) / halfZ;
  return 2.4 * ((sx ** 8 + sz ** 8) ** 0.125 - 1);
}

// Сечение траектории фолликула с привязкой к глубине. У донышка полость переходит в округлую луковицу.
const axisSamples = Array.from({ length: 121 }, (_, i) => {
  const u = i / 120;
  return { p: AX.getPoint(u), r: R.ct(u) };
});
const canal = Array.from({ length: 181 }, (_, i) => {
  const y = 0.5 - i * 0.056;
  const index = axisSamples.findIndex(({ p }) => p.y <= y);
  if (index === 0) return { x: 4.0, r: R.ct(0) };
  if (index < 0) return { x: 1.65, r: 1.22 * (1 - smooth(7.23, 8.84, -y)) ** 0.58 };
  const upper = axisSamples[index - 1];
  const lower = axisSamples[index];
  const t = (upper.p.y - y) / (upper.p.y - lower.p.y);
  return { x: lerp(upper.p.x, lower.p.x, t), r: lerp(upper.r, lower.r, t) };
});

function follicleSpace(x: number, y: number, z: number): number {
  const sample = clamp((0.5 - y) / 0.056, 0, canal.length - 2);
  const i = Math.floor(sample);
  const a = canal[i];
  const b = canal[i + 1];
  const dx = (x - lerp(a.x, b.x, sample - i)) * 0.94;
  const r = lerp(a.r, b.r, sample - i);
  return Math.hypot(dx, z) - r;
}

type Height = (x: number, z: number) => number;

function tissue(topY: Height, bottomY: Height, minY: number, maxY: number, cell: number): BufferGeometry {
  const g = meshSdf((x, y, z) => Math.max(scalpMargin(x, y, z), y - topY(x, z), bottomY(x, z) - y, -follicleSpace(x, y, z)), {
    min: [SK.x0 - 0.5, minY, -5.15], max: [SK.x1 + 0.4, maxY, 5.05], cell,
  });
  const positions = g.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = 0.055 * positions.getX(i);
    uv[i * 2 + 1] = 0.09 * positions.getZ(i) + 0.033 * positions.getY(i);
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

export function buildScalp() {
  const cornBot: Height = (x, z) => top(x, z) - 0.145;
  const basalBot: Height = (x, z) => epiBottom(x, z) - 0.078;
  return {
    corneum: tissue(top, cornBot, -0.72, 0.4, 0.092),
    epidermis: tissue(cornBot, epiBottom, -1.19, 0.24, 0.108),
    basal: tissue(epiBottom, basalBot, -1.24, -0.4, 0.068),
    papillary: tissue(basalBot, papillaryBase, -2.2, -0.5, 0.14),
    reticular: tissue(papillaryBase, dermisBase, -5.79, -1.61, 0.181),
    hypodermis: tissue(dermisBase, deepBase, -10.18, -4.63, 0.192),
  };
}
