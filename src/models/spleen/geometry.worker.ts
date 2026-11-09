import { buildSpleenMesh, spleenTransferables } from './field';

// Селезёнка строится в отдельном потоке: на сетке из полутора миллионов узлов поле считается пару секунд.
self.onmessage = () => {
  const data = buildSpleenMesh();
  (self as unknown as Worker).postMessage(data, spleenTransferables(data));
};
