import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ModelProps } from '../three/types';
import type { StageMode } from '../three/Stage';
import { modelDescriptions } from '../content/ru/models';

export interface ModelEntry {
  Component: LazyExoticComponent<ComponentType<ModelProps>>;
  hasCutaway?: boolean;
  camera?: { position: [number, number, number]; fov?: number };
  target?: [number, number, number];
  /** Описание модели для скринридеров и браузеров без 3D. */
  description: string;
  /** Дополнительные режимы модели (кнопки на сцене). */
  modes?: StageMode[];
  /** Часть можно рассмотреть отдельно (кнопка в списке «Из чего состоит»). */
  isolate?: boolean;
}

/** 3D-модель каждого раздела грузится отдельным куском, только когда раздел открыт. */
export const MODELS: Record<string, ModelEntry> = {
  skelet: {
    Component: lazy(() => import('./skeleton/SkeletonModel')),
    hasCutaway: true,
    camera: { position: [0, 0.75, 11.6], fov: 32 },
    target: [0, 0.3, 0],
    description: modelDescriptions.skelet,
  },
  pechen: {
    Component: lazy(() => import('./liver/LiverModel')),
    camera: { position: [0.5, 1.1, 15.5], fov: 32 },
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
  serdce: {
    Component: lazy(() => import('./heart/HeartModel')),
    hasCutaway: true,
    camera: { position: [0.6, 0.9, 12], fov: 32 },
    target: [0, 0.35, 0],
    description: modelDescriptions.serdce,
  },
};
