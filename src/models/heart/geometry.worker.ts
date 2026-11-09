import { heartCut, heartMain } from './build';
import type { HeartEntity } from './types';
import type { CutKey } from './field';

// Сердце строится в отдельном потоке: поле, сосуды, клапаны и жир считаются несколько секунд.
self.onmessage = (e: MessageEvent<'main' | CutKey>) => {
  const entities = e.data === 'main' ? heartMain() : heartCut(e.data);
  const transfer: ArrayBuffer[] = [];
  const add = (a?: Float32Array | Uint32Array) => a && transfer.push(a.buffer as ArrayBuffer);
  for (const en of entities) {
    add(en.mesh.positions);
    add(en.mesh.normals);
    add(en.mesh.indices);
    add(en.mesh.colors);
    add(en.mesh.surf);
    add(en.morph?.positions);
    add(en.morph?.normals);
  }
  (self as unknown as Worker).postMessage(entities satisfies HeartEntity[], transfer);
};
