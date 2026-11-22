import { encodeSet } from '../body/transfer';
import { buildEndocrineBodySet } from './glands';

/** Фоновый поток: строит высокодетализированные сетки всех эндокринных желёз без блокировки UI. */
self.onmessage = () => {
  const { data, transfer } = encodeSet(buildEndocrineBodySet());
  (self as unknown as Worker).postMessage(data, transfer);
};
