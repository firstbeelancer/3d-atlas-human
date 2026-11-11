import type { SceneId } from './anatomy';
import { buildBud } from './buildBud';
import { buildTongue } from './buildTongue';
import type { Parts } from './types';

export type { MatKey, MeshDef, Parts } from './types';

export interface SceneData {
  parts: Parts;
}

/** Геометрия одной сцены; строится при первом показе. */
export function buildScene(scene: SceneId): SceneData {
  return { parts: scene === 'bud' ? buildBud() : buildTongue() };
}

export function disposeScene(data: SceneData): void {
  for (const defs of Object.values(data.parts)) for (const d of defs) d.g.dispose();
}
