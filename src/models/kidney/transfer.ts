import { BufferAttribute, BufferGeometry } from 'three';
import type { Piece } from './build';
import type { EncodedGeometry } from '../skeleton/transfer';

export type EncodedPiece = Omit<Piece, 'geometry'> & {
  positions: EncodedGeometry['position'];
  normals: EncodedGeometry['normal'];
  colors: Float32Array;
  indices: EncodedGeometry['index'];
};

export type WorkerMessage = { progress: number } | { pieces: EncodedPiece[] };

export function encode(pieces: Piece[]) {
  const buffers: ArrayBuffer[] = [];
  const payload = pieces.map(({ geometry, ...piece }): EncodedPiece => {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal.array as Float32Array;
    const colors = geometry.attributes.color.array as Float32Array;
    const indices = geometry.index?.array as EncodedPiece['indices'];
    for (const array of [positions, normals, colors, indices]) {
      if (array) buffers.push(array.buffer as ArrayBuffer);
    }
    return { ...piece, positions, normals, colors, indices };
  });
  return { payload, buffers };
}

export function decode(pieces: EncodedPiece[]): Piece[] {
  return pieces.map(({ positions, normals, colors, indices, ...piece }) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    if (indices) geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    return { ...piece, geometry };
  });
}
