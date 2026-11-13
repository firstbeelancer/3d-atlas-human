import { CanvasTexture, Color, DoubleSide, FrontSide, MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, type Material, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './build';

type Params = ConstructorParameters<typeof MeshPhysicalMaterial>[0];

export interface NoseTextures {
  skin: Texture | null;
  skinBump: Texture | null;
  mucosa: Texture | null;
  mucosaBump: Texture | null;
  boneBump: Texture | null;
}

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void, srgb = true): Texture | null {
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

let seed = 1234;
const rnd = () => {
  seed = (seed * 48271) % 2147483647;
  return seed / 2147483647;
};

/** Текстуры рисуются в canvas: кожа с порами и лёгкой пятнистостью, влажная слизистая с сосудистым рисунком. */
export function buildTextures(): NoseTextures {
  seed = 1234;
  const skin = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#e7b49b';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const r = 8 + rnd() * 26;
      ctx.fillStyle = `rgba(${205 + rnd() * 40}, ${125 + rnd() * 60}, ${105 + rnd() * 50}, ${0.04 + rnd() * 0.07})`;
      ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 3200; i++) {
      const x = rnd() * s, y = rnd() * s, r = 0.7 + rnd() * 1.6;
      ctx.fillStyle = `rgba(255, 226, 205, ${0.1 + rnd() * 0.12})`;
      ctx.beginPath(); ctx.arc(x, y, r + 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(120, 62, 52, ${0.1 + rnd() * 0.16})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(150, 88, 72, 0.10)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 260; i++) {
      const x = rnd() * s, y = rnd() * s;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26); ctx.stroke();
    }
  });
  const skinBump = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) {
      const v = 92 + rnd() * 58;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 0.7 + rnd() * 2.0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(70,70,70,0.30)'; ctx.lineWidth = 0.7;
    for (let i = 0; i < 240; i++) {
      const x = rnd() * s, y = rnd() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40); ctx.stroke();
    }
  }, false);
  const mucosa = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#e8899a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 800; i++) {
      ctx.fillStyle = `rgba(${222 + rnd() * 33}, ${112 + rnd() * 58}, ${122 + rnd() * 50}, ${0.07 + rnd() * 0.1})`;
      ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 8 + rnd() * 28, 0, Math.PI * 2); ctx.fill();
    }
    const drawVessel = (x: number, y: number, ang: number, len: number, w: number, depth: number): void => {
      if (depth <= 0 || len < 3) return;
      const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
      ctx.strokeStyle = `rgba(185, 42, 62, ${0.16 + rnd() * 0.2})`;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      drawVessel(nx, ny, ang + (rnd() - 0.5) * 0.9, len * 0.72, w * 0.7, depth - 1);
      if (rnd() < 0.7) drawVessel(nx, ny, ang + (rnd() - 0.5) * 1.6, len * 0.6, w * 0.6, depth - 1);
    };
    for (let i = 0; i < 26; i++) drawVessel(rnd() * s, rnd() * s, rnd() * Math.PI * 2, 16 + rnd() * 20, 1.6, 5);
  });
  const mucosaBump = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const v = 100 + rnd() * 56;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 1 + rnd() * 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }, false);
  const boneBump = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 104 + rnd() * 48;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 0.5 + rnd() * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(96,96,96,0.22)'; ctx.lineWidth = 0.6;
    for (let i = 0; i < 120; i++) {
      const x = rnd() * s, y = rnd() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 8); ctx.stroke();
    }
  }, false);
  return { skin, skinBump, mucosa, mucosaBump, boneBump };
}

/**
 * Материал с цветом среза: изнанка поверхности красится сплошным цветом ткани,
 * поэтому на плоскости разреза тело выглядит плотным без отдельных «крышек».
 */
function solid(params: Params, key: string, back: string): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ side: DoubleSide, ...params });
  m.customProgramCacheKey = () => `nose-solid-${key}`;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBack = { value: new Color(back) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBack;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n          if (!gl_FrontFacing) { diffuseColor.rgb = uBack; }')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n          if (!gl_FrontFacing) roughnessFactor = 0.85;');
  };
  return m;
}

const glass = { transparent: true, depthWrite: false } as const;

