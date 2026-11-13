import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { MatKey } from './types';

/*
  Материалы тканей кожи. Плотные тела рисуются с двух сторон: изнанка поверхности видна на срезе
  и красится процедурным гистологическим рисунком в мировых координатах (без «плывущих» текстур).
  Для полупрозрачных оболочек, кератина и секрета используются sheen, clearcoat и прозрачность.
*/

interface Spec {
  color: string;
  /** Цвет среза; по умолчанию чуть темнее цвета ткани. */
  cut?: string;
  rough?: number;
  cc?: number;
  ccr?: number;
  sheen?: number;
  sheenColor?: string;
  opacity?: number;
  /** Рисунок на изнанке: 0 — зерно, 1 — волокна вдоль x, 2 — крупные клетки, 3 — концентрические кольца. */
  pattern?: 0 | 1 | 2 | 3;
  map?: 'cuticle' | 'cells';
  bump?: 'skin' | 'cells' | 'cuticle';
  bumpScale?: number;
  /** Не красить изнанку (прозрачные оболочки, тонкие листы). */
  plain?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
}

const SPECS: Record<MatKey, Spec> = {
  corneum: { color: '#ecd9c6', cut: '#e6cdb4', rough: 0.72, bump: 'skin', bumpScale: 1.15, sheen: 0.45, sheenColor: '#fff5ea' },
  lucidum: { color: '#f3e6d4', cut: '#ecd9c2', rough: 0.4, cc: 0.5, ccr: 0.2, opacity: 0.92, pattern: 0 },
  granulosum: { color: '#d9a08c', cut: '#cd8f7a', rough: 0.5, pattern: 2 },
  spinosum: { color: '#e9b9a3', cut: '#e2a58f', rough: 0.5, cc: 0.25, pattern: 2, sheen: 0.3, sheenColor: '#ffd9c9' },
  basal: { color: '#c58875', cut: '#b87763', rough: 0.52, pattern: 2 },
  dermisP: { color: '#f1cbbb', cut: '#ecbeaa', rough: 0.56, pattern: 1, sheen: 0.35, sheenColor: '#ffe0d4' },
  dermisR: { color: '#f3d8c8', cut: '#eecbb7', rough: 0.58, pattern: 1, sheen: 0.3 },
  hypodermis: { color: '#f2d98c', cut: '#ecc877', rough: 0.46, cc: 0.3, pattern: 2 },
  fat: { color: '#f7e394', cut: '#f2d778', rough: 0.22, cc: 0.85, ccr: 0.16, pattern: 2, sheen: 0.3, sheenColor: '#fff8d6' },
  collagen: { color: '#fff1dc', rough: 0.44, sheen: 0.7, sheenColor: '#ffffff', cc: 0.25 },
  elastin: { color: '#e8c86a', rough: 0.38, sheen: 0.5, sheenColor: '#fff0b0', cc: 0.3 },
  flake: { color: '#f2e4d2', rough: 0.66, sheen: 0.4, sheenColor: '#fff8ee', plain: true },
  pore: { color: '#b98a6e', rough: 0.6, pattern: 0 },
  keratinocyte: { color: '#f0c3ab', cut: '#e8b298', rough: 0.42, cc: 0.4, pattern: 2 },
  melanocyte: { color: '#4b2a1c', rough: 0.38, cc: 0.5 },
  melanosome: { color: '#2b1a10', rough: 0.3, cc: 0.75 },
  langerhans: { color: '#c9d4e8', rough: 0.4, cc: 0.45 },
  merkel: { color: '#82c2a4', rough: 0.36, cc: 0.5 },
  cuticleHair: { color: '#ffffff', cut: '#6e4b2f', rough: 0.28, cc: 0.95, ccr: 0.16, map: 'cuticle', bump: 'cuticle', bumpScale: 0.65, sheen: 0.7, sheenColor: '#f5cfa0' },
  cortex: { color: '#7e5535', cut: '#8a5f3a', rough: 0.44, cc: 0.35, pattern: 1, bump: 'cells', bumpScale: 0.35 },
  medulla: { color: '#e3d3b2', cut: '#efe2c6', rough: 0.68, pattern: 2 },
  irs: { color: '#ece0bd', cut: '#e3d4a8', rough: 0.4, cc: 0.45, pattern: 3 },
  ors: { color: '#e79b99', cut: '#df8c8a', rough: 0.42, cc: 0.45, pattern: 2, sheen: 0.3, sheenColor: '#ffc2c0' },
  glassy: { color: '#9cc0d6', cut: '#8fb4cc', rough: 0.22, cc: 0.9, ccr: 0.12 },
  ctSheath: { color: '#d9a78f', cut: '#d09a82', rough: 0.5, pattern: 1, sheen: 0.35, sheenColor: '#ffdcc8' },
  bulbCells: { color: '#f3c8a0', cut: '#eab98c', rough: 0.4, cc: 0.45, pattern: 2 },
  matrixCells: { color: '#e9879b', cut: '#df7589', rough: 0.36, cc: 0.55, pattern: 2 },
  papilla: { color: '#d96b5b', cut: '#cc5a4b', rough: 0.3, cc: 0.75, sheen: 0.6, sheenColor: '#ffb0a0' },
  gland: { color: '#f4e4a8', cut: '#eed78e', rough: 0.32, cc: 0.65, ccr: 0.2, pattern: 2, sheen: 0.4, sheenColor: '#fff6d0' },
  sebum: { color: '#ffd35a', rough: 0.1, cc: 1, ccr: 0.06, emissive: '#ffb020', emissiveIntensity: 0.15 },
  duct: { color: '#e9d9b8', cut: '#e0cda6', rough: 0.38, cc: 0.45 },
  muscle: { color: '#b9444c', cut: '#a8383f', rough: 0.4, cc: 0.45, sheen: 0.75, sheenColor: '#ff9a9a', pattern: 1, bump: 'cells', bumpScale: 0.45 },
  tendon: { color: '#efe3cb', rough: 0.42, sheen: 0.7, sheenColor: '#ffffff', cc: 0.25 },
  apocrine: { color: '#a9b6e2', cut: '#98a6d4', rough: 0.34, cc: 0.6 },
  eccrine: { color: '#a8c6ea', cut: '#96b6de', rough: 0.34, cc: 0.6 },
  eccrineDuct: { color: '#c3d8ef', cut: '#b2cbe8', rough: 0.36, cc: 0.5 },
  sweat: { color: '#cfe8f7', opacity: 0.62, rough: 0.05, cc: 1, ccr: 0.04, plain: true },
  artery: { color: '#d03a34', rough: 0.28, cc: 0.8, ccr: 0.15 },
  vein: { color: '#3f62b2', rough: 0.28, cc: 0.8, ccr: 0.15 },
  capillary: { color: '#e4544e', rough: 0.3, cc: 0.7 },
  lymph: { color: '#bfe3c0', opacity: 0.55, rough: 0.25, cc: 0.7, plain: true },
  nerve: { color: '#e8cb4a', rough: 0.35, cc: 0.6, sheen: 0.4, sheenColor: '#fff2a0' },
  ending: { color: '#f2a73a', rough: 0.34, cc: 0.6 },
  meissner: { color: '#6db794', rough: 0.36, cc: 0.5 },
  meissnerCapsule: { color: '#bfe0cf', opacity: 0.34, rough: 0.2, cc: 0.75, plain: true },
  pacShell: { color: '#dcc6e6', opacity: 0.3, rough: 0.2, cc: 0.75, plain: true },
  pacCore: { color: '#9b6dc2', rough: 0.34, cc: 0.5 },
  ruffini: { color: '#e89a5a', rough: 0.34, cc: 0.55 },
};

