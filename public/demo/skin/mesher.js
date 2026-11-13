// mesher.js — авторский мезер: marching tetrahedra + сварка вершин + сглаживание Таубина.
// Написано с нуля. Куб делится на 6 тетраэдров вдоль главной диагонали (согласованно между
// ячейками, поэтому швов нет). Ориентация треугольников — по градиенту линейной интерполянтa
// внутри тетраэдра (без дополнительных выборок поля).

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const TETS = [
  [0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7],
  [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7],
];

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Градиент линейной функции, заданной значениями в 4 вершинах тетраэдра. */
function tetGrad(pa, pb, pc, pd, fa, fb, fc, fd) {
  const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
  const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
  const e3 = [pd[0] - pa[0], pd[1] - pa[1], pd[2] - pa[2]];
  const c1 = cross(e2, e3), c2 = cross(e3, e1), c3 = cross(e1, e2);
  const det = e1[0] * c1[0] + e1[1] * c1[1] + e1[2] * c1[2];
  if (Math.abs(det) < 1e-12) return [0, 1, 0];
  const d1 = fb - fa, d2 = fc - fa, d3 = fd - fa;
  return [
    (d1 * c1[0] + d2 * c2[0] + d3 * c3[0]) / det,
    (d1 * c1[1] + d2 * c2[1] + d3 * c3[1]) / det,
    (d1 * c1[2] + d2 * c2[2] + d3 * c3[2]) / det,
  ];
}

export function meshField(field, bounds, opts = {}) {
  const cell = opts.cell ?? 0.25;
  const [mn, mx] = bounds;
  const nx = Math.max(2, Math.round((mx[0] - mn[0]) / cell));
  const ny = Math.max(2, Math.round((mx[1] - mn[1]) / cell));
  const nz = Math.max(2, Math.round((mx[2] - mn[2]) / cell));
  const gx = nx + 1, gy = ny + 1, gz = nz + 1;
  const sx = (mx[0] - mn[0]) / nx, sy = (mx[1] - mn[1]) / ny, sz = (mx[2] - mn[2]) / nz;
  const NN = gx * gy * gz;
  const node = (i, j, k) => (i * gy + j) * gz + k;
  const vals = new Float32Array(NN);
  for (let i = 0; i < gx; i++)
    for (let j = 0; j < gy; j++)
      for (let k = 0; k < gz; k++)
        vals[node(i, j, k)] = field(mn[0] + i * sx, mn[1] + j * sy, mn[2] + k * sz);

  const verts = [];
  const vmap = new Map();
  const tris = [];

  function edgeVert(n1, n2, p1, p2, f1, f2) {
    const key = n1 < n2 ? n1 * NN + n2 : n2 * NN + n1;
    let vi = vmap.get(key);
    if (vi === undefined) {
      const t = f1 / (f1 - f2);
      vi = verts.length / 3;
      verts.push(p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t, p1[2] + (p2[2] - p1[2]) * t);
      vmap.set(key, vi);
    }
    return vi;
  }

  const cp = new Array(8), cn = new Array(8), cv = new Array(8);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        for (let c = 0; c < 8; c++) {
          const o = CORNERS[c];
          const ii = i + o[0], jj = j + o[1], kk = k + o[2];
          cn[c] = node(ii, jj, kk);
          cv[c] = vals[cn[c]];
          cp[c] = [mn[0] + ii * sx, mn[1] + jj * sy, mn[2] + kk * sz];
        }
        // быстрый пропуск целиком пустых/полных ячеек
        let allIn = true, allOut = true;
        for (let c = 0; c < 8; c++) { if (cv[c] < 0) allOut = false; else allIn = false; }
        if (allIn || allOut) continue;

        for (const tet of TETS) {
          const ia = tet[0], ib = tet[1], ic = tet[2], id = tet[3];
          const fa = cv[ia], fb = cv[ib], fc = cv[ic], fd = cv[id];
          const inA = fa < 0, inB = fb < 0, inC = fc < 0, inD = fd < 0;
          const n = (inA ? 1 : 0) + (inB ? 1 : 0) + (inC ? 1 : 0) + (inD ? 1 : 0);
          if (n === 0 || n === 4) continue;

          const pa = cp[ia], pb = cp[ib], pc = cp[ic], pd = cp[id];
          const na = cn[ia], nb = cn[ib], nc = cn[ic], nd = cn[id];
          const g = tetGrad(pa, pb, pc, pd, fa, fb, fc, fd);

          const emit = (v0, v1, v2) => {
            const ax = verts[v0 * 3], ay = verts[v0 * 3 + 1], az = verts[v0 * 3 + 2];
            const ux = verts[v1 * 3] - ax, uy = verts[v1 * 3 + 1] - ay, uz = verts[v1 * 3 + 2] - az;
            const wx = verts[v2 * 3] - ax, wy = verts[v2 * 3 + 1] - ay, wz = verts[v2 * 3 + 2] - az;
            const nx2 = uy * wz - uz * wy, ny2 = uz * wx - ux * wz, nz2 = ux * wy - uy * wx;
            if (nx2 * g[0] + ny2 * g[1] + nz2 * g[2] < 0) tris.push(v0, v2, v1);
            else tris.push(v0, v1, v2);
          };

          if (n === 1 || n === 3) {
            // одна вершина отделена от трёх
            let solo, o1, o2, o3, fs, f1, f2, f3, ns, n1, n2, n3, ps, p1, p2, p3;
            if (inA !== inB && inA !== inC && inA !== inD) { solo = 0; }
            else if (inB !== inA && inB !== inC && inB !== inD) { solo = 1; }
            else if (inC !== inA && inC !== inB && inC !== inD) { solo = 2; }
            else { solo = 3; }
            const P = [pa, pb, pc, pd], F = [fa, fb, fc, fd], N = [na, nb, nc, nd];
            const others = [0, 1, 2, 3].filter((q) => q !== solo);
            ps = P[solo]; fs = F[solo]; ns = N[solo];
            p1 = P[others[0]]; f1 = F[others[0]]; n1 = N[others[0]];
            p2 = P[others[1]]; f2 = F[others[1]]; n2 = N[others[1]];
            p3 = P[others[2]]; f3 = F[others[2]]; n3 = N[others[2]];
            const v1 = edgeVert(ns, n1, ps, p1, fs, f1);
            const v2 = edgeVert(ns, n2, ps, p2, fs, f2);
            const v3 = edgeVert(ns, n3, ps, p3, fs, f3);
            emit(v1, v2, v3);
          } else {
            // n === 2: две внутри, две снаружи — четырёхугольник
            const P = [pa, pb, pc, pd], F = [fa, fb, fc, fd], N = [na, nb, nc, nd], IN = [inA, inB, inC, inD];
            const ins = [0, 1, 2, 3].filter((q) => IN[q]);
            const outs = [0, 1, 2, 3].filter((q) => !IN[q]);
            const A = ins[0], B = ins[1], C = outs[0], D = outs[1];
            const vAC = edgeVert(N[A], N[C], P[A], P[C], F[A], F[C]);
            const vAD = edgeVert(N[A], N[D], P[A], P[D], F[A], F[D]);
            const vBD = edgeVert(N[B], N[D], P[B], P[D], F[B], F[D]);
            const vBC = edgeVert(N[B], N[C], P[B], P[C], F[B], F[C]);
            emit(vAC, vAD, vBD);
            emit(vAC, vBD, vBC);
          }
        }
      }
    }
  }

  let positions = new Float32Array(verts);
  let indices = new Uint32Array(tris);
  if (opts.smooth !== 0) positions = taubin(positions, indices, opts.smooth ?? 4);
  const normals = computeNormals(positions, indices);
  return { positions, normals, indices };
}

