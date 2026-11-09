import { buildGlandMesh, glandTransferables } from './field';

// Железа строится в отдельном потоке: на сетке из полутора миллионов узлов поле считается пару секунд.
self.onmessage = () => {
  const data = buildGlandMesh();
  (self as unknown as Worker).postMessage(data, glandTransferables(data));
};
