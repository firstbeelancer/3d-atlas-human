import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from './geometry';

/* Процедурные текстуры пузыря: рисуются в canvas, никаких внешних файлов. */

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function base(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

/** Мягкие пятна-«облака» поверх базы. */
function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, colors: string[], n: number, rMin: number, rMax: number, alpha: number) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rMin + rand() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = colors[Math.floor(rand() * colors.length)];
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Короткие штрихи-волокна под углом. */
function fibres(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, colors: string[], n: number, len: number, angle: number, spread: number, width: number, alpha: number) {
  const rand = mulberry32(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const a = angle + (rand() - 0.5) * spread;
    const l = len * (0.5 + rand());
    ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    ctx.lineWidth = width * (0.6 + rand() * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Наружная поверхность стенки: бледно-розовая, с лёгкой мраморностью и волокнами под серозой. */
export function surfaceTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  base(ctx, 512, 512, '#cf8d76');
  blotches(ctx, 512, 512, 11, ['#dda189', '#bd7a63', '#e3ab94'], 90, 24, 90, 0.25);
  fibres(ctx, 512, 512, 12, ['#e0a58c', '#b9785f'], 500, 26, 0.5, 1.1, 1.4, 0.16);
  fibres(ctx, 512, 512, 13, ['#e8b49c'], 240, 18, 2.4, 1.2, 1.1, 0.12);
  return toTexture(canvas);
}

/** Детрузор: переплетающиеся пучки гладкой мышцы в двух направлениях. */
export function detrusorTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  base(ctx, 512, 512, '#a5573e');
  blotches(ctx, 512, 512, 21, ['#b96a4c', '#93482f'], 60, 30, 100, 0.3);
  fibres(ctx, 512, 512, 22, ['#c07a58', '#8f4630', '#d1916e'], 900, 44, 0.6, 0.5, 3.2, 0.35);
  fibres(ctx, 512, 512, 23, ['#bd6c4e', '#9c5138', '#cf8663'], 900, 44, -0.6, 0.5, 3.2, 0.35);
  fibres(ctx, 512, 512, 24, ['#e0a37e'], 260, 30, 1.5, 0.7, 1.6, 0.18);
  return toTexture(canvas);
}

/** Подслизистая основа: светлая, рыхлая, с сосудистыми крапинками. */
export function submucosaTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  base(ctx, 512, 512, '#eed9bd');
  blotches(ctx, 512, 512, 31, ['#f4e4c8', '#e3cba4'], 70, 26, 90, 0.3);
  const rand = mulberry32(32);
  for (let i = 0; i < 380; i++) {
    ctx.fillStyle = rand() > 0.45 ? 'rgba(178,64,54,0.5)' : 'rgba(84,96,164,0.5)';
    ctx.beginPath();
    ctx.arc(rand() * 512, rand() * 512, 0.8 + rand() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  fibres(ctx, 512, 512, 33, ['#fff3da', '#dcc49c'], 300, 30, 0.9, 1.6, 1.2, 0.2);
  return toTexture(canvas);
}

/** Слизистая изнутри: влажная розовая, с мягким рельефом и тонкой сосудистой сеткой. */
export function mucosaTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  base(ctx, 512, 512, '#d89484');
  blotches(ctx, 512, 512, 41, ['#e5aa99', '#c97e6d', '#efbda9'], 120, 18, 70, 0.3);
  const rand = mulberry32(42);
  ctx.lineCap = 'round';
  for (let i = 0; i < 130; i++) {
    // тонкие ветвящиеся сосудики
    let x = rand() * 512;
    let y = rand() * 512;
    let a = rand() * Math.PI * 2;
    ctx.strokeStyle = 'rgba(166,62,54,0.35)';
    ctx.lineWidth = 1 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * 16;
      y += Math.sin(a) * 16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  blotches(ctx, 512, 512, 43, ['#f2c4b2'], 60, 6, 20, 0.25);
  return toTexture(canvas);
}

/** Серозная оболочка (брюшина): почти прозрачно-бледная, с глянцевыми потёками. */
export function serosaTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  base(ctx, 256, 256, '#e9d9c8');
  blotches(ctx, 256, 256, 51, ['#f4e8da', '#dfcdb4'], 40, 20, 70, 0.3);
  fibres(ctx, 256, 256, 52, ['#ffffff', '#efe0cd'], 160, 40, 1.2, 0.8, 2.4, 0.15);
  return toTexture(canvas);
}

/** Адвентиция: волокнистая соединительная ткань без брюшины. */
export function adventitiaTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  base(ctx, 256, 256, '#d9bda0');
  fibres(ctx, 256, 256, 61, ['#c7a37e', '#ecd7ba', '#b8936c'], 700, 34, 0.4, 1.8, 1.8, 0.3);
  blotches(ctx, 256, 256, 62, ['#e6cdb0'], 30, 16, 50, 0.25);
  return toTexture(canvas);
}

/** Поперечнополосатая мышца (наружный сфинктер, тазовое дно): пучки с поперечной исчерченностью. */
export function striatedTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  base(ctx, 256, 256, '#9c4a3c');
  fibres(ctx, 256, 256, 71, ['#b25f4c', '#8a3e31', '#c4745e'], 500, 52, 0.12, 0.35, 5, 0.4);
  const rand = mulberry32(72);
  ctx.globalAlpha = 0.16;
  for (let x = 0; x < 256; x += 5 + rand() * 4) {
    ctx.fillStyle = '#5f2a20';
    ctx.fillRect(x, 0, 1.4, 256);
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}
