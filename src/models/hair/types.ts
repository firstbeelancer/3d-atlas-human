import type { BufferGeometry } from 'three';

/** Ключ материала: цвет и свойства ткани задаются в materials.ts. */
export type MatKey =
  // кожа
  | 'corneum'
  | 'epidermis'
  | 'basal'
  | 'dermisP'
  | 'dermisR'
  | 'hypodermis'
  | 'fat'
  | 'collagen'
  // волос
  | 'cuticleHair'
  | 'cortex'
  | 'medulla'
  | 'melaninG'
  // фолликул
  | 'irsCuticle'
  | 'huxley'
  | 'henle'
  | 'companion'
  | 'ors'
  | 'glassy'
  | 'ctSheath'
  | 'infund'
  | 'isthmus'
  | 'bulge'
  | 'bulbCells'
  | 'matrixCells'
  | 'papilla'
  | 'melanocyte'
  // железы, мышца
  | 'gland'
  | 'duct'
  | 'sebum'
  | 'muscle'
  | 'tendon'
  | 'apocrine'
  // сосуды и нервы
  | 'artery'
  | 'vein'
  | 'capillary'
  | 'nerve'
  | 'ending'
  | 'merkel'
  // цикл
  | 'club'
  | 'strand'
  | 'germ'
  | 'shed'
  // волос под микроскопом
  | 'scale'
  | 'cuticleA'
  | 'cuticleB'
  | 'cuticleC'
  | 'cuticleD'
  | 'cortexCells'
  | 'cmc'
  | 'macro'
  | 'micro'
  | 'medullaFoam'
  | 'air'
  | 'melanosome'
  // ноготь и палец
  | 'nailDorsal'
  | 'nailRoot'
  | 'lunula'
  | 'nailBody'
  | 'nailFree'
  | 'nailVentral'
  | 'nailBand'
  | 'nailRidge'
  | 'fold'
  | 'epony'
  | 'nailCuticle'
  | 'latFold'
  | 'hypo'
  | 'matrixNail'
  | 'sterile'
  | 'bedRidge'
  | 'bedDermis'
  | 'bone'
  | 'cartilage'
  | 'ligament'
  | 'pulp'
  | 'septa'
  | 'fingerSkin'
  | 'fingerprint'
  | 'eccrine'
  | 'pacShell'
  | 'pacCore'
  | 'meissner'
  | 'glomus';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Не участвует в выборе мышью (фон, контекст). */
  noPick?: boolean;
  /** Незамкнутая поверхность (чешуйки, листы): проверка замкнутости её пропускает. */
  open?: boolean;
}

export type Parts = Record<string, MeshDef[]>;

export type Mat = MatKey;
