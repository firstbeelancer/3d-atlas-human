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
  Материалы тканей высокого разрешения. Плотные тела рисуются с двух сторон: изнанка поверхности видна на срезе
  и красится процедурным гистологическим рисунком в мировых координатах (без «плывущих» текстур).
  Для полупрозрачных и кератиновых структур используются физические свойства: sheen, clearcoat, iridescence и transmission.
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
  transmission?: number;
  thickness?: number;
  ior?: number;
  /** Рисунок на изнанке: 0 — зерно, 1 — волокна вдоль x, 2 — крупные клетки, 3 — концентрические кольца. */
  pattern?: 0 | 1 | 2 | 3;
  map?: 'cuticle' | 'cells';
  bump?: 'skin' | 'cells' | 'cuticle' | 'bone' | 'nail';
  bumpScale?: number;
  vertexColors?: boolean;
  /** Не красить изнанку (прозрачные оболочки, тонкие листы). */
  plain?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
}

const SPECS: Record<MatKey, Spec> = {
  corneum: { color: '#ecd9c6', cut: '#e6cdb4', rough: 0.72, bump: 'skin', bumpScale: 1.15, sheen: 0.45, sheenColor: '#fff5ea' },
  epidermis: { color: '#e9b9a3', cut: '#e2a58f', rough: 0.5, cc: 0.25, pattern: 2, sheen: 0.3, sheenColor: '#ffd9c9' },
  basal: { color: '#c58875', cut: '#b87763', rough: 0.52, pattern: 2 },
  dermisP: { color: '#f1cbbb', cut: '#ecbeaa', rough: 0.56, pattern: 1, sheen: 0.35, sheenColor: '#ffe0d4' },
  dermisR: { color: '#f3d8c8', cut: '#eecbb7', rough: 0.58, pattern: 1, sheen: 0.3 },
  hypodermis: { color: '#f2d98c', cut: '#ecc877', rough: 0.46, cc: 0.3, pattern: 2 },
  fat: { color: '#f7e394', cut: '#f2d778', rough: 0.22, cc: 0.85, ccr: 0.16, pattern: 2, sheen: 0.3, sheenColor: '#fff8d6' },
  collagen: { color: '#fff1dc', rough: 0.44, sheen: 0.7, sheenColor: '#ffffff', cc: 0.25 },
  cuticleHair: { color: '#ffffff', cut: '#6e4b2f', rough: 0.28, cc: 0.95, ccr: 0.16, map: 'cuticle', bump: 'cuticle', bumpScale: 0.65, sheen: 0.7, sheenColor: '#f5cfa0' },
  cortex: { color: '#7e5535', cut: '#8a5f3a', rough: 0.44, cc: 0.35, pattern: 1, bump: 'cells', bumpScale: 0.35 },
  medulla: { color: '#e3d3b2', cut: '#efe2c6', rough: 0.68, pattern: 2 },
  melaninG: { color: '#2b160b', rough: 0.35, cc: 0.65 },
  irsCuticle: { color: '#ece0bd', cut: '#e3d4a8', rough: 0.4, cc: 0.45, pattern: 3 },
  huxley: { color: '#e8d6a2', cut: '#dec88c', rough: 0.45, cc: 0.4, pattern: 2 },
  henle: { color: '#e2cb92', cut: '#d6bb7c', rough: 0.45, cc: 0.4, pattern: 2 },
  companion: { color: '#d9b8a0', cut: '#cda78d', rough: 0.48, cc: 0.35 },
  ors: { color: '#e79b99', cut: '#df8c8a', rough: 0.42, cc: 0.45, pattern: 2, sheen: 0.3, sheenColor: '#ffc2c0' },
  glassy: { color: '#9cc0d6', cut: '#8fb4cc', rough: 0.22, cc: 0.9, ccr: 0.12 },
  ctSheath: { color: '#d9a78f', cut: '#d09a82', rough: 0.5, pattern: 1, sheen: 0.35, sheenColor: '#ffdcc8' },
  infund: { color: '#f0cbb0', cut: '#e8bb9c', rough: 0.5, pattern: 2 },
  isthmus: { color: '#e9a98d', cut: '#e19b7e', rough: 0.46, pattern: 2 },
  bulge: { color: '#b46ea4', cut: '#a45f95', rough: 0.4, cc: 0.5, pattern: 2, sheen: 0.4, sheenColor: '#f0c4e8' },
  bulbCells: { color: '#f3c8a0', cut: '#eab98c', rough: 0.4, cc: 0.45, pattern: 2 },
  matrixCells: { color: '#e9879b', cut: '#df7589', rough: 0.36, cc: 0.55, pattern: 2 },
  papilla: { color: '#d96b5b', cut: '#cc5a4b', rough: 0.3, cc: 0.75, sheen: 0.6, sheenColor: '#ffb0a0' },
  melanocyte: { color: '#4b2a1c', rough: 0.38, cc: 0.5 },
  gland: { color: '#f4e4a8', cut: '#eed78e', rough: 0.32, cc: 0.65, ccr: 0.2, pattern: 2, sheen: 0.4, sheenColor: '#fff6d0' },
  duct: { color: '#e9d9b8', cut: '#e0cda6', rough: 0.38, cc: 0.45 },
  sebum: { color: '#ffd35a', rough: 0.1, cc: 1, ccr: 0.06, emissive: '#ffb020', emissiveIntensity: 0.15 },
  muscle: { color: '#b9444c', cut: '#a8383f', rough: 0.4, cc: 0.45, sheen: 0.75, sheenColor: '#ff9a9a', pattern: 1, bump: 'cells', bumpScale: 0.45 },
  tendon: { color: '#efe3cb', rough: 0.42, sheen: 0.7, sheenColor: '#ffffff', cc: 0.25 },
  apocrine: { color: '#a9b6e2', cut: '#98a6d4', rough: 0.34, cc: 0.6 },
  artery: { color: '#d03a34', rough: 0.28, cc: 0.8, ccr: 0.15 },
  vein: { color: '#3f62b2', rough: 0.28, cc: 0.8, ccr: 0.15 },
  capillary: { color: '#e4544e', rough: 0.3, cc: 0.7 },
  nerve: { color: '#e8cb4a', rough: 0.35, cc: 0.6, sheen: 0.4, sheenColor: '#fff2a0' },
  ending: { color: '#f2a73a', rough: 0.34, cc: 0.6 },
  merkel: { color: '#82c2a4', rough: 0.36, cc: 0.5 },
  club: { color: '#e9e0cb', cut: '#e3d8be', rough: 0.4, cc: 0.45, pattern: 2 },
  strand: { color: '#d7a090', cut: '#c98f7f', rough: 0.46 },
  germ: { color: '#9e72c2', cut: '#8f63b4', rough: 0.36, cc: 0.55 },
  shed: { color: '#74502f', rough: 0.3, cc: 0.85, map: 'cuticle', bump: 'cuticle', bumpScale: 0.6 },
  scale: { color: '#c8a066', rough: 0.26, cc: 0.95, ccr: 0.16, vertexColors: true, sheen: 0.6, sheenColor: '#ffd9a0', plain: true, bump: 'cuticle', bumpScale: 0.35 },
  cuticleA: { color: '#d3ad74', cut: '#caa268', rough: 0.3, cc: 0.75, pattern: 3 },
  cuticleB: { color: '#a9784a', cut: '#9d6c40', rough: 0.36, cc: 0.55, pattern: 3 },
  cuticleC: { color: '#dcbd8a', cut: '#d2b27c', rough: 0.36, cc: 0.55, pattern: 3 },
  cuticleD: { color: '#8c5f38', cut: '#80532f', rough: 0.4, cc: 0.45, pattern: 3 },
  cortexCells: { color: '#ffffff', cut: '#b88c5a', rough: 0.42, cc: 0.35, map: 'cells', bump: 'cells', bumpScale: 0.5, pattern: 2 },
  cmc: { color: '#b6d3ea', opacity: 0.26, rough: 0.16, cc: 1, plain: true },
  macro: { color: '#e5b784', rough: 0.34, cc: 0.6, sheen: 0.65, sheenColor: '#fff0cc', pattern: 1 },
  micro: { color: '#f4dcae', rough: 0.3, cc: 0.65 },
  medullaFoam: { color: '#efe4cb', cut: '#f2e8d0', rough: 0.7, pattern: 2 },
  air: { color: '#ffffff', opacity: 0.52, rough: 0.04, cc: 1, plain: true },
  melanosome: { color: '#2b1a10', rough: 0.3, cc: 0.75 },
  nailDorsal: { color: '#ffe9e4', opacity: 0.32, rough: 0.04, cc: 1, ccr: 0.03, bump: 'nail', bumpScale: 0.22, plain: true },
  nailRoot: { color: '#f2d9d2', cut: '#ecc9c0', rough: 0.36, cc: 0.55 },
  lunula: { color: '#f7f1e8', cut: '#f2e8dc', rough: 0.32, cc: 0.65 },
  nailBody: { color: '#f4c9c2', cut: '#eebdb5', rough: 0.26, cc: 0.75, bump: 'nail', bumpScale: 0.18 },
  nailFree: { color: '#f8f3ea', cut: '#f2ebdf', rough: 0.28, cc: 0.75 },
  nailVentral: { color: '#f0d3c8', opacity: 0.72, rough: 0.28, cc: 0.55, plain: true },
  nailBand: { color: '#fbe7be', opacity: 0.9, rough: 0.28, plain: true },
  nailRidge: { color: '#fff0eb', opacity: 0.55, rough: 0.18, cc: 1, plain: true },
  fold: { color: '#eab9a4', cut: '#e2aa94', rough: 0.5, bump: 'skin', bumpScale: 0.55, pattern: 2 },
  epony: { color: '#f3d1c3', rough: 0.42, cc: 0.45, plain: true },
  nailCuticle: { color: '#fff4ec', opacity: 0.62, rough: 0.18, cc: 0.85, plain: true },
  latFold: { color: '#e7af9a', cut: '#df9f88', rough: 0.5, bump: 'skin', bumpScale: 0.55, pattern: 2 },
  hypo: { color: '#f0b9a2', cut: '#e8a98f', rough: 0.48, pattern: 2 },
  matrixNail: { color: '#d98d99', cut: '#cf7e8b', rough: 0.36, cc: 0.55, pattern: 2 },
  sterile: { color: '#e99ba1', cut: '#e08c93', rough: 0.36, cc: 0.45, pattern: 2 },
  bedRidge: { color: '#d66f7d', cut: '#cb6270', rough: 0.42, pattern: 1 },
  bedDermis: { color: '#e4898f', cut: '#da7a81', rough: 0.46, pattern: 1 },
  bone: { color: '#efe5cc', cut: '#f3ead3', rough: 0.5, cc: 0.2, bump: 'bone', bumpScale: 0.6, pattern: 2 },
  cartilage: { color: '#c3e2ec', cut: '#b6d8e4', rough: 0.18, cc: 0.9, ccr: 0.1 },
  ligament: { color: '#f2e9d7', cut: '#ebe0c8', rough: 0.38, sheen: 0.75, sheenColor: '#ffffff', pattern: 1 },
  pulp: { color: '#f4d37e', cut: '#eec764', rough: 0.36, cc: 0.45, pattern: 2 },
  septa: { color: '#fff3df', cut: '#fff3df', rough: 0.46, sheen: 0.5, sheenColor: '#ffffff' },
  fingerSkin: { color: '#eab79e', cut: '#df9f86', rough: 0.52, cc: 0.18, bump: 'skin', bumpScale: 0.65, sheen: 0.55, sheenColor: '#ffd2c2', pattern: 1 },
  fingerprint: { color: '#e8b19a', cut: '#df9f86', rough: 0.48, cc: 0.2, sheen: 0.55, sheenColor: '#ffd2c2' },
  eccrine: { color: '#a8c6ea', rough: 0.34, cc: 0.6 },
  pacShell: { color: '#dcc6e6', opacity: 0.36, rough: 0.2, cc: 0.75, plain: true },
  pacCore: { color: '#9b6dc2', rough: 0.34, cc: 0.5 },
  meissner: { color: '#6db794', rough: 0.36, cc: 0.5 },
  glomus: { color: '#8c3160', rough: 0.3, cc: 0.75 },
};

