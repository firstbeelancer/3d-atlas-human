import type { SceneId } from './anatomy';
import { buildBud } from './buildBud';
import { buildTongue } from './buildTongue';
import type { MeshDef, Parts } from './types';

export type { MatKey, MeshDef, Parts } from './types';

export interface SceneData {
  parts: Parts;
  /** Мышечная толща языка: видна на разрезе, мышью не выбирается. */
  context: MeshDef[];
}

/** Геометрия одной сцены; строится при первом показе. */
export function buildScene(scene: SceneId): SceneData {
  if (scene === 'bud') return { parts: buildBud(), context: [] };
  return buildTongue();
}

export function disposeScene(data: SceneData): void {
  for (const defs of Object.values(data.parts)) for (const d of defs) d.g.dispose();
  for (const d of data.context) d.g.dispose();
}
