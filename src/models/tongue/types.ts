import type { BufferGeometry } from 'three';

/** Ключ материала: цвет и свойства ткани задаются в materials.ts. */
export type MatKey =
  // слизистая и рельеф
  | 'mucosa'
  | 'dorsum'
  | 'rootMucosa'
  | 'ventral'
  | 'sulcus'
  | 'pit'
  | 'frenulum'
  | 'fimbria'
  | 'caruncle'
  // сосочки
  | 'filiform'
  | 'fungiform'
  | 'foliate'
  | 'vallate'
  | 'trench'
  | 'tonsil'
  // мышцы
  | 'core'
  | 'supLong'
  | 'infLong'
  | 'transverse'
  | 'vertical'
  | 'septum'
  | 'extrinsic'
  | 'extrinsicB'
  // опора
  | 'bone'
  | 'ghostBone'
  | 'cartilage'
  // сосуды, нервы, железы
  | 'artery'
  | 'vein'
  | 'nerve'
  | 'chorda'
  | 'gland'
  | 'glandSub'
  | 'duct'
  | 'ebner'
  // вкусовая почка
  | 'epithelium'
  | 'basement'
  | 'lamina'
  | 'capillary'
  | 'budShell'
  | 'pore'
  | 'hairs'
  | 'cell1'
  | 'cell2'
  | 'cell3'
  | 'basal'
  | 'fibre'
  | 'saliva'
  | 'molecule';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Не участвует в выборе мышью (фон, призрачные ориентиры). */
  noPick?: boolean;
}

export type Parts = Record<string, MeshDef[]>;
