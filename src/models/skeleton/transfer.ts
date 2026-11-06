import { BufferAttribute, BufferGeometry } from 'three';
import type { SkeletonGeometry } from './bones';

export interface EncodedGeometry {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array | null;
  index: Uint32Array | Uint16Array | null;
}

export type EncodedSkeleton = Record<keyof SkeletonGeometry, EncodedGeometry>;

export function encodeSkeleton(g: SkeletonGeometry): { data: EncodedSkeleton; transfer: ArrayBuffer[] } {
  const data = {} as EncodedSkeleton;
  const transfer: ArrayBuffer[] = [];
  for (const [key, geo] of Object.entries(g) as [keyof SkeletonGeometry, BufferGeometry][]) {
    const position = geo.attributes.position.array as Float32Array;
    const normal = geo.attributes.normal.array as Float32Array;
    const index = (geo.index?.array as Uint32Array | Uint16Array | undefined) ?? null;
    const color = (geo.attributes.color?.array as Float32Array | undefined) ?? null;
    data[key] = { position, normal, color, index };
    transfer.push(position.buffer as ArrayBuffer, normal.buffer as ArrayBuffer);
    if (color) transfer.push(color.buffer as ArrayBuffer);
    if (index) transfer.push(index.buffer as ArrayBuffer);
  }
  return { data, transfer };
}

export function decodeSkeleton(data: EncodedSkeleton): SkeletonGeometry {
  const out = {} as SkeletonGeometry;
  for (const [key, e] of Object.entries(data) as [keyof SkeletonGeometry, EncodedGeometry][]) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(e.position, 3));
    g.setAttribute('normal', new BufferAttribute(e.normal, 3));
    if (e.color) g.setAttribute('color', new BufferAttribute(e.color, 3));
    if (e.index) g.setIndex(new BufferAttribute(e.index, 1));
    g.computeBoundingSphere();
    out[key] = g;
  }
  return out;
}
