import type { StomachGeometry } from './build';
import { decodeStomach, type EncodedStomach } from './transfer';

let pending: Promise<StomachGeometry> | null = null;

const buildHere = () => import('./build').then((m) => m.stomachGeometry());

function buildInWorker(): Promise<StomachGeometry> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<EncodedStomach>) => {
      worker.terminate();
      resolve(decodeStomach(e.data));
    };
    worker.onerror = () => {
      worker.terminate();
      // поток не поднялся (старый браузер, политика безопасности) — строим в основном потоке
      buildHere().then(resolve, reject);
    };
    worker.postMessage('build');
  });
}

/** Геометрия желудка: одна на сессию, строится в фоновом потоке, если он доступен. */
export function loadStomachGeometry(): Promise<StomachGeometry> {
  if (!pending) {
    pending = typeof Worker === 'undefined' ? buildHere() : buildInWorker();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
