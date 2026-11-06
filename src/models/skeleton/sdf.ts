import { BufferAttribute, BufferGeometry } from 'three';

/*
  Маленький набор функций расстояния со знаком (SDF) и сетка «поверхностные сети» (surface nets).
  Кость описывается как плавное объединение капсул, эллипсоидов и скруглённых коробок,
  а из поля строится гладкая поверхность. Так получаются органические формы с отверстиями
  (глазницы, запирательное отверстие таза), которых не собрать из простых примитивов.
*/

export type V3 = [number, number, number];
export type Sdf = (x: number, y: number, z: number) => number;

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function sphere(c: V3, r: number): Sdf {
  return (x, y, z) => len3(x - c[0], y - c[1], z - c[2]) - r;
}

/** Эллипсоид (приближённое расстояние, достаточно для сетки). */
export function ellipsoid(c: V3, r: V3): Sdf {
  return (x, y, z) => {
    const px = (x - c[0]) / r[0];
    const py = (y - c[1]) / r[1];
    const pz = (z - c[2]) / r[2];
    const k0 = len3(px, py, pz);
    const k1 = len3(px / r[0], py / r[1], pz / r[2]);
    // внутри формула iq стремится к нулю в центре — берём простую оценку по меньшей полуоси
    if (k0 < 1) return (k0 - 1) * Math.min(r[0], r[1], r[2]);
    return (k0 * (k0 - 1)) / k1;
  };
}

/** Капсула с разными радиусами на концах (скруглённый конус). */
export function capsule(a: V3, b: V3, ra: number, rb = ra): Sdf {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - a[0];
    const pay = y - a[1];
    const paz = z - a[2];
    const h = clamp((pax * bax + pay * bay + paz * baz) / l2, 0, 1);
    const r = ra + (rb - ra) * h;
    return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  };
}

/** Капсула с эллиптическим сечением: сжата по оси, перпендикулярной отрезку. */
export function flatCapsule(a: V3, b: V3, ra: number, rb: number, squash: V3): Sdf {
  // squash — множители по осям x,y,z, на которые делится координата (1 — без изменений)
  const base = capsule(
    [a[0] / squash[0], a[1] / squash[1], a[2] / squash[2]],
    [b[0] / squash[0], b[1] / squash[1], b[2] / squash[2]],
    ra,
    rb,
  );
  const k = Math.min(squash[0], squash[1], squash[2]);
  return (x, y, z) => base(x / squash[0], y / squash[1], z / squash[2]) * k;
}

