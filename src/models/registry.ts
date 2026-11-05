import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ModelProps } from '../three/types';

export interface ModelEntry {
  Component: LazyExoticComponent<ComponentType<ModelProps>>;
  hasCutaway?: boolean;
  camera?: { position: [number, number, number]; fov?: number };
  target?: [number, number, number];
  /** Описание модели для скринридеров и браузеров без 3D. */
  description: string;
}

/** 3D-модель каждого раздела грузится отдельным куском, только когда раздел открыт. */
export const MODELS: Record<string, ModelEntry> = {
  serdce: {
    Component: lazy(() => import('./heart/HeartModel')),
    hasCutaway: true,
    camera: { position: [0.6, 0.9, 12], fov: 32 },
    target: [0, 0.35, 0],
    description:
      'Модель сердца спереди: четыре камеры, аорта, лёгочный ствол и полые вены. В режиме разреза видны клапаны, перегородка и ток крови.',
  },
};
