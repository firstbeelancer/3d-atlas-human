import {
  CanvasTexture, Color, DoubleSide, FrontSide, LinearFilter, MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, type Material, type WebGLProgramParametersWithUniforms,
} from 'three';
import { TM_N } from './anatomy';
import type { MatKey } from './build';

type Params = ConstructorParameters<typeof MeshPhysicalMaterial>[0];

export interface EarTextures {
  skin: CanvasTexture;
  tm: CanvasTexture;
  fibre: CanvasTexture;
  bump: CanvasTexture;
  dispose(): void;
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = true, srgb = true): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  const t = new CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const prng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

/** Текстуры строятся в canvas: кожа, барабанная перепонка с рукояткой молоточка и световым рефлексом, мышечные волокна. */
export function buildTextures(): EarTextures {
  const skin = canvasTex(256, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    const r = prng(3);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(150,90,70,${0.03 + r() * 0.05})`;
      g.beginPath();
      g.arc(r() * s, r() * s, 0.6 + r() * 1.3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.15})`;
      g.fillRect(r() * s, r() * s, 1 + r() * 2, 1);
    }
  });
  const bump = canvasTex(256, (g, s) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, s, s);
    const r = prng(9);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(90 + r() * 90);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(r() * s, r() * s, 0.7 + r() * 1.1, 0, Math.PI * 2);
      g.fill();
    }
  }, true, false);
  const fibre = canvasTex(128, (g, s) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, s, s);
    const r = prng(5);
    for (let x = 0; x < s; x += 2) {
      const v = Math.floor(70 + r() * 120);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1 + Math.floor(r() * 2), s);
    }
  }, true, false);
  const tm = canvasTex(512, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.5);
    grad.addColorStop(0, '#d9cbc2');
    grad.addColorStop(0.7, '#c9bcb4');
    grad.addColorStop(1, '#b7a79d');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const r = prng(17);
    // радиальные и циркулярные волокна
    g.lineWidth = 1;
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2;
      g.strokeStyle = `rgba(245,236,226,${0.12 + r() * 0.2})`;
      g.beginPath();
      g.moveTo(s / 2 + Math.cos(a) * s * 0.06, s / 2 + Math.sin(a) * s * 0.06);
      g.lineTo(s / 2 + Math.cos(a) * s * 0.49, s / 2 + Math.sin(a) * s * 0.49);
      g.stroke();
    }
    for (let k = 1; k < 9; k++) {
      g.strokeStyle = 'rgba(120,100,95,0.08)';
      g.beginPath();
      g.arc(s / 2, s / 2, s * 0.055 * k, 0, Math.PI * 2);
      g.stroke();
    }
    // световой рефлекс: вниз и вперёд от пупка
    const cone = g.createLinearGradient(s * 0.5, s * 0.5, s * 0.78, s * 0.8);
    cone.addColorStop(0, 'rgba(255,255,250,0.92)');
    cone.addColorStop(1, 'rgba(255,255,250,0.1)');
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.5);
    g.lineTo(s * 0.74, s * 0.88);
    g.lineTo(s * 0.62, s * 0.9);
    g.closePath();
    g.fill();
    // рукоятка молоточка просвечивает через перепонку: от пупка вверх и вперёд
    g.strokeStyle = 'rgba(170,120,90,0.85)';
    g.lineCap = 'round';
    g.lineWidth = s * 0.026;
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.5);
    g.lineTo(s * 0.57, s * 0.2);
    g.stroke();
    g.fillStyle = 'rgba(235,225,205,0.95)';
    g.beginPath();
    g.arc(s * 0.575, s * 0.17, s * 0.022, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(s * 0.5, s * 0.5, s * 0.02, 0, Math.PI * 2);
    g.fill();
  }, false);
  const tex: EarTextures = {
    skin,
    tm,
    fibre,
    bump,
    dispose() {
      skin.dispose();
      tm.dispose();
      fibre.dispose();
      bump.dispose();
    },
  };
  return tex;
}

/** Общие uniform: вибрация перепонки и бегущая волна по базилярной мембране. */
export const VIB = { uVib: { value: 0 }, uN: { value: [TM_N[0], TM_N[1], TM_N[2]] as [number, number, number] } };
export const WAVE = { uT: { value: 0 }, uP: { value: 0.5 }, uA: { value: 0 } };