export interface HairTextures {
  cuticle: Texture;
  cells: Texture;
  skin: Texture;
  bone: Texture;
  nail: Texture;
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

/** Высокодетализированные процедурные текстуры: чешуйки кутикулы, клетки коры, микрорельеф кожи, кости и ногтя. */
export function buildHairTextures(): HairTextures {
  const rnd = (() => {
    let s = 12345;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  })();

  // 1. Кутикула 512x1024: многослойная черепица с продольными микробороздками кератина
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

  // 2. Клетки коры 512x512: плотно упакованные веретенообразные клетки с фибриллярной текстурой
  const [kc, kx] = canvas(512, 512);
  kx.fillStyle = '#a87d4a';
  kx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 3; j++) {
      const cxm = (i + 0.5 + (j % 2) * 0.5) * (512 / 6);
      const cym = (j + 0.5) * (512 / 3) + (rnd() - 0.5) * 24;
      for (const oy of [-512, 0, 512]) {
        for (const ox of [-512, 0, 512]) {
          const g = kx.createLinearGradient(cxm - 40 + ox, 0, cxm + 40 + ox, 0);
          const tone = 152 + Math.floor(rnd() * 48);
          g.addColorStop(0, `rgb(${tone - 42},${tone - 72},${tone - 102})`);
          g.addColorStop(0.5, `rgb(${tone + 36},${tone - 4},${tone - 52})`);
          g.addColorStop(1, `rgb(${tone - 42},${tone - 72},${tone - 102})`);
          kx.fillStyle = g;
          kx.beginPath();
          kx.ellipse(cxm + ox, cym + oy, 38, 86, 0, 0, Math.PI * 2);
          kx.fill();
          kx.strokeStyle = 'rgba(56,30,12,0.72)';
          kx.lineWidth = 2.4;
          kx.stroke();
        }
      }
    }
  }

  // 3. Микрорельеф кожи 256x256: ромбическая сетка линий Лангера + поры
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

  // 4. Пористость и гаверсовы каналы кости 256x256
  const [bc, bx] = canvas(256, 256);
  bx.fillStyle = '#c8c8c8';
  bx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    bx.fillStyle = rnd() > 0.5 ? 'rgba(90,90,90,0.22)' : 'rgba(255,255,255,0.22)';
    bx.beginPath();
    bx.ellipse(x, y, 2 + rnd() * 14, 1 + rnd() * 2.5, (rnd() - 0.5) * 0.25, 0, Math.PI * 2);
    bx.fill();
  }

  // 5. Продольная исчерченность кератина ногтя 256x256
  const [nc, nx] = canvas(256, 256);
  nx.fillStyle = '#808080';
  nx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 180; i++) {
    const y = rnd() * 256;
    nx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(40,40,40,0.16)';
    nx.lineWidth = 0.8 + rnd() * 1.4;
    nx.beginPath();
    nx.moveTo(0, y);
    nx.lineTo(256, y);
    nx.stroke();
  }

  const textures = {
    cuticle: wrap(cc, 1, 1, true),
    cells: wrap(kc, 8, 1, true),
    skin: wrap(sc, 6, 6, false),
    bone: wrap(bc, 4, 4, false),
    nail: wrap(nc, 2, 4, false),
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

export function makeMaterial(key: MatKey, tex: HairTextures): MeshPhysicalMaterial {
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
    vertexColors: !!s.vertexColors,
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
    m.customProgramCacheKey = () => `hair-cut-${pat}`;
    m.onBeforeCompile = (shader) => patchCut(shader, cut, pat);
  }
  return m;
}
