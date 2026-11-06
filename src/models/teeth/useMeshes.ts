/**
 * Загрузка сеток из фоновых потоков с кэшем: повторный заход в раздел или переключение режима
 * не строит модель заново.
 */
import { useEffect, useState } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { jobKey, runJob, type MeshJob, type MeshResult } from './jobs';

export type GeoSet = Record<string, Record<string, BufferGeometry>>;

const cache = new Map<string, Promise<GeoSet>>();
const done = new Map<string, GeoSet>();

let pool: Worker[] | null = null;
let rr = 0;
let seq = 0;
const pending = new Map<number, (r: MeshResult | Error) => void>();

function workers(): Worker[] | null {
  if (typeof Worker === 'undefined') return null;
  if (!pool) {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    pool = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; result?: MeshResult; error?: string }>) => {
        const cb = pending.get(e.data.id);
        pending.delete(e.data.id);
        cb?.(e.data.result ?? new Error(e.data.error));
      };
      return w;
    });
  }
  return pool;
}

function toGeometry(r: MeshResult): GeoSet {
  const out: GeoSet = {};
  for (const [variant, set] of Object.entries(r)) {
    out[variant] = {};
    for (const [name, m] of Object.entries(set)) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(m.positions, 3));
      g.setAttribute('normal', new BufferAttribute(m.normals, 3));
      if (m.colors) g.setAttribute('color', new BufferAttribute(m.colors, 3));
      g.setIndex(new BufferAttribute(m.indices, 1));
      g.computeBoundingSphere();
      out[variant][name] = g;
    }
  }
  return out;
}

export function loadMeshes(job: MeshJob): Promise<GeoSet> {
  const key = jobKey(job);
  let p = cache.get(key);
  if (!p) {
    const ws = workers();
    p = new Promise<MeshResult>((resolve, reject) => {
      if (!ws) {
        // без фоновых потоков (старые браузеры) строим на месте
        setTimeout(() => {
          try {
            resolve(runJob(job));
          } catch (e) {
            reject(e as Error);
          }
        }, 0);
        return;
      }
      const id = ++seq;
      pending.set(id, (r) => (r instanceof Error ? reject(r) : resolve(r)));
      ws[rr++ % ws.length].postMessage({ id, job });
    }).then((r) => {
      const g = toGeometry(r);
      done.set(key, g);
      return g;
    });
    cache.set(key, p);
  }
  return p;
}

/** Хук: сетки по заданию или null, пока строятся. Ошибка уходит в границу ошибок сцены. */
export function useMeshes(job: MeshJob | null): GeoSet | null {
  const key = job ? jobKey(job) : '';
  const [state, setState] = useState<{ key: string; geo: GeoSet | null; err?: Error }>(() => ({ key, geo: job ? done.get(key) ?? null : null }));
  useEffect(() => {
    if (!job) return;
    const ready = done.get(key);
    if (ready) {
      setState({ key, geo: ready });
      return;
    }
    let alive = true;
    loadMeshes(job).then(
      (geo) => alive && setState({ key, geo }),
      (err: Error) => alive && setState({ key, geo: null, err }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (state.err) throw state.err;
  return state.key === key ? state.geo : (done.get(key) ?? null);
}