export function roundBox(c: V3, half: V3, r: number): Sdf {
  return (x, y, z) => {
    const qx = Math.abs(x - c[0]) - half[0] + r;
    const qy = Math.abs(y - c[1]) - half[1] + r;
    const qz = Math.abs(z - c[2]) - half[2] + r;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    return len3(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

/** Тор в плоскости xz вокруг оси y (кольцо). */
export function torus(c: V3, R: number, r: number): Sdf {
  return (x, y, z) => {
    const qx = Math.sqrt((x - c[0]) ** 2 + (z - c[2]) ** 2) - R;
    return Math.sqrt(qx * qx + (y - c[1]) ** 2) - r;
  };
}

const dot = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => ax * bx + ay * by + az * bz;

/** Тонкая пластинка-треугольник толщиной 2r — для плоских костей: лопатки, крыла подвздошной кости. */
export function triangle(a: V3, b: V3, c: V3, r: number): Sdf {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as V3;
  const cb = [c[0] - b[0], c[1] - b[1], c[2] - b[2]] as V3;
  const ac = [a[0] - c[0], a[1] - c[1], a[2] - c[2]] as V3;
  // нормаль = ba x ac
  const nx = ba[1] * ac[2] - ba[2] * ac[1];
  const ny = ba[2] * ac[0] - ba[0] * ac[2];
  const nz = ba[0] * ac[1] - ba[1] * ac[0];
  const cr = (u: V3) => [u[1] * nz - u[2] * ny, u[2] * nx - u[0] * nz, u[0] * ny - u[1] * nx] as V3;
  const e1 = cr(ba);
  const e2 = cr(cb);
  const e3 = cr(ac);
  const nn = nx * nx + ny * ny + nz * nz;
  const seg = (u: V3, px: number, py: number, pz: number) => {
    const h = clamp(dot(u[0], u[1], u[2], px, py, pz) / dot(u[0], u[1], u[2], u[0], u[1], u[2]), 0, 1);
    const dx = u[0] * h - px;
    const dy = u[1] * h - py;
    const dz = u[2] * h - pz;
    return dx * dx + dy * dy + dz * dz;
  };
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const pbx = x - b[0], pby = y - b[1], pbz = z - b[2];
    const pcx = x - c[0], pcy = y - c[1], pcz = z - c[2];
    const s =
      Math.sign(dot(e1[0], e1[1], e1[2], pax, pay, paz)) +
      Math.sign(dot(e2[0], e2[1], e2[2], pbx, pby, pbz)) +
      Math.sign(dot(e3[0], e3[1], e3[2], pcx, pcy, pcz));
    let d2: number;
    if (s < 2) d2 = Math.min(seg(ba, pax, pay, paz), seg(cb, pbx, pby, pbz), seg(ac, pcx, pcy, pcz));
    else {
      const dn = dot(nx, ny, nz, pax, pay, paz);
      d2 = (dn * dn) / nn;
    }
    return Math.sqrt(d2) - r;
  };
}

/** Изогнутая пластинка между двумя ломаными (нижний и верхний край) одинаковой длины. */
export function strip(lower: V3[], upper: V3[], r: number): Sdf {
  const tris: Sdf[] = [];
  for (let i = 0; i < lower.length - 1; i++) {
    tris.push(triangle(lower[i], lower[i + 1], upper[i], r));
    tris.push(triangle(lower[i + 1], upper[i + 1], upper[i], r));
  }
  return union(...tris);
}

/** Поворот формы вокруг оси x на угол a относительно точки c. */
export function rotateX(f: Sdf, a: number, c: V3): Sdf {
  const cs = Math.cos(-a);
  const sn = Math.sin(-a);
  return (x, y, z) => {
    const py = y - c[1];
    const pz = z - c[2];
    return f(x, c[1] + py * cs - pz * sn, c[2] + py * sn + pz * cs);
  };
}

/** Цепочка капсул по точкам (для изогнутых отростков и дуг). */
export function chain(points: V3[], radii: number[] | number): Sdf {
  const rs = typeof radii === 'number' ? points.map(() => radii) : radii;
  const parts: Sdf[] = [];
  for (let i = 0; i < points.length - 1; i++) parts.push(capsule(points[i], points[i + 1], rs[i], rs[i + 1]));
  return union(...parts);
}

/**
 * Ускорение: пока точка дальше margin от коробки [min,max], возвращаем расстояние до коробки
 * (нижнюю оценку) и не считаем сложную форму внутри.
 */
export function bounded(f: Sdf, min: V3, max: V3, margin = 0.15): Sdf {
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const hx = (max[0] - min[0]) / 2;
  const hy = (max[1] - min[1]) / 2;
  const hz = (max[2] - min[2]) / 2;
  return (x, y, z) => {
    const qx = Math.max(Math.abs(x - cx) - hx, 0);
    const qy = Math.max(Math.abs(y - cy) - hy, 0);
    const qz = Math.max(Math.abs(z - cz) - hz, 0);
    const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return d > margin ? d : f(x, y, z);
  };
}

export function union(...fs: Sdf[]): Sdf {
  return (x, y, z) => {
    let d = Infinity;
    for (const f of fs) {
      const v = f(x, y, z);
      if (v < d) d = v;
    }
    return d;
  };
}

/** Плавное объединение: формы перетекают одна в другую, как настоящая кость. */
export function smooth(k: number, ...fs: Sdf[]): Sdf {
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) {
      const b = fs[i](x, y, z);
      const h = clamp(0.5 + (0.5 * (b - d)) / k, 0, 1);
      d = b + (d - b) * h - k * h * (1 - h);
    }
    return d;
  };
}