export interface SkinTextures {
  cuticle: Texture;
  cells: Texture;
  skin: Texture;
  dispose(): void;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function wrap(c: HTMLCanvasElement, rx: number, ry: number, srgb: boolean): Texture {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Процедурные текстуры: чешуйки кутикулы волоса, клетки и микрорельеф кожи с порами. */
export function buildSkinTextures(): SkinTextures {
  const rnd = (() => {
    let s = 987654;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  })();

  // 1. Кутикула волоса 512x1024: многослойная черепица с продольными микробороздками кератина
  const [cc, cx] = canvas(512, 1024);
  cx.fillStyle = '#734e2f';
  cx.fillRect(0, 0, 512, 1024);
  const rows = 36;
  const cols = 8;
  for (let i = rows; i >= 0; i--) {
    for (let j = -1; j <= cols; j++) {
      const w = 512 / cols;
      const x = j * w + (i % 2) * (w / 2) + (rnd() - 0.5) * 6;
      const y = (i / rows) * 1024;
      const h = 58;
      const g = cx.createLinearGradient(0, y, 0, y + h);
      const tone = (rnd() - 0.5) * 18;
      g.addColorStop(0, `rgb(${156 + tone},${115 + tone * 0.7},${75 + tone * 0.5})`);
      g.addColorStop(0.7, `rgb(${198 + tone},${154 + tone * 0.7},${106 + tone * 0.5})`);
      g.addColorStop(0.95, `rgb(${135 + tone},${95 + tone * 0.6},${60 + tone * 0.4})`);
      g.addColorStop(1, '#3d2413');
      cx.fillStyle = g;
      cx.beginPath();
      cx.moveTo(x, y);
      cx.lineTo(x + w, y);
      cx.lineTo(x + w, y + 36);
      cx.quadraticCurveTo(x + w * 0.5, y + 74, x, y + 36);
      cx.closePath();
      cx.fill();
      cx.strokeStyle = 'rgba(34,18,8,0.6)';
      cx.lineWidth = 2;
      cx.stroke();
    }
  }
  cx.strokeStyle = 'rgba(255,235,205,0.08)';
  cx.lineWidth = 1;
  for (let i = 0; i < 220; i++) {
    const x = rnd() * 512;
    cx.beginPath();
    cx.moveTo(x, 0);
    cx.lineTo(x + (rnd() - 0.5) * 4, 1024);
    cx.stroke();
  }

  // 2. Клетки 512x512: плотно упакованные клетки с зернистой текстурой
  const [kc, kx] = canvas(512, 512);
  kx.fillStyle = '#c89a80';
  kx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      const cxm = (i + 0.5 + (j % 2) * 0.5) * (512 / 6);
      const cym = (j + 0.5) * (512 / 4) + (rnd() - 0.5) * 24;
      for (const oy of [-512, 0, 512]) {
        for (const ox of [-512, 0, 512]) {
          const g = kx.createRadialGradient(cxm + ox, cym + oy, 6, cxm + ox, cym + oy, 52);
          const tone = 190 + Math.floor(rnd() * 40);
          g.addColorStop(0, `rgb(${tone + 20},${tone - 30},${tone - 60})`);
          g.addColorStop(0.75, `rgb(${tone - 20},${tone - 80},${tone - 110})`);
          g.addColorStop(1, `rgb(${tone - 70},${tone - 130},${tone - 160})`);
          kx.fillStyle = g;
          kx.beginPath();
          kx.ellipse(cxm + ox, cym + oy, 44, 40, rnd() * 0.6, 0, Math.PI * 2);
          kx.fill();
          kx.strokeStyle = 'rgba(90,45,25,0.55)';
          kx.lineWidth = 2.2;
          kx.stroke();
        }
      }
    }
  }

