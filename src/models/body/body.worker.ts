import { encodeSet } from './transfer';
import { buildPart, type BodyPart } from './build';

/** Фоновый поток: строит тяжёлые сетки тела (кожа, скелет, органы), не блокируя страницу. */
self.onmessage = (e: MessageEvent<BodyPart>) => {
  const { data, transfer } = encodeSet(buildPart(e.data));
  (self as unknown as Worker).postMessage(data, transfer);
};
