/**
 * Surface Nets: превращает поле расстояний на регулярной сетке в гладкую замкнутую сетку треугольников.
 * Одна вершина на ячейку, через которую проходит поверхность (среднее точек пересечения рёбер),
 * нормали — градиент поля, поэтому изгибы выглядят гладкими даже без сглаживания сетки.
 */

export interface Grid {
  x0: number;
  y0: number;
  z0: number;
  h: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** Рёбра куба: пары номеров углов (угол c = dx + 2*dy + 4*dz). */
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function gridIndex(g: Grid, i: number, j: number, k: number): number {
  return i + g.nx * (j + g.ny * k);
}

export function surfaceNets(g: Grid, field: Float32Array, iso = 0): MeshData {
  const { nx, ny, nz, h, x0, y0, z0 } = g;
  const sx = 1;
  const sy = nx;
  const sz = nx * ny;
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const nrm: number[] = [];
  const corner = new Float64Array(8);
  const offs = [0, sx, sy, sx + sy, sz, sx + sz, sy + sz, sx + sy + sz];

  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const base = i + sy * j + sz * k;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = field[base + offs[c]] - iso;
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let n = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a];
          const vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          ax += (a & 1) + ((b & 1) - (a & 1)) * t;
          ay += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          az += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cellVert[base] = pos.length / 3;
        pos.push(x0 + (i + ax / n) * h, y0 + (j + ay / n) * h, z0 + (k + az / n) * h);
        // градиент поля внутри ячейки: среднее разностей по четырём параллельным рёбрам
        let gx = corner[1] - corner[0] + corner[3] - corner[2] + corner[5] - corner[4] + corner[7] - corner[6];
        let gy = corner[2] - corner[0] + corner[3] - corner[1] + corner[6] - corner[4] + corner[7] - corner[5];
        let gz = corner[4] - corner[0] + corner[5] - corner[1] + corner[6] - corner[2] + corner[7] - corner[3];
        const l = Math.hypot(gx, gy, gz) || 1;
        gx /= l;
        gy /= l;
        gz /= l;
        nrm.push(gx, gy, gz);
      }

  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const base = i + sy * j + sz * k;
        const inside = field[base] - iso < 0;
        // ребро вдоль x
        if (i < nx - 1 && inside !== field[base + sx] - iso < 0)
          quad(cellVert[base], cellVert[base - sy], cellVert[base - sy - sz], cellVert[base - sz], !inside);
        // ребро вдоль y
        if (j < ny - 1 && inside !== field[base + sy] - iso < 0)
          quad(cellVert[base], cellVert[base - sz], cellVert[base - sx - sz], cellVert[base - sx], !inside);
        // ребро вдоль z
        if (k < nz - 1 && inside !== field[base + sz] - iso < 0)
          quad(cellVert[base], cellVert[base - sx], cellVert[base - sx - sy], cellVert[base - sy], !inside);
      }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint32Array(idx) };
}

/**
 * Сглаживание Таубина (шаг к соседям и шаг назад): убирает «лесенку» сетки, не сжимая форму.
 * Нормали тоже усредняются по соседям, чтобы блики ложились ровно.
 */
export function smoothMesh(m: MeshData, iterations = 2): MeshData {
  const n = m.positions.length / 3;
  if (n === 0) return m;
  const deg = new Uint32Array(n + 1);
  const idx = m.indices;
  for (let i = 0; i < idx.length; i += 3) {
    deg[idx[i]] += 2;
    deg[idx[i + 1]] += 2;
    deg[idx[i + 2]] += 2;
  }
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, n);
  const nb = new Uint32Array(start[n]);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    nb[fill[a]++] = b;
    nb[fill[a]++] = c;
    nb[fill[b]++] = a;
    nb[fill[b]++] = c;
    nb[fill[c]++] = a;
    nb[fill[c]++] = b;
  }
  const pass = (src: Float32Array, factor: number, normalize: boolean): Float32Array => {
    const out = new Float32Array(src.length);
    for (let v = 0; v < n; v++) {
      const s = start[v];
      const e = start[v + 1];
      let x = 0;
      let y = 0;
      let z = 0;
      for (let q = s; q < e; q++) {
        const u = nb[q] * 3;
        x += src[u];
        y += src[u + 1];
        z += src[u + 2];
      }
      const k = e - s || 1;
      const o = v * 3;
      let ox = src[o] + factor * (x / k - src[o]);
      let oy = src[o + 1] + factor * (y / k - src[o + 1]);
      let oz = src[o + 2] + factor * (z / k - src[o + 2]);
      if (normalize) {
        const l = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
        ox /= l;
        oy /= l;
        oz /= l;
      }
      out[o] = ox;
      out[o + 1] = oy;
      out[o + 2] = oz;
    }
    return out;
  };
  let p = m.positions;
  let nr = m.normals;
  for (let i = 0; i < iterations; i++) {
    p = pass(p, 0.5, false);
    p = pass(p, -0.53, false);
    nr = pass(nr, 0.6, true);
  }
  return { positions: p, normals: nr, indices: m.indices };
}
