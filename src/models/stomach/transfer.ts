import { BufferAttribute, BufferGeometry } from 'three';
import type { Entity, EntityKind, StomachGeometry } from './build';
import type { Vec } from './anatomy';

/*
  Передача геометрии из фонового потока. Разные части стенки используют одни и те же буферы вершин
  (меняется только индексный буфер), поэтому каждый буфер передаётся один раз, а части ссылаются на него по номеру.
*/

interface EncodedBuffer {
  array: Float32Array;
  itemSize: number;
}

interface EncodedEntity {
  id: string;
  kind: EntityKind;
  attributes: Record<string, number>;
  index: Uint32Array | null;
}

export interface EncodedStomach {
  buffers: EncodedBuffer[];
  entities: EncodedEntity[];
  anchors: Record<string, Vec>;
}

export function encodeStomach(g: StomachGeometry): { data: EncodedStomach; transfer: ArrayBuffer[] } {
  const buffers: EncodedBuffer[] = [];
  const seen = new Map<BufferAttribute, number>();
  const transfer: ArrayBuffer[] = [];
  const entities = g.entities.map((e): EncodedEntity => {
    const attributes: Record<string, number> = {};
    for (const [name, attr] of Object.entries(e.geometry.attributes)) {
      const a = attr as BufferAttribute;
      let id = seen.get(a);
      if (id === undefined) {
        id = buffers.length;
        seen.set(a, id);
        buffers.push({ array: a.array as Float32Array, itemSize: a.itemSize });
        transfer.push((a.array as Float32Array).buffer as ArrayBuffer);
      }
      attributes[name] = id;
    }
    const index = (e.geometry.index?.array as Uint32Array | undefined) ?? null;
    if (index) transfer.push(index.buffer as ArrayBuffer);
    return { id: e.id, kind: e.kind, attributes, index };
  });
  return { data: { buffers, entities, anchors: g.anchors }, transfer };
}

export function decodeStomach(d: EncodedStomach): StomachGeometry {
  const attrs = d.buffers.map((b) => new BufferAttribute(b.array, b.itemSize));
  const entities = d.entities.map((e): Entity => {
    const g = new BufferGeometry();
    for (const [name, id] of Object.entries(e.attributes)) g.setAttribute(name, attrs[id]);
    if (e.index) g.setIndex(new BufferAttribute(e.index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return { id: e.id, kind: e.kind, geometry: g };
  });
  return { entities, anchors: d.anchors };
}
