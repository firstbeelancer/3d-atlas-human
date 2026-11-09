import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { MatKey } from './build';
import type { PancTextures } from '../pancreas/textures';
import { makeMaterial as makePanc } from '../pancreas/materials';
import type { MatKey as PancKey } from '../pancreas/build';

type Params = ConstructorParameters<typeof MeshPhysicalMaterial>[0];

const NOISE = `
float h31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float hc(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z);
}`;

/*
  Цвет среза. Изнанка поверхности видна там, где плоскость среза убрала переднюю стенку; чтобы на срезе была настоящая
  структура, а не краска дальней стенки, луч из камеры пересекается с плоскостью среза, и рисунок считается в этой точке:
  красная пульпа с зерном, светлые узелки белой пульпы (с красной точкой центральной артерии и розовым ободком)
  и сеть светлых трабекул. Рисунок зависит от точки в пространстве, поэтому не «плывёт» при вращении.
*/
const CUT = `
vec3 cutFace(vec3 q){
  vec3 col = mix(vec3(0.34,0.06,0.14), vec3(0.52,0.12,0.22), vnoise(q*4.2)*0.65 + vnoise(q*13.0)*0.35);
  col *= 0.86 + 0.28*vnoise(q*58.0);
  // белая пульпа: ячейки Ворлея, в части ячеек — узелок
  vec3 g = q*2.7; vec3 gi = floor(g); vec3 gf = fract(g);
  float white = 0.0; float halo = 0.0; float core = 0.0;
  float tf1 = 9.0; float tf2 = 9.0; float tid = 0.0;
  for (int k=-1;k<=1;k++) for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
    vec3 n = vec3(float(i),float(j),float(k)); vec3 c = gi+n;
    vec3 o = vec3(hc(c), hc(c+17.0), hc(c+41.0));
    float on = step(0.46, hc(c+9.0));
    float dist = length(gf - n - o)/2.7;
    float R = 0.065 + 0.075*hc(c+23.0);
    white = max(white, (1.0 - smoothstep(R*0.78, R, dist))*on);
    halo = max(halo, (1.0 - smoothstep(R, R*1.9, dist))*on);
    vec3 cc = vec3(hc(c+3.0), hc(c+5.0), hc(c+7.0)) - 0.5;
    core = max(core, (1.0 - smoothstep(R*0.16, R*0.26, length(gf - n - o - cc*0.12)/2.7))*on);
  }
  // трабекулы: края крупных ячеек, не везде
  vec3 tg = q*0.46; vec3 ti = floor(tg); vec3 tfp = fract(tg);
  for (int k=-1;k<=1;k++) for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
    vec3 n = vec3(float(i),float(j),float(k)); vec3 c = ti+n;
    vec3 o = vec3(hc(c+61.0), hc(c+67.0), hc(c+71.0));
    float d = length(tfp - n - o);
    if (d < tf1) { tf2 = tf1; tf1 = d; tid = hc(c+77.0); } else if (d < tf2) tf2 = d;
  }
  float edge = 1.0 - smoothstep(0.012, 0.05, (tf2 - tf1)/0.46*0.46);
  edge *= step(0.28, tid) * (0.55 + 0.45*vnoise(q*3.0));
  col = mix(col, vec3(0.64,0.27,0.38), halo*0.45);
  col = mix(col, vec3(0.86,0.78,0.80), white*0.8);
  col = mix(col, vec3(0.80,0.13,0.15), core);
  col = mix(col, vec3(0.94,0.84,0.78), edge*0.85);
  return col;
}`;

/** Паренхима: цвет из вершин, рябь капсулы через шум, на срезе — настоящий рисунок пульпы. */
function parenchyma(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    vertexColors: true,
    side: DoubleSide,
    roughness: 0.52,
    clearcoat: 0.05,
    clearcoatRoughness: 0.5,
    sheen: 0.0,
    sheenRoughness: 0.45,
    sheenColor: new Color('#d98aa6'),
  });
  m.customProgramCacheKey = () => 'sp-parenchyma-v3';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\n${NOISE}\n${CUT}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
#if NUM_CLIPPING_PLANES > 0
if (!gl_FrontFacing) {
  vec3 P = -vViewPosition;
  vec4 pl = clippingPlanes[0];
  float dn = dot(pl.xyz, P);
  float s = clamp(-pl.w / (abs(dn) > 1e-4 ? dn : 1e-4), 0.0, 1.0);
  vec3 hit = P * s;
  vec3 wp = cameraPosition + transpose(mat3(viewMatrix)) * hit;
  diffuseColor.rgb = cutFace(wp);
}
#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#if NUM_CLIPPING_PLANES > 0
if (!gl_FrontFacing) {
  normal = normalize(-clippingPlanes[0].xyz);
} else
#endif
{
  float hh = vnoise(vObj*6.0)*0.6 + vnoise(vObj*21.0)*0.4;
  vec2 dh = vec2(dFdx(hh), dFdy(hh));
  vec3 sx = normalize(dFdx(-vViewPosition));
  vec3 sy = normalize(dFdy(-vViewPosition));
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  normal = normalize(abs(det) * normal - 0.28 * grad);
}`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#if NUM_CLIPPING_PLANES > 0
if (!gl_FrontFacing) { material.clearcoat = 0.0; material.roughness = 0.9; material.specularColor = vec3(0.0); }
#endif`,
      );
  };
  return m;
}