export function subtract(base: Sdf, ...cuts: Sdf[]): Sdf {
  return (x, y, z) => {
    let d = base(x, y, z);
    for (const c of cuts) d = Math.max(d, -c(x, y, z));
    return d;
  };
}

export function smoothSubtract(k: number, base: Sdf, ...cuts: Sdf[]): Sdf {
  return (x, y, z) => {
    let d = base(x, y, z);
    for (const c of cuts) {
      const b = -c(x, y, z);
      const h = clamp(0.5 - (0.5 * (d - b)) / k, 0, 1);
      d = d + (b - d) * h + k * h * (1 - h);
    }
    return d;
  };
}

export function intersect(a: Sdf, b: Sdf): Sdf {
  return (x, y, z) => Math.max(a(x, y, z), b(x, y, z));
}

/** Зеркальная пара относительно плоскости x = 0 (для симметричных частей черепа и таза). */
export function mirrorX(f: Sdf): Sdf {
  return (x, y, z) => f(Math.abs(x), y, z);
}

export interface MeshOptions {
  min: V3;
  max: V3;
  /** Размер ячейки сетки (в единицах модели). */
  cell: number;
  /**
   * Затенение углублений (ambient occlusion), запечённое в цвет вершин: глазницы, носовое отверстие,
   * щели между зубами и запирательное отверстие становятся темнее и читаются без текстур.
   * Значение — шаг пробы вдоль нормали.
   */
  ao?: number;
}

/**
 * «Поверхностные сети»: по одной вершине на ячейку, пересечённую поверхностью,
 * четырёхугольник на каждое ребро со сменой знака. Нормали — по градиенту поля.
 */
