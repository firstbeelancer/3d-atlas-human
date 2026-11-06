import { skeletonGeometry } from './bones';
import { encodeSkeleton } from './transfer';

// Кости строятся в отдельном потоке, чтобы страница не замирала, пока считаются поля расстояний.
self.onmessage = () => {
  const { data, transfer } = encodeSkeleton(skeletonGeometry());
  (self as unknown as Worker).postMessage(data, transfer);
};
