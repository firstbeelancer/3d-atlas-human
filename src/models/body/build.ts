import { skeletonGeometry } from '../skeleton/bones';
import { buildAbdomen } from './abdomen';
import { PIVOTS } from './meta';
import { skinGeometry } from './skin';
import { buildThorax } from './thorax';
import type { GeometrySet } from './transfer';
import { buildVessels } from './vessels';

export type BodyPart = 'skin' | 'bones' | 'thorax' | 'abdomen' | 'vessels';

/** Грубость сетки скелета на главной: кости рассматривают издалека, зато их тут много. */
export const BONE_DETAIL = 1.7;

/** Собирает сетки одной части тела (вызывается в фоновом потоке, а при его отсутствии — в основном). */
export function buildPart(part: BodyPart): GeometrySet {
  switch (part) {
    case 'skin':
      return { skin: skinGeometry() };
    case 'bones':
      return { ...skeletonGeometry(BONE_DETAIL) } as unknown as GeometrySet;
    case 'thorax': {
      const g = buildThorax();
      for (const [key, p] of Object.entries(PIVOTS)) g[key]?.translate(-p[0], -p[1], -p[2]);
      return g;
    }
    case 'abdomen':
      return buildAbdomen();
    case 'vessels':
      return buildVessels();
  }
}
