// selftest.mjs — самопроверка геометрии демо (запускается в CI: node selftest.mjs).
import { PARTS } from './anatomy.js';
import { meshField, signedVolume } from './mesher.js';

let fail = 0;
let totalTris = 0;
const t0 = Date.now();
for (const p of PARTS) {
  const m = meshField(p.field, p.bounds, { cell: p.cell, smooth: p.smooth });
  const n = m.positions.length / 3;
  const tris = m.indices.length / 3;
  totalTris += tris;
  let finite = true;
  for (let i = 0; i < m.positions.length; i++) if (!Number.isFinite(m.positions[i])) finite = false;
  for (let i = 0; i < m.normals.length; i++) if (!Number.isFinite(m.normals[i])) finite = false;
  let inRange = true;
  for (let i = 0; i < m.indices.length; i++) if (m.indices[i] < 0 || m.indices[i] >= n) inRange = false;
  const vol = signedVolume(m.positions, m.indices);
  // замкнутость: каждое неориентированное ребро встречается ровно дважды
  const edges = new Map();
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i], b = m.indices[i + 1], c = m.indices[i + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? u * n + v : v * n + u;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let badEdges = 0;
  for (const cnt of edges.values()) if (cnt !== 2) badEdges++;
  const ok = finite && inRange && tris > 20 && vol > 0 && badEdges === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${p.id.padEnd(14)} v=${String(n).padStart(6)} t=${String(tris).padStart(6)} vol=${vol.toFixed(2).padStart(9)} badEdges=${badEdges}`);
}
console.log(`\nParts: ${PARTS.length}, total triangles: ${totalTris}, time: ${((Date.now() - t0) / 1000).toFixed(1)}s, failures: ${fail}`);
if (fail > 0) { console.error('SELFTEST FAILED'); process.exit(1); }
console.log('SELFTEST PASSED');
