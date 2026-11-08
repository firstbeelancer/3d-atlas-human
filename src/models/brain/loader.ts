/**
 * Загрузка мозга: задания уходят в пул фоновых потоков, результат кэшируется на сессию.
 * Из сеток кортекса собираются геометрии долей и зон на общих буферах вершин.
 */
import { BufferAttribute, BufferGeometry, Data3DTexture, LinearFilter, RGBAFormat, UnsignedByteType, ClampToEdgeWrapping } from 'three';
import { allJobs, jobKey, runJob, type BrainJob, type BrainMesh, type BrainResult, type Volume } from './jobs';
import { LOBES, ZONE_BITS } from './field';

export interface BrainData {
  /** Доли: по две геометрии (правая и левая стороны). */
  lobes: Record<string, { side: 1 | -1; geo: BufferGeometry }[]>;
  zones: Record<string, { side: 1 | -1; geo: BufferGeometry }[]>;
  /** Целая кора каждой стороны (для подложки «белого вещества» при разнесении). */
  cortex: { side: 1 | -1; geo: BufferGeometry }[];
  cerebellum: BufferGeometry;
  vermis: BufferGeometry;
  stem: Record<string, BufferGeometry>;
  structs: Record<string, BufferGeometry>;
  shells: Record<string, BufferGeometry>;
  volC: Data3DTexture;
  volB: Data3DTexture;
  volInfo: { c: Volume; b: Volume };
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

function runAll(jobs: BrainJob[]): Promise<Map<string, BrainResult>> {
  const out = new Map<string, BrainResult>();
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
      w.onmessage = (e: MessageEvent<{ id: number; result?: BrainResult; error?: string }>) => {
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
      const w = new Worker(new URL('./brain.worker.ts', import.meta.url), { type: 'module' });
      w.onerror = fail;
      workers.push(w);
      feed(w);
    }
  });
}

function baseGeometry(m: BrainMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new BufferAttribute(m.normals, 3));
  if (m.colors) g.setAttribute('color', new BufferAttribute(m.colors, 3));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Геометрия из части треугольников исходной сетки: вершинные буферы общие, индексы свои. */
function subset(base: BufferGeometry, m: BrainMesh, keep: (t: number) => boolean): BufferGeometry | null {
  const nt = m.indices.length / 3;
  const idx: number[] = [];
  for (let t = 0; t < nt; t++)
    if (keep(t)) idx.push(m.indices[t * 3], m.indices[t * 3 + 1], m.indices[t * 3 + 2]);
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

function texture(v: Volume): Data3DTexture {
  const t = new Data3DTexture(v.data, v.dims[0], v.dims[1], v.dims[2]);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

function assemble(res: Map<string, BrainResult>): BrainData {
  const get = (k: string) => res.get(k)!;
  const lobes: BrainData['lobes'] = {};
  const zones: BrainData['zones'] = {};
  const cortex: BrainData['cortex'] = [];
  for (const side of [1, -1] as const) {
    const m = get(`hemi:${side}`).mesh!;
    const base = baseGeometry(m);
    cortex.push({ side, geo: base });
    LOBES.forEach((id, li) => {
      const g = subset(base, m, (t) => m.tri![t] === li);
      if (g) (lobes[id] ??= []).push({ side, geo: g });
    });
    ZONE_BITS.forEach((id, bi) => {
      const g = subset(base, m, (t) => (m.zone![t] & (1 << bi)) !== 0);
      if (g) (zones[id] ??= []).push({ side, geo: g });
    });
  }
  const cm = get('cerebellum').mesh!;
  const cb = baseGeometry(cm);
  const vermis = subset(cb, cm, (t) => (cm.zone![t] & 1) !== 0) ?? cb;
  const sm = get('stem').mesh!;
  const sb = baseGeometry(sm);
  const stem: Record<string, BufferGeometry> = {};
  ['midbrain', 'pons', 'medulla', 'spinal-cord', 'tectum'].forEach((id, i) => {
    const g = subset(sb, sm, (t) => sm.tri![t] === i);
    if (g) stem[id] = g;
  });
  const structs: Record<string, BufferGeometry> = {};
  for (const [k, r] of res) if (k.startsWith('struct:')) structs[k.slice(7)] = baseGeometry(r.mesh!);
  const shells = { arachnoid: baseGeometry(get('shell:arachnoid').mesh!), dura: baseGeometry(get('shell:dura').mesh!) };
  const c = get('volC').vol!;
  const b = get('volB').vol!;
  return { lobes, zones, cortex, cerebellum: cb, vermis, stem, structs, shells, volC: texture(c), volB: texture(b), volInfo: { c, b } };
}

let pending: Promise<BrainData> | null = null;

/** Мозг строится один раз за сессию; q > 1 — грубее (для слабых устройств). */
export function loadBrain(): Promise<BrainData> {
  if (!pending) {
    const q = typeof window !== 'undefined' && window.innerWidth < 640 ? 1.35 : 1;
    pending = runAll(allJobs(q)).then(assemble);
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
