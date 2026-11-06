import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ModelProps } from '../three/types';
import { modelDescriptions } from '../content/ru/models';

export interface ModelEntry {
  Component: LazyExoticComponent<ComponentType<ModelProps>>;
  hasCutaway?: boolean;
  camera?: { position: [number, number, number]; fov?: number };
  /** Пределы приближения камеры и свободное вращение. */
  orbit?: { minDistance?: number; maxDistance?: number; free?: boolean };
  /** Слои, разнос на части и режим «отдельно» — для моделей из многих частей. */
  explorer?: boolean;
  target?: [number, number, number];
  /** Описание модели для скринридеров и браузеров без 3D. */
  description: string;
}

/** 3D-модель каждого раздела грузится отдельным куском, только когда раздел открыт. */
export const MODELS: Record<string, ModelEntry> = {
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
    description: modelDescriptions.skelet,
  },
  serdce: {
    Component: lazy(() => import('./heart/HeartModel')),
    hasCutaway: true,
    camera: { position: [0.6, 0.9, 12], fov: 32 },
    target: [0, 0.35, 0],
    description: modelDescriptions.serdce,
  },
};