  // 3. Микрорельеф кожи 256x256: ромбическая сетка борозд + поры
  const [sc, sx] = canvas(256, 256);
  const img = sx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 4;
      const u = (x / 256) * Math.PI * 2;
      const v = (y / 256) * Math.PI * 2;
      const grid = Math.abs(Math.sin(u * 5 + v * 3)) * Math.abs(Math.sin(u * 3 - v * 5));
      const grain = 135 + 75 * grid + (rnd() - 0.5) * 35;
      const val = Math.max(0, Math.min(255, grain));
      img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = val;
      img.data[idx + 3] = 255;
    }
  }
  sx.putImageData(img, 0, 0);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    sx.fillStyle = 'rgba(60,60,60,0.35)';
    sx.beginPath();
    sx.arc(x, y, 0.8 + rnd() * 1.4, 0, Math.PI * 2);
    sx.fill();
  }

  const textures = {
    cuticle: wrap(cc, 1, 1, true),
    cells: wrap(kc, 8, 1, true),
    skin: wrap(sc, 6, 6, false),
  };
  return { ...textures, dispose: () => Object.values(textures).forEach((t) => t.dispose()) };
}

const NOISE = `
float hh(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x), mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x), mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x), f.y), f.z);
}`;

function patchCut(shader: WebGLProgramParametersWithUniforms, cut: Color, pattern: number): void {
  shader.uniforms.cutColor = { value: cut };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  const pat =
    pattern === 1
      ? 'float n = vn(vWP*vec3(1.1,8.0,1.1))*0.55 + vn(vWP*vec3(3.2,28.0,3.2))*0.3 + vn(vWP*12.0)*0.15; float k = 0.84 + 0.32*n;'
      : pattern === 2
      ? 'float n = vn(vWP*4.5)*0.5 + vn(vWP*16.0)*0.35 + vn(vWP*38.0)*0.15; float k = 0.82 + 0.36*n;'
      : pattern === 3
      ? 'float r = length(vWP.yz); float n = 0.5 + 0.5*sin(r*38.0 + vn(vWP*9.0)*3.0); float k = 0.86 + 0.26*n;'
      : 'float n = vn(vWP*13.0)*0.65 + vn(vWP*31.0)*0.35; float k = 0.90 + 0.20*n;';
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\nuniform vec3 cutColor;\n${NOISE}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\nif (!gl_FrontFacing) { ${pat} diffuseColor.rgb = cutColor * k; }`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (!gl_FrontFacing) roughnessFactor = 0.86;');
}

export function makeMaterial(key: MatKey, tex: SkinTextures): MeshPhysicalMaterial {
  const s = SPECS[key];
  const transparent = s.opacity !== undefined && s.opacity < 1;
  const m = new MeshPhysicalMaterial({
    color: s.color,
    roughness: s.rough ?? 0.5,
    metalness: 0,
    clearcoat: s.cc ?? 0,
    clearcoatRoughness: s.ccr ?? 0.3,
    sheen: s.sheen ?? 0,
    sheenColor: new Color(s.sheenColor ?? '#ffffff'),
    sheenRoughness: 0.45,
    side: DoubleSide,
    transparent,
    opacity: s.opacity ?? 1,
    depthWrite: !transparent,
    emissive: new Color(s.emissive ?? '#000000'),
    emissiveIntensity: s.emissiveIntensity ?? 0,
  });
  if (s.map) m.map = s.map === 'cuticle' ? tex.cuticle : tex.cells;
  if (s.bump) {
    m.bumpMap = tex[s.bump];
    m.bumpScale = s.bumpScale ?? 0.6;
  }
  if (!s.plain) {
    const cut = new Color(s.cut ?? s.color).multiplyScalar(s.cut ? 1 : 0.9);
    const pat = s.pattern ?? 0;
    m.customProgramCacheKey = () => `skin-cut-${pat}`;
    m.onBeforeCompile = (shader) => patchCut(shader, cut, pat);
  }
  return m;
}
