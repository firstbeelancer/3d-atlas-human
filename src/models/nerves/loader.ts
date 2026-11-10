import { decodeSet, type EncodedSet, type GeometrySet } from '../body/transfer';

let pending: Promise<GeometrySet> | null = null;

const buildHere = () => import('./build').then((m) => m.buildAll());

function buildInWorker(): Promise<GeometrySet> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./nerves.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<EncodedSet>) => {
      worker.terminate();
      resolve(decodeSet(e.data));
    };
    worker.onerror = () => {
      worker.terminate();
      // поток не поднялся — строим в основном потоке
      buildHere().then(resolve, reject);
    };
    worker.postMessage(null);
  });
}

/** Сетки нервной системы: одна сборка на сессию, в фоновом потоке. */
export function loadNerves(): Promise<GeometrySet> {
  if (!pending) {
    pending = typeof Worker === 'undefined' ? buildHere() : buildInWorker();
    pending.then((set) => {
      for (const g of Object.values(set)) g.computeBoundingBox();
    }, () => { pending = null; });
  }
  return pending;
}
