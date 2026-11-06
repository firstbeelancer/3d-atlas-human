import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from './geometry';

/* Процедурные текстуры глаза: рисуются в canvas при первом показе, никаких файлов. */

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Шум значений, периодичный по u (шов текстуры не виден): fu — целое число ячеек по кругу. */
function pnoise(u: number, v: number, fu: number, fv: number, seed: number): number {
  const x = u * fu;
  const y = v * fv;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const i0 = ((x0 % fu) + fu) % fu;
  const i1 = (i0 + 1) % fu;
  const a = hash(i0, y0, seed);
  const b = hash(i1, y0, seed);
  const c = hash(i0, y0 + 1, seed);
  const d = hash(i1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, repeatU = true): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  if (repeatU) tex.wrapS = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

type RGB = [number, number, number];

export interface IrisPalette {
  inner: RGB;
  outer: RGB;
  ring: RGB;
}

export const IRIS_PALETTES = {
  hazel: { inner: [168, 118, 52], outer: [92, 124, 98], ring: [214, 170, 90] },
  blue: { inner: [150, 132, 98], outer: [88, 128, 176], ring: [190, 200, 205] },
  brown: { inner: [120, 72, 34], outer: [82, 48, 26], ring: [170, 108, 56] },
} satisfies Record<string, IrisPalette>;

export type IrisColor = keyof typeof IRIS_PALETTES;

/** Радужка: u — по кругу, v — от зрачка (0) к корню (1). Верх canvas — корень. */
export function irisTexture(palette: IrisPalette = IRIS_PALETTES.hazel): CanvasTexture {
  const W = 1024;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const fiber = 0.5 * pnoise(u, v, 180, 3, 1) + 0.3 * pnoise(u, v, 96, 6, 2) + 0.2 * pnoise(u, v, 320, 2, 3);
      const collarette = 0.36 + 0.03 * Math.sin(u * Math.PI * 2 * 11 + 1.3) + 0.012 * Math.sin(u * Math.PI * 2 * 29);
      const m = sstep(collarette - 0.05, collarette + 0.1, v);
      let r = mix(palette.inner[0], palette.outer[0], m);
      let g = mix(palette.inner[1], palette.outer[1], m);
      let b = mix(palette.inner[2], palette.outer[2], m);
      let k = 0.5 + 1.0 * fiber;
      // складки сокращения: тонкие концентрические бороздки
      k *= 0.9 + 0.1 * Math.sin(v * 150 + pnoise(u, v, 8, 4, 5) * 6);
      // крипты: тёмные «ниши» вокруг воротничка
      const crypt = pnoise(u, v, 30, 7, 4);
      if (v > 0.2 && v < 0.82 && crypt > 0.66) k *= 1 - 0.7 * sstep(0.66, 0.85, crypt);
      // воротничок (collarette) светлее
      const col = Math.exp(-Math.pow((v - collarette) / 0.022, 2));
      r = mix(r, palette.ring[0], col * 0.65);
      g = mix(g, palette.ring[1], col * 0.65);
      b = mix(b, palette.ring[2], col * 0.65);
      // зрачковая кайма — тёмная
      const ruff = 1 - sstep(0.0, 0.07, v);
      k *= 1 - 0.65 * ruff;
      r = mix(r, 52, ruff * 0.6);
      g = mix(g, 30, ruff * 0.6);
      b = mix(b, 18, ruff * 0.6);
      // лимбальное кольцо у корня — темнее
      k *= 1 - 0.62 * sstep(0.86, 1.0, v);
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, r * k);
      img.data[i + 1] = Math.min(255, g * k);
      img.data[i + 2] = Math.min(255, b * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/** Склера: v — от заднего полюса (0) к лимбу (1). Верх canvas — лимб. */
export function scleraTexture(): CanvasTexture {
  const W = 768;
  const H = 384;
  const { canvas, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const n = pnoise(u, v, 12, 6, 7) * 0.5 + pnoise(u, v, 48, 24, 8) * 0.3 + pnoise(u, v, 160, 80, 9) * 0.2;
      const streak = pnoise(u, v, 90, 5, 10);
      const k = 0.955 + 0.06 * n + 0.025 * streak;
      const warm = 0.35 * sstep(0.85, 1, v) + 0.18 * (1 - sstep(0, 0.2, v));
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, 243 * k);
      img.data[i + 1] = Math.min(255, (240 - 6 * warm * 8) * k);
      img.data[i + 2] = Math.min(255, (230 - 14 * warm * 8) * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/** Конъюнктива: полупрозрачная плёнка с мелкими красными сосудами. v — от свода (0) к лимбу (1). */
export function conjunctivaTexture(): CanvasTexture {
  const W = 1024;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const rng = mulberry32(21);
  ctx.fillStyle = 'rgba(255, 226, 220, 0.16)';
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  const vessel = (x: number, y: number, len: number, w: number, depth: number, dir: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    let cx = x;
    let cy = y;
    const steps = Math.round(len / 7);
    for (let i = 0; i < steps; i++) {
      cx += (rng() - 0.5) * 7 + dir * 1.2;
      cy -= 7; // к лимбу — вверх по canvas
      ctx.lineTo(cx, cy);
      if (depth < 3 && rng() < 0.11) vessel(cx, cy, len * 0.5, w * 0.62, depth + 1, (rng() - 0.5) * 3);
    }
    ctx.strokeStyle = `rgba(${176 - depth * 8}, ${28 + depth * 12}, ${30 + depth * 10}, ${0.7 - depth * 0.12})`;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  for (let i = 0; i < 90; i++) vessel(rng() * W, H * (0.95 - rng() * 0.2), H * (0.55 + rng() * 0.35), 1.6 + rng() * 1.4, 0, (rng() - 0.5) * 2);
  // у лимба сосуды редеют: белёсая полоса
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.18, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(canvas);
}

/** Хориоидея: тёмная красно-коричневая сеть сосудов. v — от полюса (0) к зубчатой линии (1). */
export function choroidTexture(): CanvasTexture {
  const W = 512;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const a = Math.abs(pnoise(u, v, 40, 20, 31) * 2 - 1);
      const b = Math.abs(pnoise(u, v, 90, 45, 32) * 2 - 1);
      const web = Math.pow(1 - Math.min(a, b * 1.2), 6);
      const mott = pnoise(u, v, 16, 8, 33);
      const i = (y * W + x) * 4;
      img.data[i] = 84 + 90 * web + 30 * mott;
      img.data[i + 1] = 22 + 34 * web + 8 * mott;
      img.data[i + 2] = 18 + 26 * web;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/** Сетчатка: тёплый оранжево-красный фон с мягкой зернистостью. */
export function retinaTexture(): CanvasTexture {
  const W = 768;
  const H = 384;
  const { canvas, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const n = 0.55 * pnoise(u, v, 24, 12, 41) + 0.3 * pnoise(u, v, 96, 48, 42) + 0.15 * pnoise(u, v, 300, 150, 43);
      const k = 0.86 + 0.28 * n - 0.16 * sstep(0.7, 1, v);
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, 226 * k);
      img.data[i + 1] = Math.min(255, 104 * k);
      img.data[i + 2] = Math.min(255, 66 * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

function radial(size: number, stops: [number, string][]): CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, false);
}

export function maculaTexture(): CanvasTexture {
  return radial(256, [
    [0, 'rgba(216,140,30,0.85)'],
    [0.45, 'rgba(214,150,40,0.7)'],
    [0.8, 'rgba(210,160,60,0.25)'],
    [1, 'rgba(210,160,60,0)'],
  ]);
}

export function foveaTexture(): CanvasTexture {
  return radial(256, [
    [0, 'rgba(120,40,18,0.95)'],
    [0.5, 'rgba(150,56,26,0.9)'],
    [0.72, 'rgba(255,214,150,0.85)'],
    [0.88, 'rgba(180,70,34,0.4)'],
    [1, 'rgba(180,70,34,0)'],
  ]);
}

export function discTexture(): CanvasTexture {
  return radial(256, [
    [0, 'rgba(255,238,205,1)'],
    [0.42, 'rgba(250,224,186,1)'],
    [0.6, 'rgba(242,176,128,1)'],
    [0.86, 'rgba(232,140,98,0.95)'],
    [1, 'rgba(232,140,98,0)'],
  ]);
}

/** Мягкая полоса лимба: прозрачная по краям. v — поперёк. */
export function limbusTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(8, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(150,160,165,0)');
  g.addColorStop(0.5, 'rgba(150,160,165,0.7)');
  g.addColorStop(1, 'rgba(150,160,165,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  return toTexture(canvas);
}
