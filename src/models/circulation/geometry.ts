import { Color, Vector3, type BufferGeometry } from 'three';
import { bloodTube } from '../body/bloodPaths';
import { curveOf, merge, tint, type V3 } from '../body/geo';
import { MICRO_GROUP, VESSELS, type Vessel } from './anatomy';
import { BLOOD_COLORS } from './appearance';

export interface VesselMesh {
  id: string;
  group: string;
  geometry: BufferGeometry;
  at: V3;
  color: string;
  gradient: boolean;
}

function gradientTube(vessel: Vessel) {
  const geometry = bloodTube(vessel);
  const rich = new Color(BLOOD_COLORS.oxygenated);
  const poor = new Color(BLOOD_COLORS.deoxygenated);
  const gain = vessel.blood === 'oxygen-gain';
  const from = gain ? poor : rich;
  const to = gain ? rich : poor;
  const start = new Vector3(...vessel.points[0]);
  const end = new Vector3(...vessel.points[vessel.points.length - 1]);
  const axis = end.sub(start);
  const lengthSquared = axis.lengthSq();
  const color = new Color();
  return tint(geometry, (x, y, z) => {
    const progress = gain
      ? ((x - start.x) * axis.x + (y - start.y) * axis.y + (z - start.z) * axis.z) / lengthSquared
      : (x + 1.44) / 2.92;
    color.copy(from).lerp(to, Math.max(0, Math.min(1, progress)));
    return [color.r, color.g, color.b];
  });
}

export function buildVesselMeshes(): VesselMesh[] {
  const groups = new Map<string, Vessel[]>();
  for (const vessel of VESSELS) {
    const paths = groups.get(vessel.part) ?? [];
    paths.push(vessel);
    groups.set(vessel.part, paths);
  }
  return Array.from(groups, ([id, paths]) => {
    const first = paths[0];
    const { blood } = first;
    const gradient = blood === 'oxygen-gain' || blood === 'oxygen-loss';
    const tubes = paths.map(gradient ? gradientTube : bloodTube);
    const geometry = tubes.length === 1 ? tubes[0] : merge(tubes);
    geometry.computeBoundingBox();
    const labelPath = curveOf(first.points);
    const point = labelPath.getPointAt(id === 'aorta' ? 0.70 : 0.56);
    return {
      id, group: first.group, geometry, gradient,
      at: [point.x, point.y, point.z + 0.06],
      color: gradient ? '#ffffff' : BLOOD_COLORS[blood],
    };
  });
}

export function buildStreams() {
  return VESSELS.flatMap((vessel, index) => {
    const { part, group, radii, points, reverse, blood } = vessel;
    const micro = group === MICRO_GROUP;
    if (micro ? radii[0] < 0.039 : radii[0] < 0.052 && part !== 'lung-capillaries') return [];
    const path = curveOf(reverse ? [...points].reverse() : points);
    const length = path.getLength();
    if (length < (micro ? 0.60 : 0.35)) return [];
    return [{
      key: `${part}-${index}`, part, group, path,
      count: Math.max(1, Math.min(7, Math.ceil(length / (micro ? 0.69 : 1.12)))),
      speed: (micro ? 0.74 : 1.55) / length,
      size: micro ? radii[0] * 0.76 : Math.max(0.013, radii[0] * 0.98),
      color: blood === 'deoxygenated' || blood === 'oxygen-gain' ? '#98b5ff' : '#ff9d86',
    }];
  });
}