/** Цветные сегменты поверх органа: границы по l + 0.28 w. */
function segments(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ transparent: true, opacity: 0.62, depthWrite: false, roughness: 0.35, clearcoat: 0.6, side: FrontSide, color: '#ffffff' });
  m.customProgramCacheKey = () => 'sp-segments';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float seg;\nvarying float vSeg;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeg = seg;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSeg;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 a = vec3(0.96,0.72,0.28); vec3 b = vec3(0.30,0.74,0.66); vec3 c = vec3(0.56,0.52,0.96);
  float t1 = smoothstep(-2.2-0.05, -2.2+0.05, vSeg);
  float t2 = smoothstep(2.3-0.05, 2.3+0.05, vSeg);
  vec3 col = mix(mix(a, b, t1), c, t2);
  float line = max(1.0 - smoothstep(0.0, 0.14, abs(vSeg + 2.2)), 1.0 - smoothstep(0.0, 0.14, abs(vSeg - 2.3)));
  diffuseColor.rgb = mix(col, vec3(1.0), line*0.85);
}`,
      );
  };
  return m;
}

/** Плотный орган: изнанка красится цветом среза. */
function solid(params: Params, key: string, back: string): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ side: DoubleSide, ...params });
  m.customProgramCacheKey = () => `sp-solid-${key}`;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBack = { value: new Color(back) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBack;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = uBack;');
  };
  return m;
}

const glass = { transparent: true, depthWrite: false, side: DoubleSide } as const;

/** Материал части: у каждой части свои экземпляры, чтобы подсветка и призрачный режим не задевали соседей. */
export function makeMaterial(kind: MatKey, t: PancTextures): Material {
  const P = (p: Params) => new MeshPhysicalMaterial(p);
  switch (kind) {
    case 'spleen':
      return parenchyma();
    case 'capsule':
      return P({ color: '#ffe9ee', transparent: true, opacity: 0.12, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, sheen: 0.5, sheenColor: new Color('#ffd6e0'), depthWrite: false, side: FrontSide });
    case 'serosa':
      return P({ color: '#ffffff', transparent: true, opacity: 0.07, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, side: FrontSide });
    case 'redPulp':
      return P({ color: '#7a1634', emissive: new Color('#2a0412'), emissiveIntensity: 0.4, roughness: 0.46, clearcoat: 0.6, clearcoatRoughness: 0.3, side: DoubleSide });
    case 'whitePulp':
      return P({ color: '#efe6ea', emissive: new Color('#c5b6d2'), emissiveIntensity: 0.28, roughness: 0.42, clearcoat: 0.55 });
    case 'trabecula':
      return P({ color: '#f1dccd', roughness: 0.5, clearcoat: 0.25 });
    case 'segments':
      return segments();
    case 'intersegment':
      return P({ ...glass, color: '#ffffff', emissive: new Color('#ffffff'), emissiveIntensity: 0.15, opacity: 0.2, roughness: 0.2 });
    case 'accessory':
      return solid({ color: '#80304e', roughness: 0.36, clearcoat: 0.65, clearcoatRoughness: 0.22, sheen: 0.5, sheenColor: new Color('#d98aa6') }, 'accessory', '#8a3a50');
    case 'lymph':
      return P({ color: '#ecd98a', roughness: 0.4, clearcoat: 0.4 });
    case 'ligament':
      return P({ ...glass, map: t.mesocolon, color: '#fbeedc', opacity: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
    case 'pancreas':
      return solid({ map: t.pancreas, bumpMap: t.bumpLobes, bumpScale: 0.8, color: '#ffffff', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: new Color('#ffd7b8') }, 'pancreas', '#efd2a8');
    case 'colon':
      return P({ ...glass, map: t.duodenum, bumpMap: t.bumpGrain, bumpScale: 0.5, color: '#f0c4a8', opacity: 0.3, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    case 'diaphragm':
      return P({ ...glass, map: t.muscle, color: '#f2b7ae', opacity: 0.12, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.5, sheenColor: new Color('#ffd0c8') });
    case 'stomach':
      return P({ ...glass, map: t.stomach, color: '#f1b3a3', opacity: 0.1, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.1 });
    default:
      return makePanc(kind as PancKey, t);
  }
}
