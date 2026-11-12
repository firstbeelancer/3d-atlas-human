import { Color, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { curveOf, tint, type V3 } from '../body/geo';
import { sweep } from '../skeleton/sweep';
import { ARTERY_GROUP, MICRO_GROUP, VEIN_GROUP, VESSELS, type Vessel } from './anatomy';
import { BLOOD_COLORS } from './appearance';

export interface VesselMesh {
  id: string;
  group: string;
  geometry: BufferGeometry;
  at: V3;
  color: string;
  gradient: boolean;
  venous: boolean;
}

const rich = new Color(BLOOD_COLORS.oxygenated);
const poor = new Color(BLOOD_COLORS.deoxygenated);

export function vesselTube(vessel: Vessel): BufferGeometry {
  const path = curveOf(vessel.points);
  const length = path.getLength();
  const [start, end] = vessel.radii;
  const calibre = Math.max(start, end);
  const radial = calibre >= 0.09 ? 20 : calibre >= 0.035 ? 14 : calibre >= 0.016 ? 10 : 8;
  const segments = Math.max(8, Math.min(220, Math.ceil(length * (calibre >= 0.035 ? 25 : 17))));
  const geometry = sweep(path, {
    radius: (t) => {
      const r = start + (end - start) * t;
      return [r, r * 0.98];
    },
    radial, segments,
    // Use rounded ends at junctions. Branches start inside the parent tube.
  });
  if (vessel.blood !== 'oxygen-gain' && vessel.blood !== 'oxygen-loss') return geometry;

  const from = vessel.blood === 'oxygen-gain' ? poor : rich;
  const to = vessel.blood === 'oxygen-gain' ? rich : poor;
  const lastRing = geometry.attributes.position.count - 2;
  const capRings = (lastRing / radial - segments - 1) / 2;
  const color = new Color();
  return tint(geometry, (_x, _y, _z, index) => {
    // The sweep samples rings at equal distances along the curve, including a curved cap.
    const t = index >= lastRing ? index - lastRing : Math.max(0, Math.min(1, (Math.floor(index / radial) - capRings) / segments));
    color.copy(from).lerp(to, t * t * (3 - 2 * t));
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
    const pieces = paths.map(vesselTube);
    const geometry = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces);
    if (pieces.length > 1) pieces.forEach((piece) => piece.dispose());
    if (!geometry) throw new Error('Could not merge vessel geometry');
    geometry.computeBoundingBox();
    const labelPath = id === 'lung-capillaries'
      ? paths.find(({ points }) => points[0][0] < -0.9 && points[0][1] < 12.55) ?? first
      : first;
    const point = curveOf(labelPath.points).getPointAt(id === 'aorta' ? 0.70 : 0.56);
    return {
      id, group: first.group, geometry, gradient,
      at: [point.x, point.y, point.z + 0.05],
      color: gradient ? '#ffffff' : BLOOD_COLORS[blood as 'oxygenated' | 'deoxygenated'],
      venous: first.group === VEIN_GROUP || id === 'pulmonary-veins' || id === 'venules',
    };
  });
}

export function buildStreams() {
  return VESSELS.flatMap((vessel, index) => {
    const { part, group, radii, points, reverse, blood } = vessel;
    const micro = group === MICRO_GROUP;
    const pulmonaryBed = part === 'lung-capillaries';
    const calibre = Math.min(...radii);
    if (micro ? radii[0] < 0.039 : radii[0] < 0.042 && !pulmonaryBed) return [];
    const path = curveOf(reverse ? [...points].reverse() : points);
    const length = path.getLength();
    if (length < (micro ? 0.5 : pulmonaryBed ? 0.13 : 0.30)) return [];
    const arterial = group === ARTERY_GROUP || part === 'pulmonary-trunk' || part === 'pulmonary-arteries' || part === 'arterioles';
    return [{
      key: `${part}-${index}`, part, group, path,
      count: Math.max(1, Math.min(8, Math.ceil(length / (micro ? 0.60 : arterial ? 1 : 1.12)))),
      speed: (micro ? 0.68 : pulmonaryBed ? 0.31 : arterial ? 1.72 : 1.18) / length,
      size: calibre * 0.72,
      color: blood === 'deoxygenated' || blood === 'oxygen-gain' ? '#98b5ff' : '#ff9d86',
      arterial,
    }];
  });
}
