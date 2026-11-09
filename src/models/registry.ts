import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ModelProps } from '../three/types';
import type { StageMode } from '../three/Stage';
import type { Box } from '../three/cameraBounds';
import { teethText } from '../content/ru/teeth-model';
import { modelDescriptions } from '../content/ru/models';
import type { MessageKey } from '../i18n';
import { CUT_DEFAULT_T } from './brain/anatomy';
import { CUT_DEFAULT_T as MUSCLES_CUT_T } from './muscles/anatomy';
import { CUT_DEFAULT_T as EAR_CUT_T, OVERVIEW as EAR_VIEW, SCALE as EAR_SCALE } from './ear/anatomy';

export interface ModelEntry {
  Component: LazyExoticComponent<ComponentType<ModelProps>>;
  hasCutaway?: boolean;
  camera?: { position: [number, number, number]; fov?: number };
  /** Пределы приближения камеры и свободное вращение. */
  orbit?: { minDistance?: number; maxDistance?: number; free?: boolean };
  /** Слои, разнос на части и режим «отдельно» — для моделей из многих частей. */
  explorer?: boolean;
  /** Своя подпись второго разреза в панели «Рассмотреть детали». */
  explorerFundusKey?: MessageKey;
  /** Три плоскости среза с ползунком положения (мозг). */
  explorerCuts?: { sideKey: MessageKey; coronalKey: MessageKey; defaults: Record<'side' | 'fundus' | 'coronal', number> };
  target?: [number, number, number];
  /** Высота пола для мягкой тени (по умолчанию — для небольших органов). */
  floorY?: number;
  /** Куда можно сдвигать центр камеры. */
  bounds?: Box;
  /** Насколько близко можно подлететь. */
  minDistance?: number;
  /** Описание модели для скринридеров и браузеров без 3D. */
  description: string;
  /** Дополнительные режимы модели (кнопки на сцене). */
  modes?: StageMode[];
  /** Часть можно рассмотреть отдельно (кнопка в списке «Из чего состоит»). */
  isolate?: boolean;
}