/** Сглаживание Таубина (λ/μ) — не усаживает объём. */
export function taubin(pos, idx, iterations = 4, lambda = 0.5, mu = -0.53) {
  const n = pos.length / 3;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
  }
  const uniq = adj.map((list) => [...new Set(list)]);
  let p = pos;
  for (let it = 0; it < iterations; it++) {
    const w = it % 2 === 0 ? lambda : mu;
    const q = new Float32Array(p.length);
    for (let i = 0; i < n; i++) {
      const nb = uniq[i];
      if (!nb.length) { q[i * 3] = p[i * 3]; q[i * 3 + 1] = p[i * 3 + 1]; q[i * 3 + 2] = p[i * 3 + 2]; continue; }
      let ax = 0, ay = 0, az = 0;
      for (const j of nb) { ax += p[j * 3]; ay += p[j * 3 + 1]; az += p[j * 3 + 2]; }
      ax /= nb.length; ay /= nb.length; az /= nb.length;
      q[i * 3] = p[i * 3] + w * (ax - p[i * 3]);
      q[i * 3 + 1] = p[i * 3 + 1] + w * (ay - p[i * 3 + 1]);
      q[i * 3 + 2] = p[i * 3 + 2] + w * (az - p[i * 3 + 2]);
    }
    p = q;
  }
  return p;
}

export function computeNormals(pos, idx) {
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    nor[a] += nx; nor[a + 1] += ny; nor[a + 2] += nz;
    nor[b] += nx; nor[b + 1] += ny; nor[b + 2] += nz;
    nor[c] += nx; nor[c + 1] += ny; nor[c + 2] += nz;
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  return nor;
}

/** Знаковый объём замкнутой сетки (для самотестирования). */
export function signedVolume(pos, idx) {
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}
