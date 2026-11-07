/*
  Сборка всех частей лёгких в одну геометрию. Считается в фоновом потоке (geometry.worker.ts).
  Каждая сущность — одна сетка с материалом (kind), частью атласа (part) и местом (where):
  доля, сторона или центр — по нему части разъезжаются при разборе.
*/

import type { Grid } from '../teeth/surfaceNets';
import { buildBodies } from './bodies';
import {
  AORTA_PATH, AORTA_R, ARCH_BRANCHES, AZYGOS_PATH, AZYGOS_R, ESOPHAGUS_PATH, ESOPHAGUS_R, IVC_PATH, IVC_R,
  LOBE_CODES, LOBE_PART, SVC_PATH, SVC_R, diaphragmY, sdHeart,
} from './field';
import { isoMesh, MeshBuilder, type RawMesh } from './mesh';
import { anyPerp, catmull, cross, norm, rng, sub, type V3 } from './sdf';
import { buildTree, CARINA, LPA_PATH, RPA_PATH, TRACHEA_TOP, TRUNK_PATH, VEIN_TRUNKS, type Where } from './tree';

export type Kind =
  | 'lung' | 'fissure' | 'pleura' | 'cavity' | 'airway' | 'cartilage' | 'carina' | 'acinus' | 'artery' | 'vein'
  | 'node' | 'nerve' | 'hilum' | 'diaphragm' | 'heart' | 'aorta' | 'cava' | 'esoph' | 'bronchialArtery';

export interface Entity {
  part: string;
  where: Where;
  kind: Kind;
  mesh: RawMesh;
}

export interface LungGeometry {
  entities: Entity[];
}

const tubeR = (a: number, b: number) => (t: number) => a + (b - a) * t;

function pathTube(b: MeshBuilder, pts: V3[], r0: number, r1: number, sides = 10, samples = 12, caps: 'none' | 'both' = 'both') {
  b.tube(catmull(pts, samples), tubeR(r0, r1), sides, caps);
}

/** Спираль вокруг ломаной: бронхиальные артерии обвивают бронх. */
function helix(pts: V3[], radius: number, turns: number, phase: number): V3[] {
  const c = catmull(pts, 24);
  const out: V3[] = [];
  for (let i = 0; i < c.length; i++) {
    const t = norm(sub(c[Math.min(i + 1, c.length - 1)], c[Math.max(i - 1, 0)]));
    const a = anyPerp(t);
    const bb = cross(t, a);
    const ang = phase + (i / (c.length - 1)) * turns * Math.PI * 2;
    out.push([c[i][0] + (a[0] * Math.cos(ang) + bb[0] * Math.sin(ang)) * radius, c[i][1] + (a[1] * Math.cos(ang) + bb[1] * Math.sin(ang)) * radius, c[i][2] + (a[2] * Math.cos(ang) + bb[2] * Math.sin(ang)) * radius]);
  }
  return out;
}

function heartMesh(): RawMesh {
  const h = 0.06;
  const g: Grid = { x0: -1.0, y0: -1.9, z0: -1.0, h, nx: Math.ceil(2.7 / h), ny: Math.ceil(2.3 / h), nz: Math.ceil(2.5 / h) };
  const f = new Float32Array(g.nx * g.ny * g.nz);
  let q = 0;
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) f[q++] = sdHeart(g.x0 + i * h, g.y0 + j * h, g.z0 + k * h);
  return isoMesh(g, f, 0, 2);
}

