import { BufferAttribute, BufferGeometry } from 'three';

/** Геометрия в виде, пригодном для передачи из фонового потока без копирования. */
export interface EncodedGeometry {
  position: Float32Array;
  normal: Float32Array | null;
  color: Float32Array | null;
  index: Uint32Array | Uint16Array | null;
}

export type GeometrySet = Record<string, BufferGeometry>;
export type EncodedSet = Record<string, EncodedGeometry>;

export function encodeSet(g: GeometrySet): { data: EncodedSet; transfer: ArrayBuffer[] } {
  const data: EncodedSet = {};
  const transfer: ArrayBuffer[] = [];
  for (const [key, geo] of Object.entries(g)) {
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const position = geo.attributes.position.array as Float32Array;
    const normal = geo.attributes.normal.array as Float32Array;
    const color = (geo.attributes.color?.array as Float32Array | undefined) ?? null;
    const index = (geo.index?.array as Uint32Array | Uint16Array | undefined) ?? null;
    data[key] = { position, normal, color, index };
    transfer.push(position.buffer as ArrayBuffer, normal.buffer as ArrayBuffer);
    if (color) transfer.push(color.buffer as ArrayBuffer);
    if (index) transfer.push(index.buffer as ArrayBuffer);
  }
  // один и тот же буфер нельзя передать дважды
  return { data, transfer: [...new Set(transfer)] };
}

export function decodeSet(e: EncodedSet): GeometrySet {
  const out: GeometrySet = {};
  for (const [key, d] of Object.entries(e)) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(d.position, 3));
    if (d.normal) g.setAttribute('normal', new BufferAttribute(d.normal, 3));
    if (d.color) g.setAttribute('color', new BufferAttribute(d.color, 3));
    if (d.index) g.setIndex(new BufferAttribute(d.index, 1));
    g.computeBoundingSphere();
    out[key] = g;
  }
  return out;
}
