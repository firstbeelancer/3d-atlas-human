import { encodeSet } from '../body/transfer';
import { buildAll } from './build';

/** Фоновый поток: строит мозг и все нервные трубки, не блокируя страницу. */
self.onmessage = () => {
  const { data, transfer } = encodeSet(buildAll());
  (self as unknown as Worker).postMessage(data, transfer);
};
