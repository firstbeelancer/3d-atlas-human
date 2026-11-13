import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ModelProps } from '../three/types';
import type { StageLegendItem, StageMode } from '../three/Stage';
import type { Box } from '../three/cameraBounds';
import { teethText } from '../content/ru/teeth-model';
import { modelDescriptions } from '../content/ru/models';
import type { MessageKey } from '../i18n';
import { KIDNEY_CAMERA, KIDNEY_TARGET } from './kidney/anatomy';
import { CUT_DEFAULT_T } from './brain/anatomy';
import { CUT_DEFAULT_T as FEMALE_CUT_T } from './female/anatomy';
import { CUT_DEFAULT_T as MUSCLES_CUT_T } from './muscles/anatomy';
import { CUT_DEFAULT_T as SPLEEN_CUT_T } from './spleen/anatomy';
import { CUT_DEFAULT_T as HAIR_CUT_T } from './hair/anatomy';
import { CUT_VIEWS as HAIR_CUT_VIEWS } from './hair/parts';
import { CUT_DEFAULT_T as TONGUE_CUT_T } from './tongue/anatomy';
import { OVERVIEW as TONGUE_VIEW } from './tongue/parts';
import { CUT_DEFAULT_T as EAR_CUT_T, OVERVIEW as EAR_VIEW, SCALE as EAR_SCALE } from './ear/anatomy';
import { CUT_DEFAULT_T as NOSE_CUT_T, OVERVIEW as NOSE_VIEW } from './nose/anatomy';
import { CUT_DEFAULT_T as SKIN_CUT_T } from './skin/anatomy';
import { OVERVIEW as SKIN_VIEW } from './skin/parts';
import { BLOOD_COLORS, BODY_FLOOR, OVERVIEW_CAMERA, OVERVIEW_TARGET } from './circulation/appearance';

