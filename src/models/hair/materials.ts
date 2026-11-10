import { CanvasTexture, Color, DoubleSide, MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './types';

/*
  Материалы тканей. Плотные тела рисуются с двух сторон: изнанка поверхности видна там, где плоскость разреза убрала
  переднюю стенку, и красится цветом среза ткани (с рябью, зависящей от точки в пространстве, поэтому рисунок не «плывёт»).
  Так на разрезе видны настоящие слои без отдельных «крышек».
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
  /** Рисунок на изнанке: 0 — зерно, 1 — волокна вдоль x, 2 — крупные клетки. */
  pattern?: 0 | 1 | 2;
  map?: 'cuticle' | 'cells';
  bump?: 'skin' | 'cells';
  bumpScale?: number;
  vertexColors?: boolean;
  /** Не красить изнанку (прозрачные оболочки, тонкие листы). */
  plain?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
}

const SPECS: Record<MatKey, Spec> = {
  corneum: { color: '#ecd9c6', cut: '#e6cdb4', rough: 0.78, bump: 'skin', bumpScale: 0.9, sheen: 0.4 },
  epidermis: { color: '#e9b9a3', cut: '#e2a58f', rough: 0.55, cc: 0.2, pattern: 2 },
  basal: { color: '#c58875', cut: '#b87763', rough: 0.55, pattern: 2 },
  dermisP: { color: '#f1cbbb', cut: '#ecbeaa', rough: 0.6, pattern: 1 },
  dermisR: { color: '#f3d8c8', cut: '#eecbb7', rough: 0.62, pattern: 1 },
  hypodermis: { color: '#f2d98c', cut: '#ecc877', rough: 0.5, cc: 0.25, pattern: 2 },
  fat: { color: '#f7e394', cut: '#f2d778', rough: 0.28, cc: 0.7, ccr: 0.2, pattern: 2 },
  collagen: { color: '#fff1dc', rough: 0.5, sheen: 0.6, sheenColor: '#ffffff' },
  cuticleHair: { color: '#ffffff', cut: '#6e4b2f', rough: 0.34, cc: 0.9, ccr: 0.22, map: 'cuticle', sheen: 0.6, sheenColor: '#f0c890' },
  cortex: { color: '#7e5535', cut: '#8a5f3a', rough: 0.5, cc: 0.3, pattern: 1 },
  medulla: { color: '#e3d3b2', cut: '#efe2c6', rough: 0.7, pattern: 2 },
  melaninG: { color: '#2b160b', rough: 0.4, cc: 0.6 },
  irsCuticle: { color: '#ece0bd', cut: '#e3d4a8', rough: 0.45, cc: 0.4 },
  huxley: { color: '#e8d6a2', cut: '#dec88c', rough: 0.5, cc: 0.35, pattern: 2 },
  henle: { color: '#e2cb92', cut: '#d6bb7c', rough: 0.5, cc: 0.35, pattern: 2 },
  companion: { color: '#d9b8a0', cut: '#cda78d', rough: 0.5, cc: 0.35 },
  ors: { color: '#e79b99', cut: '#df8c8a', rough: 0.45, cc: 0.4, pattern: 2 },
  glassy: { color: '#9cc0d6', cut: '#8fb4cc', rough: 0.3, cc: 0.8 },
  ctSheath: { color: '#d9a78f', cut: '#d09a82', rough: 0.55, pattern: 1 },
  infund: { color: '#f0cbb0', cut: '#e8bb9c', rough: 0.55, pattern: 2 },
  isthmus: { color: '#e9a98d', cut: '#e19b7e', rough: 0.5, pattern: 2 },
  bulge: { color: '#b46ea4', cut: '#a45f95', rough: 0.45, cc: 0.4, pattern: 2 },
  bulbCells: { color: '#f3c8a0', cut: '#eab98c', rough: 0.45, cc: 0.4, pattern: 2 },
  matrixCells: { color: '#e9879b', cut: '#df7589', rough: 0.4, cc: 0.5, pattern: 2 },
  papilla: { color: '#d96b5b', cut: '#cc5a4b', rough: 0.35, cc: 0.7, sheen: 0.5, sheenColor: '#ffb0a0' },
  melanocyte: { color: '#4b2a1c', rough: 0.45, cc: 0.4 },
  gland: { color: '#f4e4a8', cut: '#eed78e', rough: 0.4, cc: 0.5, pattern: 2 },
  duct: { color: '#e9d9b8', cut: '#e0cda6', rough: 0.4, cc: 0.4 },
  sebum: { color: '#ffd35a', rough: 0.15, cc: 1, ccr: 0.1, emissive: '#ffb020', emissiveIntensity: 0.12 },
  muscle: { color: '#b9444c', cut: '#a8383f', rough: 0.45, cc: 0.4, sheen: 0.7, sheenColor: '#ff9a9a', pattern: 1 },
  tendon: { color: '#efe3cb', rough: 0.5, sheen: 0.6, sheenColor: '#ffffff' },
  apocrine: { color: '#a9b6e2', cut: '#98a6d4', rough: 0.4, cc: 0.5 },
  artery: { color: '#d03a34', rough: 0.35, cc: 0.7, ccr: 0.2 },
  vein: { color: '#3f62b2', rough: 0.35, cc: 0.7, ccr: 0.2 },
  capillary: { color: '#e4544e', rough: 0.35, cc: 0.6 },
  nerve: { color: '#e8cb4a', rough: 0.4, cc: 0.5 },
  ending: { color: '#f2a73a', rough: 0.4, cc: 0.5 },
  merkel: { color: '#82c2a4', rough: 0.4, cc: 0.4 },
  club: { color: '#e9e0cb', cut: '#e3d8be', rough: 0.45, cc: 0.4, pattern: 2 },
  strand: { color: '#d7a090', cut: '#c98f7f', rough: 0.5 },
  germ: { color: '#9e72c2', cut: '#8f63b4', rough: 0.4, cc: 0.5 },
  shed: { color: '#74502f', rough: 0.35, cc: 0.8, map: 'cuticle' },
  scale: { color: '#c8a066', rough: 0.3, cc: 0.9, ccr: 0.2, vertexColors: true, sheen: 0.5, sheenColor: '#ffd9a0', plain: true },
  cuticleA: { color: '#d3ad74', cut: '#caa268', rough: 0.35, cc: 0.7 },
  cuticleB: { color: '#a9784a', cut: '#9d6c40', rough: 0.4, cc: 0.5 },
  cuticleC: { color: '#dcbd8a', cut: '#d2b27c', rough: 0.4, cc: 0.5 },
  cuticleD: { color: '#8c5f38', cut: '#80532f', rough: 0.45, cc: 0.4 },
  cortexCells: { color: '#ffffff', cut: '#b88c5a', rough: 0.48, cc: 0.3, map: 'cells', pattern: 2 },
  cmc: { color: '#b6d3ea', opacity: 0.26, rough: 0.2, cc: 1, plain: true },
  macro: { color: '#e5b784', rough: 0.4, cc: 0.5, sheen: 0.6, sheenColor: '#fff0cc' },
  micro: { color: '#f4dcae', rough: 0.35, cc: 0.6 },
  medullaFoam: { color: '#efe4cb', cut: '#f2e8d0', rough: 0.75, pattern: 2 },
  air: { color: '#ffffff', opacity: 0.55, rough: 0.05, cc: 1, plain: true },
  melanosome: { color: '#2b1a10', rough: 0.35, cc: 0.7 },
  nailDorsal: { color: '#ffe9e4', opacity: 0.3, rough: 0.05, cc: 1, ccr: 0.04, plain: true },
  nailRoot: { color: '#f2d9d2', cut: '#ecc9c0', rough: 0.4, cc: 0.5 },
  lunula: { color: '#f7f1e8', cut: '#f2e8dc', rough: 0.35, cc: 0.6 },
  nailBody: { color: '#f4c9c2', cut: '#eebdb5', rough: 0.3, cc: 0.7 },
  nailFree: { color: '#f8f3ea', cut: '#f2ebdf', rough: 0.3, cc: 0.7 },
  nailVentral: { color: '#f0d3c8', opacity: 0.7, rough: 0.3, cc: 0.5, plain: true },
  nailBand: { color: '#fbe7be', opacity: 0.9, rough: 0.3, plain: true },
  nailRidge: { color: '#fff0eb', opacity: 0.55, rough: 0.2, cc: 1, plain: true },
  fold: { color: '#eab9a4', cut: '#e2aa94', rough: 0.55, pattern: 2 },
  epony: { color: '#f3d1c3', rough: 0.45, cc: 0.4, plain: true },
  nailCuticle: { color: '#fff4ec', opacity: 0.6, rough: 0.2, cc: 0.8, plain: true },
  latFold: { color: '#e7af9a', cut: '#df9f88', rough: 0.55, pattern: 2 },
  hypo: { color: '#f0b9a2', cut: '#e8a98f', rough: 0.5, pattern: 2 },
  matrixNail: { color: '#d98d99', cut: '#cf7e8b', rough: 0.4, cc: 0.5, pattern: 2 },
  sterile: { color: '#e99ba1', cut: '#e08c93', rough: 0.4, cc: 0.4, pattern: 2 },
  bedRidge: { color: '#d66f7d', cut: '#cb6270', rough: 0.45, pattern: 1 },
  bedDermis: { color: '#e4898f', cut: '#da7a81', rough: 0.5, pattern: 1 },
  bone: { color: '#efe5cc', cut: '#f3ead3', rough: 0.55, cc: 0.15, pattern: 2 },
  cartilage: { color: '#c3e2ec', cut: '#b6d8e4', rough: 0.25, cc: 0.8, ccr: 0.15 },
  ligament: { color: '#f2e9d7', cut: '#ebe0c8', rough: 0.45, sheen: 0.7, sheenColor: '#ffffff', pattern: 1 },
  pulp: { color: '#f4d37e', cut: '#eec764', rough: 0.4, cc: 0.4, pattern: 2 },
  septa: { color: '#fff3df', cut: '#fff3df', rough: 0.5 },
  fingerSkin: { color: '#eab79e', cut: '#df9f86', rough: 0.55, cc: 0.15, bump: 'skin', bumpScale: 0.5, sheen: 0.5, sheenColor: '#ffd2c2', pattern: 1 },
  fingerprint: { color: '#e8b19a', cut: '#df9f86', rough: 0.5, cc: 0.15, sheen: 0.5, sheenColor: '#ffd2c2' },
  eccrine: { color: '#a8c6ea', rough: 0.4, cc: 0.5 },
  pacShell: { color: '#dcc6e6', opacity: 0.38, rough: 0.25, cc: 0.6, plain: true },
  pacCore: { color: '#9b6dc2', rough: 0.4, cc: 0.4 },
  meissner: { color: '#6db794', rough: 0.4, cc: 0.4 },
  glomus: { color: '#8c3160', rough: 0.35, cc: 0.7 },
};