export function meshSdf(f: Sdf, { min, max, cell, ao }: MeshOptions): BufferGeometry {
  const nx = Math.max(2, Math.ceil((max[0] - min[0]) / cell));
  const ny = Math.max(2, Math.ceil((max[1] - min[1]) / cell));
  const nz = Math.max(2, Math.ceil((max[2] - min[2]) / cell));
  const sx = nx + 1;
  const sy = ny + 1;
  const field = new Float32Array(sx * sy * (nz + 1)).fill(NaN);
  const exact = new Uint8Array(field.length);
  // Узкая полоса: сначала грубая сетка с шагом S, точно считаем поле только в блоках рядом с поверхностью.
  const S = 4;
  const cx = Math.ceil(nx / S);
  const cy = Math.ceil(ny / S);
  const cz = Math.ceil(nz / S);
  const half = S * cell * 0.5;
  const reach = S * cell * 0.866 * 1.6;
  for (let bk = 0; bk < cz; bk++) {
    for (let bj = 0; bj < cy; bj++) {
      for (let bi = 0; bi < cx; bi++) {
        const centre = f(min[0] + bi * S * cell + half, min[1] + bj * S * cell + half, min[2] + bk * S * cell + half);
        const far = Math.abs(centre) > reach;
        const sgn = centre;
        const k1 = Math.min(nz, (bk + 1) * S);
        const j1 = Math.min(ny, (bj + 1) * S);
        const i1 = Math.min(nx, (bi + 1) * S);
        for (let k = bk * S; k <= k1; k++) {
          const z = min[2] + k * cell;
          for (let j = bj * S; j <= j1; j++) {
            const y = min[1] + j * cell;
            const row = (k * sy + j) * sx;
            for (let i = bi * S; i <= i1; i++) {
              const id = row + i;
              if (!far) {
                if (!exact[id]) {
                  field[id] = f(min[0] + i * cell, y, z);
                  exact[id] = 1;
                }
              } else if (Number.isNaN(field[id])) field[id] = sgn;
            }
          }
        }
      }
    }
  }
  const at = (i: number, j: number, k: number) => field[(k * sy + j) * sx + i];

  const vertIndex = new Int32Array(nx * ny * nz).fill(-1);
  const positions: number[] = [];
  const grads: number[] = [];
  const corner = new Float32Array(8);
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const offs = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = at(i + offs[c][0], j + offs[c][1], k + offs[c][2]);
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let px = 0;
        let py = 0;
        let pz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          const va = corner[a];
          const vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          px += offs[a][0] + (offs[b][0] - offs[a][0]) * t;
          py += offs[a][1] + (offs[b][1] - offs[a][1]) * t;
          pz += offs[a][2] + (offs[b][2] - offs[a][2]) * t;
          n++;
        }
        vertIndex[(k * ny + j) * nx + i] = positions.length / 3;
        const u = px / n;
        const w = py / n;
        const q = pz / n;
        positions.push(min[0] + (i + u) * cell, min[1] + (j + w) * cell, min[2] + (k + q) * cell);
        // градиент поля внутри ячейки (по 8 углам) — гладкая нормаль без лишних вычислений поля
        const gx =
          (corner[1] - corner[0]) * (1 - w) * (1 - q) + (corner[3] - corner[2]) * w * (1 - q) +
          (corner[5] - corner[4]) * (1 - w) * q + (corner[7] - corner[6]) * w * q;
        const gy =
          (corner[2] - corner[0]) * (1 - u) * (1 - q) + (corner[3] - corner[1]) * u * (1 - q) +
          (corner[6] - corner[4]) * (1 - u) * q + (corner[7] - corner[5]) * u * q;
        const gz =
          (corner[4] - corner[0]) * (1 - u) * (1 - w) + (corner[5] - corner[1]) * u * (1 - w) +
          (corner[6] - corner[2]) * (1 - u) * w + (corner[7] - corner[3]) * u * w;
        const gl = len3(gx, gy, gz) || 1;
        grads.push(gx / gl, gy / gl, gz / gl);
      }
    }
  }

  const idx = (i: number, j: number, k: number) => vertIndex[(k * ny + j) * nx + i];
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };

  for (let k = 1; k < nz; k++) {
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // ребро вдоль x между (i,j,k) и (i+1,j,k)
        const a = at(i, j, k) < 0;
        if (a === at(i + 1, j, k) < 0) continue;
        quad(idx(i, j - 1, k - 1), idx(i, j, k - 1), idx(i, j, k), idx(i, j - 1, k), !a);
      }
    }
  }
  for (let k = 1; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const a = at(i, j, k) < 0;
        if (a === at(i, j + 1, k) < 0) continue;
        quad(idx(i - 1, j, k - 1), idx(i - 1, j, k), idx(i, j, k), idx(i, j, k - 1), !a);
      }
    }
  }
  for (let k = 0; k < nz; k++) {
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const a = at(i, j, k) < 0;
        if (a === at(i, j, k + 1) < 0) continue;
        quad(idx(i - 1, j - 1, k), idx(i, j - 1, k), idx(i, j, k), idx(i - 1, j, k), !a);
      }
    }
  }

  const pos = new Float32Array(positions);
  const normals = new Float32Array(grads);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setIndex(indices);
  if (ao) {
    const colors = new Float32Array(pos.length);
    for (let v = 0; v < pos.length; v += 3) {
      let occ = 0;
      let w = 0.5;
      for (let i = 1; i <= 5; i++) {
        const d = i * ao;
        const fx = pos[v] + normals[v] * d;
        const fy = pos[v + 1] + normals[v + 1] * d;
        const fz = pos[v + 2] + normals[v + 2] * d;
        occ += (d - Math.max(0, f(fx, fy, fz))) * w;
        w *= 0.5;
      }
      const shade = Math.max(0, Math.min(1, 1 - (occ / ao) * 1.5));
      const c = 0.3 + 0.7 * shade;
      colors[v] = c;
      colors[v + 1] = c;
      colors[v + 2] = c;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
  }
  g.computeBoundingSphere();
  return g;
}
