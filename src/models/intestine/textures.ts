import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from './anatomy';

/* Процедурные текстуры кишечника: рисуются в canvas, никаких внешних файлов. */

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')!, w, h };
}
type Cv = ReturnType<typeof makeCanvas>;

function toTexture(c: Cv, repeat: [number, number] = [1, 1]): CanvasTexture {
  const tex = new CanvasTexture(c.canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.needsUpdate = true;
  return tex;
}

const fill = ({ ctx, w, h }: Cv, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
};

/** Мягкие пятна поверх базы; рисуются с переносом через край, чтобы текстура не давала швов. */
function blotches(c: Cv, seed: number, colors: string[], n: number, rMin: number, rMax: number, alpha: number) {
  const { ctx, w, h } = c;
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rMin + rand() * (rMax - rMin);
    const col = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    for (const dx of [-w, 0, w]) {
      for (const dy of [-h, 0, h]) {
        if (x + dx + r < 0 || x + dx - r > w || y + dy + r < 0 || y + dy - r > h) continue;
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function fibres(c: Cv, seed: number, colors: string[], n: number, len: number, angle: number, spread: number, width: number, alpha: number) {
  const { ctx, w, h } = c;
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
    for (const dx of [-w, 0, w]) {
      if (x + dx + l < 0 || x + dx - l > w) continue;
      ctx.beginPath();
      ctx.moveTo(x + dx, y);
      ctx.lineTo(x + dx + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function dots(c: Cv, seed: number, colors: string[], n: number, rMin: number, rMax: number, alpha: number) {
  const { ctx, w, h } = c;
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, rMin + rand() * (rMax - rMin), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Ветвящиеся тонкие сосудики. */
function capillaries(c: Cv, seed: number, n: number, color: string, alpha: number, step = 16) {
  const { ctx, w, h } = c;
  const rand = mulberry32(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = rand() * w;
    let y = rand() * h;
    let a = rand() * Math.PI * 2;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * (0.6 + rand() * 0.4);
    ctx.lineWidth = 0.9 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Тонкая кишка снаружи: розовая, влажная, с сеточкой сосудов брыжеечного края. Ось u (x) — вдоль кишки. */
export function smallSkinTexture(): CanvasTexture {
  const c = makeCanvas(512, 512);
  fill(c, '#d99683');
  blotches(c, 101, ['#e5a893', '#c9806c', '#efb9a3'], 80, 30, 110, 0.28);
  fibres(c, 102, ['#e8b09b', '#bf7863'], 420, 60, 0, 0.5, 2.2, 0.16);
  capillaries(c, 103, 90, 'rgba(176,70,60,0.5)', 0.45, 20);
  blotches(c, 104, ['#f5cdbb'], 40, 8, 26, 0.2);
  return toTexture(c);
}

/** Толстая кишка снаружи: бледнее и желтее, с мраморными пятнами жира. */
export function colonSkinTexture(): CanvasTexture {
  const c = makeCanvas(512, 512);
  fill(c, '#d4a08c');
  blotches(c, 111, ['#e0b39f', '#c48e79', '#ecc3ae'], 90, 28, 120, 0.3);
  blotches(c, 112, ['#efd49a', '#e8c688'], 26, 12, 40, 0.18);
  fibres(c, 113, ['#e5bba6', '#b98771'], 360, 70, 0, 0.35, 2.6, 0.18);
  capillaries(c, 114, 60, 'rgba(170,76,66,0.45)', 0.4, 22);
  return toTexture(c);
}

/** Мышечная оболочка: пучки гладкой мышцы. */
export function muscleTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#a85b45');
  blotches(c, 121, ['#bb6c52', '#94472f'], 40, 26, 90, 0.3);
  fibres(c, 122, ['#c27b5a', '#8f4630', '#d3946f'], 520, 46, Math.PI / 2, 0.45, 3, 0.35);
  return toTexture(c);
}

export function submucosaTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#efdcc0');
  blotches(c, 131, ['#f6e7cd', '#e5cfa8'], 50, 22, 80, 0.3);
  dots(c, 132, ['rgba(176,60,52,1)', 'rgba(80,94,168,1)'], 240, 0.8, 1.9, 0.5);
  fibres(c, 133, ['#fff4de', '#dec79f'], 220, 28, 0.8, 1.6, 1.2, 0.22);
  return toTexture(c);
}

/** Слизистая тонкой кишки изнутри: бархатистая от ворсинок, розово-оранжевая. */
export function mucosaSmallTexture(): CanvasTexture {
  const c = makeCanvas(512, 512);
  fill(c, '#e0998a');
  blotches(c, 141, ['#eab0a0', '#d0806f', '#f1bfae'], 90, 20, 80, 0.3);
  // ворсинки — частая россыпь светлых точек с тенью
  const { ctx, w, h } = c;
  const rand = mulberry32(142);
  for (let i = 0; i < 4200; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 1.1 + rand() * 1.2;
    ctx.fillStyle = 'rgba(120,48,40,0.28)';
    ctx.beginPath();
    ctx.arc(x + 0.8, y + 0.8, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rand() > 0.5 ? 'rgba(248,196,176,0.7)' : 'rgba(240,170,150,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  capillaries(c, 143, 60, 'rgba(170,56,50,0.3)', 0.4, 14);
  return toTexture(c);
}

/** Слизистая толстой кишки: гладкая, бледно-розовая, с точками устьев крипт, без ворсинок. */
export function mucosaColonTexture(): CanvasTexture {
  const c = makeCanvas(512, 512);
  fill(c, '#e3b1a2');
  blotches(c, 151, ['#ecc2b3', '#d49b8b', '#f2cdbf'], 90, 24, 90, 0.3);
  dots(c, 152, ['rgba(150,80,70,1)'], 1500, 0.8, 1.7, 0.4);
  capillaries(c, 153, 90, 'rgba(176,64,56,0.4)', 0.45, 20);
  return toTexture(c);
}

/** Анальный канал: плотная бледная ткань с синеватыми венозными подушками. */
export function mucosaAnalTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#d99f95');
  blotches(c, 161, ['#e6b3a8', '#c58176', '#8f6e92'], 60, 20, 70, 0.28);
  capillaries(c, 162, 40, 'rgba(120,70,130,0.45)', 0.4, 14);
  return toTexture(c);
}

/** Брюшина: почти прозрачная глянцевая плёнка. */
export function serosaTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#f1e3d4');
  blotches(c, 171, ['#fff7ee', '#e8d6c2'], 40, 20, 70, 0.3);
  fibres(c, 172, ['#ffffff', '#efe0cd'], 140, 40, 0.3, 1.6, 2.2, 0.15);
  return toTexture(c);
}

/** Кал: тёмно-коричневый, комковатый, с вкраплениями растительных волокон. */
export function fecesTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#7a5232');
  blotches(c, 181, ['#8f6540', '#634125', '#a07548'], 90, 8, 40, 0.5);
  dots(c, 182, ['#c8a56a', '#4a2f19', '#9b7a3e'], 400, 0.8, 2.6, 0.55);
  return toTexture(c);
}

/** Жир и брыжейка: жёлтый мрамор с сетью прожилок. */
export function fatTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#f1dc9c');
  blotches(c, 191, ['#f8e8b3', '#e8c97a', '#fff2c8'], 90, 8, 36, 0.5);
  fibres(c, 192, ['#e6bf6c', '#fff4cf'], 180, 24, 0.7, 6, 1.4, 0.3);
  return toTexture(c);
}

/** Поджелудочная железа: бледная, зернистая, дольчатая. */
export function pancreasTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#e6b79c');
  blotches(c, 201, ['#f0c9ae', '#d9a287', '#f6d7bd'], 80, 6, 28, 0.5);
  dots(c, 202, ['#cc9275', '#f8dcc4'], 900, 0.8, 2.2, 0.5);
  return toTexture(c);
}

/** Желудок: розовато-серая мышечная стенка. */
export function stomachTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#dd9f93');
  blotches(c, 211, ['#e8b5aa', '#c98378'], 60, 20, 80, 0.3);
  fibres(c, 212, ['#e6aca0', '#b9766b'], 260, 40, 0.5, 1.2, 2, 0.2);
  capillaries(c, 213, 40, 'rgba(176,66,60,0.4)', 0.4, 16);
  return toTexture(c);
}

/** Поперечнополосатая мышца (наружный сфинктер, лобково-прямокишечная). */
export function striatedTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#a04c3e');
  fibres(c, 221, ['#b5614e', '#8c4033', '#c7765f'], 460, 52, 0.1, 0.35, 5, 0.4);
  const rand = mulberry32(222);
  c.ctx.globalAlpha = 0.16;
  for (let x = 0; x < 256; x += 5 + rand() * 4) {
    c.ctx.fillStyle = '#5f2a20';
    c.ctx.fillRect(x, 0, 1.4, 256);
  }
  c.ctx.globalAlpha = 1;
  return toTexture(c);
}

/* ---------- Срез стенки под микроскопом ---------- */

/** Срез продольной мышцы вдоль волокон: горизонтальные полосы пучков. */
export function sectionLongTexture(): CanvasTexture {
  const c = makeCanvas(512, 128);
  fill(c, '#b45f4a');
  fibres(c, 231, ['#cc7d62', '#9b4c39', '#d99273'], 420, 120, 0, 0.06, 3.4, 0.45);
  return toTexture(c);
}

/** Срез круговой мышцы поперёк волокон: круглые «сечения» пучков. */
export function sectionCircTexture(): CanvasTexture {
  const c = makeCanvas(512, 256);
  fill(c, '#a44f40');
  const { ctx, w, h } = c;
  const rand = mulberry32(241);
  for (let i = 0; i < 380; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 4 + rand() * 7;
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r);
    g.addColorStop(0, '#d08a6c');
    g.addColorStop(1, '#8c4034');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}

/** Собственная пластинка слизистой: клетки и капилляры в рыхлой ткани. */
export function laminaTexture(): CanvasTexture {
  const c = makeCanvas(512, 256);
  fill(c, '#f1c9b8');
  blotches(c, 251, ['#f7d8c9', '#e5b3a1'], 60, 20, 70, 0.4);
  dots(c, 252, ['#9b6a96', '#7b5a8e', '#b88ab0'], 520, 1.2, 2.8, 0.55);
  dots(c, 253, ['#d9534f'], 90, 1, 2.2, 0.6);
  return toTexture(c);
}

/** Эпителий ворсинки: ряды столбчатых клеток с щёточной каёмкой. */
export function epitheliumTexture(): CanvasTexture {
  const c = makeCanvas(256, 256);
  fill(c, '#f3d4c6');
  const { ctx, w, h } = c;
  const rand = mulberry32(261);
  const cw = 16;
  for (let y = 0; y < h; y += 14) {
    for (let x = 0; x < w; x += cw) {
      const ox = (Math.floor(y / 14) % 2) * (cw / 2);
      ctx.strokeStyle = 'rgba(176,110,98,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + ox, y, cw, 14);
      ctx.fillStyle = `rgba(${230 + rand() * 20},${180 + rand() * 20},${164 + rand() * 20},0.55)`;
      ctx.fillRect(x + ox + 1, y + 1, cw - 2, 12);
      ctx.fillStyle = 'rgba(255,236,226,0.5)';
      ctx.fillRect(x + ox + 1, y + 1, cw - 2, 2);
    }
  }
  return toTexture(c);
}

export type IntestineTextures = ReturnType<typeof buildTextures>;

export function buildTextures() {
  return {
    smallSkin: smallSkinTexture(),
    colonSkin: colonSkinTexture(),
    muscle: muscleTexture(),
    submucosa: submucosaTexture(),
    mucosaSmall: mucosaSmallTexture(),
    mucosaColon: mucosaColonTexture(),
    mucosaAnal: mucosaAnalTexture(),
    serosa: serosaTexture(),
    feces: fecesTexture(),
    fat: fatTexture(),
    pancreas: pancreasTexture(),
    stomach: stomachTexture(),
    striated: striatedTexture(),
    sectionLong: sectionLongTexture(),
    sectionCirc: sectionCircTexture(),
    lamina: laminaTexture(),
    epithelium: epitheliumTexture(),
  };
}
