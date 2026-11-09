import { Color, DoubleSide, MeshPhysicalMaterial, type MeshPhysicalMaterialParameters } from 'three';
import { ANT, AX, BASE, LA_CENTER, LAT, RA_CENTER } from './field';
import type { Kind } from './types';

/*
  Материалы сердца. Все они делят одни и те же «формулы» сокращения: в вершинном шейдере точки смещаются
  к верхушке (укорочение), к оси (сжатие) и слегка закручиваются, предсердия сжимаются к своим центрам.
  Поэтому стенка, клапаны, хорды и сосуды сердца двигаются как единое целое, без щелей.
  Мышечная стенка получает волокнистый рисунок и мелкую неровность из шума по положению точки.
*/

export const BEAT = {
  uV: { value: 0 },
  uA: { value: 0 },
};

const f3 = (v: ArrayLike<number>) => `vec3(${v[0].toFixed(5)}, ${v[1].toFixed(5)}, ${v[2].toFixed(5)})`;

const VERT_DECL = /* glsl */ `
uniform float uV;
uniform float uA;
varying vec3 vLP;
varying float vSurf;
#ifdef HEART_SURF
attribute float aSurf;
#endif
`;

const VERT_BEAT = /* glsl */ `
{
  const vec3 hBase = ${f3(BASE)};
  const vec3 hAx = ${f3(AX)};
  const vec3 hRA = ${f3(RA_CENTER)};
  const vec3 hLA = ${f3(LA_CENTER)};
  vec3 d = transformed - hBase;
  float s = dot(d, hAx);
  vec3 radial = d - hAx * s;
  float w = smoothstep(0.15, 2.0, s);
  float wr = smoothstep(-0.05, 0.6, s);
  vec3 disp = -hAx * (0.1 * uV * w) - radial * (0.055 * uV * wr);
  disp += cross(hAx, radial) * (0.1 * uV * w);
  vec3 da = transformed - hRA;
  disp -= da * (0.07 * uA * exp(-dot(da, da) / 0.5));
  vec3 db = transformed - hLA;
  disp -= db * (0.07 * uA * exp(-dot(db, db) / 0.5));
  transformed += disp;
}
`;

const NOISE = /* glsl */ `
varying vec3 vLP;
varying float vSurf;
vec3 hash3(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453);
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

type Params = MeshPhysicalMaterialParameters;

const TABLE: Record<Kind, Params> = {
  wall: { color: '#ffffff', vertexColors: true, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new Color('#ffb3a6'), side: DoubleSide },
  fat: { color: '#ecd27c', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.4, sheenColor: new Color('#fff2b8') },
  leaflet: { color: '#f4e7d9', roughness: 0.42, clearcoat: 0.3, sheen: 0.7, sheenColor: new Color('#ffe9e0'), side: DoubleSide },
  ring: { color: '#f1ebe0', roughness: 0.5, clearcoat: 0.25 },
  chorda: { color: '#f6f2e8', roughness: 0.5 },
  coronaryA: { color: '#d6281f', roughness: 0.35, clearcoat: 0.5 },
  coronaryV: { color: '#3b55b8', roughness: 0.35, clearcoat: 0.5 },
  conduction: { color: '#f2c61d', roughness: 0.4, clearcoat: 0.4, emissive: new Color('#7a5a00'), emissiveIntensity: 0.35 },
  node: { color: '#f4b400', roughness: 0.4, clearcoat: 0.4, emissive: new Color('#7a4a00'), emissiveIntensity: 0.4 },
};

export function makeHeartMaterial(kind: Kind): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ ...TABLE[kind] });
  m.customProgramCacheKey = () => `heart-${kind}`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uV = BEAT.uV;
    shader.uniforms.uA = BEAT.uA;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${kind === 'wall' ? '#define HEART_SURF\n' : ''}${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLP = position;\nvSurf = ${kind === 'wall' ? 'aSurf' : '0.0'};`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${VERT_BEAT}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`);
    if (kind === 'wall') {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec3 hAxis = ${f3(AX)};
          vec3 hLat = ${f3(LAT)};
          vec3 hAnt = ${f3(ANT)};
          float n1 = vnoise(vLP * 8.0);
          float n2 = vnoise(vLP * 36.0);
          float fib = vnoise(vec3(dot(vLP, hAxis) * 5.0, dot(vLP, hLat) * 46.0, dot(vLP, hAnt) * 46.0));
          float fib2 = vnoise(vec3(dot(vLP, hAxis) * 14.0, dot(vLP, hLat) * 80.0, dot(vLP, hAnt) * 80.0));
          float hgt = 0.0;
          if (vSurf < 0.5) {
            diffuseColor.rgb *= (0.86 + 0.26 * n1) * (0.93 + 0.14 * fib);
            hgt = 0.35 * n2 + 0.3 * fib;
          } else if (vSurf < 1.5) {
            diffuseColor.rgb *= 0.9 + 0.18 * n2;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.82, 0.8), smoothstep(0.62, 0.9, fib) * 0.25);
            hgt = 0.25 * n1;
          } else {
            diffuseColor.rgb *= (0.84 + 0.3 * fib) * (0.92 + 0.12 * fib2);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.78, 0.72), smoothstep(0.55, 0.85, fib2) * 0.25);
            hgt = 0.5 * fib2 + 0.25 * n2;
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\n roughnessFactor = vSurf > 1.5 ? 0.82 : (vSurf > 0.5 ? 0.3 : 0.42);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>\n normal = perturbN(-vViewPosition, normal, vec2(dFdx(hgt), dFdy(hgt)) * (vSurf > 1.5 ? 0.32 : 0.5), faceDirection);`,
        );
    } else if (kind === 'fat') {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>\n float fl = vnoise(vLP * 26.0) * 0.6 + vnoise(vLP * 60.0) * 0.4;\n diffuseColor.rgb *= 0.9 + 0.2 * fl;`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>\n normal = perturbN(-vViewPosition, normal, vec2(dFdx(fl), dFdy(fl)) * 0.45, faceDirection);`,
        );
    }
  };
  return m;
}

