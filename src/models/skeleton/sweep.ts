import { BufferAttribute, BufferGeometry, Vector3, type Curve } from 'three';

export interface SweepOptions {
  /** Полуширина сечения вдоль «боковой» оси и полувысота вдоль «верхней» в точке t (0..1). */
  radius: (t: number) => [number, number];
  /** Направление, задающее ориентацию сечения (по умолчанию — вверх). */
  up?: Vector3;
  segments?: number;
  radial?: number;
  /** Скруглённые торцы (полусферы) — на концах кость не обрывается срезом. */
  caps?: boolean;
}

/**
 * Трубка переменного эллиптического сечения вдоль кривой: рёбра, ключица, хрящи, фаланги.
 * Сечение ориентируется по вектору up, поэтому плоские рёбра не перекручиваются.
 */
export function sweep(path: Curve<Vector3>, opts: SweepOptions): BufferGeometry {
  const { radius, segments = 48, radial = 14, caps = true } = opts;
  const up = (opts.up ?? new Vector3(0, 1, 0)).clone().normalize();
  const rings: { c: Vector3; s: Vector3; u: Vector3; t: Vector3; rw: number; rh: number }[] = [];
  const tmp = new Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const c = path.getPointAt(t);
    const tan = path.getTangentAt(t).normalize();
    let s = tmp.copy(tan).cross(up);
    if (s.lengthSq() < 1e-6) s = new Vector3(1, 0, 0).cross(tan);
    s = s.clone().normalize();
    const u = s.clone().cross(tan).normalize();
    const [rw, rh] = radius(t);
    rings.push({ c, s, u, t: tan, rw, rh });
  }

  // скруглённые торцы: несколько колец, сходящихся в точку за концом кривой
  const capRings = caps ? 5 : 0;
  const all: typeof rings = [];
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (let k = capRings; k >= 1; k--) {
    const a = (k / (capRings + 1)) * (Math.PI / 2);
    const back = Math.sin(a) * Math.min(first.rw, first.rh);
    all.push({ ...first, c: first.c.clone().addScaledVector(first.t, -back), rw: first.rw * Math.cos(a), rh: first.rh * Math.cos(a) });
  }
  all.push(...rings);
  for (let k = 1; k <= capRings; k++) {
    const a = (k / (capRings + 1)) * (Math.PI / 2);
    const fwd = Math.sin(a) * Math.min(last.rw, last.rh);
    all.push({ ...last, c: last.c.clone().addScaledVector(last.t, fwd), rw: last.rw * Math.cos(a), rh: last.rh * Math.cos(a) });
  }

  const ringCount = all.length;
  const verts = ringCount * radial + (caps ? 2 : 0);
  const pos = new Float32Array(verts * 3);
  const p = new Vector3();
  all.forEach((r, i) => {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      p.copy(r.c).addScaledVector(r.s, Math.cos(a) * r.rw).addScaledVector(r.u, Math.sin(a) * r.rh);
      pos.set([p.x, p.y, p.z], (i * radial + j) * 3);
    }
  });
  const index: number[] = [];
  for (let i = 0; i < ringCount - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      index.push(a, c, b, b, c, d);
    }
  }
  if (caps) {
    const tipA = ringCount * radial;
    const tipB = tipA + 1;
    const fa = first.c.clone().addScaledVector(first.t, -Math.min(first.rw, first.rh));
    const fb = last.c.clone().addScaledVector(last.t, Math.min(last.rw, last.rh));
    pos.set([fa.x, fa.y, fa.z], tipA * 3);
    pos.set([fb.x, fb.y, fb.z], tipB * 3);
    const lastRing = (ringCount - 1) * radial;
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      index.push(tipA, j, j2);
      index.push(tipB, lastRing + j2, lastRing + j);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Профиль «кость с утолщёнными концами»: тонкое тело, широкие головки (для фаланг и пястных костей). */
export function knobbyProfile(r: number, ends = 1.45, waist = 0.78): (t: number) => [number, number] {
  return (t) => {
    const e = Math.max(Math.exp(-((t / 0.16) ** 2)), Math.exp(-(((1 - t) / 0.16) ** 2)));
    const k = waist + (ends - waist) * e;
    return [r * k, r * k * 0.86];
  };
}
