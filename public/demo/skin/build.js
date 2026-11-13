// build.js — оркестрация: поле -> сетка для каждой части. Авторский код.
import { PARTS } from './anatomy.js';
import { meshField } from './mesher.js';

export function buildAll(onProgress) {
  const out = {};
  for (let i = 0; i < PARTS.length; i++) {
    const p = PARTS[i];
    out[p.id] = meshField(p.field, p.bounds, { cell: p.cell, smooth: p.smooth });
    if (onProgress) onProgress((i + 1) / PARTS.length, p.name);
  }
  return out;
}

export { PARTS };
