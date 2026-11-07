import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from './geometry';

/* Процедурные текстуры желчного пузыря: рисуются в canvas, внешних файлов нет. Все бесшовные — повторяются по обеим осям. */

type Ctx = CanvasRenderingContext2D;

function canvasOf(w: number, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')!, w, h };
}

function toTexture(canvas: HTMLCanvasElement, color = true): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Рисует фигуру во всех девяти копиях холста, чтобы текстура была бесшовной. */
function tiled(w: number, h: number, x: number, y: number, r: number, draw: (ox: number, oy: number) => void) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const ox = x + dx * w;
      const oy = y + dy * h;
      if (ox + r < 0 || ox - r > w || oy + r < 0 || oy - r > h) continue;
      draw(ox, oy);
    }
  }
}

function fill(ctx: Ctx, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function blotches(ctx: Ctx, w: number, h: number, seed: number, colors: string[], n: number, rMin: number, rMax: number, alpha: number) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rMin + rand() * (rMax - rMin);
    const c = colors[Math.floor(rand() * colors.length)];
    const a = alpha * (0.4 + rand() * 0.6);
    tiled(w, h, x, y, r, (ox, oy) => {
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
      g.addColorStop(0, c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
}

function dots(ctx: Ctx, w: number, h: number, seed: number, colors: string[], n: number, rMin: number, rMax: number, alpha: number) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rMin + rand() * (rMax - rMin);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    tiled(w, h, x, y, r, (ox, oy) => {
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
}

function streaks(ctx: Ctx, w: number, h: number, seed: number, colors: string[], n: number, len: number, angle: number, spread: number, width: number, alpha: number) {
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
    tiled(w, h, x, y, l, (ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.quadraticCurveTo(ox + Math.cos(a + 0.4) * l * 0.5, oy + Math.sin(a + 0.4) * l * 0.5, ox + Math.cos(a) * l, oy + Math.sin(a) * l);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

/** Сеть мелких сосудов: ветвящиеся извилистые линии. */
function capillaries(ctx: Ctx, w: number, h: number, seed: number, colors: string[], trunks: number, depth: number, width: number, alpha: number) {
  const rand = mulberry32(seed);
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, lw: number, d: number) => {
    let cx = x;
    let cy = y;
    let ca = a;
    const steps = 7 + Math.floor(rand() * 4);
    ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha * (0.5 + d * 0.15);
    ctx.lineWidth = lw;
    const pts: [number, number][] = [[cx, cy]];
    for (let i = 0; i < steps; i++) {
      ca += (rand() - 0.5) * 0.75;
      cx += Math.cos(ca) * (len / steps);
      cy += Math.sin(ca) * (len / steps);
      pts.push([cx, cy]);
    }
    for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px + dx, py + dy) : ctx.lineTo(px + dx, py + dy)));
      ctx.stroke();
    }
    if (d > 0) {
      for (let i = 2; i < pts.length - 1; i += 2) {
        if (rand() < 0.75) branch(pts[i][0], pts[i][1], ca + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.7), len * 0.55, lw * 0.62, d - 1);
      }
    }
  };
  for (let i = 0; i < trunks; i++) branch(rand() * w, rand() * h, rand() * Math.PI * 2, 120 + rand() * 120, width, depth);
  ctx.globalAlpha = 1;
}

/** Наружная поверхность пузыря: тёмно-зелёная от желчи, с пятнами, сосудистой сетью и блеском серозы. */
function gbSkin(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(1024);
  fill(ctx, w, h, '#4a8a52');
  blotches(ctx, w, h, 11, ['#2f6b43', '#3c7b4a', '#5da05a'], 90, 60, 170, 0.5);
  blotches(ctx, w, h, 12, ['#86ad5c', '#a0b45e', '#2a5f45'], 46, 40, 120, 0.32);
  streaks(ctx, w, h, 13, ['#2d6342', '#69a766', '#7eb066'], 700, 70, 0.4, 2.2, 1.6, 0.22);
  capillaries(ctx, w, h, 14, ['#c75a50', '#b94a4a', '#e07a6c', '#7c63a0'], 26, 3, 2.4, 0.5);
  dots(ctx, w, h, 15, ['#e9e0a8', '#f4efc4'], 160, 1.2, 3.2, 0.5);
  return toTexture(canvas);
}

/** Мышечный слой: переплетённые пучки гладкой мускулатуры идут в разные стороны. */
function muscle(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(1024);
  fill(ctx, w, h, '#c47468');
  blotches(ctx, w, h, 21, ['#aa5a52', '#d98c7e', '#b8685e'], 70, 50, 140, 0.45);
  streaks(ctx, w, h, 22, ['#a24f4a', '#b95f56', '#8f423f'], 900, 120, 0.62, 0.28, 5, 0.34);
  streaks(ctx, w, h, 23, ['#d88f82', '#e2a597', '#c97a6e'], 900, 120, -0.62, 0.28, 5, 0.3);
  streaks(ctx, w, h, 24, ['#e9bcae', '#f0cabd'], 500, 90, 1.57, 0.5, 1.6, 0.25);
  return toTexture(canvas);
}

/** Собственная пластинка и подслизистая: светлая рыхлая соединительная ткань с сосудами. */
function propria(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  fill(ctx, w, h, '#efd9bf');
  blotches(ctx, w, h, 31, ['#f6e7d0', '#e5c9a7', '#f0d2b9'], 60, 30, 90, 0.5);
  streaks(ctx, w, h, 32, ['#fff2dd', '#d9b996'], 520, 60, 0.9, 6, 1.8, 0.35);
  capillaries(ctx, w, h, 33, ['#d8756a', '#c9605d'], 10, 3, 1.6, 0.5);
  return toTexture(canvas);
}

/** Слизистая оболочка: бархатистая жёлто-зелёная с розовыми пятнами, мелкая зернистость эпителия. */
function mucosa(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(1024);
  fill(ctx, w, h, '#d9c26b');
  blotches(ctx, w, h, 41, ['#c8b25a', '#e3d083', '#d8a566', '#b9b45e'], 100, 40, 130, 0.5);
  blotches(ctx, w, h, 42, ['#e9a98f', '#f0b9a0'], 40, 40, 110, 0.28);
  dots(ctx, w, h, 43, ['#a8963f', '#efe0a0', '#c79a52', '#9cab55'], 7000, 1.2, 3.6, 0.38);
  capillaries(ctx, w, h, 44, ['#d8756a'], 8, 3, 1.4, 0.34);
  return toTexture(canvas);
}

/** Печень: красно-коричневая, с дольковым рисунком, сосудами и глянцем. */
function liver(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(1024);
  fill(ctx, w, h, '#86372c');
  blotches(ctx, w, h, 51, ['#6e281f', '#9a4636', '#7d3025', '#a8553f'], 130, 50, 190, 0.55);
  // дольки: многоугольные ячейки с тонкими светлыми перегородками
  const rand = mulberry32(52);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 520; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 11 + rand() * 9;
    const sides = 5 + Math.floor(rand() * 2);
    const rot = rand() * Math.PI;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(210,150,125,0.13)' : 'rgba(60,15,12,0.15)';
    tiled(w, h, x, y, r, (ox, oy) => {
      ctx.beginPath();
      for (let k = 0; k <= sides; k++) {
        const a = rot + (k / sides) * Math.PI * 2;
        const px = ox + Math.cos(a) * r;
        const py = oy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  }
  capillaries(ctx, w, h, 53, ['#b4524a', '#5e2a52'], 9, 3, 2, 0.28);
  return toTexture(canvas);
}

/** Поджелудочная железа: бледно-жёлтая, зернистая, дольчатая. */
function pancreas(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  fill(ctx, w, h, '#e4c58f');
  blotches(ctx, w, h, 61, ['#d3aa6b', '#efd9aa', '#dcb980', '#c99f66'], 120, 20, 70, 0.55);
  dots(ctx, w, h, 62, ['#b98c56', '#f3e3b7', '#d9b27a'], 3000, 1.2, 3.2, 0.5);
  return toTexture(canvas);
}

/** Двенадцатиперстная кишка: розовая бархатная стенка. */
function duodenum(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  fill(ctx, w, h, '#e3a193');
  blotches(ctx, w, h, 71, ['#d98778', '#f0b9ab', '#cf7b6f'], 70, 30, 100, 0.5);
  dots(ctx, w, h, 72, ['#c26f66', '#f7cfc4', '#e69a8b'], 3500, 1.1, 3, 0.4);
  capillaries(ctx, w, h, 73, ['#b83f43'], 6, 3, 1.4, 0.35);
  return toTexture(canvas);
}

/** Ложе пузыря: плотная соединительная ткань без брюшины. */
function fossa(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  fill(ctx, w, h, '#d9a595');
  blotches(ctx, w, h, 81, ['#e6bcae', '#c98e7d', '#efcfc2'], 60, 30, 100, 0.5);
  streaks(ctx, w, h, 82, ['#f3d8cc', '#b97a69', '#e8bfb0'], 700, 70, 0.3, 1.4, 2, 0.4);
  capillaries(ctx, w, h, 83, ['#c4574f'], 8, 3, 1.5, 0.45);
  return toTexture(canvas);
}

/** Карты рельефа: зернистая, волокнистая и дольчатая (серое = высота). */
function bump(kind: 'grain' | 'fibre' | 'lobes'): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  fill(ctx, w, h, '#808080');
  if (kind === 'grain') {
    dots(ctx, w, h, 91, ['#a8a8a8', '#606060', '#c0c0c0', '#707070'], 4200, 1, 3.4, 0.7);
    blotches(ctx, w, h, 92, ['#999', '#666'], 40, 30, 90, 0.4);
  } else if (kind === 'fibre') {
    streaks(ctx, w, h, 93, ['#b0b0b0', '#5a5a5a', '#9a9a9a'], 1100, 60, 0.5, 2.6, 2.4, 0.5);
    blotches(ctx, w, h, 94, ['#999', '#6a6a6a'], 40, 30, 90, 0.4);
  } else {
    blotches(ctx, w, h, 95, ['#c8c8c8', '#555', '#a0a0a0', '#6b6b6b'], 160, 14, 54, 0.7);
    dots(ctx, w, h, 96, ['#303030', '#d0d0d0'], 1800, 1, 2.6, 0.5);
  }
  return toTexture(canvas, false);
}

export interface GbTextures {
  gbSkin: CanvasTexture;
  muscle: CanvasTexture;
  propria: CanvasTexture;
  mucosa: CanvasTexture;
  liver: CanvasTexture;
  pancreas: CanvasTexture;
  duodenum: CanvasTexture;
  fossa: CanvasTexture;
  bumpGrain: CanvasTexture;
  bumpFibre: CanvasTexture;
  bumpLobes: CanvasTexture;
}

export function buildTextures(): GbTextures {
  return {
    gbSkin: gbSkin(),
    muscle: muscle(),
    propria: propria(),
    mucosa: mucosa(),
    liver: liver(),
    pancreas: pancreas(),
    duodenum: duodenum(),
    fossa: fossa(),
    bumpGrain: bump('grain'),
    bumpFibre: bump('fibre'),
    bumpLobes: bump('lobes'),
  };
}
