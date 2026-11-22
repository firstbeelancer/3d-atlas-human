import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { EndocrineTextures } from './textures';

/*
  Физические материалы эндокринных органов: влажный блеск капсулы (clearcoat + sheen),
  микрорельеф долек и процедурный гистологический рисунок на изнанке любого разреза
  (!gl_FrontFacing), благодаря которому срез органа выглядит плотным и живым.
*/

export type MatKey =
  | 'hypothalamus'
  | 'hypoNuclei'
  | 'pituitaryStalk'
  | 'adenohypophysis'
  | 'neurohypophysis'
  | 'pineal'
  | 'thyroid'
  | 'thyroidIsthmus'
  | 'parathyroid'
  | 'thymus'
  | 'pancreas'
  | 'islets'
  | 'adrenalCortex'
  | 'adrenalMedulla'
  | 'ovary'
  | 'testis'
  | 'heartGhost'
  | 'kidneyGhost'
  | 'artery'
  | 'vein'
  | 'portalVessel'
  | 'nerveTract'
  | 'opticChiasm'
  | 'bone'
  | 'sinusGhost'
  | 'brainGhost'
  | 'cartilageGhost'
  | 'endocrineCell'
  | 'golgi'
  | 'vesicle'
  | 'capillaryWall'
  | 'rbc'
  | 'peptideHormone'
  | 'steroidHormone'
  | 'membraneReceptor'
  | 'decoyReceptor'
  | 'cellMembrane'
  | 'lipidHead'
  | 'cytoplasm'
  | 'nucleusShell'
  | 'nuclearReceptor'
  | 'dnaStrand';

type Params = ConstructorParameters<typeof MeshPhysicalMaterial>[0];

type CutPattern = 'solid' | 'follicle' | 'cortex' | 'lobule' | 'cords' | 'bone';

const NOISE_GLSL = `
varying vec3 vEndoObj;
float eh31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float evnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(
    mix(mix(eh31(i),eh31(i+vec3(1,0,0)),f.x), mix(eh31(i+vec3(0,1,0)),eh31(i+vec3(1,1,0)),f.x), f.y),
    mix(mix(eh31(i+vec3(0,0,1)),eh31(i+vec3(1,0,1)),f.x), mix(eh31(i+vec3(0,1,1)),eh31(i+vec3(1,1,1)),f.x), f.y),
    f.z
  );
}
`;

function cutFragment(pattern: CutPattern): string {
  switch (pattern) {
    case 'follicle':
      // фолликулы щитовидной железы с янтарным коллоидом на срезе
      return `
        if (!gl_FrontFacing) {
          float f1 = evnoise(vEndoObj * 16.0);
          float f2 = evnoise(vEndoObj * 36.0);
          float ring = smoothstep(0.42, 0.72, f1);
          diffuseColor.rgb = mix(uBack, uBackAlt, ring) * (0.86 + 0.24 * f2);
        }
      `;
    case 'cortex':
      // радиальные зоны коры надпочечника
      return `
        if (!gl_FrontFacing) {
          float bands = evnoise(vEndoObj * 12.0) * 0.6 + evnoise(vEndoObj * 28.0) * 0.4;
          diffuseColor.rgb = mix(uBack, uBackAlt, smoothstep(0.3, 0.75, bands));
        }
      `;
    case 'lobule':
      // дольчатая паренхима поджелудочной железы и тимуса
      return `
        if (!gl_FrontFacing) {
          float n = evnoise(vEndoObj * 10.0) * 0.55 + evnoise(vEndoObj * 26.0) * 0.45;
          float septa = smoothstep(0.66, 0.86, n);
          diffuseColor.rgb = mix(uBack, uBackAlt, septa) * (0.88 + 0.22 * evnoise(vEndoObj * 48.0));
        }
      `;
    case 'cords':
      // железистые тяжи аденогипофиза и капилляры
      return `
        if (!gl_FrontFacing) {
          float n = evnoise(vEndoObj * 6.0) * 0.5 + evnoise(vEndoObj * 18.0) * 0.5;
          diffuseColor.rgb = mix(uBack, uBackAlt, smoothstep(0.35, 0.75, n));
        }
      `;
    case 'bone':
      // губчатое вещество клиновидной кости
      return `
        if (!gl_FrontFacing) {
          float n = evnoise(vEndoObj * 9.0) * 0.5 + evnoise(vEndoObj * 22.0) * 0.5;
          diffuseColor.rgb = mix(uBack, uBackAlt, smoothstep(0.38, 0.70, n));
        }
      `;
    default:
      return `
        if (!gl_FrontFacing) {
          diffuseColor.rgb = uBack;
        }
      `;
  }
}

