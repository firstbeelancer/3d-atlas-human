import { CanvasTexture, Color, DoubleSide, MeshPhysicalMaterial, RepeatWrapping, Vector4, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './types';

/*
  Материалы тканей языка. Плотные тела рисуются с двух сторон: изнанка поверхности видна там, где плоскость разреза
  убрала переднюю стенку, и красится цветом среза ткани с рябью по точке пространства. Так на любом разрезе видны
  настоящие слои: тонкая слизистая, под ней мышцы с волокнами, перегородка.
  Подвижные части получают общий «движущий» вершинный шейдер: язык высовывается, поднимает кончик, ходит в стороны.
*/

interface Spec {
  color: string;
  cut?: string;
  rough?: number;
  cc?: number;
  ccr?: number;
  sheen?: number;
  sheenColor?: string;
  opacity?: number;
  /** Рисунок на изнанке: 0 — зерно, 1 — волокна, 2 — клетки. */
  pattern?: 0 | 1 | 2;
  bump?: number;
  /** Не красить изнанку (прозрачные оболочки, тонкие листы). */
  plain?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
}

const SPECS: Record<MatKey, Spec> = {
  mucosa: { color: '#e48f8f', cut: '#e7a39e', rough: 0.38, cc: 0.55, ccr: 0.25, sheen: 0.5, sheenColor: '#ffc9c2', bump: 0.25 },
  dorsum: { color: '#e19a98', cut: '#e7a39e', rough: 0.62, cc: 0.35, ccr: 0.4, sheen: 0.7, sheenColor: '#ffe1dc', bump: 0.9 },
  rootMucosa: { color: '#d98a86', cut: '#e2a09a', rough: 0.45, cc: 0.5, ccr: 0.3, sheen: 0.5, sheenColor: '#ffc9c2', bump: 0.5 },
  ventral: { color: '#dc7f8e', cut: '#e5a0a3', rough: 0.25, cc: 0.85, ccr: 0.15, sheen: 0.4, sheenColor: '#ffc0d0', bump: 0.1 },
  sulcus: { color: '#a94f57', rough: 0.5, cc: 0.4, plain: true },
  pit: { color: '#4a1a20', rough: 0.7, plain: true },
  frenulum: { color: '#e6909b', cut: '#e9a6aa', rough: 0.3, cc: 0.8, ccr: 0.2, opacity: 0.88 },
  fimbria: { color: '#d97888', rough: 0.35, cc: 0.6, plain: true },
  caruncle: { color: '#e2828c', rough: 0.3, cc: 0.8, plain: true },
  filiform: { color: '#f2d3cc', rough: 0.75, sheen: 0.6, sheenColor: '#ffffff', plain: true },
  fungiform: { color: '#d8454f', rough: 0.3, cc: 0.8, ccr: 0.15, plain: true },
  foliate: { color: '#d76a72', cut: '#e19a98', rough: 0.4, cc: 0.5, plain: true },
  vallate: { color: '#e17f82', cut: '#e7a39e', rough: 0.35, cc: 0.6, ccr: 0.2, pattern: 2 },
  trench: { color: '#5a1f28', rough: 0.7, plain: true },
  tonsil: { color: '#d99389', cut: '#e5b1a2', rough: 0.4, cc: 0.5, pattern: 2 },
  core: { color: '#b54448', cut: '#b84a4c', rough: 0.5, cc: 0.3, pattern: 1 },
  supLong: { color: '#c9545a', cut: '#c55257', rough: 0.45, cc: 0.4, sheen: 0.6, sheenColor: '#ff9a9a', pattern: 1 },
  infLong: { color: '#c24e5e', cut: '#bd4b5a', rough: 0.45, cc: 0.4, sheen: 0.6, sheenColor: '#ff9aa8', pattern: 1 },
  transverse: { color: '#d76a5d', cut: '#cf6155', rough: 0.45, cc: 0.4, sheen: 0.5, sheenColor: '#ffb19a' },
  vertical: { color: '#a8384a', cut: '#a03445', rough: 0.45, cc: 0.4, sheen: 0.5, sheenColor: '#ff8fa0' },
  septum: { color: '#f2e6d3', cut: '#efe2cc', rough: 0.5, sheen: 0.6, sheenColor: '#ffffff', pattern: 1 },
  extrinsic: { color: '#b9424a', cut: '#ad3a42', rough: 0.45, cc: 0.4, sheen: 0.7, sheenColor: '#ff9a9a', pattern: 1 },
  extrinsicB: { color: '#c2564a', cut: '#b44c41', rough: 0.45, cc: 0.4, sheen: 0.7, sheenColor: '#ffae9a', pattern: 1 },
  bone: { color: '#efe4c8', cut: '#f4ead4', rough: 0.55, cc: 0.2, pattern: 2 },
  ghostBone: { color: '#e9dfc6', opacity: 0.17, rough: 0.4, cc: 0.4, plain: true },
  cartilage: { color: '#d5e7ea', cut: '#c9dfe4', rough: 0.3, cc: 0.7, ccr: 0.2, opacity: 0.82 },
  artery: { color: '#d03a34', rough: 0.35, cc: 0.7, ccr: 0.2 },
  vein: { color: '#4560b5', rough: 0.35, cc: 0.7, ccr: 0.2 },
  nerve: { color: '#e8c84a', rough: 0.4, cc: 0.5 },
  chorda: { color: '#f29a3a', rough: 0.4, cc: 0.5 },
  gland: { color: '#e9b98f', cut: '#e2aa7c', rough: 0.45, cc: 0.4, pattern: 2 },
  glandSub: { color: '#f0d6a8', cut: '#e9c891', rough: 0.45, cc: 0.4, pattern: 2 },
  duct: { color: '#f3e3b0', rough: 0.35, cc: 0.6 },
  ebner: { color: '#9fc3e0', cut: '#8eb6d6', rough: 0.4, cc: 0.5, pattern: 2 },
  epithelium: { color: '#efb6ad', cut: '#f0c0b6', rough: 0.5, cc: 0.35, sheen: 0.5, sheenColor: '#ffe0da', pattern: 2, bump: 0.4 },
  basement: { color: '#a9cce6', opacity: 0.3, rough: 0.3, cc: 0.6, plain: true },
  lamina: { color: '#f3dcc4', cut: '#f2d6bc', rough: 0.55, pattern: 1 },
  capillary: { color: '#d8443d', rough: 0.35, cc: 0.7 },
  budShell: { color: '#f5e7d0', opacity: 0.22, rough: 0.2, cc: 0.8, plain: true },
  pore: { color: '#3a1418', rough: 0.7, plain: true },
  hairs: { color: '#fff1c8', rough: 0.3, cc: 0.6, emissive: '#ffd27a', emissiveIntensity: 0.15 },
  cell1: { color: '#b8c4d8', cut: '#aab8cf', rough: 0.4, cc: 0.4, pattern: 2 },
  cell2: { color: '#7cc29a', cut: '#6db58b', rough: 0.4, cc: 0.4, pattern: 2 },
  cell3: { color: '#a77ad0', cut: '#9a6bc4', rough: 0.4, cc: 0.4, pattern: 2 },
  basal: { color: '#f0a65a', cut: '#e8984a', rough: 0.4, cc: 0.4, pattern: 2 },
  fibre: { color: '#f2cf3c', rough: 0.35, cc: 0.6, emissive: '#c99a10', emissiveIntensity: 0.12 },
  saliva: { color: '#bfe3f5', opacity: 0.2, rough: 0.05, cc: 1, ccr: 0.05, plain: true },
  molecule: { color: '#ffffff', rough: 0.3, cc: 0.7, emissive: '#7bd0ff', emissiveIntensity: 0.35 },
};

/** Общий параметр движения языка: x — вперёд, y — кончик вверх, z — вбок, w — желобок. */
export const MOTION = { value: new Vector4() };

export interface TongueTextures {
  grain: Texture;
  dispose(): void;
}

/** Мелкий рельеф слизистой: бархатистость спинки от сосочков и зернистость эпителия. */
export function buildTongueTextures(): TongueTextures {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const img = x.createImageData(128, 128);
  let s = 4242;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 128 * 128; i++) {
    const v = 110 + rnd() * 130;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(10, 10);
  t.needsUpdate = true;
  return { grain: t, dispose: () => t.dispose() };
}

const NOISE = `
float hh(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x), mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x), mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x), f.y), f.z);
}`;

/** Смещение вершин при движении языка; повторяет displace() из anatomy.ts. */
const MOVE = `
uniform vec4 uMotion;
float tsm(float a, float b, float x){ float t = clamp((x-a)/(b-a), 0.0, 1.0); return t*t*(3.0-2.0*t); }
vec3 tongueMove(vec3 p){
  float w = tsm(-2.6, 2.2, p.x) * tsm(-2.6, -1.0, p.y);
  float front = tsm(0.5, 5.2, p.x);
  float f2 = front*front;
  float dx = (uMotion.x*1.35 - uMotion.y*0.35*f2) * w;
  float dy = (uMotion.y*1.55*f2 - uMotion.w*0.22*exp(-(p.z/0.9)*(p.z/0.9))*tsm(-1.0, 2.0, p.x)) * w;
  float dz = uMotion.z*1.25*f2*w;
  float narrow = 1.0 - 0.16*uMotion.x*w*front;
  return vec3(p.x + dx, p.y + dy, p.z*narrow + dz);
}`;

function patch(shader: WebGLProgramParametersWithUniforms, cut: Color | null, pattern: number, moving: boolean): void {
  let vs = shader.vertexShader;
  if (moving) {
    shader.uniforms.uMotion = MOTION;
    vs = vs.replace('#include <common>', `#include <common>\n${MOVE}`).replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = tongueMove(transformed);');
  }
  if (cut) {
    shader.uniforms.cutColor = { value: cut };
    vs = vs
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const pat =
      pattern === 1
        ? 'float n = vn(vWP*vec3(9.0,2.2,9.0))*0.6 + vn(vWP*vec3(30.0,7.0,30.0))*0.4; float k = 0.84 + 0.3*n;'
        : pattern === 2
          ? 'float n = vn(vWP*6.0)*0.55 + vn(vWP*21.0)*0.45; float k = 0.84 + 0.32*n;'
          : 'float n = vn(vWP*16.0); float k = 0.93 + 0.14*n;';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\nuniform vec3 cutColor;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nif (!gl_FrontFacing) { ${pat} diffuseColor.rgb = cutColor * k; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (!gl_FrontFacing) roughnessFactor = 0.88;');
  }
  shader.vertexShader = vs;
}

export function makeMaterial(key: MatKey, tex: TongueTextures, moving: boolean): MeshPhysicalMaterial {
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
    emissive: new Color(s.emissive ?? '#000000'),
    emissiveIntensity: s.emissiveIntensity ?? 0,
  });
  if (s.bump) {
    m.bumpMap = tex.grain;
    m.bumpScale = s.bump;
  }
  const cut = s.plain ? null : new Color(s.cut ?? s.color).multiplyScalar(s.cut ? 1 : 0.9);
  const pat = s.pattern ?? 0;
  if (cut || moving) {
    m.customProgramCacheKey = () => `tongue-${cut ? pat : 'p'}-${moving ? 'm' : 's'}`;
    m.onBeforeCompile = (shader) => patch(shader, cut, pat, moving);
  }
  return m;
}
