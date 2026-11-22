import { decodeSet, type EncodedSet, type GeometrySet } from '../body/transfer';
import { attachOrganicUv, type PartMeshMap } from './geoHelpers';
import type { MatKey } from './materials';

let pending: Promise<PartMeshMap> | null = null;

function unpack(set: GeometrySet): PartMeshMap {
  const out: PartMeshMap = {};
  for (const [compound, geo] of Object.entries(set)) {
    const sep = compound.indexOf('::');
    const partId = sep >= 0 ? compound.slice(0, sep) : compound;
    const mat = (sep >= 0 ? compound.slice(sep + 2) : 'thyroid') as MatKey;
    attachOrganicUv(geo, 1.8);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const list = out[partId] ?? [];
    list.push({ mat, geo });
    out[partId] = list;
  }
  return out;
}

const buildHere = (): Promise<PartMeshMap> =>
  import('./glands').then((m) => unpack(m.buildEndocrineBodySet()));

function buildInWorker(): Promise<PartMeshMap> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./endocrine.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<EncodedSet>) => {
      worker.terminate();
      resolve(unpack(decodeSet(e.data)));
    };
    worker.onerror = () => {
      worker.terminate();
      buildHere().then(resolve, reject);
    };
    worker.postMessage(null);
  });
}

/** Сетки эндокринных желёз тела: одна сборка на сессию, в фоновом потоке. */
export function loadEndocrineBody(): Promise<PartMeshMap> {
  if (!pending) {
    pending = typeof Worker === 'undefined' ? buildHere() : buildInWorker();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
