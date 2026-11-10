import type { SceneId } from './anatomy';
import { buildCycle, buildFollicle } from './buildFollicle';
import { buildNail } from './buildNail';
import { buildShaft } from './buildShaft';
import type { MeshDef, Parts } from './types';

export type { MatKey, MeshDef, Parts } from './types';

export interface SceneData {
  parts: Parts;
  /** Фон сцены (кожа вокруг фолликулов в цикле роста): не выбирается мышью. */
  context: MeshDef[];
}

/** Геометрия одной сцены; строится при первом показе. */
export function buildScene(scene: SceneId): SceneData {
  switch (scene) {
    case 'follicle':
      return { parts: buildFollicle(), context: [] };
    case 'shaft':
      return { parts: buildShaft(), context: [] };
    case 'cycle':
      return buildCycle();
    case 'nail':
      return { parts: buildNail(), context: [] };
  }
}

export function disposeScene(data: SceneData): void {
  for (const defs of Object.values(data.parts)) for (const d of defs) d.g.dispose();
  for (const d of data.context) d.g.dispose();
}
