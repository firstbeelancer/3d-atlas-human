import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import type { V3 } from './geometry';
import type { MeshDef, Parts } from './types';

const SURFACE = ['apex', 'body', 'root', 'dorsum', 'ventral-surface'];

/** Intersect indexed tissue with the plane, welding seams between mesh patches. */
function crossSection(definitions: MeshDef[], plane: { n: V3; c: number }, fill: MeshDef['m'], edge?: MeshDef['m']): MeshDef[] {
  const axis = plane.n.findIndex((n) => n !== 0);
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const sign = plane.n[axis];
  // Stay just inside the visible half, including when the slider lines up with a whole row of vertices.
  const at = -plane.c / sign + sign * 0.000017;
  const points: Vector2[] = [];
  const pointIds = new Map<string, number>();
  const links: Set<number>[] = [];
  const coord = (p: ReturnType<BufferGeometry['getAttribute']>, i: number, k: number) =>
    k === 0 ? p.getX(i) : k === 1 ? p.getY(i) : p.getZ(i);
  const join = (x: number, y: number): number => {
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;
    const existing = pointIds.get(key);
    if (existing !== undefined) return existing;
    const id = points.length;
    points.push(new Vector2(x, y));
    links.push(new Set());
    pointIds.set(key, id);
    return id;
  };

  for (const { g } of definitions) {
    const p = g.getAttribute('position');
    const indices = g.index!.array;
    for (let k = 0; k < indices.length; k += 3) {
      const a = indices[k];
      const b = indices[k + 1];
      const c = indices[k + 2];
      const da = coord(p, a, axis) - at;
      const db = coord(p, b, axis) - at;
      const dc = coord(p, c, axis) - at;
      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;
      const hit: number[] = [];
      for (const [i, j, di, dj] of [[a, b, da, db], [b, c, db, dc], [c, a, dc, da]]) {
        if ((di < 0) === (dj < 0)) continue;
        const t = di / (di - dj);
        const x = coord(p, i, u);
        const y = coord(p, i, v);
        hit.push(join(x + t * (coord(p, j, u) - x), y + t * (coord(p, j, v) - y)));
      }
      if (hit.length === 2 && hit[0] !== hit[1]) {
        links[hit[0]].add(hit[1]);
        links[hit[1]].add(hit[0]);
      }
    }
  }

  const outline: Vector2[][] = [];
  for (let start = 0; start < points.length; start++) {
    while (links[start].size) {
      const ring = [points[start]];
      let last = start;
      let closed = false;
      while (links[last].size) {
        const next = links[last].values().next().value!;
        links[last].delete(next);
        links[next].delete(last);
        if (next === start) {
          closed = true;
          break;
        }
        ring.push(points[next]);
        last = next;
      }
      if (closed && ring.length > 2 && Math.abs(ShapeUtils.area(ring)) > 0.0001) {
        if (ShapeUtils.isClockWise(ring)) ring.reverse();
        outline.push(ring);
      }
    }
  }

  const defs: MeshDef[] = [];
  const mesh = (vertices: Vector2[], faces: number[][], m: MeshDef['m']) => {
    const positions: number[] = [];
    const normals: number[] = [];
    for (const p of vertices) {
      const q = [0, 0, 0];
      q[axis] = at;
      q[u] = p.x;
      q[v] = p.y;
      positions.push(...q);
      normals.push(...plane.n.map((n) => -n));
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    g.setIndex(faces.flatMap(([a, b, c]) => {
      const ab = vertices[b].clone().sub(vertices[a]);
      const ac = vertices[c].clone().sub(vertices[a]);
      return ab.cross(ac) * sign < 0 ? [a, b, c] : [a, c, b];
    }));
    defs.push({ g, m, noPick: true });
  };

  if (!edge) {
    const contains = (ring: Vector2[], p: Vector2): boolean => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y)) inside = !inside;
      }
      return inside;
    };
    const nested: { ring: Vector2[]; parent: number; depth: number }[] = [];
    outline.sort((a, b) => Math.abs(ShapeUtils.area(b)) - Math.abs(ShapeUtils.area(a)));
    for (const ring of outline) {
      let parent = nested.length - 1;
      while (parent >= 0 && !contains(nested[parent].ring, ring[0])) parent--;
      nested.push({ ring, parent, depth: parent < 0 ? 0 : nested[parent].depth + 1 });
    }
    for (const [i, { ring, depth }] of nested.entries()) {
      if (depth % 2) continue;
      const holes = nested.filter(({ parent }) => parent === i).map(({ ring: hole }) => [...hole].reverse());
      mesh([ring, ...holes].flat(), ShapeUtils.triangulateShape(ring, holes), fill);
    }
    return defs;
  }

  for (const outer of outline) {
    const n = outer.length;
    // A thin mucosal edge follows the true outline. Keep it narrow at tangential cuts.
    const center = outer.reduce((sum, p) => sum.add(p), new Vector2()).multiplyScalar(1 / n);
    const extent = Math.min(
      Math.max(...outer.map((p) => p.x)) - Math.min(...outer.map((p) => p.x)),
      Math.max(...outer.map((p) => p.y)) - Math.min(...outer.map((p) => p.y)),
    );
    const rim = Math.min(0.06, extent * 0.06);
    const inner = outer.map((p) => p.clone().lerp(center, Math.min(0.13, rim / Math.max(0.06, p.distanceTo(center)))));
    const band = outer.flatMap((_, i) => {
      const j = (i + 1) % n;
      return [[i, j, n + i], [j, n + j, n + i]];
    });
    mesh(inner, ShapeUtils.triangulateShape(inner, []), fill);
    mesh([...outer, ...inner], band, edge);
  }
  return defs;
}

export function tongueSection(parts: Parts, plane: { n: V3; c: number }, hidden?: ReadonlySet<string>): MeshDef[] {
  if (SURFACE.some((id) => hidden?.has(id))) return [];
  return crossSection(SURFACE.flatMap((id) => parts[id]), plane, 'sectionMuscle', 'sectionMucosa');
}

export function budSection(parts: Parts, plane: { n: V3; c: number }, hidden?: ReadonlySet<string>): MeshDef[] {
  return [
    ...(hidden?.has('b-epithelium') ? [] : crossSection(parts['b-epithelium'], plane, 'sectionEpithelium')),
    ...(hidden?.has('b-core') ? [] : crossSection(parts['b-core'], plane, 'sectionLamina')),
  ];
}
