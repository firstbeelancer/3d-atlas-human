/**
 * Загрузка уха: задания уходят в пул фоновых потоков, результат кэшируется на сессию.
 * Из сеток раковины, кости и воздушных пространств собираются геометрии частей на общих буферах вершин.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { AIR_REGIONS, AURICLE_REGIONS, BONE_REGIONS, allJobs, jobKey, runJob, type EarJob, type EarMesh } from './jobs';

export interface EarData {
  skin: Record<string, BufferGeometry>;
  cartilage: BufferGeometry;
  bone: Record<string, BufferGeometry>;
  air: Record<string, BufferGeometry>;
  malleus: BufferGeometry;
  incus: BufferGeometry;
  stapes: BufferGeometry;
}

const listeners = new Set<() => void>();
let progress = { done: 0, total: 1 };
export function getProgress() {
  return progress;
}
export function subscribeProgress(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setProgress(done: number, total: number) {
  progress = { done, total };
  listeners.forEach((l) => l());
}

function runAll(jobs: EarJob[]): Promise<Map<string, EarMesh>> {
  const out = new Map<string, EarMesh>();
  setProgress(0, jobs.length);
  if (typeof Worker === 'undefined') {
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (i >= jobs.length) return resolve(out);
        out.set(jobKey(jobs[i]), runJob(jobs[i]));
        i++;
        setProgress(i, jobs.length);
        setTimeout(step, 0);
      };
      step();
    });
  }
  return new Promise((resolve, reject) => {
    const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    const queue = [...jobs];
    let done = 0;
    const workers: Worker[] = [];
    const fail = (e: unknown) => {
      workers.forEach((w) => w.terminate());
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    const feed = (w: Worker) => {
      const job = queue.shift();
      if (!job) {
        w.terminate();
        return;
      }
      const id = jobs.indexOf(job);
      w.onmessage = (e: MessageEvent<{ id: number; result?: EarMesh; error?: string }>) => {
        if (e.data.error || !e.data.result) return fail(new Error(e.data.error));
        out.set(jobKey(job), e.data.result);
        done++;
        setProgress(done, jobs.length);
        if (done === jobs.length) {
          workers.forEach((x) => x.terminate());
          resolve(out);
        } else feed(w);
      };
      w.postMessage({ id, job });
    };
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./ear.worker.ts', import.meta.url), { type: 'module' });
      w.onerror = fail;
      workers.push(w);
      feed(w);
    }
  });
}

function baseGeometry(m: EarMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new BufferAttribute(m.normals, 3));
  if (m.colors) g.setAttribute('color', new BufferAttribute(m.colors, 3));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Геометрия из части треугольников исходной сетки: вершинные буферы общие, индексы свои. */
function subset(base: BufferGeometry, m: EarMesh, keep: (t: number) => boolean): BufferGeometry | null {
  const nt = m.indices.length / 3;
  const idx: number[] = [];
  for (let t = 0; t < nt; t++) if (keep(t)) idx.push(m.indices[t * 3], m.indices[t * 3 + 1], m.indices[t * 3 + 2]);
  if (!idx.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('normal', base.getAttribute('normal'));
  const c = base.getAttribute('color');
  if (c) g.setAttribute('color', c);
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.boundingSphere = base.boundingSphere;
  return g;
}

function regions(m: EarMesh, names: readonly string[]): Record<string, BufferGeometry> {
  const base = baseGeometry(m);
  const out: Record<string, BufferGeometry> = {};
  names.forEach((id, i) => {
    const g = subset(base, m, (t) => m.tri![t] === i);
    if (g) out[id] = g;
  });
  return out;
}

function assemble(res: Map<string, EarMesh>): EarData {
  const get = (k: string) => res.get(k)!;
  return {
    skin: regions(get('auricle'), AURICLE_REGIONS),
    cartilage: baseGeometry(get('cartilage')),
    bone: regions(get('bone'), BONE_REGIONS),
    air: regions(get('air'), AIR_REGIONS),
    malleus: baseGeometry(get('malleus')),
    incus: baseGeometry(get('incus')),
    stapes: baseGeometry(get('stapes')),
  };
}

let pending: Promise<EarData> | null = null;

/** Ухо строится один раз за сессию; q > 1 — грубее (для слабых устройств). */
export function loadEar(): Promise<EarData> {
  if (!pending) {
    const q = typeof window !== 'undefined' && window.innerWidth < 640 ? 1.35 : 1;
    pending = runAll(allJobs(q)).then(assemble);
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
