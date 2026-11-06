import { stomachGeometry } from './build';
import { encodeStomach } from './transfer';

// Желудок строится в отдельном потоке, чтобы страница не замирала, пока считаются слои, складки и сосуды.
self.onmessage = () => {
  const { data, transfer } = encodeStomach(stomachGeometry());
  (self as unknown as Worker).postMessage(data, transfer);
};
