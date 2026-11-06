import { BufferAttribute, BufferGeometry } from 'three';
import type { Entity, EntityKind, LiverGeometry } from './build';
import type { Vec } from './anatomy';

interface EncodedEntity {
  id: string;
  kind: EntityKind;
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array | null;
  index: Uint32Array | null;
}

export interface EncodedLiver {
  entities: EncodedEntity[];
  anchors: Record<string, Vec>;
}

export function encodeLiver(g: LiverGeometry): { data: EncodedLiver; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = [];
  const entities = g.entities.map((e): EncodedEntity => {
    const position = e.geometry.attributes.position.array as Float32Array;
    const normal = e.geometry.attributes.normal.array as Float32Array;
    const color = (e.geometry.attributes.color?.array as Float32Array | undefined) ?? null;
    const index = (e.geometry.index?.array as Uint32Array | undefined) ?? null;
    transfer.push(position.buffer as ArrayBuffer, normal.buffer as ArrayBuffer);
    if (color) transfer.push(color.buffer as ArrayBuffer);
    if (index) transfer.push(index.buffer as ArrayBuffer);
    return { id: e.id, kind: e.kind, position, normal, color, index };
  });
  return { data: { entities, anchors: g.anchors }, transfer };
}

export function decodeLiver(d: EncodedLiver): LiverGeometry {
  const entities = d.entities.map((e): Entity => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(e.position, 3));
    g.setAttribute('normal', new BufferAttribute(e.normal, 3));
    if (e.color) g.setAttribute('color', new BufferAttribute(e.color, 3));
    if (e.index) g.setIndex(new BufferAttribute(e.index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return { id: e.id, kind: e.kind, geometry: g };
  });
  return { entities, anchors: d.anchors };
}
