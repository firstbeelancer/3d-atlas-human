import { BufferAttribute, BufferGeometry } from 'three';
import { sliceSolid } from '../female/geometry';
import type { MeshDef, Parts } from './types';

const SCALP = new Set(['stratum-corneum', 'epidermis', 'basal-layer', 'papillary-dermis', 'reticular-dermis', 'hypodermis']);
const SECTIONED = new Set([
  ...SCALP,
  'hair-root', 'irs-cuticle', 'huxley', 'henle', 'companion', 'ors', 'glassy', 'connective-sheath',
  'hair-bulb', 'matrix', 'papilla',
  'nail-dorsal', 'nail-root', 'nail-body', 'free-edge', 'lunula', 'nail-ventral', 'germinal-matrix',
  'sterile-matrix', 'distal-phalanx', 'phalanx-tuft', 'middle-phalanx-head', 'joint-cartilage',
]);

/** Замыкает центральный продольный срез в пределах контура ткани. */
export function prepareLongitudinalSection(parts: Parts): Parts {
  for (const [id, meshes] of Object.entries(parts)) {
    if (!SECTIONED.has(id)) continue;
    // Для мягких тканей фон немного уходит назад, чтобы было видно ход сосудов и мышцы.
    const z = SCALP.has(id) ? -0.53 : -0.004;
    const faces: MeshDef[] = [];
    for (const mesh of meshes) {
      const positions = mesh.g.getAttribute('position');
      const index = mesh.g.getIndex();
      if (!positions || !index || mesh.open) continue;
      const section = sliceSolid(positions.array, index.array, 2, z);
      if (!section) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(section.position, 3));
      geometry.setIndex(new BufferAttribute(section.index, 1));
      geometry.computeVertexNormals();
      faces.push({ g: geometry, m: mesh.m, longitudinalFace: true, noPick: mesh.noPick });
    }
    meshes.push(...faces);
  }
  return parts;
}
