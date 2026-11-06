import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { MeshPhysicalMaterial, Vector4, type Texture } from 'three';
import { fibreTexture, pitTexture } from './textures';
import { sAt } from './shape';
import { ZONES } from './anatomy';

/*
  Материал стенки желудка. Подсветка отдела — в шейдере по (s, v) вершины: так один набор сеток
  показывает любой отдел, изгиб или особое место стенки без отдельной геометрии.
*/

export type WallKind = 'serosa' | 'muscle-longitudinal' | 'muscle-circular' | 'muscle-oblique' | 'submucosa' | 'mucosa';

const PARAMS: Record<WallKind, ConstructorParameters<typeof MeshPhysicalMaterial>[0]> = {
  serosa: { color: '#dc9185', roughness: 0.36, clearcoat: 0.85, clearcoatRoughness: 0.2, sheen: 0.6, sheenColor: '#ffd2c4' },
  'muscle-longitudinal': { color: '#c0554a', roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: '#ff9d8a' },
  'muscle-circular': { color: '#a43c38', roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: '#ff9d8a' },
  'muscle-oblique': { color: '#cf6652', roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: '#ff9d8a' },
  submucosa: { color: '#f2dfc2', roughness: 0.6, clearcoat: 0.15 },
  mucosa: { color: '#e6807a', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.16, sheen: 0.7, sheenColor: '#ffb7a8', vertexColors: true },
};

const ROTATION: Partial<Record<WallKind, number>> = { 'muscle-circular': Math.PI / 2, 'muscle-oblique': Math.PI / 4 };

let pit: Texture | null | undefined;
let fibre: Texture | null | undefined;

/** Все отделы подсвечиваются по одному правилу: прямоугольник (s0, s1, центр v, полуширина v) без «дыры». */
export function zoneUniform(id: string | null): { rect: Vector4; hole: Vector4; on: number } {
  const z = id ? ZONES[id] : undefined;
  const toVec = (zn: { k0: number; k1: number; v: number | null; dv: number }) => new Vector4(sAt(zn.k0), sAt(zn.k1), zn.v ?? 0, zn.dv);
  if (!z) return { rect: new Vector4(-1, -1, 0, 0), hole: new Vector4(0, 0, 0, 0), on: 0 };
  return { rect: toVec(z.zone), hole: z.hole ? toVec(z.hole) : new Vector4(0, 0, 0, 0), on: 1 };
}

interface Props {
  kind: WallKind;
  /** Подсветить всю сетку. */
  active?: boolean;
  /** Подсветить отдел (id из ZONES). */
  zone?: string | null;
  opacity?: number;
}

export function WallMaterial({ kind, active = false, zone = null, opacity }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const material = useMemo(() => {
    if (pit === undefined) pit = pitTexture();
    if (fibre === undefined) fibre = fibreTexture();
    const m = new MeshPhysicalMaterial({ ...PARAMS[kind] });
    const tex = kind === 'mucosa' ? pit : kind.startsWith('muscle') ? fibre : null;
    if (tex) {
      const t = tex.clone();
      t.needsUpdate = true;
      if (kind.startsWith('muscle')) {
        t.center.set(0.5, 0.5);
        t.rotation = ROTATION[kind] ?? 0;
      }
      m.map = t;
      m.bumpMap = t;
      m.bumpScale = kind === 'mucosa' ? 1.4 : 1.2;
    }
    const uniforms = { uRect: { value: new Vector4(-1, -1, 0, 0) }, uHole: { value: new Vector4() }, uOn: { value: 0 } };
    m.userData.uniforms = uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aSV;\nvarying vec2 vSV;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSV = aSV;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vSV;
uniform vec4 uRect;
uniform vec4 uHole;
uniform float uOn;
float zoneMask(vec4 z) {
  if (z.w <= 0.0) return 0.0;
  float inS = smoothstep(z.x - 0.03, z.x + 0.03, vSV.x) * (1.0 - smoothstep(z.y - 0.03, z.y + 0.03, vSV.x));
  float dv = abs(mod(vSV.y - z.z + 3.14159265, 6.2831853) - 3.14159265);
  float inV = 1.0 - smoothstep(z.w - 0.04, z.w + 0.04, dv);
  return inS * inV;
}`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  float zm = zoneMask(uRect) * (1.0 - zoneMask(uHole));
  totalEmissiveRadiance += vec3(1.0, 0.52, 0.36) * 0.42 * zm * uOn;`,
        );
    };
    m.customProgramCacheKey = () => 'stomach-wall';
    return m;
  }, [kind]);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const u = material.userData.uniforms as { uRect: { value: Vector4 }; uHole: { value: Vector4 }; uOn: { value: number } };
    const z = active ? { rect: new Vector4(-1, 99, 0, 10), hole: new Vector4(), on: 1 } : zoneUniform(zone);
    u.uRect.value.copy(z.rect);
    u.uHole.value.copy(z.hole);
    u.uOn.value = z.on;
    material.transparent = opacity !== undefined;
    material.opacity = opacity ?? 1;
    material.depthWrite = opacity === undefined || opacity > 0.9;
    material.needsUpdate = true;
    invalidate();
  }, [material, active, zone, opacity, invalidate]);

  return <primitive object={material} attach="material" />;
}
