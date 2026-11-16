import * as THREE from 'three';

export interface ManagedMaterialConfig {
  color: number | string;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: number | string;
  map?: THREE.Texture;
  bumpMap?: THREE.Texture;
  bumpScale?: number;
  roughnessMap?: THREE.Texture;
  vertexColors?: boolean;
  opacity?: number;
  doubleSided?: boolean;
  cutInteriorTint?: THREE.Color;
  clippingPlanes: THREE.Plane[];
}

/**
 * Creates a biological PBR MeshPhysicalMaterial enhanced with custom cross-section
 * interior shading on clipped backfaces (!gl_FrontFacing).
 */
export function createBiologicalMaterial(cfg: ManagedMaterialConfig): THREE.MeshPhysicalMaterial {
  const baseOpacity = cfg.opacity ?? 1.0;
  const isDoubleSided = cfg.doubleSided !== false;

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(cfg.color),
    roughness: cfg.roughness ?? 0.55,
    metalness: cfg.metalness ?? 0.02,
    clearcoat: cfg.clearcoat ?? 0.12,
    clearcoatRoughness: cfg.clearcoatRoughness ?? 0.42,
    sheen: cfg.sheen ?? 0.25,
    sheenRoughness: cfg.sheenRoughness ?? 0.65,
    sheenColor: cfg.sheenColor ? new THREE.Color(cfg.sheenColor) : new THREE.Color(0xffd6cc),
    map: cfg.map ?? null,
    bumpMap: cfg.bumpMap ?? null,
    bumpScale: cfg.bumpScale ?? 0.025,
    roughnessMap: cfg.roughnessMap ?? null,
    vertexColors: cfg.vertexColors ?? false,
    transparent: baseOpacity < 0.985,
    opacity: baseOpacity,
    depthWrite: baseOpacity >= 0.985,
    side: isDoubleSided ? THREE.DoubleSide : THREE.FrontSide,
    clippingPlanes: cfg.clippingPlanes,
    clipShadows: true
  });

  mat.userData.baseOpacity = baseOpacity;
  mat.userData.baseColor = new THREE.Color(cfg.color);

  if (isDoubleSided) {
    const interiorTint =
      cfg.cutInteriorTint ?? new THREE.Color(cfg.color).multiplyScalar(0.84);
    const cacheKey = `bio_cut_${interiorTint.getHexString()}`;

    mat.customProgramCacheKey = () => cacheKey;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCutTint = { value: interiorTint };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vBioWorldPos;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vBioWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform vec3 uCutTint;
           varying vec3 vBioWorldPos;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           if (!gl_FrontFacing) {
             float micro = sin(vBioWorldPos.x * 34.0 + sin(vBioWorldPos.z * 21.0)) *
                           cos(vBioWorldPos.y * 34.0 + cos(vBioWorldPos.x * 19.0)) * 0.055;
             diffuseColor.rgb = mix(diffuseColor.rgb, uCutTint, 0.58) + vec3(micro);
           }`
        );
    };
  }

  return mat;
}
