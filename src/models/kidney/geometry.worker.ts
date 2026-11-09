import { buildKidney } from './build';
import { encode, type WorkerMessage } from './transfer';

self.onmessage = () => {
  const worker = self as unknown as Worker;
  const pieces = buildKidney((progress) => worker.postMessage({ progress } satisfies WorkerMessage));
  const { payload, buffers } = encode(pieces);
  worker.postMessage({ pieces: payload } satisfies WorkerMessage, buffers);
};