export interface HairTextures {
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
  t.anisotropy = 4;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Текстуры рисуются в canvas: чешуйки кутикулы, веретёна клеток коры, мелкий рельеф кожи. */
export function buildHairTextures(): HairTextures {
  // кутикула: черепица чешуек вдоль волоса (v — вдоль, u — вокруг)
  const [cc, cx] = canvas(256, 512);
  cx.fillStyle = '#7a5434';
  cx.fillRect(0, 0, 256, 512);
  const rows = 22;
  const cols = 6;
  for (let i = rows; i >= 0; i--) {
    for (let j = -1; j <= cols; j++) {
      const w = 256 / cols;
      const x = j * w + (i % 2) * (w / 2);
      const y = (i / rows) * 512;
      const g = cx.createLinearGradient(0, y, 0, y + 46);
      g.addColorStop(0, '#a77d52');
      g.addColorStop(0.75, '#c49a68');
      g.addColorStop(1, '#4a2f1b');
      cx.fillStyle = g;
      cx.beginPath();
      cx.moveTo(x, y);
      cx.lineTo(x + w, y);
      cx.lineTo(x + w, y + 30);
      cx.quadraticCurveTo(x + w / 2, y + 62, x, y + 30);
      cx.closePath();
      cx.fill();
      cx.strokeStyle = 'rgba(40,22,10,0.55)';
      cx.lineWidth = 1.5;
      cx.stroke();
    }
  }
  // клетки коры: веретёна, вытянутые вдоль волоса
  const [kc, kx] = canvas(256, 256);
  kx.fillStyle = '#b98f5c';
  kx.fillRect(0, 0, 256, 256);
  const rnd = (() => {
    let s = 12345;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  })();
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      const cxm = (i + 0.5 + (j % 2) * 0.5) * 64;
      const cym = (j + 0.5) * 128 + (rnd() - 0.5) * 20;
      for (const oy of [-256, 0, 256]) {
        for (const ox of [-256, 0, 256]) {
          const g = kx.createLinearGradient(cxm - 28 + ox, 0, cxm + 28 + ox, 0);
          const tone = 150 + Math.floor(rnd() * 50);
          g.addColorStop(0, `rgb(${tone - 40},${tone - 70},${tone - 100})`);
          g.addColorStop(0.5, `rgb(${tone + 35},${tone - 5},${tone - 55})`);
          g.addColorStop(1, `rgb(${tone - 40},${tone - 70},${tone - 100})`);
          kx.fillStyle = g;
          kx.beginPath();
          kx.ellipse(cxm + ox, cym + oy, 27, 62, 0, 0, Math.PI * 2);
          kx.fill();
          kx.strokeStyle = 'rgba(60,35,15,0.7)';
          kx.lineWidth = 2;
          kx.stroke();
        }
      }
    }
  }
  // шум для рельефа кожи
  const [sc, sx] = canvas(128, 128);
  const img = sx.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 120 + rnd() * 110;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  sx.putImageData(img, 0, 0);
  const textures = { cuticle: wrap(cc, 1, 1, true), cells: wrap(kc, 8, 1, true), skin: wrap(sc, 6, 6, false) };
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
      ? 'float n = vn(vWP*vec3(1.1,8.0,1.1))*0.6 + vn(vWP*vec3(3.0,26.0,3.0))*0.4; float k = 0.86 + 0.28*n;'
      : pattern === 2
        ? 'float n = vn(vWP*5.0)*0.55 + vn(vWP*19.0)*0.45; float k = 0.84 + 0.32*n;'
        : 'float n = vn(vWP*13.0); float k = 0.93 + 0.14*n;';
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\nuniform vec3 cutColor;\n${NOISE}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\nif (!gl_FrontFacing) { ${pat} diffuseColor.rgb = cutColor * k; }`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (!gl_FrontFacing) roughnessFactor = 0.88;');
}

export function makeMaterial(key: MatKey, tex: HairTextures): MeshPhysicalMaterial {
  const s = SPECS[key];
  const transparent = s.opacity !== undefined && s.opacity < 1;
  const m = new MeshPhysicalMaterial({
    color: s.color,
    roughness: s.rough ?? 0.5,
    metalness: 0,
    clearcoat: s.cc ?? 0,
    clearcoatRoughness: s.ccr ?? 0.35,
    sheen: s.sheen ?? 0,
    sheenColor: new Color(s.sheenColor ?? '#ffffff'),
    sheenRoughness: 0.5,
    side: DoubleSide,
    transparent,
    opacity: s.opacity ?? 1,
    depthWrite: !transparent,
    vertexColors: !!s.vertexColors,
    emissive: new Color(s.emissive ?? '#000000'),
    emissiveIntensity: s.emissiveIntensity ?? 0,
  });
  if (s.map) m.map = s.map === 'cuticle' ? tex.cuticle : tex.cells;
  if (s.bump) {
    m.bumpMap = tex.skin;
    m.bumpScale = s.bumpScale ?? 0.6;
  }
  if (!s.plain) {
    const cut = new Color(s.cut ?? s.color).multiplyScalar(s.cut ? 1 : 0.9);
    const pat = s.pattern ?? 0;
    m.customProgramCacheKey = () => `hair-cut-${pat}`;
    m.onBeforeCompile = (shader) => patchCut(shader, cut, pat);
  }
  return m;
}
