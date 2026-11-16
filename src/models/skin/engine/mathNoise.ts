import * as THREE from 'three';

/** Deterministic PRNG (Mulberry32) */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Permutation table for fast deterministic 2D/3D gradient noise
const PERM = new Uint8Array(512);
(function initPerm() {
  const rand = createSeededRandom(133742);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad2(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) !== 0 ? -u : u) + ((h & 2) !== 0 ? -2.0 * v : 2.0 * v) * 0.5;
}

function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];

  const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
  const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
  return lerp(x1, x2, v);
}

export function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const A = PERM[X] + Y;
  const AA = PERM[A] + Z;
  const AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y;
  const BA = PERM[B] + Z;
  const BB = PERM[B + 1] + Z;

  return lerp(
    lerp(
      lerp(grad3(PERM[AA], xf, yf, zf), grad3(PERM[BA], xf - 1, yf, zf), u),
      lerp(grad3(PERM[AB], xf, yf - 1, zf), grad3(PERM[BB], xf - 1, yf - 1, zf), u),
      v
    ),
    lerp(
      lerp(grad3(PERM[AA + 1], xf, yf, zf - 1), grad3(PERM[BA + 1], xf - 1, yf, zf - 1), u),
      lerp(grad3(PERM[AB + 1], xf, yf - 1, zf - 1), grad3(PERM[BB + 1], xf - 1, yf - 1, zf - 1), u),
      v
    ),
    w
  );
}

export function fbm2D(x: number, y: number, octaves = 4, lacunarity = 2.05, gain = 0.5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

export function fbm3D(
  x: number,
  y: number,
  z: number,
  octaves = 3,
  lacunarity = 2.0,
  gain = 0.5
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3D(x * freq, y * freq, z * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

function hash2(ix: number, iy: number): [number, number] {
  const h1 = PERM[(ix & 255) + PERM[iy & 255]];
  const h2 = PERM[((ix + 37) & 255) + PERM[(iy + 91) & 255]];
  return [h1 / 255, h2 / 255];
}

/**
 * Cellular Voronoi distance in 2D.
 * Returns { f1: nearest center distance, edge: f2 - f1 (0 right along cellular border!) }
 * Ideal for rhomboid/triangular skin microrelief sulci cutis and polygonal squamous cells.
 */
export function voronoi2D(x: number, y: number, jitter = 0.82): { f1: number; edge: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  let d1 = 8.0;
  let d2 = 8.0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const [hx, hy] = hash2(ix + dx, iy + dy);
      const px = dx + 0.5 + (hx - 0.5) * jitter - fx;
      const py = dy + 0.5 + (hy - 0.5) * jitter - fy;
      const d = Math.sqrt(px * px + py * py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return { f1: d1, edge: d2 - d1 };
}

export interface VariableTubeOptions {
  curve: THREE.Curve<THREE.Vector3>;
  tubularSegments: number;
  radialSegments: number;
  radiusFn: (u: number, theta: number) => number;
  capStart?: boolean;
  capEnd?: boolean;
  /** Optional vertex color along curve u in [0, 1] */
  colorFn?: (u: number) => THREE.Color;
}

/**
 * Builds an organic variable-radius 3D tube using smooth Bishop Parallel Transport frames
 * (zero twist-pinching even on tight 3D coils, spirals, and hairpin loops).
 */
export function buildVariableTubeGeometry(opts: VariableTubeOptions): THREE.BufferGeometry {
  const {
    curve,
    tubularSegments,
    radialSegments,
    radiusFn,
    capStart = true,
    capEnd = true,
    colorFn
  } = opts;

  const points: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    points.push(curve.getPointAt(u));
    tangents.push(curve.getTangentAt(u).normalize());
  }

  // Initial orthogonal normal
  const t0 = tangents[0];
  const ref = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const n0 = new THREE.Vector3().crossVectors(t0, ref).normalize();
  const b0 = new THREE.Vector3().crossVectors(t0, n0).normalize();
  normals.push(n0);
  binormals.push(b0);

  const quat = new THREE.Quaternion();
  for (let i = 1; i <= tubularSegments; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const n = normals[i - 1].clone();
    if (prevT.distanceToSquared(currT) > 1e-10) {
      quat.setFromUnitVectors(prevT, currT);
      n.applyQuaternion(quat);
    }
    // Re-orthogonalize
    n.addScaledVector(currT, -n.dot(currT)).normalize();
    const b = new THREE.Vector3().crossVectors(currT, n).normalize();
    normals.push(n);
    binormals.push(b);
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const ringStride = radialSegments + 1;

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const p = points[i];
    const n = normals[i];
    const b = binormals[i];
    const c = colorFn ? colorFn(u) : null;

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const theta = v * Math.PI * 2;
      const r = Math.max(0.0005, radiusFn(u, theta));
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      const vx = p.x + r * (cos * n.x + sin * b.x);
      const vy = p.y + r * (cos * n.y + sin * b.y);
      const vz = p.z + r * (cos * n.z + sin * b.z);

      positions.push(vx, vy, vz);
      uvs.push(u * 6.0, v);
      if (c) {
        colors.push(c.r, c.g, c.b);
      }
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  if (capStart) {
    const centerIdx = positions.length / 3;
    const p0 = points[0];
    positions.push(p0.x, p0.y, p0.z);
    uvs.push(0, 0.5);
    if (colorFn) {
      const c = colorFn(0);
      colors.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < radialSegments; j++) {
      indices.push(centerIdx, j + 1, j);
    }
  }

  if (capEnd) {
    const centerIdx = positions.length / 3;
    const pEnd = points[tubularSegments];
    positions.push(pEnd.x, pEnd.y, pEnd.z);
    uvs.push(1, 0.5);
    if (colorFn) {
      const c = colorFn(1);
      colors.push(c.r, c.g, c.b);
    }
    const base = tubularSegments * ringStride;
    for (let j = 0; j < radialSegments; j++) {
      indices.push(centerIdx, base + j, base + j + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colors.length > 0) {
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Merges multiple BufferGeometries into a single BufferGeometry (preserving position, normal, uv, and optional color).
 */
export function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;
  const hasColor = geometries.some((g) => !!g.getAttribute('color'));

  const prepared = geometries.map((orig) => {
    const g = orig;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    totalVerts += pos.count;
    const idx = g.getIndex();
    totalIndices += idx ? idx.count : pos.count;
    return g;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
  const indices = new Uint32Array(totalIndices);

  let vertOffset = 0;
  let idxOffset = 0;

  for (const g of prepared) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const col = g.getAttribute('color');
    const count = pos.count;

    positions.set(pos.array as Float32Array, vertOffset * 3);
    if (norm) {
      normals.set(norm.array as Float32Array, vertOffset * 3);
    }
    if (uv) {
      uvs.set(uv.array as Float32Array, vertOffset * 2);
    }
    if (colors) {
      if (col) {
        colors.set(col.array as Float32Array, vertOffset * 3);
      } else {
        colors.fill(1, vertOffset * 3, (vertOffset + count) * 3);
      }
    }

    const idx = g.getIndex();
    if (idx) {
      const arr = idx.array;
      for (let i = 0; i < idx.count; i++) {
        indices[idxOffset + i] = arr[i] + vertOffset;
      }
      idxOffset += idx.count;
    } else {
      for (let i = 0; i < count; i++) {
        indices[idxOffset + i] = vertOffset + i;
      }
      idxOffset += count;
    }

    vertOffset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colors) {
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}
