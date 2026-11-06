import { decodeSet, type EncodedSet, type GeometrySet } from './transfer';
import type { BodyPart } from './build';

const pending = new Map<BodyPart, Promise<GeometrySet>>();

const buildHere = (part: BodyPart) => import('./build').then((m) => m.buildPart(part));

function buildInWorker(part: BodyPart): Promise<GeometrySet> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./body.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere(part).then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<EncodedSet>) => {
      worker.terminate();
      resolve(decodeSet(e.data));
    };
    worker.onerror = () => {
      worker.terminate();
      // поток не поднялся (старый браузер, политика безопасности) — строим в основном потоке
      buildHere(part).then(resolve, reject);
    };
    worker.postMessage(part);
  });
}

/** Сетки части тела: одна на сессию; строятся параллельно в отдельных потоках. */
export function loadBodyPart(part: BodyPart): Promise<GeometrySet> {
  let p = pending.get(part);
  if (!p) {
    p = typeof Worker === 'undefined' ? buildHere(part) : buildInWorker(part);
    p.catch(() => pending.delete(part));
    pending.set(part, p);
  }
  return p;
}
