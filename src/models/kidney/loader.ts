import type { Piece } from './build';
import { decode, type WorkerMessage } from './transfer';

let pending: Promise<Piece[]> | undefined;
let progress = 0;
const listeners = new Set<() => void>();

export function subscribeProgress(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getProgress() { return progress; }

function report(value: number) {
  progress = value;
  listeners.forEach((listener) => listener());
}

const buildHere = () => import('./build').then(({ buildKidney }) => buildKidney(report));

function inWorker(): Promise<Piece[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere().then(resolve, reject);
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if ('progress' in data) {
        report(data.progress);
        return;
      }
      worker.terminate();
      try {
        resolve(decode(data.pieces));
      } catch (error) {
        reject(error);
      }
    };
    worker.onerror = worker.onmessageerror = () => {
      worker.terminate();
      buildHere().then(resolve, reject);
    };
    worker.postMessage('build');
  });
}

export function loadKidney() {
  if (!pending) {
    report(0);
    pending = (typeof Worker === 'undefined' ? buildHere() : inWorker()).then((pieces) => {
      report(1);
      return pieces;
    });
    pending.catch(() => { pending = undefined; });
  }
  return pending;
}
