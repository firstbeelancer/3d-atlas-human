import { describe, expect, it } from 'vitest';
import { stomachGeometry, type StomachGeometry } from '../src/models/stomach/build';
import { decodeStomach, encodeStomach } from '../src/models/stomach/transfer';
import { BASE_C, BASE_R, DOME, LENGTH, TAU, foldH, offsets, rows, sAt, wallPoint } from '../src/models/stomach/shape';
import { CUT_WINDOW, LAYER_WINDOWS } from '../src/models/stomach/windows';
import { LAYER_IDS, PART_IDS, ZONES } from '../src/models/stomach/anatomy';

let geo: StomachGeometry;
const build = () => (geo ??= stomachGeometry());

describe('stomach shape', () => {
  it('is a J-shaped tube about eight units long with landmarks in order', () => {
    expect(LENGTH).toBeGreaterThan(7);
    expect(LENGTH).toBeLessThan(9.5);
    let prev = -1;
    for (let k = 0; k <= 13; k++) {
      const s = sAt(k);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
    expect(DOME).toBeGreaterThan(0.8);
  });

  it('keeps the wall layers nested from the serosa to the lumen everywhere', () => {
    const off = new Float64Array(7);
    for (let i = 0; i < rows().length; i += 17) {
      for (let j = 0; j < 24; j++) {
        offsets(rows()[i], (j / 24) * TAU, off);
        // косого слоя в антральном отделе нет: его толщина нулевая, остальные слои всегда имеют толщину
        for (let k = 1; k < 7; k++) expect(off[k]).toBeGreaterThanOrEqual(off[k - 1]);
        expect(off[6]).toBeGreaterThan(off[2]);
      }
    }
  });

  it('narrows to a small lumen at the pylorus and keeps the sphincter wall thick', () => {
    const off = new Float64Array(7);
    const row = rows()[Math.round((sAt(8) / LENGTH) * (rows().length - 1))];
    offsets(row, 0, off);
    const lumenRadius = row.a - off[6];
    expect(lumenRadius).toBeGreaterThan(0.03);
    expect(lumenRadius).toBeLessThan(0.18);
    const body = rows()[Math.round((sAt(2.5) / LENGTH) * (rows().length - 1))];
    expect(off[6]).toBeGreaterThan(0.15);
    expect(body.a).toBeGreaterThan(0.9);
  });

  it('has folds in the body and none in the pyloric canal', () => {
    const table = rows();
    const at = (k: number) => table[Math.round((sAt(k) / LENGTH) * (table.length - 1))];
    let body = 0;
    for (let j = 0; j < 72; j++) body = Math.max(body, foldH(at(3), (j / 72) * TAU) * at(3).amp);
    expect(body).toBeGreaterThan(0.08);
    for (let j = 0; j < 72; j++) expect(foldH(at(7.8), (j / 72) * TAU) * at(7.8).amp).toBeLessThan(0.005);
  });

  it('puts points of the cross-section on a closed finite curve', () => {
    const row = rows()[600];
    const p = wallPoint(row, 0, 0);
    const q = wallPoint(row, TAU, 0);
    for (let c = 0; c < 3; c++) {
      expect(Number.isFinite(p[c])).toBe(true);
      expect(p[c]).toBeCloseTo(q[c], 6);
    }
  });
});

describe('stomach windows', () => {
  it('nest the dissection windows from the serosa to the submucosa', () => {
    for (let k = 1; k < LAYER_WINDOWS.length; k++) {
      const a = LAYER_WINDOWS[k - 1];
      const b = LAYER_WINDOWS[k];
      expect(b.r0).toBeGreaterThan(a.r0);
      expect(b.r1).toBeLessThan(a.r1);
      expect(b.c0).toBeGreaterThan(a.c0);
      expect(b.c1).toBeLessThan(a.c1);
    }
    expect(LAYER_WINDOWS).toHaveLength(LAYER_IDS.length - 1);
  });

  it('open the front wall but stay inside the grid', () => {
    expect(CUT_WINDOW.c0).toBeGreaterThanOrEqual(0);
    expect(CUT_WINDOW.c1).toBeLessThanOrEqual(BASE_C);
    expect(CUT_WINDOW.r1).toBeLessThan(BASE_R);
    expect(CUT_WINDOW.c0 + CUT_WINDOW.c1).toBe(BASE_C / 2);
  });
});

describe('stomach geometry', () => {
  it('builds every entity with finite positions and valid indices', () => {
    const g = build();
    const ids = new Set(g.entities.map((e) => e.id));
    for (const id of [
      'wall-closed', 'wall-cut', 'lumen-cut', 'cut-window', 'layer-0', 'layer-1', 'layer-2', 'layer-3', 'layer-4',
      'layer-mucosa', 'cut-layers', 'esophagus', 'esophagus-lumen', 'esophagus-cut', 'vagus-nerves', 'gastric-veins',
      'left-gastric-artery', 'right-gastric-artery', 'gastroepiploic-arteries', 'short-gastric-arteries',
      'greater-omentum', 'lesser-omentum',
    ]) expect(ids.has(id), id).toBe(true);
    for (const e of g.entities) {
      const pos = e.geometry.attributes.position;
      expect(pos.count, e.id).toBeGreaterThan(100);
      for (let i = 0; i < pos.array.length; i += 997) expect(Number.isFinite(pos.array[i]), e.id).toBe(true);
      const idx = e.geometry.index;
      if (idx) {
        let max = 0;
        for (let i = 0; i < idx.count; i++) max = Math.max(max, idx.array[i]);
        expect(max, e.id).toBeLessThan(pos.count);
      }
    }
  });

  it('removes the front wall in the cutaway and keeps the back wall', () => {
    const g = build();
    const count = (id: string) => g.entities.find((e) => e.id === id)!.geometry.index!.count;
    expect(count('wall-cut')).toBeLessThan(count('wall-closed') * 0.8);
    expect(count('wall-cut')).toBeGreaterThan(count('wall-closed') * 0.3);
    expect(count('layer-0')).toBeLessThan(count('wall-closed'));
    expect(count('layer-4')).toBeLessThan(count('layer-0') * 1.2);
  });

  it('shares vertex buffers between the views of the same wall surface', () => {
    const g = build();
    const a = g.entities.find((e) => e.id === 'wall-closed')!.geometry;
    const b = g.entities.find((e) => e.id === 'wall-cut')!.geometry;
    expect(a.attributes.position).toBe(b.attributes.position);
    expect(a.attributes.aSV).toBeDefined();
  });

  it('keeps the model inside the camera bounds', () => {
    const g = build();
    for (const e of g.entities) {
      if (e.id.includes('omentum')) continue;
      const box = e.geometry.boundingBox!;
      expect(box.min.x, e.id).toBeGreaterThan(-3.4);
      expect(box.max.x, e.id).toBeLessThan(2.6);
      expect(box.max.y, e.id).toBeLessThan(4.1);
      expect(box.min.y, e.id).toBeGreaterThan(-3.4);
    }
  });

  it('gives anchors to labelled parts and every highlight zone is defined', () => {
    const g = build();
    for (const id of ['fundus', 'body', 'cardia', 'antrum', 'pylorus', 'duodenum', 'esophagus', 'lesser-curvature', 'greater-curvature', 'rugae', 'gastric-canal', 'pyloric-sphincter', 'mucosa', 'vagus-nerves', 'lesser-omentum', 'greater-omentum', ...LAYER_IDS.map((l) => `layer:${l}`)]) {
      expect(g.anchors[id], id).toBeDefined();
      for (const c of g.anchors[id]) expect(Number.isFinite(c)).toBe(true);
    }
    for (const id of Object.keys(ZONES)) expect(PART_IDS.includes(id), id).toBe(true);
  });

  it('survives the transfer from the worker with shared buffers', () => {
    const g = build();
    const { data, transfer } = encodeStomach(g);
    expect(new Set(transfer).size).toBe(transfer.length);
    const back = decodeStomach(data);
    expect(back.entities.map((e) => e.id)).toEqual(g.entities.map((e) => e.id));
    const closed = back.entities.find((e) => e.id === 'wall-closed')!.geometry;
    const cut = back.entities.find((e) => e.id === 'wall-cut')!.geometry;
    expect(closed.attributes.position).toBe(cut.attributes.position);
    expect(back.anchors.body).toEqual(g.anchors.body);
  });
});
