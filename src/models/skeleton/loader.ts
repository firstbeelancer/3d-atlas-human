import type { SkeletonGeometry } from './bones';
import { decodeSkeleton, type EncodedSkeleton } from './transfer';

let pending: Promise<SkeletonGeometry> | null = null;

const buildHere = () => import('./bones').then((m) => m.skeletonGeometry());

function buildInWorker(): Promise<SkeletonGeometry> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<EncodedSkeleton>) => {
      worker.terminate();
      resolve(decodeSkeleton(e.data));
    };
    worker.onerror = () => {
      worker.terminate();
      // поток не поднялся (старый браузер, политика безопасности) — строим в основном потоке
      buildHere().then(resolve, reject);
    };
    worker.postMessage('build');
  });
}

/** Геометрия скелета: одна на сессию, строится в фоновом потоке, если он доступен. */
export function loadSkeletonGeometry(): Promise<SkeletonGeometry> {
  if (!pending) {
    pending = typeof Worker === 'undefined' ? buildHere() : buildInWorker();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
