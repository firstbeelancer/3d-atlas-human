import { CanvasTexture, Color, DoubleSide, FrontSide, MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, type Material, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './build';

type Params = ConstructorParameters<typeof MeshPhysicalMaterial>[0];

export interface NoseTextures {
  skin: Texture | null;
  skinBump: Texture | null;
  mucosa: Texture | null;
  mucosaBump: Texture | null;
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
    ctx.fillStyle = '#e6b59c';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const r = 6 + rnd() * 22;
      ctx.fillStyle = `rgba(${200 + rnd() * 40}, ${120 + rnd() * 60}, ${100 + rnd() * 50}, ${0.05 + rnd() * 0.08})`;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(120, 60, 50, ${0.08 + rnd() * 0.14})`;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 0.6 + rnd() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const skinBump = canvasTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 5000; i++) {
        const v = 90 + rnd() * 60;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 0.8 + rnd() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(70,70,70,0.35)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 220; i++) {
        ctx.beginPath();
        const x = rnd() * s;
        const y = rnd() * s;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 60);
        ctx.stroke();
      }
    },
    false,
  );
  const mucosa = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#e8899a';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${220 + rnd() * 35}, ${110 + rnd() * 60}, ${120 + rnd() * 50}, ${0.08 + rnd() * 0.1})`;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 8 + rnd() * 30, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 160; i++) {
      ctx.strokeStyle = `rgba(190, 40, 60, ${0.18 + rnd() * 0.22})`;
      ctx.beginPath();
      let x = rnd() * s;
      let y = rnd() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  const mucosaBump = canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) {
        const v = 100 + rnd() * 56;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 1 + rnd() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    false,
  );
  return { skin, skinBump, mucosa, mucosaBump };
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
      return solid({ color: '#e3a48f', map: t.skin, bumpMap: t.skinBump, bumpScale: 0.3, roughness: 0.6 }, 'skinInner', '#f0d2b2');
    case 'dark':
      return P({ color: '#2a1216', roughness: 0.95, side: FrontSide });
    case 'hair':
      return P({ color: '#3b2a22', roughness: 0.5, side: DoubleSide });
    case 'bone':
      return solid({ color: '#efe6cf', roughness: 0.62, sheen: 0.2, sheenColor: new Color('#fff6dd') }, 'bone', '#d9c9a4');
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
