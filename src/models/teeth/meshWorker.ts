/// <reference lib="webworker" />
/** Фоновый поток: строит сетки зубов, чтобы страница не замирала. */
import { runJob, transferables, type MeshJob } from './jobs';

self.onmessage = (e: MessageEvent<{ id: number; job: MeshJob }>) => {
  const { id, job } = e.data;
  try {
    const result = runJob(job);
    (self as unknown as Worker).postMessage({ id, result }, transferables(result));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
