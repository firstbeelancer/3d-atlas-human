import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './build';
import type { GbTextures } from './textures';

type Params = ConstructorParameters<typeof MeshPhysicalMaterial>[0];

/**
 * Материал слоя стенки. Изнанка поверхности красится цветом среза слоя:
 * поверхности слоёв вложены друг в друга, и на плоскости разреза в кольце между ними
 * виден цвет именно этого слоя — настоящий срез без отдельных «крышек».
 */
function layer(params: Params, key: string, back?: string): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ side: back ? DoubleSide : FrontSide, ...params });
  if (back) {
    m.customProgramCacheKey = () => `gb-layer-${key}`;
    m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uBack = { value: new Color(back) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBack;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n          if (!gl_FrontFacing) diffuseColor.rgb = uBack;');
    };
  }
  return m;
}

const glass = { transparent: true, depthWrite: false, side: DoubleSide } as const;

/** Материал части: каждая часть получает свои экземпляры, чтобы подсветка и призрачный режим не задевали соседей. */
export function makeMaterial(kind: MatKey, t: GbTextures): Material {
  const P = (p: Params) => new MeshPhysicalMaterial(p);
  switch (kind) {
    case 'gbSkin':
      return layer(
        {
          map: t.gbSkin,
          bumpMap: t.bumpFibre,
          bumpScale: 0.55,
          roughness: 0.33,
          clearcoat: 0.75,
          clearcoatRoughness: 0.2,
          sheen: 0.45,
          sheenRoughness: 0.4,
          sheenColor: new Color('#b9e9b0'),
        },
        'skin',
        '#e6d9a6',
      );
    case 'serosa':
      return P({ color: '#ffffff', transparent: true, opacity: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, side: FrontSide });
    case 'subserosa':
      return layer({ map: t.propria, color: '#e9dfae', bumpMap: t.bumpFibre, bumpScale: 0.3, roughness: 0.6 }, 'subserosa', '#e9dca6');
    case 'muscle':
      return layer(
        { map: t.muscle, bumpMap: t.bumpFibre, bumpScale: 1.1, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: new Color('#ff9d8a') },
        'muscle',
        '#c0675c',
      );
    case 'propria':
      return layer({ map: t.propria, roughness: 0.65 }, 'propria', '#f2dcc0');
    case 'mucosa':
      return layer(
        { map: t.mucosa, bumpMap: t.bumpGrain, bumpScale: 0.6, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 },
        'mucosa',
        '#e0cb78',
      );
    case 'rugae':
      return P({
        map: t.mucosa,
        bumpMap: t.bumpGrain,
        bumpScale: 1.0,
        roughness: 0.36,
        clearcoat: 0.75,
        clearcoatRoughness: 0.22,
        sheen: 0.8,
        sheenRoughness: 0.5,
        sheenColor: new Color('#fff0a0'),
        side: DoubleSide,
      });
    case 'sinus':
      return P({ color: '#8a4f3a', roughness: 0.5, clearcoat: 0.4 });
    case 'bile':
      return P({ color: '#7f9a1f', emissive: new Color('#3a4a08'), emissiveIntensity: 0.18, transparent: true, opacity: 0.5, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, side: DoubleSide });
    case 'valve':
      return P({ map: t.mucosa, color: '#f0b090', bumpMap: t.bumpGrain, bumpScale: 0.6, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.2, side: DoubleSide });
    case 'ductWall':
      return P({ ...glass, color: '#dbd58e', opacity: 0.4, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'cystWall':
      return P({ ...glass, color: '#dcd690', opacity: 0.3, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'ductCore':
      return P({ color: '#8aa82a', emissive: new Color('#445a0a'), emissiveIntensity: 0.3, roughness: 0.25, clearcoat: 0.8 });
    case 'pancWall':
      return P({ ...glass, color: '#f3ead0', opacity: 0.5, roughness: 0.15, clearcoat: 0.8 });
    case 'pancCore':
      return P({ color: '#f1cf78', emissive: new Color('#a07a14'), emissiveIntensity: 0.25, roughness: 0.3 });
    case 'oddi':
      return P({ color: '#d9775b', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new Color('#ffb59b') });
    case 'papilla':
      return P({ color: '#e88e7c', roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, sheen: 0.5, sheenColor: new Color('#ffc4b4') });
    case 'hole':
      return P({ color: '#2c0f0c', roughness: 0.7, side: DoubleSide });
    case 'artery':
      return P({ color: '#c3362e', roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.25, emissive: new Color('#300000'), emissiveIntensity: 0.08 });
    case 'vein':
      return P({ color: '#46589e', roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    case 'portal':
      return P({ color: '#4a4fae', roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    case 'nerve':
      return P({ color: '#e5c24a', roughness: 0.5, clearcoat: 0.2 });
    case 'node':
      return P({ color: '#9db35c', roughness: 0.45, clearcoat: 0.45 });
    case 'lymph':
      return P({ color: '#cbdba0', roughness: 0.45, clearcoat: 0.3 });
    case 'liver':
      return P({
        map: t.liver,
        bumpMap: t.bumpLobes,
        bumpScale: 0.3,
        roughness: 0.36,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
        sheen: 0.7,
        sheenRoughness: 0.45,
        sheenColor: new Color('#ff9f8a'),
      });
    case 'fossa':
      return P({ map: t.fossa, bumpMap: t.bumpFibre, bumpScale: 0.5, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    case 'curtain':
      return P({ ...glass, color: '#f7ebcd', opacity: 0.17, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
    case 'calot':
      return P({ ...glass, color: '#ffc45c', opacity: 0.32, emissive: new Color('#b86f00'), emissiveIntensity: 0.3, roughness: 0.4 });
    case 'calotEdge':
      return P({ color: '#f2a22c', emissive: new Color('#b86f00'), emissiveIntensity: 0.35, roughness: 0.4 });
    case 'duodenum':
      return P({ ...glass, map: t.duodenum, bumpMap: t.bumpGrain, bumpScale: 0.5, color: '#f2b9ac', opacity: 0.34, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    case 'duodenumFold':
      return P({ ...glass, map: t.duodenum, color: '#f0aea0', opacity: 0.5, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    case 'pancreas':
      return P({ ...glass, map: t.pancreas, bumpMap: t.bumpLobes, bumpScale: 1.2, opacity: 0.48, roughness: 0.5, clearcoat: 0.25 });
  }
}
