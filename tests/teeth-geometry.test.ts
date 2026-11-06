import { describe, expect, it } from 'vitest';
import { LOWER, SHOWCASE, SPECS, UPPER, makeToothField } from '../src/models/teeth/anatomy';
import { buildTooth, TOOTH_LAYERS } from '../src/models/teeth/build';
import { archLayout, buildArchTooth } from '../src/models/teeth/arch';
import { SHOWCASE_POSES, TYPES } from '../src/models/teeth/parts';
import { surfaceNets, type Grid } from '../src/models/teeth/surfaceNets';

describe('surface nets', () => {
  it('meshes a sphere into a closed surface with outward normals', () => {
    const h = 0.05;
    const g: Grid = { x0: -1.2, y0: -1.2, z0: -1.2, h, nx: 49, ny: 49, nz: 49 };
    const f = new Float32Array(g.nx * g.ny * g.nz);
    let p = 0;
    for (let k = 0; k < g.nz; k++)
      for (let j = 0; j < g.ny; j++)
        for (let i = 0; i < g.nx; i++, p++) f[p] = Math.hypot(g.x0 + i * h, g.y0 + j * h, g.z0 + k * h) - 1;
    const m = surfaceNets(g, f);
    expect(m.indices.length).toBeGreaterThan(3000);
    // каждое ребро встречается ровно в двух треугольниках — поверхность замкнута
    const edges = new Map<string, number>();
    for (let i = 0; i < m.indices.length; i += 3)
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const u = m.indices[i + a];
        const v = m.indices[i + b];
        const key = u < v ? `${u}-${v}` : `${v}-${u}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    expect([...edges.values()].every((c) => c === 2)).toBe(true);
    // нормали смотрят наружу и точки лежат на сфере
    for (let i = 0; i < m.positions.length; i += 3) {
      const r = Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]);
      expect(Math.abs(r - 1)).toBeLessThan(0.02);
      const dot = (m.positions[i] * m.normals[i] + m.positions[i + 1] * m.normals[i + 1] + m.positions[i + 2] * m.normals[i + 2]) / r;
      expect(dot).toBeGreaterThan(0.9);
    }
    // обход треугольников согласован с нормалями (лицевая сторона наружу)
    const [a, b, c] = [m.indices[0] * 3, m.indices[1] * 3, m.indices[2] * 3];
    const P = m.positions;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    expect(n[0] * P[a] + n[1] * P[a + 1] + n[2] * P[a + 2]).toBeGreaterThan(0);
  });
});

describe('tooth anatomy fields', () => {
  it('has 8 teeth per half-jaw and the textbook root counts', () => {
    expect(UPPER).toHaveLength(8);
    expect(LOWER).toHaveLength(8);
    expect(SPECS['u-i1'].roots).toHaveLength(1);
    expect(SPECS['u-c'].roots).toHaveLength(1);
    expect(SPECS['u-p1'].roots).toHaveLength(2);
    expect(SPECS['u-m1'].roots).toHaveLength(3);
    expect(SPECS['l-m1'].roots).toHaveLength(2);
    expect(SPECS['l-p1'].roots).toHaveLength(1);
  });

  it('the canine has the longest root and the molar the widest crown', () => {
    const rootLen = (id: string) => Math.max(...SPECS[id].roots.map((r) => r.len));
    for (const s of UPPER) expect(rootLen('u-c')).toBeGreaterThanOrEqual(rootLen(s.id));
    expect(SPECS['u-m1'].md.max).toBeGreaterThan(SPECS['u-p1'].md.max);
  });

  it('is inside at the crown and the root apex, outside around the tooth', () => {
    for (const s of Object.values(SPECS)) {
      const f = makeToothField(s);
      expect(f.outer(0, s.h * 0.5, 0), s.id).toBeLessThan(0);
      const r = s.roots[0];
      expect(f.outer(r.sx + (r.ax - r.sx) * 0.5, -r.len * 0.5, r.sz + (r.az - r.sz) * 0.5), s.id).toBeLessThan(0);
      expect(f.outer(0, s.h + 0.2, 0), s.id).toBeGreaterThan(0);
      expect(f.outer(0, -r.len - 0.3, 0), s.id).toBeGreaterThan(0);
      expect(f.outer(1.5, 0, 0), s.id).toBeGreaterThan(0);
      // эмаль у шейки тонкая, на буграх толще
      expect(f.shell(0, s.h, 0)).toBeGreaterThan(f.shell(s.md.cerv, 0.01, 0));
    }
  });
});

describe('tooth meshes', () => {
  it('builds every tissue layer of the showcase teeth, whole and cut', () => {
    for (const kind of TYPES) {
      const pose = SHOWCASE_POSES[kind];
      const b = buildTooth(SHOWCASE[kind], { step: 0.03, yaw: pose.yaw, cutZ: pose.cutZ });
      for (const variant of ['full', 'cut'] as const)
        for (const layer of TOOTH_LAYERS) {
          const m = b[variant][layer];
          expect(m, `${kind} ${variant} ${layer}`).toBeDefined();
          expect(m!.indices.length).toBeGreaterThan(30);
          for (const v of m!.positions) expect(Number.isFinite(v)).toBe(true);
        }
      // в разрезе ничего не выходит за плоскость сечения
      for (const layer of TOOTH_LAYERS) {
        const pos = b.cut[layer]!.positions;
        for (let i = 2; i < pos.length; i += 3) expect(pos[i]).toBeLessThan(pose.cutZ + 0.035);
      }
      expect(b.full.enamel!.colors!.length).toBe(b.full.enamel!.positions.length);
    }
  });

  it('places 32 teeth in the dental arches, mirrored left and right', () => {
    const lay = archLayout();
    expect(lay).toHaveLength(32);
    expect(lay.filter((p) => p.jaw === 'upper')).toHaveLength(16);
    for (const p of lay.filter((q) => q.side === 1)) {
      const twin = lay.find((q) => q.side === -1 && q.specId === p.specId)!;
      expect(twin.pos[0]).toBeCloseTo(-p.pos[0]);
    }
    const m = buildArchTooth(SPECS['l-m1'], 0.04);
    expect(m.indices.length).toBeGreaterThan(300);
  });
});
