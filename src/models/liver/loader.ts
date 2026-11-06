import type { LiverGeometry } from './build';
import { decodeLiver, type EncodedLiver } from './transfer';

let pending: Promise<LiverGeometry> | null = null;

const buildHere = () => import('./build').then((m) => m.liverGeometry());

function buildInWorker(): Promise<LiverGeometry> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<EncodedLiver>) => {
      worker.terminate();
      resolve(decodeLiver(e.data));
    };
    worker.onerror = () => {
      worker.terminate();
      // поток не поднялся (старый браузер, политика безопасности) — строим в основном потоке
      buildHere().then(resolve, reject);
    };
    worker.postMessage('build');
  });
}

/** Геометрия печени: одна на сессию, строится в фоновом потоке, если он доступен. */
export function loadLiverGeometry(): Promise<LiverGeometry> {
  if (!pending) {
    pending = typeof Worker === 'undefined' ? buildHere() : buildInWorker();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
