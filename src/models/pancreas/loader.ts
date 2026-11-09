import type { GlandMeshData } from './field';

let pending: Promise<GlandMeshData> | null = null;

const buildHere = () => import('./field').then((m) => m.buildGlandMesh());

function buildInWorker(): Promise<GlandMeshData> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<GlandMeshData>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      // поток не поднялся (старый браузер, политика безопасности) — строим в основном потоке
      buildHere().then(resolve, reject);
    };
    worker.postMessage('build');
  });
}

/** Геометрия железы: одна на сессию, строится в фоновом потоке, если он доступен. */
export function loadGlandMesh(): Promise<GlandMeshData> {
  if (!pending) {
    pending = typeof Worker === 'undefined' ? buildHere() : buildInWorker();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