/** Материал части: каждая часть получает свои экземпляры, чтобы подсветка и призрачный режим не задевали соседей. */
export function makeMaterial(kind: MatKey, t: NoseTextures): Material {
  const P = (p: Params) => new MeshPhysicalMaterial(p);
  switch (kind) {
    case 'skin':
      return solid(
        {
          color: '#e2a98e',
          vertexColors: true,
          map: t.skin,
          bumpMap: t.skinBump,
          bumpScale: 0.35,
          roughness: 0.52,
          clearcoat: 0.18,
          clearcoatRoughness: 0.5,
          sheen: 0.5,
          sheenRoughness: 0.6,
          sheenColor: new Color('#ffd7c4'),
        },
        'skin',
        '#f3d9b6',
      );
    case 'skinInner':
      return solid({ color: '#e3a48f', vertexColors: true, map: t.skin, bumpMap: t.skinBump, bumpScale: 0.3, roughness: 0.6 }, 'skinInner', '#f0d2b2');
    case 'dark':
      return P({ color: '#2a1216', roughness: 0.95, side: FrontSide });
    case 'hair':
      return P({ color: '#3b2a22', roughness: 0.5, side: DoubleSide });
    case 'bone':
      return solid({ color: '#efe6cf', bumpMap: t.boneBump, bumpScale: 0.3, roughness: 0.62, sheen: 0.2, sheenColor: new Color('#fff6dd') }, 'bone', '#d9c9a4');
    case 'boneGhost':
      return P({ color: '#efe6cf', roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide });
    case 'cartilage':
      return solid({ color: '#cfe3ea', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3, transmission: 0, sheen: 0.4, sheenColor: new Color('#e9f6f9') }, 'cartilage', '#b7d6df');
    case 'mucosa':
      return solid(
        { color: '#f0a3ad', map: t.mucosa, bumpMap: t.mucosaBump, bumpScale: 0.25, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 },
        'mucosa',
        '#e58b97',
      );
    case 'mucosaWet':
      return solid(
        { color: '#f4aab2', map: t.mucosa, bumpMap: t.mucosaBump, bumpScale: 0.3, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.35, sheenColor: new Color('#ffdde2') },
        'mucosaWet',
        '#d97583',
      );
    case 'air':
      return P({ color: '#9fd6ff', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide, emissive: new Color('#4a9ad8'), emissiveIntensity: 0.12 });
    case 'sinus':
      return P({ color: '#bfe3ff', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.4, depthWrite: false, side: DoubleSide, emissive: new Color('#3d86c8'), emissiveIntensity: 0.1 });
    case 'nerve':
      return solid({ color: '#f5df7a', roughness: 0.45, sheen: 0.4, sheenColor: new Color('#fff2b0') }, 'nerve', '#e2c75e');
    case 'ganglion':
      return solid({ color: '#f0cf5c', roughness: 0.5 }, 'ganglion', '#d9b644');
    case 'artery':
      return solid({ color: '#e0453f', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }, 'artery', '#8d1e1e');
    case 'vein':
      return solid({ color: '#6d6fd6', roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3 }, 'vein', '#3d3f95');
    case 'muscle':
      return solid({ color: '#c8574f', roughness: 0.5, sheen: 0.5, sheenColor: new Color('#ff9d8a'), clearcoat: 0.25, clearcoatRoughness: 0.45 }, 'muscle', '#9f3a37');
    case 'gland':
      return P({ color: '#f8e3a2', roughness: 0.5, emissive: new Color('#8a6a1a'), emissiveIntensity: 0.08 });
    case 'olfactory':
      return P({ color: '#e8c35a', roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3, side: DoubleSide, emissive: new Color('#9a7a10'), emissiveIntensity: 0.14 });
    case 'bulb':
      return solid({ color: '#f1d9a8', roughness: 0.5, sheen: 0.3, sheenColor: new Color('#fff0d0') }, 'bulb', '#d9bf88');
    case 'ghostFace':
      return P({ color: '#f4d6c3', roughness: 0.6, opacity: 0.1, side: DoubleSide, ...glass });
    case 'eye':
      return P({ color: '#ffffff', roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.35, depthWrite: false, side: FrontSide });
    case 'tonsil':
      return solid({ color: '#e59aa6', roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.3 }, 'tonsil', '#c76f7e');
    case 'lymph':
      return solid({ color: '#9fd0c9', roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 }, 'lymph', '#6fa8a0');
  }
}
