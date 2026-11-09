import { BufferAttribute, BufferGeometry } from 'three';
import type { CutKey } from './field';
import type { Anim, HeartEntity, Kind, Variant } from './types';

export interface HeartPiece {
  key: string;
  part: string;
  kind: Kind;
  variant: Variant;
  anim?: Anim;
  geometry: BufferGeometry;
}

function decode(list: HeartEntity[], prefix: string): HeartPiece[] {
  return list.map((e, i) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(e.mesh.positions, 3));
    g.setAttribute('normal', new BufferAttribute(e.mesh.normals, 3));
    if (e.mesh.colors) g.setAttribute('color', new BufferAttribute(e.mesh.colors, 3));
    if (e.mesh.surf) g.setAttribute('aSurf', new BufferAttribute(e.mesh.surf, 1));
    g.setIndex(new BufferAttribute(e.mesh.indices, 1));
    if (e.morph) {
      // открытое положение — цель морфинга; значения относительные
      const base = e.mesh.positions;
      const delta = new Float32Array(base.length);
      for (let k = 0; k < base.length; k++) delta[k] = e.morph.positions[k] - base[k];
      const ndelta = new Float32Array(base.length);
      for (let k = 0; k < base.length; k++) ndelta[k] = e.morph.normals[k] - e.mesh.normals[k];
      g.morphAttributes.position = [new BufferAttribute(delta, 3)];
      g.morphAttributes.normal = [new BufferAttribute(ndelta, 3)];
      g.morphTargetsRelative = true;
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return { key: `${prefix}|${e.part}|${e.kind}|${i}`, part: e.part, kind: e.kind, variant: e.variant, anim: e.anim, geometry: g };
  });
}

type Job = 'main' | CutKey;

const buildHere = (job: Job) =>
  import('./build').then((m) => (job === 'main' ? m.heartMain() : m.heartCut(job)));

function runInWorker(job: Job): Promise<HeartEntity[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere(job).then(resolve, reject);
      return;
    }
    worker.onmessage = (e: MessageEvent<HeartEntity[]>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      buildHere(job).then(resolve, reject);
    };
    worker.postMessage(job);
  });
}

const pending = new Map<Job, Promise<HeartPiece[]>>();

function load(job: Job): Promise<HeartPiece[]> {
  let p = pending.get(job);
  if (!p) {
    p = (typeof Worker === 'undefined' ? buildHere(job) : runInWorker(job)).then((list) => decode(list, job));
    p.catch(() => pending.delete(job));
    pending.set(job, p);
  }
  return p;
}

/** Целое сердце и все внутренние структуры: одно на сессию. */
export const loadHeart = () => load('main');
/** Стенка с вырезом (строится по требованию и запоминается). */
export const loadHeartCut = (kind: CutKey) => load(kind);
