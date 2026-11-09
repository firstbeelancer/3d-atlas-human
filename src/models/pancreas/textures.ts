import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from '../gallbladder/geometry';
import { buildTextures as buildGbTextures, type GbTextures } from '../gallbladder/textures';

/* Процедурные текстуры соседних органов. Печень, двенадцатиперстная кишка и карты рельефа берутся из набора пузыря. */

function canvasOf(w: number, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')!, w, h };
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

type Ctx = CanvasRenderingContext2D;

function blotches(ctx: Ctx, w: number, h: number, seed: number, colors: string[], n: number, rMin: number, rMax: number, alpha: number) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rMin + rand() * (rMax - rMin);
    for (const dx of [-w, 0, w])
      for (const dy of [-h, 0, h]) {
        const ox = x + dx;
        const oy = y + dy;
        if (ox + r < 0 || ox - r > w || oy + r < 0 || oy - r > h) continue;
        const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
        g.addColorStop(0, colors[Math.floor(rand() * colors.length)]);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.globalAlpha = 1;
}

function specks(ctx: Ctx, w: number, h: number, seed: number, colors: string[], n: number, rMin: number, rMax: number, alpha: number) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, rMin + rand() * (rMax - rMin), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Ветвящиеся тонкие сосуды: блуждающие ломаные. */
function veinNet(ctx: Ctx, w: number, h: number, seed: number, colors: string[], n: number, width: number, alpha: number) {
  const rand = mulberry32(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = rand() * w;
    let y = rand() * h;
    let a = rand() * Math.PI * 2;
    ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * (0.6 + rand() * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * 16;
      y += Math.sin(a) * 16;
      ctx.lineTo(((x % w) + w) % w, ((y % h) + h) % h);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function spleen(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  ctx.fillStyle = '#7b2f48';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 101, ['#5f2238', '#94405a', '#6d2a43', '#a24f66'], 110, 30, 110, 0.5);
  specks(ctx, w, h, 102, ['#4e1a2e', '#b46a80'], 2600, 1, 2.6, 0.35);
  veinNet(ctx, w, h, 103, ['#c98a9b', '#4f1c30'], 18, 1.4, 0.3);
  return toTexture(canvas);
}

function kidney(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  ctx.fillStyle = '#8c3b30';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 111, ['#74291f', '#a44f40', '#823226', '#b05a47'], 120, 20, 80, 0.5);
  specks(ctx, w, h, 112, ['#5e1f18', '#c27a66'], 2800, 1, 2.2, 0.3);
  veinNet(ctx, w, h, 113, ['#d79a85', '#6b2219'], 12, 1.2, 0.22);
  return toTexture(canvas);
}

function stomach(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  ctx.fillStyle = '#eaa797';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 121, ['#dd9080', '#f3bcae', '#d98878'], 90, 30, 110, 0.5);
  veinNet(ctx, w, h, 122, ['#c24f4b', '#8e4aa0'], 20, 1.6, 0.4);
  return toTexture(canvas);
}

function bone(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  ctx.fillStyle = '#e8dbc0';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 131, ['#d9c8a6', '#f2e8d2', '#cdb98f'], 80, 20, 90, 0.5);
  specks(ctx, w, h, 132, ['#b8a27a', '#fbf4e2'], 3200, 1, 2.4, 0.4);
  return toTexture(canvas);
}

function mesocolon(): CanvasTexture {
  const { canvas, ctx, w, h } = canvasOf(512);
  ctx.fillStyle = '#f2e1b6';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 141, ['#f8ecc8', '#e8d197', '#f0dca6'], 80, 25, 90, 0.5);
  veinNet(ctx, w, h, 142, ['#c9574f', '#6a73b8'], 34, 1.8, 0.55);
  return toTexture(canvas);
}

export interface PancTextures extends GbTextures {
  spleen: CanvasTexture;
  kidney: CanvasTexture;
  stomach: CanvasTexture;
  bone: CanvasTexture;
  mesocolon: CanvasTexture;
}

export function buildTextures(): PancTextures {
  return { ...buildGbTextures(), spleen: spleen(), kidney: kidney(), stomach: stomach(), bone: bone(), mesocolon: mesocolon() };
}
