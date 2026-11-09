import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

/* Процедурные текстуры тканей: рисуются в canvas, внешних файлов нет. */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return { c, ctx, size };
}

function done(c: HTMLCanvasElement, srgb = true): CanvasTexture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Мягкие пятна: оттенки ткани. Рисуются с переносом через край, чтобы текстура бесшовно повторялась. */
function blotch(ctx: CanvasRenderingContext2D, size: number, rand: () => number, colors: string[], n: number, r0: number, r1: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, r = r0 + rand() * (r1 - r0);
    const col = colors[Math.floor(rand() * colors.length)];
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function strokes(ctx: CanvasRenderingContext2D, size: number, rand: () => number, colors: string[], n: number, len: number, angle: number, spread: number, width: number, alpha: number, wavy = 0) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size;
    const a = angle + (rand() - 0.5) * spread;
    const l = len * (0.5 + rand());
    ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    ctx.lineWidth = width * (0.6 + rand() * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + Math.cos(a) * l * 0.3 + wavy * (rand() - 0.5) * l, y + Math.sin(a) * l * 0.3, x + Math.cos(a) * l * 0.7, y + Math.sin(a) * l * 0.7 + wavy * (rand() - 0.5) * l, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Брюшина матки и трубы: розовая гладкая поверхность с сеточкой мелких сосудов. */
export function serosaTexture() {
  const { c, ctx, size } = canvas(512, '#e9b7ac');
  const r = rng(11);
  blotch(ctx, size, r, ['#f4cfc4', '#dc9d92', '#efc0b3', '#d58f87'], 90, 30, 90, 0.4);
  strokes(ctx, size, r, ['#b3453f', '#c9605a'], 140, 70, 1.2, 6.2, 1.1, 0.35, 0.8);
  strokes(ctx, size, r, ['#d98c84'], 220, 36, 0.4, 6.2, 0.8, 0.22, 0.6);
  return done(c);
}

/** Миометрий: плотные пучки гладкомышечных волокон, переплетённые в разных направлениях. */
export function myometriumTexture() {
  const { c, ctx, size } = canvas(512, '#b9584f');
  const r = rng(23);
  blotch(ctx, size, r, ['#d27a6e', '#9c4039', '#c4665b'], 80, 30, 80, 0.45);
  strokes(ctx, size, r, ['#e29b8f', '#8d3630', '#cc7266'], 900, 110, 0.5, 2.4, 1.6, 0.3, 0.25);
  strokes(ctx, size, r, ['#d98a7d', '#a24841'], 700, 100, 2.1, 1.6, 1.3, 0.28, 0.2);
  return done(c);
}

/** Эндометрий: бархатная слизистая с мелкими железистыми ямками. */
export function endometriumTexture() {
  const { c, ctx, size } = canvas(512, '#d9757c');
  const r = rng(31);
  blotch(ctx, size, r, ['#e99aa0', '#c45863', '#f0b0b2', '#b84a58'], 110, 20, 70, 0.45);
  for (let i = 0; i < 700; i++) {
    const x = r() * size, y = r() * size, rad = 1.5 + r() * 3.2;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#8f2b3d';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#f7c2c2';
    ctx.beginPath();
    ctx.arc(x - 0.6, y - 0.6, rad * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return done(c);
}

/** Слизистая канала шейки и влагалища: влажная розовая поверхность с мелкой сеткой. */
export function mucosaTexture() {
  const { c, ctx, size } = canvas(512, '#e3918f');
  const r = rng(47);
  blotch(ctx, size, r, ['#f0aaa6', '#d27c7d', '#eba19b', '#c76d72'], 100, 24, 80, 0.45);
  strokes(ctx, size, r, ['#f4bdb6', '#bd5f64'], 420, 54, 0.9, 6.2, 1.0, 0.25, 0.9);
  return done(c);
}

/** Яичник: кремово-розовая бугристая кора со складками. */
export function ovaryTexture() {
  const { c, ctx, size } = canvas(512, '#e9c7b5');
  const r = rng(59);
  blotch(ctx, size, r, ['#f4dccb', '#d9ae9a', '#efcfbc', '#cc9f8f'], 130, 16, 60, 0.5);
  strokes(ctx, size, r, ['#b78674', '#c99a88'], 260, 50, 0.7, 6.2, 1.4, 0.35, 1.3);
  return done(c);
}

/** Шейка матки: плотная, чуть более бледная ткань. */
export function cervixTexture() {
  const { c, ctx, size } = canvas(512, '#e6aaa2');
  const r = rng(71);
  blotch(ctx, size, r, ['#f2c3ba', '#d9908b', '#eeb5ad'], 90, 30, 90, 0.4);
  strokes(ctx, size, r, ['#c06a66'], 120, 60, 1.3, 6.2, 1.0, 0.2, 0.7);
  return done(c);
}

/** Листы брыжейки: тонкая плёнка с жилками сосудов. */
export function sheetTexture() {
  const { c, ctx, size } = canvas(512, '#f0cfc4');
  const r = rng(83);
  blotch(ctx, size, r, ['#f8e2d8', '#e6b5a8'], 60, 40, 110, 0.35);
  strokes(ctx, size, r, ['#b04a46', '#c9615b'], 120, 150, 0.2, 2.2, 1.3, 0.45, 0.6);
  strokes(ctx, size, r, ['#cc706a'], 260, 60, 0.2, 6.2, 0.8, 0.28, 0.9);
  return done(c);
}

export type FemaleTextures = ReturnType<typeof makeTextures>;
export function makeTextures() {
  return {
    serosa: serosaTexture(),
    myometrium: myometriumTexture(),
    endometrium: endometriumTexture(),
    mucosa: mucosaTexture(),
    ovary: ovaryTexture(),
    cervix: cervixTexture(),
    sheet: sheetTexture(),
  };
}