function diaphragmMesh(): RawMesh {
  const b = new MeshBuilder(true);
  const NU = 160, NV = 56;
  const C = [0, -0.1];
  const place = (u: number, v: number, off: number): V3 => {
    const th = u * Math.PI * 2;
    const x = Math.cos(th) * 2.62 * v + C[0];
    const z = Math.sin(th) * 1.78 * v + C[1];
    return [x, diaphragmY(x, z) + off, z];
  };
  const color = (u: number, v: number): V3 => {
    const th = u * Math.PI * 2;
    const x = Math.cos(th) * 2.62 * v, z = Math.sin(th) * 1.78 * v;
    // сухожильный центр — трилистник; мышечная часть с радиальными волокнами
    const tend = Math.max(0, 1 - Math.hypot(x / 1.1, (z - 0.15) / 0.8)) + Math.max(0, 1 - Math.hypot((x + 0.95) / 0.7, (z + 0.0) / 0.55)) * 0.7 + Math.max(0, 1 - Math.hypot((x - 0.95) / 0.7, z / 0.55)) * 0.7;
    const t = Math.min(1, tend * 1.6);
    const streak = 0.9 + 0.1 * Math.sin(th * 90 + v * 3) * (0.5 + v);
    return [(0.74 + 0.2 * t) * streak, (0.28 + 0.52 * t) * streak, (0.24 + 0.46 * t) * streak];
  };
  const s0 = b.count;
  b.grid(NU, NV, (u, v) => place(u, v, 0.04), color);
  b.recomputeNormals(s0);
  const s1 = b.count;
  b.grid(NU, NV, (u, v) => place(u, v, -0.04), color);
  b.recomputeNormals(s1);
  // край, прикреплённый к рёбрам
  const edge0: V3[] = [], edge1: V3[] = [];
  for (let i = 0; i <= NU; i++) {
    edge0.push(place(i / NU, 1, 0.04));
    edge1.push(place(i / NU, 1, -0.04));
  }
  const s2 = b.count;
  b.ribbon(edge0, edge1, [0.7, 0.26, 0.22]);
  b.recomputeNormals(s2);
  return b.build();
}

