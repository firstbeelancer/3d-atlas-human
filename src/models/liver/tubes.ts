import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import type { Vec } from './anatomy';

/** Копит много трубок и листов в одну геометрию — один вызов отрисовки на часть. */
export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private idx: number[] = [];

  private ring(centre: Vector3, normalsFrom: Vector3, n: Vector3, b: Vector3, r: number, radial: number): number {
    const start = this.pos.length / 3;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const dx = Math.cos(a) * n.x + Math.sin(a) * b.x;
      const dy = Math.cos(a) * n.y + Math.sin(a) * b.y;
      const dz = Math.cos(a) * n.z + Math.sin(a) * b.z;
      const px = centre.x + dx * r;
      const py = centre.y + dy * r;
      const pz = centre.z + dz * r;
      this.pos.push(px, py, pz);
      const nx = px - normalsFrom.x;
      const ny = py - normalsFrom.y;
      const nz = pz - normalsFrom.z;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.nor.push(nx / l, ny / l, nz / l);
    }
    return start;
  }

  /** Трубка вдоль сглаженной кривой с плавным сужением и закруглёнными концами. */
  tube(points: Vec[], r0: number, r1 = r0, opts: { radial?: number; wobble?: (t: number) => number } = {}): void {
    const curve = new CatmullRomCurve3(
      points.map((p) => new Vector3(...p)),
      false,
      'centripetal',
    );
    const length = curve.getLength();
    const n = Math.max(6, Math.ceil(length * 16));
    const radial = opts.radial ?? (Math.max(r0, r1) > 0.12 ? 22 : Math.max(r0, r1) > 0.045 ? 14 : 9);
    const frames = curve.computeFrenetFrames(n, false);
    const rings: number[] = [];
    const radiusAt = (t: number) => (r0 + (r1 - r0) * t) * (opts.wobble ? opts.wobble(t) : 1);
    const caps = [60, 30];
    const p0 = curve.getPointAt(0);
    const p1 = curve.getPointAt(1);
    const t0 = curve.getTangentAt(0);
    const t1 = curve.getTangentAt(1);
    for (const deg of caps) {
      const a = (deg * Math.PI) / 180;
      const c = p0.clone().addScaledVector(t0, -radiusAt(0) * Math.sin(a));
      rings.push(this.ring(c, p0, frames.normals[0], frames.binormals[0], radiusAt(0) * Math.cos(a), radial));
    }
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = curve.getPointAt(t);
      rings.push(this.ring(c, c, frames.normals[i], frames.binormals[i], radiusAt(t), radial));
    }
    for (const deg of [...caps].reverse()) {
      const a = (deg * Math.PI) / 180;
      const c = p1.clone().addScaledVector(t1, radiusAt(1) * Math.sin(a));
      rings.push(this.ring(c, p1, frames.normals[n], frames.binormals[n], radiusAt(1) * Math.cos(a), radial));
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = rings[i] + j;
        const b = rings[i] + ((j + 1) % radial);
        const c = rings[i + 1] + j;
        const d = rings[i + 1] + ((j + 1) % radial);
        this.idx.push(a, b, c, b, d, c);
      }
    }
    // закрываем торцы
    for (const [ring, head] of [
      [rings[0], false],
      [rings[rings.length - 1], true],
    ] as const) {
      const centre = this.pos.length / 3;
      const base = ring * 3;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let j = 0; j < radial; j++) {
        sx += this.pos[base + j * 3];
        sy += this.pos[base + j * 3 + 1];
        sz += this.pos[base + j * 3 + 2];
      }
      const tt = head ? t1 : t0;
      this.pos.push(sx / radial, sy / radial, sz / radial);
      this.nor.push(head ? tt.x : -tt.x, head ? tt.y : -tt.y, head ? tt.z : -tt.z);
      for (let j = 0; j < radial; j++) {
        const a = ring + j;
        const b = ring + ((j + 1) % radial);
        if (head) this.idx.push(centre, b, a);
        else this.idx.push(centre, a, b);
      }
    }
  }

  /** Параметрический лист (связки): сетка (nu+1)x(nv+1), нормали по конечным разностям. */
  sheet(fn: (u: number, v: number) => Vec, nu: number, nv: number): void {
    const start = this.pos.length / 3;
    const P = (u: number, v: number) => new Vector3(...fn(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))));
    const e = 0.01;
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const u = i / nu;
        const v = j / nv;
        const p = P(u, v);
        const du = P(u + e, v).sub(P(u - e, v));
        const dv = P(u, v + e).sub(P(u, v - e));
        const nrm = du.cross(dv).normalize();
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(nrm.x, nrm.y, nrm.z);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = start + i * (nv + 1) + j;
        const b = a + 1;
        const c = a + (nv + 1);
        const d = c + 1;
        this.idx.push(a, b, c, b, d, c);
      }
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Детерминированный генератор случайных чисел: дерево сосудов одинаково при каждой загрузке. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