/**
 * Материал слоя: изнанка поверхности красится цветом среза, поэтому на разрезе в стенке виден цвет слоя без отдельных «крышек».
 */
function layer(params: Params, key: string, back?: string): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ side: back ? DoubleSide : FrontSide, ...params });
  if (back) {
    m.customProgramCacheKey = () => `ear-layer-${key}`;
    m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uBack = { value: new Color(back) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBack;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n          if (!gl_FrontFacing) diffuseColor.rgb = uBack;');
    };
  }
  return m;
}

function waveMat(params: Params, key: string, gain: number): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ side: DoubleSide, ...params });
  m.customProgramCacheKey = () => `ear-wave-${key}`;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uT = WAVE.uT;
    shader.uniforms.uP = WAVE.uP;
    shader.uniforms.uA = WAVE.uA;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlong;\nvarying float vAlong;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vAlong = aAlong;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlong;\nuniform float uT;\nuniform float uP;\nuniform float uA;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
          float env = exp(-pow((vAlong - uP) / 0.11, 2.0));
          float ph = 0.5 + 0.5 * sin(vAlong * 70.0 - uT * 14.0);
          totalEmissiveRadiance += vec3(1.0, 0.5, 0.18) * env * (0.35 + 0.65 * ph) * uA * ${gain.toFixed(2)};`,
      );
  };
  return m;
}

const glass = { transparent: true, depthWrite: false, side: DoubleSide } as const;

/** Материал части: у каждой части свои экземпляры, поэтому подсветка и призрачный режим не задевают соседей. */
export function makeMaterial(kind: MatKey, t: EarTextures): Material {
  const P = (p: Params) => new MeshPhysicalMaterial(p);
  switch (kind) {
    case 'skin':
      return layer(
        { vertexColors: true, map: t.skin, bumpMap: t.bump, bumpScale: 0.18, color: new Color('#efc2a8'), roughness: 0.52, clearcoat: 0.22, clearcoatRoughness: 0.55, sheen: 0.7, sheenRoughness: 0.5, sheenColor: new Color('#ffc7b2') },
        'skin',
        '#e6ad95',
      );
    case 'cartilage':
      return layer({ color: new Color('#f3e8c8'), roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new Color('#fff7dc') }, 'cartilage', '#efe0b2');
    case 'bone':
      return layer({ ...glass, color: new Color('#efe3c8'), opacity: 0.27, roughness: 0.5, clearcoat: 0.25 }, 'bone', '#dcc9a2');
    case 'mucosa':
      return P({ ...glass, color: new Color('#eb9a94'), opacity: 0.52, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18, sheen: 0.8, sheenColor: new Color('#ffc2b8') });
    case 'ossicle':
      return P({ color: new Color('#f5eedd'), roughness: 0.34, clearcoat: 0.65, clearcoatRoughness: 0.25, sheen: 0.5, sheenColor: new Color('#fffaf0') });
    case 'tm': {
      const m = P({ map: t.tm, color: new Color('#f4ebe4'), transparent: true, opacity: 0.88, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, side: DoubleSide, depthWrite: false, sheen: 0.4, sheenColor: new Color('#fff4ea') });
      m.customProgramCacheKey = () => 'ear-tm';
      m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        shader.uniforms.uVib = VIB.uVib;
        shader.uniforms.uN = VIB.uN;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aRho;\nuniform float uVib;\nuniform vec3 uN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += uN * (uVib * (1.0 - aRho * aRho));');
      };
      return m;
    }
    case 'tmFlaccida':
      return P({ color: new Color('#e7b9ad'), transparent: true, opacity: 0.84, roughness: 0.3, clearcoat: 0.7, side: DoubleSide, depthWrite: false, sheen: 0.6, sheenColor: new Color('#ffcfc4') });
    case 'annulus':
      return P({ color: new Color('#e9ddc6'), roughness: 0.45, clearcoat: 0.4 });
    case 'nerve':
      return P({ color: new Color('#f0d24f'), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4, emissive: new Color('#5a4300'), emissiveIntensity: 0.08 });
    case 'ganglion':
      return P({ color: new Color('#eaa63c'), roughness: 0.4, clearcoat: 0.5 });
    case 'artery':
      return P({ color: new Color('#cc372d'), roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.25, emissive: new Color('#300000'), emissiveIntensity: 0.08 });
    case 'vein':
      return P({ color: new Color('#4565b8'), roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    case 'muscle':
      return P({ color: new Color('#c25a4b'), bumpMap: t.fibre, bumpScale: 0.8, roughness: 0.5, clearcoat: 0.25, sheen: 0.5, sheenColor: new Color('#ff9d8a') });
    case 'ligament':
      return P({ color: new Color('#f1e8d2'), roughness: 0.5, clearcoat: 0.3 });
    case 'canalSkin':
      return P({ map: t.skin, bumpMap: t.bump, bumpScale: 0.3, color: new Color('#e9b49c'), roughness: 0.5, clearcoat: 0.3, side: DoubleSide, sheen: 0.5, sheenColor: new Color('#ffc7b2') });
    case 'hair':
      return P({ color: new Color('#7b5a44'), roughness: 0.6 });
    case 'gland':
      return P({ color: new Color('#dba646'), roughness: 0.4, clearcoat: 0.5 });
    case 'cerumen':
      return P({ ...glass, color: new Color('#cb8f22'), opacity: 0.4, roughness: 0.2, clearcoat: 0.9 });
    case 'glass':
      return P({ ...glass, color: new Color('#dff0f6'), opacity: 0.16, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.4 });
    case 'glassSoft':
      return P({ ...glass, color: new Color('#e6dfd0'), opacity: 0.11, roughness: 0.2, clearcoat: 0.6 });
    case 'perilymph':
      return P({ ...glass, color: new Color('#7db4ee'), opacity: 0.4, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new Color('#1a4a86'), emissiveIntensity: 0.14 });
    case 'endolymph':
      return P({ ...glass, color: new Color('#f4cc7c'), opacity: 0.52, roughness: 0.1, clearcoat: 1, emissive: new Color('#7d5412'), emissiveIntensity: 0.16 });
    case 'membrane':
      return P({ ...glass, color: new Color('#f8ece3'), opacity: 0.55, roughness: 0.3, clearcoat: 0.6 });
    case 'basilar':
      return waveMat({ color: new Color('#f3dbaa'), roughness: 0.4, clearcoat: 0.6, emissive: new Color('#3a2608'), emissiveIntensity: 0.1 }, 'basilar', 1.3);
    case 'reissner':
      return P({ ...glass, color: new Color('#fbeef0'), opacity: 0.5, roughness: 0.2, clearcoat: 0.8 });
    case 'corti':
      return waveMat({ color: new Color('#e9726c'), roughness: 0.4, clearcoat: 0.5, emissive: new Color('#400a08'), emissiveIntensity: 0.1 }, 'corti', 1.6);
    case 'tectorial':
      return P({ ...glass, color: new Color('#f2e5c2'), opacity: 0.7, roughness: 0.3 });
    case 'lamina':
      return P({ color: new Color('#efe3c4'), roughness: 0.5, side: DoubleSide });
    case 'modiolus':
      return P({ color: new Color('#e9ddc3'), roughness: 0.58, clearcoat: 0.15 });
    case 'duct':
      return P({ ...glass, color: new Color('#f3dea4'), opacity: 0.6, roughness: 0.18, clearcoat: 0.9, emissive: new Color('#a07a2a'), emissiveIntensity: 0.12 });
    case 'ampulla':
      return P({ ...glass, color: new Color('#f4d996'), opacity: 0.66, roughness: 0.18, clearcoat: 0.9, emissive: new Color('#a07a2a'), emissiveIntensity: 0.14 });
    case 'cupula':
      return P({ ...glass, color: new Color('#fff4d8'), opacity: 0.6, roughness: 0.1, clearcoat: 1 });
    case 'macula':
      return P({ color: new Color('#d9b27a'), roughness: 0.5 });
    case 'otolith':
      return P({ color: new Color('#fffdf6'), roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'capsule':
      return P({ ...glass, color: new Color('#f7f0e4'), opacity: 0.5, roughness: 0.3, clearcoat: 0.6 });
    case 'brainstem':
      return P({ color: new Color('#d9c8ba'), roughness: 0.55, clearcoat: 0.25, sheen: 0.4, transparent: true, opacity: 0.7 });
    case 'wall':
      return P({ ...glass, color: new Color('#f1d7cb'), opacity: 0.42, roughness: 0.35, clearcoat: 0.5 });
    case 'tube':
      return P({ color: new Color('#ffffff'), transparent: true, opacity: 0, depthWrite: false });
  }
}
