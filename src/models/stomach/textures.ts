import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { rng } from '../liver/tubes';

/*
  Процедурные текстуры стенки (рисуются в коде на canvas): желудочные поля с ямками для слизистой
  и мышечные волокна. Один и тот же рисунок служит и цветом (затемнение углублений), и рельефом.
*/

const SIZE = 512;

function canvas(): { ctx: CanvasRenderingContext2D; el: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas');
  el.width = SIZE;
  el.height = SIZE;
  const ctx = el.getContext('2d');
  return ctx ? { ctx, el } : null;
}

function finish(el: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(el);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Желудочные поля: многоугольные «подушки», между ними борозды, в центре — устье желудочной ямки. */
export function pitTexture(): Texture | null {
  const c = canvas();
  if (!c) return null;
  const G = 15;
  const r = rng(91);
  const pts: [number, number][] = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.15 + 0.7 * r()) / G, (j + 0.15 + 0.7 * r()) / G]);
  const img = c.ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x / SIZE;
      const py = y / SIZE;
      const gx = Math.floor(px * G);
      const gy = Math.floor(py * G);
      let d1 = 9;
      let d2 = 9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = (gx + dx + G) % G;
          const cy = (gy + dy + G) % G;
          const p = pts[cy * G + cx];
          const ox = p[0] + Math.floor((gx + dx) / G);
          const oy = p[1] + Math.floor((gy + dy) / G);
          const d = Math.hypot(px - ox, py - oy) * G;
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      const groove = Math.min(1, Math.max(0, (d2 - d1) / 0.32));
      const pit = Math.exp(-((d1 / 0.15) ** 2));
      const dome = 0.82 + 0.18 * (1 - Math.min(1, d1 / 0.6));
      const h = Math.max(0, Math.min(1, groove * dome * (1 - 0.8 * pit)));
      const v = 110 + 145 * h;
      const k = (y * SIZE + x) * 4;
      img.data[k] = v;
      img.data[k + 1] = v;
      img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  c.ctx.putImageData(img, 0, 0);
  return finish(c.el);
}

/** Мышечные волокна вдоль оси x рисунка; направление слоя задаётся поворотом текстуры. */
export function fibreTexture(): Texture | null {
  const c = canvas();
  if (!c) return null;
  const { ctx } = c;
  const r = rng(5);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // пучки волокон
  for (let i = 0; i < 70; i++) {
    const y = (i / 70) * SIZE + r() * 4;
    const w = 3 + r() * 5;
    const shade = 150 + r() * 80;
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(0, y);
    const a = 1.5 + r() * 3;
    const f = 2 + Math.floor(r() * 3);
    for (let x = 0; x <= SIZE; x += 16) ctx.lineTo(x, y + Math.sin((x / SIZE) * Math.PI * 2 * f + i) * a);
    ctx.stroke();
  }
  // тонкие волоконца и щели между пучками
  for (let i = 0; i < 380; i++) {
    const y = r() * SIZE;
    const dark = r() < 0.5;
    ctx.strokeStyle = dark ? 'rgba(40,40,40,0.35)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.6 + r() * 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= SIZE; x += 24) ctx.lineTo(x, y + Math.sin((x / SIZE) * Math.PI * 4 + i) * 1.4);
    ctx.stroke();
  }
  return finish(c.el);
}