export function lungsGeometry(): LungGeometry {
  const out: Entity[] = [];
  const push = (part: string, where: Where, kind: Kind, mesh: RawMesh | MeshBuilder) => {
    const m = mesh instanceof MeshBuilder ? mesh.build() : mesh;
    if (m.positions.length) out.push({ part, where, kind, mesh: m });
  };
  const rnd = rng(4242);

  /* лёгкие, плевра, щели */
  const bodies = buildBodies();
  for (const c of LOBE_CODES) push(LOBE_PART[c], c, 'lung', bodies.lobes[c]);
  push('fissures', 'C', 'fissure', bodies.fissures);
  push('pleura', 'R', 'pleura', bodies.pleura.R);
  push('pleura', 'L', 'pleura', bodies.pleura.L);
  push('pleural-cavity', 'R', 'cavity', bodies.cavity.R);
  push('pleural-cavity', 'L', 'cavity', bodies.cavity.L);

  /* бронхиальное дерево */
  const tree = buildTree();
  const groups = new Map<string, { part: string; where: Where; b: MeshBuilder }>();
  const acini = new Map<string, MeshBuilder>();
  const get = (part: string, where: Where) => {
    const k = `${part}|${where}`;
    if (!groups.has(k)) groups.set(k, { part, where, b: new MeshBuilder() });
    return groups.get(k)!.b;
  };
  for (const br of tree.branches) {
    if (br.part === 'trachea') continue;
    const mb = get(br.part, br.where);
    const sides = br.r0 > 0.06 ? 14 : br.r0 > 0.025 ? 9 : 5;
    mb.tube(catmull(br.pts, br.part === 'bronchioles' ? 3 : 8), tubeR(br.r0, br.r1), sides, br.terminal ? 'end' : 'none');
    if (!br.terminal) mb.sphere(br.pts[br.pts.length - 1], br.r1 * 1.02, sides, Math.max(4, sides / 2));
  }
  for (const [, g] of groups) push(g.part, g.where, 'airway', g.b);

  for (const tip of tree.tips) {
    if (!acini.has(tip.where)) acini.set(tip.where, new MeshBuilder());
    const mb = acini.get(tip.where)!;
    for (let i = 0; i < 3; i++) {
      const o: V3 = [(rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05];
      mb.sphere([tip.p[0] + tip.dir[0] * 0.035 + o[0], tip.p[1] + tip.dir[1] * 0.035 + o[1], tip.p[2] + tip.dir[2] * 0.035 + o[2]], 0.026 + rnd() * 0.012, 7, 5);
    }
  }
  for (const [w, mb] of acini) push('alveoli', w as Where, 'acinus', mb);

  /* трахея: стенка и хрящевые полукольца, открытые сзади */
  const wall = new MeshBuilder();
  const axis: V3[] = [TRACHEA_TOP, [0, 1.9, -0.2], CARINA];
  wall.tube(catmull(axis, 20), 0.15, 28, 'none');
  push('trachea', 'C', 'airway', wall);
  const rings = new MeshBuilder();
  for (let i = 0; i < 18; i++) {
    const y = 2.78 - i * 0.09;
    const zc = -0.2 - ((2.85 - y) / 1.85) * 0.02;
    const big = i === 0 ? 1.25 : 1;
    const arc: V3[] = [];
    for (let j = 0; j <= 22; j++) {
      const phi = -Math.PI / 2 + 0.6 + (j / 22) * (Math.PI * 2 - 1.2);
      arc.push([Math.cos(phi) * 0.168, y, zc + Math.sin(phi) * 0.168]);
    }
    rings.tube(arc, 0.021 * big, 7, 'both');
  }
  push('trachea', 'C', 'cartilage', rings);

  /* киль */
  const carina = new MeshBuilder();
  carina.ellipsoid([CARINA[0], CARINA[1] - 0.02, CARINA[2]], [0.16, 0.12, 0.16], undefined, 20, 12);
  carina.ellipsoid([CARINA[0], CARINA[1] + 0.03, CARINA[2]], [0.022, 0.1, 0.15], undefined, 10, 8);
  push('carina', 'C', 'carina', carina);

  /* лёгочный ствол, артерии, вены */
  const trunk = new MeshBuilder();
  pathTube(trunk, TRUNK_PATH, 0.21, 0.19, 18, 14);
  pathTube(trunk, RPA_PATH, 0.16, 0.1, 14, 22);
  pathTube(trunk, LPA_PATH, 0.15, 0.1, 14, 22);
  trunk.sphere(TRUNK_PATH[3], 0.19, 16, 10);
  push('pulmonary-trunk', 'C', 'artery', trunk);
  const aBy = new Map<Where, MeshBuilder>();
  for (const a of tree.arteries) {
    if (!aBy.has(a.where)) aBy.set(a.where, new MeshBuilder());
    aBy.get(a.where)!.tube(catmull(a.pts, 4), tubeR(a.r0, a.r1), a.r0 > 0.03 ? 9 : 5, 'both');
  }
  for (const [w, mb] of aBy) push('pulmonary-trunk', w, 'artery', mb);
  const vTrunkR = new MeshBuilder(), vTrunkL = new MeshBuilder();
  for (const [k, path] of Object.entries(VEIN_TRUNKS)) pathTube(k === 'ru' || k === 'rl' ? vTrunkR : vTrunkL, path, 0.07, 0.115, 14, 14);
  push('pulmonary-veins', 'R', 'vein', vTrunkR);
  push('pulmonary-veins', 'L', 'vein', vTrunkL);
  const vBy = new Map<Where, MeshBuilder>();
  for (const v of tree.veins) {
    if (!vBy.has(v.where)) vBy.set(v.where, new MeshBuilder());
    vBy.get(v.where)!.tube(catmull(v.pts, 4), tubeR(v.r0, v.r1), v.r0 > 0.03 ? 9 : 5, 'both');
  }
  for (const [w, mb] of vBy) push('pulmonary-veins', w, 'vein', mb);

  /* бронхиальные сосуды: тонкие артерии обвивают главные и долевые бронхи */
  const bvR = new MeshBuilder(), bvL = new MeshBuilder();
  tree.branches.forEach((br, i) => {
    if (br.part !== 'main-bronchi' && br.part !== 'lobar-bronchi') return;
    const mb = br.where === 'R' || br.where === 'ru' || br.where === 'rm' || br.where === 'rl' ? bvR : bvL;
    const turns = 2 + br.pts.length * 0.4;
    mb.tube(helix(br.pts, br.r0 + 0.02, turns, i), 0.0105, 5, 'both');
    mb.tube(helix(br.pts, br.r0 + 0.022, turns, i + 3.1), 0.008, 5, 'both');
  });
  const aortaFeed: V3[][] = [
    [[0.68, 0.55, -0.7], [0.5, 0.75, -0.5], [0.3, 0.8, -0.36], [0.05, 0.9, -0.27]],
    [[0.7, 0.4, -0.72], [0.9, 0.5, -0.5], [0.84, 0.52, -0.36]],
  ];
  pathTube(bvL, aortaFeed[0], 0.012, 0.009, 5, 14);
  pathTube(bvL, aortaFeed[1], 0.011, 0.009, 5, 10);
  pathTube(bvR, [[0.05, 0.9, -0.27], [-0.3, 0.84, -0.33], [-0.6, 0.7, -0.34]], 0.01, 0.009, 5, 12);
  push('bronchial-vessels', 'R', 'bronchialArtery', bvR);
  push('bronchial-vessels', 'L', 'bronchialArtery', bvL);

  /* лимфоузлы: бобовидные, тёмные от угольной пыли */
  const nodes = new MeshBuilder();
  const NODES: [V3, number][] = [
    [[0.0, 0.82, -0.26], 0.12], [[-0.12, 0.7, -0.3], 0.07], [[0.14, 0.7, -0.3], 0.07],
    [[-0.3, 1.42, -0.08], 0.09], [[-0.22, 1.7, -0.02], 0.07], [[0.26, 1.5, -0.1], 0.08], [[0.2, 1.8, -0.1], 0.06],
    [[-0.66, 0.5, -0.42], 0.08], [[-0.85, 0.4, -0.42], 0.065], [[-0.74, 0.12, -0.4], 0.07], [[-0.95, 0.88, -0.42], 0.06],
    [[0.78, 0.36, -0.46], 0.08], [[0.95, 0.28, -0.46], 0.065], [[0.9, 0.0, -0.4], 0.07], [[1.05, 0.8, -0.34], 0.06],
    [[-0.9, -0.3, -0.4], 0.055], [[1.06, -0.2, -0.46], 0.055],
  ];
  for (const [p, r] of NODES) {
    const ax = norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
    const a1 = anyPerp(ax);
    nodes.ellipsoid(p, [r * 1.5, r * 0.85, r * 0.95], [a1, ax, cross(a1, ax)], 12, 9);
  }
  push('lymph-nodes', 'C', 'node', nodes);

  /* нервы: блуждающие нервы и лёгочное сплетение на задней стороне ворот */
  const nerves = new MeshBuilder();
  pathTube(nerves, [[-0.3, 3.0, -0.14], [-0.28, 2.1, -0.34], [-0.3, 1.3, -0.46], [-0.55, 0.78, -0.5], [-0.72, 0.5, -0.5]], 0.024, 0.022, 7, 30);
  pathTube(nerves, [[0.3, 3.0, -0.14], [0.34, 2.1, -0.34], [0.46, 1.35, -0.5], [0.72, 0.8, -0.58], [0.85, 0.45, -0.52]], 0.024, 0.022, 7, 30);
  tree.branches.forEach((br, i) => {
    if (br.part !== 'main-bronchi' && br.part !== 'lobar-bronchi') return;
    const off = (k: number) => br.pts.map((p): V3 => [p[0] + (k - 1) * 0.02, p[1], p[2] - br.r0 - 0.012 + (k - 1) * 0.01]);
    pathTube(nerves, off(0), 0.0115, 0.01, 5, 12);
    if (i % 2 === 0) pathTube(nerves, off(2), 0.009, 0.008, 5, 12);
  });
  push('nerves', 'C', 'nerve', nerves);

  /* ворота лёгких: плевральный рукав вокруг корня */
  const hR = new MeshBuilder(), hL = new MeshBuilder();
  hR.tube(catmull([[-0.45, 0.75, -0.2], [-0.78, 0.4, -0.22], [-1.0, 0.1, -0.2]], 8), 0.36, 20, 'both', undefined, 0.8);
  hL.tube(catmull([[0.5, 0.65, -0.25], [0.82, 0.3, -0.27], [1.05, 0.0, -0.28]], 8), 0.36, 20, 'both', undefined, 0.8);
  push('hilum', 'R', 'hilum', hR);
  push('hilum', 'L', 'hilum', hL);

  push('diaphragm', 'C', 'diaphragm', diaphragmMesh());

  /* соседи */
  push('heart', 'C', 'heart', heartMesh());
  const ao = new MeshBuilder();
  pathTube(ao, AORTA_PATH, AORTA_R, AORTA_R * 0.85, 20, 60);
  for (const br of ARCH_BRANCHES) pathTube(ao, br.path, br.r, br.r * 0.9, 12, 16);
  push('aorta', 'C', 'aorta', ao);
  const es = new MeshBuilder();
  es.tube(catmull(ESOPHAGUS_PATH, 40), ESOPHAGUS_R, 16, 'both', undefined, 0.75);
  push('esophagus', 'C', 'esoph', es);
  const cv = new MeshBuilder();
  pathTube(cv, SVC_PATH, SVC_R, SVC_R * 0.85, 16, 24);
  pathTube(cv, AZYGOS_PATH, AZYGOS_R, AZYGOS_R, 8, 20);
  pathTube(cv, IVC_PATH, IVC_R, IVC_R, 16, 10);
  push('vena-cava', 'C', 'cava', cv);

  return { entities: out };
}
