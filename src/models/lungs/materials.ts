import { Color, DoubleSide, MeshPhysicalMaterial, type MeshPhysicalMaterialParameters } from 'three';
import type { Kind } from './build';

/*
  Материалы лёгких. Поверхность лёгкого — полупрозрачный блестящий висцеральный листок плевры, под которым
  виден мозаичный рисунок вторичных долек: многоугольники 1–2 см, разделённые тёмными линиями угольной пыли.
  Рисунок считается в шейдере по положению точки (шум Вороного), поэтому не зависит от сетки.
  Изнанка поверхности красится цветом губчатой ткани: на разрезе внутри видна паренхима, а у дыхательных трубок — слизистая.
*/

const COMMON = /* glsl */ `
varying vec3 vLP;
vec3 hash3(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453);
}
vec2 worley(vec3 x){
  vec3 p = floor(x), f = fract(x);
  float d1 = 9.0, d2 = 9.0;
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 g = vec3(float(i),float(j),float(k));
    vec3 r = g + hash3(p+g) - f;
    float d = dot(r,r);
    if(d<d1){ d2=d1; d1=d; } else if(d<d2){ d2=d; }
  }
  return vec2(sqrt(d1), sqrt(d2));
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000 = hash3(i).x, n100 = hash3(i+vec3(1,0,0)).x, n010 = hash3(i+vec3(0,1,0)).x, n110 = hash3(i+vec3(1,1,0)).x;
  float n001 = hash3(i+vec3(0,0,1)).x, n101 = hash3(i+vec3(1,0,1)).x, n011 = hash3(i+vec3(0,1,1)).x, n111 = hash3(i+vec3(1,1,1)).x;
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y), mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
}
vec3 perturbN(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection){
  vec3 sx = normalize(dFdx(surfPos)); vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm); vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

function withVarying(m: MeshPhysicalMaterial, key: string, color: string, extra: (shader: { fragmentShader: string }) => void) {
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (shader) => {
    void color;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`);
    extra(shader);
  };
}

type Params = MeshPhysicalMaterialParameters;

const TABLE: Record<Kind, Params> = {
  lung: { color: '#e9979e', roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.24, sheen: 0.6, sheenColor: new Color('#ffc9c4'), side: DoubleSide },
  fissure: { color: '#f3dcd6', roughness: 0.4, clearcoat: 0.3, side: DoubleSide },
  pleura: { color: '#f6d6d6', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.13, depthWrite: false, side: DoubleSide },
  cavity: { color: '#a9c8ea', roughness: 0.2, transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide },
  airway: { color: '#e4e1d6', roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, side: DoubleSide },
  cartilage: { color: '#d6e6ec', roughness: 0.28, clearcoat: 0.75, clearcoatRoughness: 0.18, side: DoubleSide },
  carina: { color: '#eddfd0', roughness: 0.4, clearcoat: 0.5, side: DoubleSide },
  acinus: { color: '#f0a9ac', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.5, sheenColor: new Color('#ffd0cc'), side: DoubleSide },
  artery: { color: '#4b5fbd', roughness: 0.38, clearcoat: 0.4, side: DoubleSide },
  vein: { color: '#d4392f', roughness: 0.38, clearcoat: 0.4, side: DoubleSide },
  bronchialArtery: { color: '#e24632', roughness: 0.4, side: DoubleSide },
  node: { color: '#77727c', roughness: 0.55, clearcoat: 0.2 },
  nerve: { color: '#e9c54d', roughness: 0.45, clearcoat: 0.3 },
  hilum: { color: '#efe6c8', roughness: 0.3, clearcoat: 0.8, transparent: true, opacity: 0.17, depthWrite: false, side: DoubleSide },
  diaphragm: { color: '#ffffff', vertexColors: true, roughness: 0.55, clearcoat: 0.25, sheen: 0.5, sheenColor: new Color('#ff9d8a'), side: DoubleSide },
  heart: { color: '#d0665c', roughness: 0.3, clearcoat: 0.6, transparent: true, opacity: 0.2, depthWrite: false, side: DoubleSide },
  aorta: { color: '#c8382f', roughness: 0.38, clearcoat: 0.5, side: DoubleSide },
  cava: { color: '#43549f', roughness: 0.4, clearcoat: 0.4, side: DoubleSide },
  esoph: { color: '#dc938a', roughness: 0.45, clearcoat: 0.5, side: DoubleSide },
};

const INNER: Partial<Record<Kind, string>> = {
  airway: '0.92,0.56,0.56', carina: '0.92,0.56,0.56', cartilage: '0.85,0.6,0.6',
  artery: '0.55,0.12,0.14', vein: '0.55,0.12,0.14', aorta: '0.6,0.14,0.14', cava: '0.2,0.22,0.5', esoph: '0.82,0.4,0.42',
  acinus: '0.98,0.78,0.72', bronchialArtery: '0.5,0.1,0.1', heart: '0.75,0.3,0.3',
};

export function makeLungMaterial(kind: Kind): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ ...TABLE[kind] });
  if (kind === 'lung') {
    withVarying(m, 'lung-v1', '', (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec2 wl = worley(vLP * 4.6);
          float ridge = wl.y - wl.x;
          float lobuleLine = 1.0 - smoothstep(0.0, 0.1, ridge);
          float lobuleH = smoothstep(0.0, 0.28, ridge);
          float mott = vnoise(vLP * 2.2) * 0.6 + vnoise(vLP * 7.0) * 0.4;
          diffuseColor.rgb *= (0.9 + 0.17 * smoothstep(-2.2, 2.4, vLP.y)) * (0.9 + 0.2 * mott);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.33, 0.4), lobuleLine * 0.38);
          if (!gl_FrontFacing) {
            vec2 wf = worley(vLP * 15.0);
            float pore = smoothstep(0.12, 0.34, wf.x);
            diffuseColor.rgb = mix(vec3(0.6, 0.27, 0.3), vec3(0.95, 0.66, 0.63), pore) * (0.92 + 0.12 * vnoise(vLP * 3.0));
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `#include <normal_fragment_maps>
          if (gl_FrontFacing) normal = perturbN(-vViewPosition, normal, vec2(dFdx(lobuleH), dFdy(lobuleH)) * 0.55, faceDirection);`,
        );
    });
  } else if (INNER[kind]) {
    withVarying(m, `inner-${kind}`, '', (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n if (!gl_FrontFacing) diffuseColor.rgb = vec3(${INNER[kind]});`,
      );
    });
  }
  return m;
}
