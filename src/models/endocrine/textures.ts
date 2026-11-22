import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/*
  Процедурные PBR-текстуры эндокринных желёз: дольчатый рельеф, коллоидная зернистость щитовидной
  железы, богатая липидами кора надпочечника, дольки тимуса и поджелудочной, тонкая сосудистая сеть.
*/

export interface EndocrineTextures {
  glandBump: Texture | null;
  thyroidMap: Texture | null;
  adrenalMap: Texture | null;
  thymusMap: Texture | null;
  pancreasMap: Texture | null;
  boneBump: Texture | null;
  cellBump: Texture | null;
}

function makeCanvasTexture(
  size: number,
  paint: (ctx: CanvasRenderingContext2D, s: number) => void,
  srgb = true,
): Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  paint(ctx, size);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function prng(initial: number) {
  let s = initial;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

function drawMicroVessels(
  ctx: CanvasRenderingContext2D,
  s: number,
  rnd: () => number,
  count: number,
  rgba: string,
) {
  const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    if (depth <= 0 || len < 4) return;
    const nx = x + Math.cos(ang) * len;
    const ny = y + Math.sin(ang) * len;
    ctx.strokeStyle = rgba;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    branch(nx, ny, ang + (rnd() - 0.5) * 0.85, len * 0.72, w * 0.68, depth - 1);
    if (rnd() < 0.65) branch(nx, ny, ang + (rnd() - 0.5) * 1.45, len * 0.58, w * 0.58, depth - 1);
  };
  for (let i = 0; i < count; i++) {
    branch(rnd() * s, rnd() * s, rnd() * Math.PI * 2, 14 + rnd() * 22, 1.5, 4);
  }
}

export function buildTextures(): EndocrineTextures {
  const glandBump = makeCanvasTexture(
    512,
    (ctx, s) => {
      const rnd = prng(4109);
      ctx.fillStyle = '#7c7c7c';
      ctx.fillRect(0, 0, s, s);
      // крупные дольки
      for (let i = 0; i < 420; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        const r = 10 + rnd() * 24;
        const g = ctx.createRadialGradient(x, y, 1, x, y, r);
        g.addColorStop(0, 'rgba(225,225,225,0.42)');
        g.addColorStop(0.72, 'rgba(148,148,148,0.22)');
        g.addColorStop(1, 'rgba(55,55,55,0.34)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // мелкое зерно
      for (let i = 0; i < 3600; i++) {
        const v = 96 + rnd() * 68;
        ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 0.8 + rnd() * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    false,
  );

  const thyroidMap = makeCanvasTexture(512, (ctx, s) => {
    const rnd = prng(8821);
    ctx.fillStyle = '#c85a4b';
    ctx.fillRect(0, 0, s, s);
    // тёплые фолликулярные вкрапления и дольки
    for (let i = 0; i < 650; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 6 + rnd() * 20;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, `rgba(${222 + rnd() * 25},${114 + rnd() * 34},${92 + rnd() * 28},0.28)`);
      g.addColorStop(1, 'rgba(138,44,38,0.16)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    drawMicroVessels(ctx, s, rnd, 22, 'rgba(150, 26, 36, 0.24)');
  });

  const adrenalMap = makeCanvasTexture(512, (ctx, s) => {
    const rnd = prng(2719);
    ctx.fillStyle = '#dfa944';
    ctx.fillRect(0, 0, s, s);
    // богатые липидами золотистые дольки коры
    for (let i = 0; i < 580; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 7 + rnd() * 18;
      ctx.fillStyle = `rgba(${235 + rnd() * 20},${178 + rnd() * 36},${70 + rnd() * 38},0.24)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(164, 102, 26, 0.16)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 190; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 34, y + (rnd() - 0.5) * 34);
      ctx.stroke();
    }
    drawMicroVessels(ctx, s, rnd, 14, 'rgba(175, 62, 34, 0.18)');
  });

  const thymusMap = makeCanvasTexture(512, (ctx, s) => {
    const rnd = prng(5513);
    ctx.fillStyle = '#e5a38d';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 9 + rnd() * 22;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(248,205,186,0.34)');
      g.addColorStop(0.75, 'rgba(222,148,128,0.22)');
      g.addColorStop(1, 'rgba(176,108,92,0.28)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const pancreasMap = makeCanvasTexture(512, (ctx, s) => {
    const rnd = prng(7741);
    ctx.fillStyle = '#e7be7c';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 720; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 6 + rnd() * 14;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(252,226,174,0.36)');
      g.addColorStop(0.7, 'rgba(226,176,108,0.24)');
      g.addColorStop(1, 'rgba(172,118,62,0.26)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const boneBump = makeCanvasTexture(
    256,
    (ctx, s) => {
      const rnd = prng(9103);
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2400; i++) {
        const v = 98 + rnd() * 58;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 0.6 + rnd() * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(90,90,90,0.25)';
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 120; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 32, y + (rnd() - 0.5) * 10);
        ctx.stroke();
      }
    },
    false,
  );

  const cellBump = makeCanvasTexture(
    256,
    (ctx, s) => {
      const rnd = prng(3317);
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2000; i++) {
        const v = 96 + rnd() * 64;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 1 + rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    false,
  );

  return { glandBump, thyroidMap, adrenalMap, thymusMap, pancreasMap, boneBump, cellBump };
}
