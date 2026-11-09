import { CanvasTexture, Color, DoubleSide, LinearMipmapLinearFilter, MeshPhysicalMaterial, RepeatWrapping } from 'three';

/*
  Материал мышцы: матовое «влажное» мясо с лёгким блеском, мелкие волокна — карта рельефа из canvas,
  сокращение — сдвиг вершин брюшка вдоль нормали (атрибут belly) и покраснение, срез — однотонная «мякоть» на изнанке.
*/

let fiber: CanvasTexture | null = null;

/** Тонкие волокна: полосы идут по вертикали текстуры, то есть вдоль мышцы (v). */
export function fiberTexture(): CanvasTexture {
  if (fiber) return fiber;
  const W = 256;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 150; i++) {
    const x = rnd() * W;
    const w = 0.6 + rnd() * 2.6;
    const dark = rnd() > 0.5;
    g.strokeStyle = dark ? `rgba(0,0,0,${0.12 + rnd() * 0.22})` : `rgba(255,255,255,${0.1 + rnd() * 0.2})`;
    g.lineWidth = w;
    g.beginPath();
    const drift = (rnd() - 0.5) * 6;
    g.moveTo(x, 0);
    g.bezierCurveTo(x + drift, H * 0.33, x - drift, H * 0.66, x + drift * 0.3, H);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  fiber = t;
  return t;
}

export interface MuscleMaterial extends MeshPhysicalMaterial {
  userData: { flex: { value: number }; base?: { opacity: number; transparent: boolean; depthWrite: boolean } };
}

const CUT = new Color('#e08d80');

export function makeMuscleMaterial(): MuscleMaterial {
  const flex = { value: 0 };
  const m = new MeshPhysicalMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.34,
    clearcoatRoughness: 0.38,
    sheen: 0.55,
    sheenRoughness: 0.5,
    sheenColor: new Color('#ff9a86'),
    bumpMap: fiberTexture(),
    bumpScale: 1.1,
    side: DoubleSide,
    emissive: new Color('#000000'),
  }) as MuscleMaterial;
  m.userData.flex = flex;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlex = flex;
    shader.uniforms.uCut = { value: CUT };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float belly;\nuniform float uFlex;\nvarying float vFlex;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(objectNormal) * belly * uFlex * 0.075;\nvFlex = uFlex * belly;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlex;\nuniform vec3 uCut;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 0.72, 0.7), clamp(vFlex * 0.9, 0.0, 1.0));')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nif (!gl_FrontFacing) gl_FragColor = vec4(uCut * (0.88 + 0.12 * sin(gl_FragCoord.x * 0.9) * sin(gl_FragCoord.y * 0.9)), gl_FragColor.a);');
  };
  m.customProgramCacheKey = () => 'muscle-v1';
  return m;
}