/** 3D-модель каждого раздела грузится отдельным куском, только когда раздел открыт. */
export const MODELS: Record<string, ModelEntry> = {
  zub: {
    Component: lazy(() => import('./teeth/TeethModel')),
    hasCutaway: true,
    explorer: true,
    isolate: true,
    camera: { position: [0, 0.9, 16.5], fov: 36 },
    target: [0, -0.1, 0],
    bounds: { min: [-3.6, -3.2, -2], max: [3.6, 3.2, 2] },
    orbit: { minDistance: 2, maxDistance: 26, free: true },
    modes: [
      { id: 'jaw', icon: 'jaw', group: 'view' },
      { id: 'arch', icon: 'arch', group: 'view' },
    ],
    description: teethText.description,
  },
  glaz: {
    Component: lazy(() => import('./eye/EyeModel')),
    hasCutaway: true,
    explorer: true,
    camera: { position: [5.2, 2.5, 9.8], fov: 32 },
    target: [0, 0, -0.4],
    orbit: { minDistance: 2.6, maxDistance: 34, free: true },
    description: modelDescriptions.glaz,
  },
  skelet: {
    Component: lazy(() => import('./skeleton/SkeletonModel')),
    hasCutaway: true,
    camera: { position: [0, 0.75, 11.6], fov: 32 },
    target: [0, 0.3, 0],
    // скелет высокий: даём сдвинуться от стоп до макушки и подлететь вплотную к черепу
    bounds: { min: [-0.75, -2.0, -0.45], max: [0.75, 2.45, 0.45] },
    minDistance: 1.1,
    description: modelDescriptions.skelet,
  },
  pechen: {
    Component: lazy(() => import('./liver/LiverModel')),
    camera: { position: [0.6, 1.4, 20], fov: 32 },
    target: [0, 0, 0],
    modes: [
      { id: 'explode', icon: 'explode' },
      { id: 'segments', icon: 'segments' },
      { id: 'inside', icon: 'inside' },
      { id: 'lobule', icon: 'lobule' },
    ],
    isolate: true,
    description: modelDescriptions.pechen,
  },
  zheludok: {
    Component: lazy(() => import('./stomach/StomachModel')),
    hasCutaway: true,
    camera: { position: [0.5, 0.9, 17.5], fov: 32 },
    target: [-0.5, 0.7, 0],
    bounds: { min: [-3.3, -2.7, -1.6], max: [2.3, 4.0, 1.6] },
    minDistance: 2.2,
    modes: [
      { id: 'explode', icon: 'explode' },
      { id: 'layers', icon: 'layers' },
      { id: 'gland', icon: 'gland' },
    ],
    isolate: true,
    description: modelDescriptions.zheludok,
  },
  serdce: {
    Component: lazy(() => import('./heart/HeartModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusHeart',
    isolate: true,
    camera: { position: [0.9, 1.0, 13.6], fov: 32 },
    target: [0, 0.4, 0],
    floorY: -2.5,
    bounds: { min: [-3, -2.6, -2.2], max: [3, 3.2, 2.2] },
    orbit: { minDistance: 1.8, maxDistance: 38, free: true },
    modes: [{ id: 'xray', icon: 'inside' }],
    description: modelDescriptions.serdce,
  },
  'mochevoj-puzyr': {
    Component: lazy(() => import('./bladder/BladderModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusBladder',
    camera: { position: [4.8, 1.9, 11.6], fov: 32 },
    target: [0, -0.2, 0],
    bounds: { min: [-3.6, -3.6, -2.6], max: [3.6, 3.6, 2.6] },
    orbit: { minDistance: 2.4, maxDistance: 30, free: true },
    description: modelDescriptions['mochevoj-puzyr'],
  },
  legkie: {
    Component: lazy(() => import('./lungs/LungsModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusLungs',
    camera: { position: [0.4, 1.3, 13.2], fov: 32 },
    target: [0, 0.55, 0],
    floorY: -3.3,
    bounds: { min: [-4, -3.4, -3], max: [4, 4.2, 3] },
    orbit: { minDistance: 1.8, maxDistance: 34, free: true },
    modes: [
      { id: 'inside', icon: 'inside' },
      { id: 'alveolus', icon: 'lobule' },
    ],
    isolate: true,
    description: modelDescriptions.legkie,
  },
  'zhelchnyj-puzyr': {
    Component: lazy(() => import('./gallbladder/GallbladderModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusGallbladder',
    isolate: true,
    camera: { position: [6.6, 4.1, 38.4], fov: 32 },
    target: [1.9, 0.2, -0.6],
    floorY: -8.9,
    bounds: { min: [-10, -11, -8], max: [11, 10, 6] },
    orbit: { minDistance: 1.8, maxDistance: 80, free: true },
    description: modelDescriptions['zhelchnyj-puzyr'],
  },
  podzheludochnaya: {
    Component: lazy(() => import('./pancreas/PancreasModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusPancreas',
    // три плоскости среза с ползунком: фронтальный, поперечный (сверху), боковой; положения по умолчанию — через протоки и головку
    explorerCuts: {
      sideKey: 'explorer.cutPancreasFrontal',
      coronalKey: 'explorer.cutPancreasSagittal',
      defaults: { side: 0.46, fundus: 0.5, coronal: 0.81 },
    },
    isolate: true,
    camera: { position: [10.0, 12.4, 63.2], fov: 32 },
    target: [0.8, 1.2, -1.2],
    floorY: -12.5,
    bounds: { min: [-17, -13, -10], max: [18, 14, 7] },
    orbit: { minDistance: 1.6, maxDistance: 110, free: true },
    modes: [{ id: 'micro', icon: 'lobule' }],
    description: modelDescriptions.podzheludochnaya,
  },
  mozg: {
    Component: lazy(() => import('./brain/BrainModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusBrain',
    explorerCuts: { sideKey: 'explorer.cutBrainSide', coronalKey: 'explorer.cutBrainCoronal', defaults: CUT_DEFAULT_T },
    camera: { position: [13, 6.3, 15], fov: 32 },
    target: [0, -0.4, -0.25],
    floorY: -7.2,
    bounds: { min: [-8, -8, -8], max: [8, 5, 8] },
    orbit: { minDistance: 2.2, maxDistance: 48, free: true },
    modes: [
      { id: 'lobes', icon: 'brain' },
      { id: 'zones', icon: 'segments' },
      { id: 'deep', icon: 'inside' },
      { id: 'meninges', icon: 'layers' },
    ],
    description: modelDescriptions.mozg,
  },
  uho: {
    Component: lazy(() => import('./ear/EarModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusEar',
    explorerCuts: { sideKey: 'explorer.cutEarSide', coronalKey: 'explorer.cutEarCoronal', defaults: EAR_CUT_T },
    isolate: true,
    camera: {
      position: [
        (EAR_VIEW.at[0] + EAR_VIEW.dir[0] * EAR_VIEW.dist) * EAR_SCALE,
        (EAR_VIEW.at[1] + EAR_VIEW.dir[1] * EAR_VIEW.dist) * EAR_SCALE,
        (EAR_VIEW.at[2] + EAR_VIEW.dir[2] * EAR_VIEW.dist) * EAR_SCALE,
      ],
      fov: 32,
    },
    target: [EAR_VIEW.at[0] * EAR_SCALE, EAR_VIEW.at[1] * EAR_SCALE, EAR_VIEW.at[2] * EAR_SCALE],
    floorY: -4.2,
    bounds: { min: [-7, -5, -9], max: [7, 5, 5] },
    orbit: { minDistance: 0.35, maxDistance: 46, free: true },
    modes: [
      { id: 'sound', icon: 'waves' },
      { id: 'inner', icon: 'inside' },
    ],
    description: modelDescriptions.uho,
  },
  myshcy: {
    Component: lazy(() => import('./muscles/MusclesModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusMuscles',
    explorerCuts: { sideKey: 'explorer.cutMusclesFrontal', coronalKey: 'explorer.cutMusclesSagittal', defaults: MUSCLES_CUT_T },
    isolate: true,
    camera: { position: [0, 0.75, 11.6], fov: 32 },
    target: [0, 0.3, 0],
    bounds: { min: [-1.4, -2.0, -0.7], max: [1.4, 2.45, 0.7] },
    orbit: { minDistance: 0.8, maxDistance: 22, free: true },
    modes: [
      { id: 'skeleton', icon: 'bone' },
      { id: 'work', icon: 'activity' },
      { id: 'peel', icon: 'layers' },
    ],
    description: modelDescriptions.myshcy,
  },
  kishechnik: {
    Component: lazy(() => import('./intestine/IntestineModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusIntestine',
    isolate: true,
    camera: { position: [5.2, -0.1, 30.1], fov: 32 },
    target: [0.2, -2.6, -0.3],
    floorY: -11.6,
    bounds: { min: [-8, -13.5, -6], max: [8, 8, 6] },
    orbit: { minDistance: 2.2, maxDistance: 70, free: true },
    modes: [{ id: 'wall', icon: 'lobule' }],
    description: modelDescriptions.kishechnik,
  },
};
