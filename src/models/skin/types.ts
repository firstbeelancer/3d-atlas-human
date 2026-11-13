import type { BufferGeometry } from 'three';

/** Ключ материала: цвет и свойства ткани задаются в materials.ts. */
export type MatKey =
  | 'corneum' | 'lucidum' | 'granulosum' | 'spinosum' | 'basal'
  | 'dermisP' | 'dermisR' | 'hypodermis' | 'fat' | 'collagen' | 'elastin' | 'flake' | 'pore'
  | 'keratinocyte' | 'melanocyte' | 'melanosome' | 'langerhans' | 'merkel'
  | 'cuticleHair' | 'cortex' | 'medulla' | 'irs' | 'ors' | 'glassy' | 'ctSheath' | 'bulbCells' | 'matrixCells' | 'papilla'
  | 'gland' | 'sebum' | 'duct' | 'muscle' | 'tendon' | 'apocrine' | 'eccrine' | 'eccrineDuct' | 'sweat'
  | 'artery' | 'vein' | 'capillary' | 'lymph'
  | 'nerve' | 'ending' | 'meissner' | 'meissnerCapsule' | 'pacShell' | 'pacCore' | 'ruffini';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Не участвует в выборе мышью (фон, контекст). */
  noPick?: boolean;
  /** Незамкнутая поверхность (чешуйки, листы): проверка замкнутости её пропускает. */
  open?: boolean;
}

export type Parts = Record<string, MeshDef[]>;