export interface ModelEntry {
  Component: LazyExoticComponent<ComponentType<ModelProps>>;
  hasCutaway?: boolean;
  initialCutaway?: boolean;
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
  /** На телефоне панель режимов и модель занимают разные области. */
  mobileModeRoom?: boolean;
  legend?: readonly StageLegendItem[];
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
  yazyk: {
    Component: lazy(() => import('./tongue/TongueModel')),
    mobileModeRoom: true,
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusTongue',
    // три плоскости среза с ползунком: сагиттальный (вид сбоку), поперечный (спереди), горизонтальный (сверху)
    explorerCuts: { sideKey: 'explorer.cutTongueSagittal', coronalKey: 'explorer.cutTongueHorizontal', defaults: TONGUE_CUT_T },
    isolate: true,
    camera: {
      position: [
        TONGUE_VIEW.tongue.at[0] + TONGUE_VIEW.tongue.dir[0] * TONGUE_VIEW.tongue.dist,
        TONGUE_VIEW.tongue.at[1] + TONGUE_VIEW.tongue.dir[1] * TONGUE_VIEW.tongue.dist,
        TONGUE_VIEW.tongue.at[2] + TONGUE_VIEW.tongue.dir[2] * TONGUE_VIEW.tongue.dist,
      ],
      fov: 32,
    },
    target: TONGUE_VIEW.tongue.at,
    floorY: -6.4,
    bounds: { min: [-8, -7, -6], max: [8, 8, 6] },
    orbit: { minDistance: 1.2, maxDistance: 70, free: true },
    modes: [
      { id: 'bud', icon: 'lobule', group: 'view', clearsSelection: true },
      { id: 'tongueUnderside', icon: 'explode', group: 'view', clearsSelection: true },
      { id: 'move', icon: 'activity' },
      { id: 'xray', icon: 'inside' },
    ],
    description: modelDescriptions.yazyk,
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
    bounds: { min: [-0.75, -2.0, -0.45], max: [0.75, 2.72, 0.45] },
    minDistance: 1.1,
    description: modelDescriptions.skelet,
  },
  'krovenosnaya-sistema': {
    Component: lazy(() => import('./circulation/CirculationModel')),
    explorer: true,
    mobileModeRoom: true,
    camera: { position: OVERVIEW_CAMERA, fov: 32 },
    target: OVERVIEW_TARGET,
    floorY: BODY_FLOOR,
    bounds: { min: [-3.6, -2.38, -0.9], max: [3.6, 2.99, 1.15] },
    orbit: { minDistance: 0.6, maxDistance: 52, free: true },
    isolate: true,
    modes: [
      { id: 'systemic', icon: 'activity', group: 'circuit', clearsSelection: true },
      { id: 'pulmonary', icon: 'inside', group: 'circuit', clearsSelection: true },
      { id: 'capillary-bed', icon: 'lobule', group: 'circuit', clearsSelection: true },
      { id: 'capillary-wall', icon: 'layers', group: 'circuit', clearsSelection: true },
    ],
    legend: [
      { label: 'circulation.oxygenated', color: BLOOD_COLORS.oxygenated },
      { label: 'circulation.deoxygenated', color: BLOOD_COLORS.deoxygenated },
    ],
    description: modelDescriptions['krovenosnaya-sistema'],
  },
  'nervnaya-sistema': {
    Component: lazy(() => import('./nerves/NervesModel')),
    // та же фигура и тот же вид, что у кровеносной системы
    camera: { position: OVERVIEW_CAMERA, fov: 32 },
    target: OVERVIEW_TARGET,
    floorY: BODY_FLOOR,
    bounds: { min: [-3.6, -2.38, -0.9], max: [3.6, 2.99, 1.15] },
    orbit: { minDistance: 0.35, maxDistance: 52, free: true },
    isolate: true,
    modes: [
      { id: 'reflex', icon: 'activity', group: 'view', clearsSelection: true },
      { id: 'neuron', icon: 'lobule', group: 'view', clearsSelection: true },
    ],
    description: modelDescriptions['nervnaya-sistema'],
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
  pochki: {
    Component: lazy(() => import('./kidney/KidneyModel')),
    hasCutaway: true,
    initialCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.kidneyVessels',
    isolate: true,
    camera: { position: KIDNEY_CAMERA, fov: 31 },
    target: KIDNEY_TARGET,
    floorY: -3.36,
    bounds: { min: [-3.7, -3.36, -1.25], max: [3.7, 3.1, 1.25] },
    orbit: { minDistance: 1.3, maxDistance: 58, free: true },
    modes: [
      { id: 'nephron', icon: 'lobule', clearsSelection: true },
      { id: 'renal-flow', icon: 'waves' },
    ],
    description: modelDescriptions.pochki,
  },
  'mochevoj-puzyr': {
    Component: lazy(() => import('./bladder/BladderModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusBladder',
    camera: { position: [5.8, 2.8, 21.8], fov: 32 },
    target: [0, 0.16, -0.38],
    floorY: -4.85,
    bounds: { min: [-4.8, -4.7, -3.6], max: [4.8, 5.1, 3.8] },
    orbit: { minDistance: 2.4, maxDistance: 72, free: true },
    description: modelDescriptions['mochevoj-puzyr'],
  },
  'zhenskaya-reproduktivnaya': {
    Component: lazy(() => import('./female/FemaleModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusFemale',
    // три плоскости среза с ползунком: фронтальный, горизонтальный, сагиттальный (вид сбоку)
    explorerCuts: { sideKey: 'explorer.cutFemaleFrontal', coronalKey: 'explorer.cutFemaleSagittal', defaults: FEMALE_CUT_T },
    isolate: true,
    camera: { position: [9, 5, 40], fov: 32 },
    target: [0, -1.4, 0.4],
    floorY: -13.4,
    bounds: { min: [-12, -14, -12], max: [12, 11, 10] },
    orbit: { minDistance: 2.2, maxDistance: 90, free: true },
    modes: [{ id: 'xray', icon: 'inside' }],
    description: modelDescriptions['zhenskaya-reproduktivnaya'],
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
  kozha: {
    Component: lazy(() => import('./skin/SkinModel')),
    hasCutaway: true,
    initialCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusSkin',
    explorerCuts: { sideKey: 'explorer.cutSkinSide', coronalKey: 'explorer.cutSkinCoronal', defaults: SKIN_CUT_T },
    isolate: true,
    camera: {
      position: [
        SKIN_VIEW.at[0] + SKIN_VIEW.dir[0] * SKIN_VIEW.dist,
        SKIN_VIEW.at[1] + SKIN_VIEW.dir[1] * SKIN_VIEW.dist,
        SKIN_VIEW.at[2] + SKIN_VIEW.dir[2] * SKIN_VIEW.dist,
      ],
      fov: 32,
    },
    target: SKIN_VIEW.at,
    floorY: -11.6,
    bounds: { min: [-11, -12, -7], max: [11, 6, 7] },
    orbit: { minDistance: 1.2, maxDistance: 120, free: true },
    modes: [
      { id: 'xray', icon: 'inside' },
      { id: 'goose', icon: 'activity' },
      { id: 'sweat', icon: 'waves' },
      { id: 'sense', icon: 'brain' },
    ],
    description: modelDescriptions.kozha,
  },
  'volosy-i-nogti': {
    Component: lazy(() => import('./hair/HairModel')),
    hasCutaway: true,
    initialCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusHair',
    explorerCuts: { sideKey: 'explorer.cutHairSide', coronalKey: 'explorer.cutHairCoronal', defaults: HAIR_CUT_T },
    isolate: true,
    camera: {
      position: [
        HAIR_CUT_VIEWS.follicle.side.at[0] + HAIR_CUT_VIEWS.follicle.side.dir[0] * HAIR_CUT_VIEWS.follicle.side.dist,
        HAIR_CUT_VIEWS.follicle.side.at[1] + HAIR_CUT_VIEWS.follicle.side.dir[1] * HAIR_CUT_VIEWS.follicle.side.dist,
        HAIR_CUT_VIEWS.follicle.side.at[2] + HAIR_CUT_VIEWS.follicle.side.dir[2] * HAIR_CUT_VIEWS.follicle.side.dist,
      ],
      fov: 32,
    },
    target: HAIR_CUT_VIEWS.follicle.side.at,
    floorY: -40,
    bounds: { min: [-14, -18, -12], max: [18, 30, 12] },
    orbit: { minDistance: 1.2, maxDistance: 150, free: true },
    modes: [
      { id: 'cycle', icon: 'sprout', group: 'view', clearsSelection: true },
      { id: 'shaft', icon: 'lobule', group: 'view', clearsSelection: true },
      { id: 'nail', icon: 'fingerprint', group: 'view', clearsSelection: true },
      { id: 'goose', icon: 'activity' },
      { id: 'xray', icon: 'inside' },
    ],
    description: modelDescriptions['volosy-i-nogti'],
  },
  selezenka: {
    Component: lazy(() => import('./spleen/SpleenModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusSpleen',
    explorerCuts: { sideKey: 'explorer.cutSpleenSide', coronalKey: 'explorer.cutSpleenCoronal', defaults: SPLEEN_CUT_T },
    isolate: true,
    camera: { position: [-19.3, 9.6, 37.4], fov: 32 },
    target: [-2.2, -0.6, 0.4],
    floorY: -14,
    bounds: { min: [-15, -14, -11], max: [11, 11, 13] },
    orbit: { minDistance: 1.6, maxDistance: 110, free: true },
    modes: [
      { id: 'xray', icon: 'inside' },
      { id: 'segments', icon: 'segments' },
      { id: 'pulp', icon: 'lobule', clearsSelection: true },
    ],
    description: modelDescriptions.selezenka,
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
  nos: {
    Component: lazy(() => import('./nose/NoseModel')),
    hasCutaway: true,
    explorer: true,
    explorerFundusKey: 'explorer.fundusNose',
    explorerCuts: { sideKey: 'explorer.cutNoseSide', coronalKey: 'explorer.cutNoseCoronal', defaults: NOSE_CUT_T },
    isolate: true,
    camera: {
      position: [
        NOSE_VIEW.at[0] + NOSE_VIEW.dir[0] * NOSE_VIEW.dist,
        NOSE_VIEW.at[1] + NOSE_VIEW.dir[1] * NOSE_VIEW.dist,
        NOSE_VIEW.at[2] + NOSE_VIEW.dir[2] * NOSE_VIEW.dist,
      ],
      fov: 32,
    },
    target: NOSE_VIEW.at,
    floorY: -4.6,
    bounds: { min: [-5, -4.5, -5.5], max: [5, 5.5, 4.5] },
    orbit: { minDistance: 0.5, maxDistance: 60, free: true },
    modes: [
      { id: 'airflow', icon: 'waves' },
      { id: 'smell', icon: 'activity' },
      { id: 'xray', icon: 'inside' },
    ],
    description: modelDescriptions.nos,
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
