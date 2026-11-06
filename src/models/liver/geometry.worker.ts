import { liverGeometry } from './build';
import { encodeLiver } from './transfer';

// Печень строится в отдельном потоке, чтобы страница не замирала, пока считаются поля расстояний.
self.onmessage = () => {
  const { data, transfer } = encodeLiver(liverGeometry());
  (self as unknown as Worker).postMessage(data, transfer);
};
