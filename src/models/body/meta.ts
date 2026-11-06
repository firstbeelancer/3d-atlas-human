import type { V3 } from '../skeleton/sdf';

/*
  Описание частей фигуры на главной: из какого набора сеток берётся часть, какому разделу атласа
  она принадлежит (по нему подсвечивается и открывается орган) и каким материалом рисуется.
  Модуль лёгкий — тяжёлая геометрия строится отдельно, в фоновых потоках.
*/

export type BodySet = 'thorax' | 'abdomen' | 'vessels';

export interface PartSpec {
  set: BodySet;
  key: string;
  slug: string;
  mat: string;
  /** Парная часть: правая копия строится зеркальным отражением. */
  mirror?: boolean;
  /** Движение: «бьётся» (сердце) или «дышит» (лёгкие). */
  anim?: 'beat' | 'breathe';
}

export interface Material {
  color: string;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: string;
}

export const MATERIALS: Record<string, Material> = {
  brain: { color: '#e9b0b0', roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.5, sheenColor: '#ffd9d4' },
  cerebellum: { color: '#d99ca2', roughness: 0.55, clearcoat: 0.3 },
  cord: { color: '#f0e4ba', roughness: 0.5, clearcoat: 0.3 },
  optic: { color: '#f4ecd2', roughness: 0.5 },
  ear: { color: '#e8b8a2', roughness: 0.55, clearcoat: 0.25, sheen: 0.4, sheenColor: '#ffd9cc' },
  lung: { color: '#ea9c9e', roughness: 0.55, clearcoat: 0.28, clearcoatRoughness: 0.5, sheen: 0.6, sheenColor: '#ffc9c4' },
  bronchi: { color: '#efe8dc', roughness: 0.45, clearcoat: 0.4 },
  larynx: { color: '#ece8dc', roughness: 0.4, clearcoat: 0.6 },
  thyroid: { color: '#c4593f', roughness: 0.5, clearcoat: 0.4 },
  heart: { color: '#bc4b41', roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: '#ff9d8c' },
  artery: { color: '#d03b31', roughness: 0.4, clearcoat: 0.5 },
  vein: { color: '#3f62b8', roughness: 0.4, clearcoat: 0.5 },
  liver: { color: '#94412f', roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.7, sheenColor: '#ffb7a0' },
  gallbladder: { color: '#4f9a56', roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.15 },
  stomach: { color: '#e6a384', roughness: 0.5, clearcoat: 0.35, sheen: 0.5, sheenColor: '#ffd9c4' },
  esophagus: { color: '#da8e7f', roughness: 0.5, clearcoat: 0.3 },
  spleen: { color: '#7f3654', roughness: 0.42, clearcoat: 0.5 },
  pancreas: { color: '#edc986', roughness: 0.6, clearcoat: 0.2 },
  kidney: { color: '#a7463c', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  pelvis: { color: '#e9d09e', roughness: 0.5 },
  adrenal: { color: '#e9b34e', roughness: 0.55 },
  bladder: { color: '#e7c56c', roughness: 0.3, clearcoat: 0.7 },
  ureter: { color: '#efe1aa', roughness: 0.5 },
  intestine: { color: '#e9a68c', roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: '#ffd4c0' },
  colon: { color: '#da9378', roughness: 0.5, clearcoat: 0.35 },
  nerve: { color: '#e7c34b', roughness: 0.45, clearcoat: 0.3 },
  bone: { color: '#eadfc6', roughness: 0.68, clearcoat: 0.15 },
  cartilage: { color: '#cddfe4', roughness: 0.34, clearcoat: 0.6 },
};

/** Какой раздел атласа открывает та или иная часть фигуры. */
export const PARTS: PartSpec[] = [
  { set: 'thorax', key: 'brain', slug: 'mozg', mat: 'brain' },
  { set: 'thorax', key: 'cerebellum', slug: 'mozg', mat: 'cerebellum' },
  { set: 'thorax', key: 'cord', slug: 'mozg', mat: 'cord' },
  { set: 'vessels', key: 'nerves', slug: 'mozg', mat: 'nerve' },
  { set: 'thorax', key: 'optic', slug: 'glaz', mat: 'optic' },
  { set: 'thorax', key: 'ear', slug: 'uho', mat: 'ear', mirror: true },
  { set: 'thorax', key: 'lungL', slug: 'legkie', mat: 'lung', anim: 'breathe' },
  { set: 'thorax', key: 'lungR', slug: 'legkie', mat: 'lung', anim: 'breathe' },
  { set: 'thorax', key: 'heart', slug: 'serdce', mat: 'heart', anim: 'beat' },
  { set: 'thorax', key: 'bronchi', slug: 'legkie', mat: 'bronchi' },
  { set: 'thorax', key: 'larynx', slug: 'legkie', mat: 'larynx' },
  { set: 'thorax', key: 'thyroid', slug: 'gormony', mat: 'thyroid' },
  { set: 'abdomen', key: 'adrenal', slug: 'gormony', mat: 'adrenal' },
  { set: 'thorax', key: 'coronaryArteries', slug: 'serdce', mat: 'artery', anim: 'beat' },
  { set: 'thorax', key: 'coronaryVeins', slug: 'serdce', mat: 'vein', anim: 'beat' },
  { set: 'abdomen', key: 'liver', slug: 'pechen', mat: 'liver' },
  { set: 'abdomen', key: 'gallbladder', slug: 'zhelchnyj-puzyr', mat: 'gallbladder' },
  { set: 'abdomen', key: 'stomach', slug: 'zheludok', mat: 'stomach' },
  { set: 'abdomen', key: 'esophagus', slug: 'zheludok', mat: 'esophagus' },
  { set: 'abdomen', key: 'spleen', slug: 'vnutrennie-organy', mat: 'spleen' },
  { set: 'abdomen', key: 'pancreas', slug: 'podzheludochnaya', mat: 'pancreas' },
  { set: 'abdomen', key: 'kidneyL', slug: 'pochki', mat: 'kidney' },
  { set: 'abdomen', key: 'kidneyR', slug: 'pochki', mat: 'kidney' },
  { set: 'abdomen', key: 'kidneyPelvis', slug: 'pochki', mat: 'pelvis' },
  { set: 'abdomen', key: 'ureters', slug: 'pochki', mat: 'ureter' },
  { set: 'abdomen', key: 'bladder', slug: 'mochevoj-puzyr', mat: 'bladder' },
  { set: 'abdomen', key: 'duodenum', slug: 'kishechnik', mat: 'intestine' },
  { set: 'abdomen', key: 'smallIntestine', slug: 'kishechnik', mat: 'intestine' },
  { set: 'abdomen', key: 'colon', slug: 'kishechnik', mat: 'colon' },
  { set: 'vessels', key: 'arteries', slug: 'krovenosnaya-sistema', mat: 'artery' },
  { set: 'vessels', key: 'veins', slug: 'krovenosnaya-sistema', mat: 'vein' },
];

/** Центры, вокруг которых «дышат» лёгкие и бьётся сердце (геометрия строится со сдвигом на −центр). */
export const PIVOTS: Record<string, V3> = {
  heart: [0.4, 12.7, 0.25],
  coronaryArteries: [0.4, 12.7, 0.25],
  coronaryVeins: [0.4, 12.7, 0.25],
  lungL: [0.95, 13.0, -0.1],
  lungR: [-0.95, 13.0, -0.1],
};

/** Подписи: куда ставить выноску у каждого раздела (дециметры, как у скелета). */
export const LABEL_AT: Record<string, V3> = {
  mozg: [0.35, 17.25, 0.3],
  glaz: [0.3, 16.36, 0.95],
  uho: [0.95, 16.1, -0.2],
  legkie: [1.35, 13.7, 0.35],
  serdce: [0.75, 12.4, 0.75],
  pechen: [-1.1, 11.6, 0.6],
  'zhelchnyj-puzyr': [-0.6, 10.85, 0.78],
  zheludok: [0.95, 10.9, 0.45],
  podzheludochnaya: [0.35, 10.9, 0.2],
  pochki: [0.95, 10.6, -0.7],
  kishechnik: [-0.2, 9.8, 1.0],
  'mochevoj-puzyr': [0.0, 9.1, 0.78],
  skelet: [-1.55, 12.6, 0.7],
  'krovenosnaya-sistema': [0.9, 7.6, 0.5],
  gormony: [0.25, 14.66, 0.32],
  'vnutrennie-organy': [1.3, 11.4, -0.62],
};
