import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './build';
import type { IntestineTextures } from './textures';

/** Общее время для перистальтики: один объект на все материалы тонкой кишки. */
export interface GutUniforms {
  uTime: { value: number };
}

export const makeGutUniforms = (): GutUniforms => ({ uTime: { value: 0 } });

interface GutOpts {
  /** Цвет изнанки поверхности — им «закрашена» плоть на разрезе. */
  back?: string;
  /** Тонкая кишка: стенка бежит волнами сокращений. */
  peristalsis?: boolean;
}

/**
 * Материал стенки кишки. Изнанка поверхности красится цветом среза слоя:
 * поверхности слоёв вложены друг в друга, и на плоскости разреза в кольце между ними
 * виден цвет именно этого слоя — настоящий срез без отдельных «крышек».
 * Перистальтика — сжатие радиуса вокруг оси кишки в вершинном шейдере; все слои сжимаются одинаково.
 */
function gut(params: ConstructorParameters<typeof MeshPhysicalMaterial>[0], uni: GutUniforms, key: string, o: GutOpts = {}): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ side: o.back ? DoubleSide : FrontSide, ...params });
  m.customProgramCacheKey = () => `gut-${key}`;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    if (o.peristalsis) {
      shader.uniforms.uTime = uni.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aC;\nattribute float aS;\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = aS / 3.2 - uTime * 0.32;
          float w = 0.5 + 0.5 * sin(6.2831853 * ph);
          w = w * w * w;
          float sg = 0.5 + 0.5 * sin(aS * 2.4 + uTime * 0.9);
          float kk = 1.0 - 0.15 * w - 0.03 * sg;
          transformed = aC + (transformed - aC) * kk;`,
        );
    }
    if (o.back) {
      shader.uniforms.uBack = { value: new Color(o.back) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBack;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n          if (!gl_FrontFacing) diffuseColor.rgb = uBack;');
    }
  };
  return m;
}

const CUT = {
  longitudinal: '#c4665a',
  circular: '#a64a44',
  submucosa: '#f1dfc4',
  mucosa: '#eba995',
};

/** Все материалы модели кишечника. */
export function makeMaterials(tex: IntestineTextures, uni: GutUniforms): Record<MatKey, Material> {
  const P = (p: ConstructorParameters<typeof MeshPhysicalMaterial>[0]) => new MeshPhysicalMaterial(p);
  const skinCommon = { roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.28, sheen: 0.5, sheenColor: new Color('#ffd5c6') };
  const serosa = { color: '#ffffff', transparent: true, opacity: 0.26, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false } as const;

  return {
    smallSkin: gut({ map: tex.smallSkin, ...skinCommon }, uni, 'smallSkin', { back: CUT.longitudinal, peristalsis: true }),
    smallSerosa: gut(serosa, uni, 'smallSerosa', { peristalsis: true }),
    smallMuscleA: gut({ map: tex.muscle, roughness: 0.6 }, uni, 'smallMuscleA', { back: CUT.longitudinal, peristalsis: true }),
    smallMuscleB: gut({ map: tex.muscle, roughness: 0.6 }, uni, 'smallMuscleB', { back: CUT.circular, peristalsis: true }),
    smallSub: gut({ map: tex.submucosa, roughness: 0.65 }, uni, 'smallSub', { back: CUT.submucosa, peristalsis: true }),
    smallMucosa: gut(
      { map: tex.mucosaSmall, bumpMap: tex.mucosaSmall, bumpScale: 1.4, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.7, sheenColor: new Color('#ffb9a6') },
      uni,
      'smallMucosa',
      { back: CUT.mucosa, peristalsis: true },
    ),

    colonSkin: gut({ map: tex.colonSkin, ...skinCommon, roughness: 0.42 }, uni, 'colonSkin', { back: CUT.longitudinal }),
    colonSerosa: gut(serosa, uni, 'colonSerosa'),
    colonMuscleA: gut({ map: tex.muscle, roughness: 0.6 }, uni, 'colonMuscleA', { back: CUT.longitudinal }),
    colonMuscleB: gut({ map: tex.muscle, roughness: 0.6 }, uni, 'colonMuscleB', { back: CUT.circular }),
    colonSub: gut({ map: tex.submucosa, roughness: 0.65 }, uni, 'colonSub', { back: CUT.submucosa }),
    colonMucosa: gut(
      { map: tex.mucosaColon, bumpMap: tex.mucosaColon, bumpScale: 0.9, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.22, sheen: 0.6, sheenColor: new Color('#ffc2b2') },
      uni,
      'colonMucosa',
      { back: CUT.mucosa },
    ),
    analSkin: gut({ map: tex.colonSkin, color: '#f2c6b6', ...skinCommon, roughness: 0.5 }, uni, 'analSkin', { back: CUT.longitudinal }),
    analMucosa: gut({ map: tex.mucosaAnal, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25 }, uni, 'analMucosa', { back: CUT.mucosa }),

    taenia: P({ color: '#f2e5c9', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, side: DoubleSide }),
    fold: P({ map: tex.mucosaColon, color: '#f1a898', roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.22 }),
    appendage: P({ map: tex.fat, color: '#f3d284', roughness: 0.5, clearcoat: 0.35 }),
    feces: gut({ map: tex.feces, bumpMap: tex.feces, bumpScale: 2, roughness: 0.62, color: '#ffffff' }, uni, 'feces', { back: '#4a2e1a' }),
    valve: P({ map: tex.mucosaColon, color: '#f0a79a', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, side: DoubleSide }),
    valveDark: P({ color: '#40181a', roughness: 0.7, side: DoubleSide }),
    papilla: P({ color: '#f2b9a9', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    sphincterIn: P({ map: tex.muscle, color: '#e6b09c', roughness: 0.5, clearcoat: 0.2, side: DoubleSide }),
    striated: P({ map: tex.striated, bumpMap: tex.striated, bumpScale: 0.8, roughness: 0.55, side: DoubleSide }),

    mesentery: P({ map: tex.fat, color: '#fbe9ae', transparent: true, opacity: 0.4, roughness: 0.45, side: DoubleSide, depthWrite: false }),
    omentum: P({ map: tex.fat, color: '#fff0c0', transparent: true, opacity: 0.22, roughness: 0.4, side: DoubleSide, depthWrite: false }),
    artery: P({ color: '#c3362e', roughness: 0.36, clearcoat: 0.5, emissive: new Color('#300000'), emissiveIntensity: 0.08 }),
    vein: P({ color: '#46589e', roughness: 0.4, clearcoat: 0.5 }),
    nerve: P({ color: '#e5c24a', roughness: 0.5 }),
    lymph: P({ color: '#a7bd62', roughness: 0.5, clearcoat: 0.4 }),
    ligament: P({ color: '#ebdfc7', roughness: 0.6, clearcoat: 0.15 }),
    stomach: P({ map: tex.stomach, roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.5, sheenColor: new Color('#ffd0c4'), side: DoubleSide }),
    pancreas: P({ map: tex.pancreas, bumpMap: tex.pancreas, bumpScale: 1.4, roughness: 0.6, side: DoubleSide }),
    bile: P({ color: '#52b05e', roughness: 0.35, clearcoat: 0.6 }),
    pancDuct: P({ color: '#f1e5b4', roughness: 0.4, clearcoat: 0.5 }),
    aorta: P({ color: '#c93d34', roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.25 }),
    ivc: P({ color: '#4d5eac', roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.25 }),
  };
}
