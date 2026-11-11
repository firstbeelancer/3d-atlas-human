import { CanvasTexture, Color, DoubleSide, MeshPhysicalMaterial, RepeatWrapping, Vector4, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './types';
import { BUD_AXES } from './buildBud';

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
  tissue?: 'oral' | 'papilla' | 'muscle' | 'micro';
  vertexColors?: boolean;
  budVoids?: boolean;
  /** Не красить изнанку (прозрачные оболочки, тонкие листы). */
  plain?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
}

const SPECS: Record<MatKey, Spec> = {
  mucosa: { color: '#c78086', cut: '#d99c9e', rough: 0.43, cc: 0.38, ccr: 0.27, tissue: 'oral', bump: 0.013, vertexColors: true },
  sulcus: { color: '#a36067', rough: 0.53, cc: 0.3, plain: true },
  pit: { color: '#65353d', rough: 0.72, plain: true },
  frenulum: { color: '#d38e96', cut: '#dea4a8', rough: 0.33, cc: 0.64, ccr: 0.23, tissue: 'oral' },
  fimbria: { color: '#d97888', rough: 0.35, cc: 0.6, plain: true },
  caruncle: { color: '#e2828c', rough: 0.3, cc: 0.8, plain: true },
  filiform: { color: '#ca8e91', rough: 0.68, sheen: 0.14, sheenColor: '#f1c5bf', tissue: 'papilla', plain: true },
  fungiform: { color: '#ba626b', rough: 0.45, cc: 0.44, ccr: 0.25, tissue: 'papilla', plain: true },
  foliate: { color: '#bc7079', rough: 0.47, cc: 0.38, tissue: 'papilla', plain: true },
  vallate: { color: '#c87e82', cut: '#d99c9e', rough: 0.46, cc: 0.42, ccr: 0.29, pattern: 2, tissue: 'papilla' },
  trench: { color: '#864750', rough: 0.68, plain: true },
  tonsil: { color: '#ad6b6e', cut: '#d28c88', rough: 0.48, cc: 0.34, pattern: 2, tissue: 'oral' },
  sectionMuscle: { color: '#a8454e', rough: 0.62, cc: 0.26, ccr: 0.32, tissue: 'muscle', plain: true },
  sectionMucosa: { color: '#d99399', rough: 0.55, cc: 0.25, tissue: 'oral', plain: true },
  supLong: { color: '#c9545a', cut: '#c55257', rough: 0.45, cc: 0.4, sheen: 0.6, sheenColor: '#ff9a9a', pattern: 1 },
  infLong: { color: '#c24e5e', cut: '#bd4b5a', rough: 0.45, cc: 0.4, sheen: 0.6, sheenColor: '#ff9aa8', pattern: 1 },
  transverse: { color: '#d76a5d', cut: '#cf6155', rough: 0.45, cc: 0.4, sheen: 0.5, sheenColor: '#ffb19a' },
  vertical: { color: '#a8384a', cut: '#a03445', rough: 0.45, cc: 0.4, sheen: 0.5, sheenColor: '#ff8fa0' },
  septum: { color: '#f2e6d3', cut: '#efe2cc', rough: 0.5, sheen: 0.6, sheenColor: '#ffffff', pattern: 1 },
  extrinsic: { color: '#b04c53', cut: '#ad3a42', rough: 0.52, cc: 0.29, sheen: 0.24, sheenColor: '#e5a0a0', pattern: 1, tissue: 'oral' },
  extrinsicB: { color: '#c2564a', cut: '#b44c41', rough: 0.45, cc: 0.4, sheen: 0.7, sheenColor: '#ffae9a', pattern: 1 },
  bone: { color: '#efe4c8', cut: '#f4ead4', rough: 0.55, cc: 0.2, pattern: 2 },
  ghostBone: { color: '#e9dfc6', opacity: 0.17, rough: 0.4, cc: 0.4, plain: true },
  cartilage: { color: '#d5e7ea', cut: '#c9dfe4', rough: 0.3, cc: 0.7, ccr: 0.2, opacity: 0.82 },
  artery: { color: '#d03a34', rough: 0.35, cc: 0.7, ccr: 0.2 },
  vein: { color: '#4560b5', rough: 0.35, cc: 0.7, ccr: 0.2 },
  submucosalVein: { color: '#987088', rough: 0.47, cc: 0.31, tissue: 'oral', opacity: 0.78 },
  nerve: { color: '#e8c84a', rough: 0.4, cc: 0.5 },
  chorda: { color: '#f29a3a', rough: 0.4, cc: 0.5 },
  gland: { color: '#e9b98f', cut: '#e2aa7c', rough: 0.45, cc: 0.4, pattern: 2 },
  glandSub: { color: '#f0d6a8', cut: '#e9c891', rough: 0.45, cc: 0.4, pattern: 2 },
  duct: { color: '#f3e3b0', rough: 0.35, cc: 0.6 },
  ebner: { color: '#9fc3e0', cut: '#8eb6d6', rough: 0.4, cc: 0.5, pattern: 2 },
  epithelium: { color: '#cb918d', cut: '#d6a09b', rough: 0.52, cc: 0.34, sheen: 0.24, sheenColor: '#eebcb5', pattern: 2, tissue: 'micro', bump: 0.025 },
  sectionEpithelium: { color: '#cb8f8c', rough: 0.64, tissue: 'micro', budVoids: true, plain: true },
  sectionLamina: { color: '#d49d91', rough: 0.66, tissue: 'micro', opacity: 0.64, plain: true },
  basement: { color: '#a9cce6', opacity: 0.3, rough: 0.3, cc: 0.6, plain: true },
  lamina: { color: '#d9b1a4', cut: '#d5ad9e', rough: 0.55, pattern: 1, tissue: 'micro' },
  capillary: { color: '#d8443d', rough: 0.35, cc: 0.7 },
  budShell: { color: '#f5e7d0', opacity: 0.22, rough: 0.2, cc: 0.8, plain: true },
  pore: { color: '#3a1418', rough: 0.7, plain: true },
  hairs: { color: '#fff1c8', rough: 0.3, cc: 0.6, emissive: '#ffd27a', emissiveIntensity: 0.15 },
  cell1: { color: '#aab7c9', cut: '#aab8cf', rough: 0.49, cc: 0.26, tissue: 'micro', pattern: 2 },
  cell2: { color: '#83ad9c', cut: '#6da38b', rough: 0.46, cc: 0.27, tissue: 'micro', pattern: 2 },
  cell3: { color: '#ab8ec0', cut: '#9b7db4', rough: 0.46, cc: 0.26, tissue: 'micro', pattern: 2 },
  basal: { color: '#dfab7b', cut: '#d09a66', rough: 0.47, cc: 0.26, tissue: 'micro', pattern: 2 },
  nucleus: { color: '#695773', rough: 0.59, plain: true },
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

function patch(shader: WebGLProgramParametersWithUniforms, cut: Color | null, pattern: number, moving: boolean, spec: Spec): void {
  const { tissue, budVoids } = spec;
  let vs = shader.vertexShader;
  if (moving) {
    shader.uniforms.uMotion = MOTION;
    vs = vs.replace('#include <common>', `#include <common>\n${MOVE}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (dot(uMotion, uMotion) > 0.00001) {
          vec3 helper = abs(objectNormal.y) < 0.94 ? vec3(0.,1.,0.) : vec3(1.,0.,0.);
          vec3 t = normalize(cross(helper, objectNormal));
          vec3 b = cross(objectNormal, t);
          vec3 p0 = tongueMove(position);
          objectNormal = normalize(cross(tongueMove(position + t * 0.012) - p0, tongueMove(position + b * 0.012) - p0));
        }`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = tongueMove(transformed);');
  }
  if (budVoids) {
    shader.uniforms.budCenters = { value: BUD_AXES.map(({ p }) => p) };
    shader.uniforms.budDirections = { value: BUD_AXES.map(({ n }) => n) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 budCenters[4];
        uniform vec3 budDirections[4];`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        for (int i = 0; i < 4; i++) {
          vec3 d = vTissue - budCenters[i];
          float h = -dot(d, budDirections[i]);
          if (h < -0.05 || h > 2.02) continue;
          float r = 0.105 + 0.75 * sin(clamp(h / 2.12, 0., 1.) * 2.65);
          float radial = length(d + budDirections[i] * h);
          if (radial < r) discard;
          diffuseColor.rgb *= 0.82 + 0.18 * smoothstep(r, r + 0.09, radial);
        }`);
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
  if (tissue) {
    vs = vs
      .replace('#include <common>', '#include <common>\nvarying vec3 vTissue;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTissue = position;');
    const paint = tissue === 'muscle'
      ? `float threads = vn(vTissue * vec3(4.0, 20.0, 34.0));
         float crossWeave = vn(vTissue * vec3(29.0, 24.0, 6.0));
         float bands = vn(vTissue * vec3(2.8, 5.0, 4.0));
         float collagen = smoothstep(0.68, 0.89, threads * 0.65 + bands * 0.35);
         float weave = mix(crossWeave, threads, smoothstep(0.24, 0.76, bands));
         diffuseColor.rgb *= 0.66 + weave * 0.62 + bands * 0.12;
         float septum = (1. - smoothstep(0.012, 0.045, abs(vTissue.z))) *
            smoothstep(-1.8, -0.9, vTissue.x) * (1. - smoothstep(4.05, 4.62, vTissue.x)) *
            (1. - smoothstep(0.48, 0.93, vTissue.y)) * smoothstep(0.0002, 0.002, fwidth(vTissue.z));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.31, 0.28), collagen * 0.35 + septum * 0.63);`
      : `float broad = vn(vTissue * ${tissue === 'micro' ? '0.66' : '2.15'});
         float mottle = vn(vTissue * ${tissue === 'micro' ? '6.0' : '12.0'});
         float pores = vn(vTissue * ${tissue === 'micro' ? '17.0' : '43.0'});
         diffuseColor.rgb *= 0.75 + 0.28 * broad + 0.15 * mottle + 0.11 * pores;
         diffuseColor.rgb.gb *= 0.88 + 0.15 * mottle + 0.10 * broad;
         roughnessFactor *= 0.88 + 0.23 * mottle;`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTissue;\n${cut ? '' : NOISE}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nif (gl_FrontFacing) { ${paint} }`);
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
    vertexColors: s.vertexColors ?? false,
  });
  if (s.bump) {
    m.bumpMap = tex.grain;
    m.bumpScale = s.bump;
  }
  const cut = s.plain ? null : new Color(s.cut ?? s.color).multiplyScalar(s.cut ? 1 : 0.9);
  const pat = s.pattern ?? 0;
  if (cut || moving || s.tissue) {
    m.customProgramCacheKey = () => `tongue-${cut ? pat : 'p'}-${moving ? 'm' : 's'}-${s.tissue ?? '-'}-${s.budVoids ? 'bud' : '-'}`;
    m.onBeforeCompile = (shader) => patch(shader, cut, pat, moving, s);
  }
  return m;
}
