import { BufferAttribute, BufferGeometry } from 'three';
import type { Entity, Kind, LungGeometry } from './build';
import type { Where } from './tree';

export interface LungEntity {
  key: string;
  part: string;
  where: Where;
  kind: Kind;
  geometry: BufferGeometry;
}

let pending: Promise<LungEntity[]> | null = null;

function decode(g: LungGeometry): LungEntity[] {
  return g.entities.map((e: Entity, i) => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(e.mesh.positions, 3));
    geo.setAttribute('normal', new BufferAttribute(e.mesh.normals, 3));
    if (e.mesh.colors) geo.setAttribute('color', new BufferAttribute(e.mesh.colors, 3));
    geo.setIndex(new BufferAttribute(e.mesh.indices, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return { key: `${e.part}|${e.where}|${e.kind}|${i}`, part: e.part, where: e.where, kind: e.kind, geometry: geo };
  });
}

const buildHere = () => import('./build').then((m) => decode(m.lungsGeometry()));

function buildInWorker(): Promise<LungEntity[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<LungGeometry>) => {
      worker.terminate();
      resolve(decode(e.data));
    };
    worker.onerror = () => {
      worker.terminate();
      buildHere().then(resolve, reject);
    };
    worker.postMessage('build');
  });
}

/** Геометрия лёгких: одна на сессию, строится в фоновом потоке, если он доступен. */
export function loadLungGeometry(): Promise<LungEntity[]> {
  if (!pending) {
    pending = typeof Worker === 'undefined' ? buildHere() : buildInWorker();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
