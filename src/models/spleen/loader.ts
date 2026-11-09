import { buildSpleenMesh, type SpleenMeshData } from './field';

let pending: Promise<SpleenMeshData> | null = null;

const buildHere = () => Promise.resolve().then(() => buildSpleenMesh());

function buildInWorker(): Promise<SpleenMeshData> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<SpleenMeshData>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = worker.onmessageerror = () => {
      worker.terminate();
      // поток не поднялся (старый браузер, политика безопасности) — строим в основном потоке
      buildHere().then(resolve, reject);
    };
    worker.postMessage('build');
  });
}

/** Геометрия селезёнки: одна на сессию, строится в фоновом потоке, если он доступен. */
export function loadSpleenMesh(): Promise<SpleenMeshData> {
  if (!pending) {
    pending = typeof Worker === 'undefined' ? buildHere() : buildInWorker();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