/** Плотная ткань: на изнанке разреза рисует процедурную гистологическую структуру. */
function solidTissue(
  params: Params,
  key: string,
  back: string,
  backAlt = back,
  pattern: CutPattern = 'solid',
): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ side: DoubleSide, ...params });
  m.customProgramCacheKey = () => `endo-${pattern}-${key}`;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBack = { value: new Color(back) };
    shader.uniforms.uBackAlt = { value: new Color(backAlt) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEndoObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEndoObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uBack;\nuniform vec3 uBackAlt;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${cutFragment(pattern)}`)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nif (!gl_FrontFacing) roughnessFactor = 0.78;',
      );
  };
  return m;
}

/** Френелевский материал «стеклянного силуэта» тела (читается и на светлом, и на тёмном фоне). */
export function makeGlassSkinMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: '#9db1cc',
    transparent: true,
    opacity: 0.13,
    roughness: 0.24,
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
    depthWrite: false,
  });
  m.customProgramCacheKey = () => 'endo-glass-skin';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rim = pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), 2.3);
       diffuseColor.a = clamp(diffuseColor.a + rim * 0.44, 0.0, 0.72);
       outgoingLight += vec3(0.46, 0.60, 0.84) * rim * 0.36;
       #include <opaque_fragment>`,
    );
  };
  return m;
}

