/// <reference lib="webworker" />
/** Фоновый поток: строит сетки уха, чтобы страница не замирала. */
import { runJob, transferables, type EarJob } from './jobs';

self.onmessage = (e: MessageEvent<{ id: number; job: EarJob }>) => {
  const { id, job } = e.data;
  try {
    const result = runJob(job);
    (self as unknown as Worker).postMessage({ id, result }, transferables(result));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
