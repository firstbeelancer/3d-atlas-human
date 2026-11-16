import { ANATOMY_STRUCTURES, type AnatomyStructureId } from '../../content/ru/skin-atlas';
import { SKIN_GROUPS } from './parts';

const equivalents: Record<string, readonly AnatomyStructureId[]> = {
  'skin-microrelief': ['skin_surface'],
  'fat-lobules': ['adipose_lobules'],
  hypodermis: ['adipose_lobules', 'fibrous_septa'],
  collagen: ['collagen_elastin'],
  elastin: ['collagen_elastin'],
  'merkel-cells': ['merkel_complex'],
  'hair-root': ['follicle_sheaths'],
  'eccrine-gland': ['sweat_secretory'],
  'eccrine-duct': ['sweat_duct'],
  'sweat-pore': ['sweat_duct'],
  'nerve-plexus': ['nerve_trunks'],
  meissner: ['meissner_corpuscle'],
  pacinian: ['pacinian_corpuscle'],
  'free-endings': ['free_nerve_endings'],
};

const sectionIds = new Map<AnatomyStructureId, string>();
const sceneIds = new Map<string, readonly AnatomyStructureId[]>();

for (const { id } of ANATOMY_STRUCTURES) {
  const part = id.replaceAll('_', '-');
  sceneIds.set(part, [id]);
  sectionIds.set(id, part);
}

// Keep the section's original terminology and selection IDs for structures present in the new model.
for (const [part, ids] of Object.entries(equivalents)) {
  sceneIds.set(part, ids);
  for (const id of ids) {
    if (ids.length === 1 && sectionIds.get(id) === id.replaceAll('_', '-')) sectionIds.set(id, part);
  }
}

for (const [group, parts] of Object.entries(SKIN_GROUPS)) {
  const ids = new Set(parts.flatMap((part) => sceneIds.get(part) ?? []));
  if (group === 'g-vessels') {
    ids.add('arteries');
    ids.add('veins');
  }
  if (group === 'g-surface') ids.add('vellus_hairs');
  sceneIds.set(group, [...ids]);
}

export function skinStructuresFor(part: string | null): readonly AnatomyStructureId[] {
  return part ? sceneIds.get(part) ?? [] : [];
}

export function skinPartFor(id: AnatomyStructureId): string {
  return sectionIds.get(id)!;
}

export function isSkinPartInteractive(part: string): boolean {
  return skinStructuresFor(part).length > 0;
}
