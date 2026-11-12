import { Color, SphereGeometry, Vector3, type BufferGeometry } from 'three';
import { curveOf, merge, tint, tube, wave, type V3 } from '../body/geo';
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

/** Адаптивная детализация трубки: крупные сосуды гладкие, мелкие — лёгкие. */
function detailOf(radius: number, length: number): { radial: number; segments: number } {
  const radial = radius >= 0.09 ? 16 : radius >= 0.055 ? 14 : radius >= 0.03 ? 11 : radius >= 0.015 ? 8 : 6;
  const perUnit = radius >= 0.03 ? 24 : 14;
  return { radial, segments: Math.max(10, Math.min(240, Math.round(length * perUnit))) };
}

export function vesselTube(vessel: Vessel): BufferGeometry {
  const length = curveOf(vessel.points).getLength();
  const r0 = vessel.radii[0];
  const r1 = vessel.radii[1];
  const d = detailOf(Math.max(r0, r1), length);
  return tube(vessel.points, (t) => {
    // лёгкое физиологическое сужение + пульсовое расширение у начала
    const taper = r0 + (r1 - r0) * t;
    const flare = t < 0.12 ? 1 + 0.1 * (1 - t / 0.12) * (r0 > 0.05 ? 1 : 0) : 1;
    return taper * flare;
  }, { radial: d.radial, segments: d.segments });
}

/** Сфера-«муфта» в месте ветвления — стыки выглядят органично, без разрывов. */
function jointSphere(at: V3, r: number): BufferGeometry {
  const g = new SphereGeometry(r * 1.04, r >= 0.05 ? 14 : 10, r >= 0.05 ? 10 : 8);
  g.translate(at[0], at[1], at[2]);
  return g;
}

/** Синусы венозных клапанов: лёгкие расширения стенки через равные промежутки. */
function valveSinuses(vessel: Vessel): BufferGeometry[] {
  const id = vessel.part;
  if (!id.includes('vein') && !id.includes('vena') && !id.includes('jugular') && !id.includes('cava') && !id.includes('saphen') && !id.includes('iliac')) return [];
  if (vessel.radii[0] < 0.03 || vessel.radii[0] > 0.1) return [];
  const curve = curveOf(vessel.points);
  const len = curve.getLength();
  if (len < 1.2) return [];
  const n = Math.min(4, Math.floor(len / 0.9));
  const out: BufferGeometry[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const c = curve.getPointAt(t);
    const r = vessel.radii[0] + (vessel.radii[1] - vessel.radii[0]) * t;
    const g = new SphereGeometry(r * 1.42, 10, 8);
    g.scale(1, 1.5, 1);
    g.translate(c.x, c.y, c.z);
    out.push(g);
  }
  return out;
}

function gradientTube(vessel: Vessel): BufferGeometry {
  const geometry = vesselTube(vessel);
  const rich = new Color(BLOOD_COLORS.oxygenated);
  const poor = new Color(BLOOD_COLORS.deoxygenated);
  const gain = vessel.blood === 'oxygen-gain';
  const from = gain ? poor : rich;
  const to = gain ? rich : poor;
  const start = new Vector3(...vessel.points[0]);
  const end = new Vector3(...vessel.points[vessel.points.length - 1]);
  const axis = end.clone().sub(start);
  const lengthSquared = Math.max(1e-6, axis.lengthSq());
  const color = new Color();
  const shaded = tint(geometry, (x, y, z) => {
    const proj = ((x - start.x) * axis.x + (y - start.y) * axis.y + (z - start.z) * axis.z) / lengthSquared;
    const progress = Math.max(0, Math.min(1, proj));
    // резкий, но плавный переход в середине капилляра
    const eased = progress * progress * (3 - 2 * progress);
    color.copy(from).lerp(to, eased);
    const fibre = 0.92 + 0.08 * wave(x * 2 + y * 2.4 + z, 11, 3);
    return [color.r * fibre, color.g * fibre, color.b * fibre];
  });
  return shaded;
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
    const parts: BufferGeometry[] = [];
    for (const vessel of paths) {
      if (gradient) {
        parts.push(gradientTube(vessel));
      } else {
        parts.push(vesselTube(vessel));
        // муфты на концах крупных сосудов
        if (vessel.radii[0] >= 0.03) {
          parts.push(jointSphere(vessel.points[0], vessel.radii[0]));
          const last = vessel.points[vessel.points.length - 1];
          parts.push(jointSphere(last, vessel.radii[1]));
        }
        for (const sn of valveSinuses(vessel)) parts.push(sn);
      }
    }
    const geometry = parts.length === 1 ? parts[0] : merge(parts);
    geometry.computeBoundingBox();
    const labelPath = curveOf(first.points);
    const point = labelPath.getPointAt(id === 'aorta' ? 0.70 : 0.56);
    return {
      id, group: first.group, geometry, gradient,
      at: [point.x, point.y, point.z + 0.06],
      color: gradient ? '#ffffff' : BLOOD_COLORS[blood as 'oxygenated' | 'deoxygenated'],
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
    const arterial = blood === 'oxygenated' || blood === 'oxygen-loss';
    return [{
      key: `${part}-${index}`, part, group, path,
      count: Math.max(1, Math.min(arterial ? 9 : 7, Math.ceil(length / (micro ? 0.55 : arterial ? 0.9 : 1.05)))),
      speed: (micro ? 0.74 : arterial ? 1.9 : 1.35) / length,
      size: micro ? radii[0] * 0.76 : Math.max(0.013, radii[0] * 0.98),
      color: blood === 'deoxygenated' || blood === 'oxygen-gain' ? '#98b5ff' : '#ff9d86',
      arterial,
    }];
  });
}
