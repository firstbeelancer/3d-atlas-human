/** Задания на построение сеток: одни и те же функции работают в фоновом потоке и в тестах. */
import { SPECS } from './anatomy';
import { buildArchTooth, buildGum } from './arch';
import { buildTooth } from './build';
import { buildJaw } from './jaw';
import type { MeshData } from './surfaceNets';

export type MeshJob =
  | { type: 'tooth'; spec: string; step: number; yaw: number; cutZ: number }
  | { type: 'jaw'; step: number }
  | { type: 'archTooth'; spec: string; step: number }
  | { type: 'gum'; jaw: 'upper' | 'lower'; step: number };

/** Результат: именованные наборы сеток (full/cut -> слой -> сетка) или одна сетка. */
export type MeshResult = Record<string, Record<string, MeshData & { colors?: Float32Array }>>;

export function jobKey(job: MeshJob): string {
  return JSON.stringify(job);
}

export function runJob(job: MeshJob): MeshResult {
  switch (job.type) {
    case 'tooth':
      return buildTooth(SPECS[job.spec], { step: job.step, yaw: job.yaw, cutZ: job.cutZ }) as unknown as MeshResult;
    case 'jaw':
      return buildJaw(job.step) as unknown as MeshResult;
    case 'archTooth':
      return { full: { outer: buildArchTooth(SPECS[job.spec], job.step) } };
    case 'gum':
      return { full: { gingiva: buildGum(job.jaw, job.step) } };
  }
}

export function transferables(r: MeshResult): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const set of Object.values(r))
    for (const m of Object.values(set)) {
      out.push(m.positions.buffer as ArrayBuffer, m.normals.buffer as ArrayBuffer, m.indices.buffer as ArrayBuffer);
      if (m.colors) out.push(m.colors.buffer as ArrayBuffer);
    }
  return out;
}