export function makeMaterial(kind: MatKey, t: EndocrineTextures): Material {
  const P = (p: Params) => new MeshPhysicalMaterial(p);
  switch (kind) {
    case 'hypothalamus':
      return solidTissue(
        {
          color: '#e698a8',
          vertexColors: true,
          bumpMap: t.cellBump,
          bumpScale: 0.015,
          roughness: 0.44,
          clearcoat: 0.48,
          clearcoatRoughness: 0.3,
          sheen: 0.5,
          sheenColor: new Color('#ffd8e2'),
        },
        'hypothalamus',
        '#d78395',
        '#f2bac6',
        'cords',
      );
    case 'hypoNuclei':
      return P({
        color: '#f7b93c',
        emissive: new Color('#cc7c14'),
        emissiveIntensity: 0.34,
        roughness: 0.32,
        clearcoat: 0.7,
        clearcoatRoughness: 0.2,
      });
    case 'pituitaryStalk':
      return solidTissue(
        {
          color: '#ebc2b8',
          roughness: 0.42,
          clearcoat: 0.5,
          sheen: 0.4,
          sheenColor: new Color('#ffe6df'),
        },
        'pituitaryStalk',
        '#d6a39a',
      );
    case 'adenohypophysis':
      return solidTissue(
        {
          color: '#d8645a',
          vertexColors: true,
          bumpMap: t.glandBump,
          bumpScale: 0.018,
          roughness: 0.38,
          clearcoat: 0.58,
          clearcoatRoughness: 0.24,
          sheen: 0.55,
          sheenColor: new Color('#ffb9ae'),
        },
        'adenohypophysis',
        '#c24f4a',
        '#eda190',
        'cords',
      );
    case 'neurohypophysis':
      return solidTissue(
        {
          color: '#ebd0b6',
          vertexColors: true,
          bumpMap: t.cellBump,
          bumpScale: 0.014,
          roughness: 0.46,
          clearcoat: 0.4,
          sheen: 0.45,
          sheenColor: new Color('#fff0dc'),
        },
        'neurohypophysis',
        '#d8bc9e',
        '#f6e4cf',
        'cords',
      );
    case 'pineal':
      return solidTissue(
        {
          color: '#9b649c',
          vertexColors: true,
          bumpMap: t.glandBump,
          bumpScale: 0.025,
          roughness: 0.42,
          clearcoat: 0.52,
          clearcoatRoughness: 0.28,
          sheen: 0.55,
          sheenColor: new Color('#e3b8ef'),
          emissive: new Color('#47205a'),
          emissiveIntensity: 0.12,
        },
        'pineal',
        '#7d4980',
        '#c596c7',
        'lobule',
      );
    case 'thyroid':
      return solidTissue(
        {
          color: '#d15a4a',
          vertexColors: true,
          map: t.thyroidMap,
          bumpMap: t.glandBump,
          bumpScale: 0.022,
          roughness: 0.38,
          clearcoat: 0.62,
          clearcoatRoughness: 0.22,
          sheen: 0.55,
          sheenColor: new Color('#ffb4a2'),
        },
        'thyroid',
        '#b8453a',
        '#f2be72',
        'follicle',
      );
    case 'thyroidIsthmus':
      return solidTissue(
        {
          color: '#d86655',
          vertexColors: true,
          map: t.thyroidMap,
          bumpMap: t.glandBump,
          bumpScale: 0.02,
          roughness: 0.40,
          clearcoat: 0.58,
          clearcoatRoughness: 0.24,
          sheen: 0.5,
          sheenColor: new Color('#ffbaa8'),
        },
        'thyroidIsthmus',
        '#be4e42',
        '#f3c379',
        'follicle',
      );
    case 'parathyroid':
      return solidTissue(
        {
          color: '#f0b83a',
          roughness: 0.34,
          clearcoat: 0.68,
          clearcoatRoughness: 0.2,
          emissive: new Color('#8f5c08'),
          emissiveIntensity: 0.16,
        },
        'parathyroid',
        '#d99c22',
      );
    case 'thymus':
      return solidTissue(
        {
          color: '#e8a28c',
          vertexColors: true,
          map: t.thymusMap,
          bumpMap: t.glandBump,
          bumpScale: 0.026,
          roughness: 0.48,
          clearcoat: 0.38,
          clearcoatRoughness: 0.36,
          sheen: 0.6,
          sheenColor: new Color('#ffdfd1'),
        },
        'thymus',
        '#d68874',
        '#f4cbb6',
        'lobule',
      );
    case 'pancreas':
      return solidTissue(
        {
          color: '#e7bd79',
          vertexColors: true,
          map: t.pancreasMap,
          bumpMap: t.glandBump,
          bumpScale: 0.028,
          roughness: 0.52,
          clearcoat: 0.3,
          clearcoatRoughness: 0.4,
          sheen: 0.55,
          sheenColor: new Color('#ffebc7'),
        },
        'pancreas',
        '#d9a864',
        '#f5dcab',
        'lobule',
      );
    case 'islets':
      return P({
        color: '#ffbe30',
        emissive: new Color('#d67e08'),
        emissiveIntensity: 0.48,
        roughness: 0.28,
        clearcoat: 0.78,
        clearcoatRoughness: 0.18,
      });
    case 'adrenalCortex':
      return solidTissue(
        {
          color: '#e5ac3c',
          vertexColors: true,
          map: t.adrenalMap,
          bumpMap: t.glandBump,
          bumpScale: 0.022,
          roughness: 0.44,
          clearcoat: 0.48,
          clearcoatRoughness: 0.28,
          sheen: 0.5,
          sheenColor: new Color('#ffe39c'),
        },
        'adrenalCortex',
        '#d99b2a',
        '#f6cf70',
        'cortex',
      );
    case 'adrenalMedulla':
      return solidTissue(
        {
          color: '#9e3836',
          vertexColors: true,
          bumpMap: t.cellBump,
          bumpScale: 0.015,
          roughness: 0.36,
          clearcoat: 0.56,
          emissive: new Color('#4d1010'),
          emissiveIntensity: 0.18,
        },
        'adrenalMedulla',
        '#7d2424',
        '#c2564e',
        'cords',
      );
    case 'ovary':
      return solidTissue(
        {
          color: '#e59ab0',
          vertexColors: true,
          bumpMap: t.glandBump,
          bumpScale: 0.02,
          roughness: 0.4,
          clearcoat: 0.55,
          clearcoatRoughness: 0.26,
          sheen: 0.55,
          sheenColor: new Color('#ffd9e6'),
        },
        'ovary',
        '#d17c98',
        '#f4c6d6',
        'follicle',
      );
    case 'testis':
      return solidTissue(
        {
          color: '#e8c4b4',
          vertexColors: true,
          bumpMap: t.cellBump,
          bumpScale: 0.015,
          roughness: 0.38,
          clearcoat: 0.58,
          clearcoatRoughness: 0.24,
          sheen: 0.5,
          sheenColor: new Color('#ffe8dc'),
        },
        'testis',
        '#cfa392',
        '#f4ddd1',
        'lobule',
      );
    case 'heartGhost':
      return P({
        color: '#c96a64',
        transparent: true,
        opacity: 0.36,
        roughness: 0.38,
        clearcoat: 0.5,
        depthWrite: false,
        side: DoubleSide,
      });
    case 'kidneyGhost':
      return P({
        color: '#b86a5e',
        transparent: true,
        opacity: 0.38,
        roughness: 0.4,
        clearcoat: 0.48,
        depthWrite: false,
        side: DoubleSide,
      });
    case 'artery':
      return solidTissue(
        {
          color: '#cc3d35',
          roughness: 0.34,
          clearcoat: 0.55,
          clearcoatRoughness: 0.25,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        },
        'artery',
        '#a02a24',
      );
    case 'vein':
      return solidTissue(
        {
          color: '#4668b8',
          roughness: 0.38,
          clearcoat: 0.48,
          clearcoatRoughness: 0.28,
          transparent: true,
          opacity: 0.54,
          depthWrite: false,
        },
        'vein',
        '#324b8a',
      );
    case 'portalVessel':
      return solidTissue(
        {
          color: '#b83c66',
          roughness: 0.3,
          clearcoat: 0.72,
          clearcoatRoughness: 0.18,
          emissive: new Color('#52122a'),
          emissiveIntensity: 0.18,
        },
        'portalVessel',
        '#8c2448',
      );
    case 'nerveTract':
      return solidTissue(
        {
          color: '#f2ce56',
          roughness: 0.38,
          clearcoat: 0.5,
          emissive: new Color('#8c6810'),
          emissiveIntensity: 0.2,
        },
        'nerveTract',
        '#d9b036',
      );
    case 'opticChiasm':
      return solidTissue(
        {
          color: '#f4edd8',
          roughness: 0.42,
          clearcoat: 0.46,
          sheen: 0.4,
          sheenColor: new Color('#fffaf0'),
        },
        'opticChiasm',
        '#dfd4bc',
      );
    case 'bone':
      return solidTissue(
        {
          color: '#ece2ca',
          vertexColors: true,
          bumpMap: t.boneBump,
          bumpScale: 0.02,
          roughness: 0.62,
          clearcoat: 0.14,
        },
        'bone',
        '#d7c3a0',
        '#b89a78',
        'bone',
      );
    case 'sinusGhost':
      return P({
        color: '#a8d4f0',
        transparent: true,
        opacity: 0.24,
        roughness: 0.15,
        clearcoat: 0.8,
        depthWrite: false,
        side: DoubleSide,
      });
    case 'brainGhost':
      return P({
        color: '#d9b5bc',
        transparent: true,
        opacity: 0.19,
        roughness: 0.5,
        clearcoat: 0.35,
        depthWrite: false,
        side: DoubleSide,
      });
    case 'cartilageGhost':
      return P({
        color: '#c4dbe4',
        transparent: true,
        opacity: 0.42,
        roughness: 0.36,
        clearcoat: 0.55,
        depthWrite: false,
        side: DoubleSide,
      });
    /* ---- Микроскопическая диорама «Клетка и рецептор» ---- */
    case 'endocrineCell':
      return solidTissue(
        {
          color: '#f0b89e',
          vertexColors: true,
          bumpMap: t.cellBump,
          bumpScale: 0.02,
          roughness: 0.42,
          clearcoat: 0.52,
          sheen: 0.5,
          sheenColor: new Color('#ffe3d4'),
        },
        'endocrineCell',
        '#e29c82',
        '#f7d2bf',
        'lobule',
      );
    case 'golgi':
      return P({
        color: '#e5884a',
        roughness: 0.38,
        clearcoat: 0.6,
        sheen: 0.4,
        sheenColor: new Color('#ffd1ad'),
      });
    case 'vesicle':
      return P({
        color: '#ffe07d',
        emissive: new Color('#c98614'),
        emissiveIntensity: 0.28,
        roughness: 0.22,
        clearcoat: 0.85,
        transparent: true,
        opacity: 0.86,
      });
    case 'capillaryWall':
      return solidTissue(
        {
          color: '#df6b68',
          vertexColors: true,
          bumpMap: t.cellBump,
          bumpScale: 0.016,
          roughness: 0.32,
          clearcoat: 0.65,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        },
        'capillaryWall',
        '#b84548',
      );
    case 'rbc':
      return P({
        color: '#cc2929',
        roughness: 0.3,
        clearcoat: 0.65,
        clearcoatRoughness: 0.2,
      });
    case 'peptideHormone':
      return P({
        color: '#2dc6c0',
        emissive: new Color('#0c7a78'),
        emissiveIntensity: 0.42,
        roughness: 0.24,
        clearcoat: 0.85,
      });
    case 'steroidHormone':
      return P({
        color: '#f5b82e',
        emissive: new Color('#b57408'),
        emissiveIntensity: 0.45,
        roughness: 0.22,
        clearcoat: 0.88,
      });
    case 'membraneReceptor':
      return P({
        color: '#3278d8',
        emissive: new Color('#163a78'),
        emissiveIntensity: 0.2,
        roughness: 0.3,
        clearcoat: 0.72,
      });
    case 'decoyReceptor':
      return P({
        color: '#8f99ad',
        roughness: 0.45,
        clearcoat: 0.4,
      });
    case 'cellMembrane':
      return solidTissue(
        {
          color: '#84b2dc',
          roughness: 0.34,
          clearcoat: 0.6,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        },
        'cellMembrane',
        '#5a88b8',
      );
    case 'lipidHead':
      return P({
        color: '#6ca0d4',
        roughness: 0.36,
        clearcoat: 0.55,
      });
    case 'cytoplasm':
      return P({
        color: '#dce9f7',
        transparent: true,
        opacity: 0.24,
        roughness: 0.2,
        depthWrite: false,
        side: DoubleSide,
      });
    case 'nucleusShell':
      return solidTissue(
        {
          color: '#7e63b8',
          roughness: 0.36,
          clearcoat: 0.55,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
        },
        'nucleusShell',
        '#5b4490',
      );
    case 'nuclearReceptor':
      return P({
        color: '#d97c2b',
        emissive: new Color('#8c4208'),
        emissiveIntensity: 0.28,
        roughness: 0.28,
        clearcoat: 0.72,
      });
    case 'dnaStrand':
      return P({
        color: '#e5c458',
        emissive: new Color('#9c7012'),
        emissiveIntensity: 0.32,
        roughness: 0.3,
        clearcoat: 0.65,
      });
  }
}
