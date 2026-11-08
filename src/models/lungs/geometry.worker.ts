import { lungsGeometry } from './build';

// Лёгкие строятся в отдельном потоке: поля, дерево бронхов и сосуды считаются несколько секунд.
self.onmessage = () => {
  const g = lungsGeometry();
  const transfer: ArrayBuffer[] = [];
  for (const e of g.entities) {
    transfer.push(e.mesh.positions.buffer as ArrayBuffer, e.mesh.normals.buffer as ArrayBuffer, e.mesh.indices.buffer as ArrayBuffer);
    if (e.mesh.colors) transfer.push(e.mesh.colors.buffer as ArrayBuffer);
  }
  (self as unknown as Worker).postMessage(g, transfer);
};
