import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './build';
import type { PancTextures } from './textures';

type Params = ConstructorParameters<typeof MeshPhysicalMaterial>[0];

/**
 * Плотный орган или стенка сосуда: изнанка поверхности красится цветом среза,
 * поэтому на плоскости разреза видна внутренность, а не пустота.
 */
function solid(params: Params, key: string, back: string): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ side: DoubleSide, ...params });
  m.customProgramCacheKey = () => `pc-solid-${key}`;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBack = { value: new Color(back) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBack;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n          if (!gl_FrontFacing) diffuseColor.rgb = uBack;');
  };
  return m;
}

/**
 * Ткань железы: цвет дольки берётся из вершин (щели темнее), поверх — мелкое зерно через производные шума,
 * а на срезе изнанка красится зернистым кремовым цветом паренхимы.
 */
function gland(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    vertexColors: true,
    side: DoubleSide,
    roughness: 0.5,
    clearcoat: 0.34,
    clearcoatRoughness: 0.4,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new Color('#ffd7b8'),
  });
  m.customProgramCacheKey = () => 'pc-gland';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObj;
float h31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float grain(vec3 p){ return vnoise(p*11.0)*0.55 + vnoise(p*27.0)*0.45; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (!gl_FrontFacing) {
  float n = vnoise(vObj*4.0)*0.5 + vnoise(vObj*13.0)*0.5;
  vec3 cut = mix(vec3(0.90,0.74,0.55), vec3(0.97,0.86,0.68), n);
  cut = mix(cut, vec3(0.86,0.58,0.46), smoothstep(0.62,0.9,vnoise(vObj*7.0))*0.45);
  diffuseColor.rgb = cut * (0.9 + 0.2*vnoise(vObj*42.0));
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float hh = grain(vObj);
  vec2 dh = vec2(dFdx(hh), dFdy(hh));
  vec3 sx = normalize(dFdx(-vViewPosition));
  vec3 sy = normalize(dFdy(-vViewPosition));
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  normal = normalize(abs(det) * normal - 0.55 * grad);
}`,
      );
  };
  return m;
}

const glass = { transparent: true, depthWrite: false, side: DoubleSide } as const;

/** Материал части: у каждой части свои экземпляры, чтобы подсветка и призрачный режим не задевали соседей. */
export function makeMaterial(kind: MatKey, t: PancTextures): Material {
  const P = (p: Params) => new MeshPhysicalMaterial(p);
  switch (kind) {
    case 'gland':
      return gland();
    case 'capsule':
      return P({ color: '#fff4e4', transparent: true, opacity: 0.17, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.4, sheenColor: new Color('#ffe6cc'), depthWrite: false, side: FrontSide });
    case 'ductWall':
      return P({ ...glass, color: '#f6efdc', opacity: 0.4, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 });
    case 'juice':
      return P({ color: '#f4c95a', emissive: new Color('#b0800f'), emissiveIntensity: 0.32, roughness: 0.28, clearcoat: 0.8 });
    case 'bileWall':
      return P({ ...glass, color: '#d8dca2', opacity: 0.42, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 });
    case 'bile':
      return P({ color: '#7ea320', emissive: new Color('#3d5509'), emissiveIntensity: 0.3, roughness: 0.25, clearcoat: 0.8 });
    case 'mixed':
      return P({ color: '#d6b640', emissive: new Color('#7d6212'), emissiveIntensity: 0.3, roughness: 0.3, clearcoat: 0.7 });
    case 'oddi':
      return P({ color: '#d9775b', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new Color('#ffb59b') });
    case 'papilla':
      return P({ color: '#e88e7c', roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, sheen: 0.5, sheenColor: new Color('#ffc4b4') });
    case 'hole':
      return P({ color: '#2c0f0c', roughness: 0.7, side: DoubleSide });
    case 'artery':
      return solid({ color: '#c3362e', roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.25, emissive: new Color('#300000'), emissiveIntensity: 0.08 }, 'artery', '#d98275');
    case 'vein':
      return solid({ color: '#46589e', roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }, 'vein', '#8d9ad0');
    case 'portal':
      return solid({ color: '#4a4fae', roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.25 }, 'portal', '#979bdc');
    case 'aorta':
      return solid({ color: '#c0342c', roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.3, emissive: new Color('#300000'), emissiveIntensity: 0.06 }, 'aorta', '#d98275');
    case 'ivc':
      return solid({ color: '#47589d', roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.3 }, 'ivc', '#8d9ad0');
    case 'nerve':
      return P({ color: '#e8c64c', roughness: 0.5, clearcoat: 0.25 });
    case 'ganglion':
      return P({ color: '#d9bd62', roughness: 0.55, clearcoat: 0.3, bumpMap: t.bumpGrain, bumpScale: 0.6 });
    case 'node':
      return solid({ color: '#a7bb62', roughness: 0.45, clearcoat: 0.45 }, 'node', '#dfe8b8');
    case 'duodenum':
      return P({ ...glass, map: t.duodenum, bumpMap: t.bumpGrain, bumpScale: 0.5, color: '#f2b9ac', opacity: 0.3, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    case 'fold':
      return P({ ...glass, map: t.duodenum, color: '#e9a090', opacity: 0.32, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    case 'ligament':
      return P({ color: '#e9dabd', roughness: 0.6, clearcoat: 0.15, sheen: 0.4, sheenColor: new Color('#fff3da') });
    case 'stomach':
      return P({ ...glass, map: t.stomach, color: '#f1b3a3', opacity: 0.12, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.1 });
    case 'spleen':
      return solid({ map: t.spleen, bumpMap: t.bumpLobes, bumpScale: 0.3, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new Color('#c97a94') }, 'spleen', '#8a3a50');
    case 'kidney':
      return solid({ map: t.kidney, bumpMap: t.bumpGrain, bumpScale: 0.3, roughness: 0.36, clearcoat: 0.65, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new Color('#e08a70') }, 'kidney', '#a65443');
    case 'adrenal':
      return solid({ color: '#e5c36c', bumpMap: t.bumpLobes, bumpScale: 0.8, roughness: 0.5, clearcoat: 0.3 }, 'adrenal', '#f0dca0');
    case 'bone':
      return solid({ map: t.bone, bumpMap: t.bumpGrain, bumpScale: 0.5, roughness: 0.62, clearcoat: 0.15 }, 'bone', '#d9a98f');
    case 'disc':
      return solid({ color: '#a9c8d0', roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.25 }, 'disc', '#d5e6ea');
    case 'liver':
      return solid({ map: t.liver, bumpMap: t.bumpLobes, bumpScale: 0.3, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.7, sheenRoughness: 0.45, sheenColor: new Color('#ff9f8a') }, 'liver', '#8a3a30');
    case 'gb':
      return solid({ map: t.gbSkin, bumpMap: t.bumpFibre, bumpScale: 0.5, roughness: 0.32, clearcoat: 0.75, clearcoatRoughness: 0.2, sheen: 0.45, sheenColor: new Color('#b9e9b0') }, 'gb', '#d9cf86');
    case 'mesocolon':
      return P({ ...glass, map: t.mesocolon, color: '#f8ecc9', opacity: 0.3, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 });
  }
}
