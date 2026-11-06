import * as THREE from 'three';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LobeKind = 'ru' | 'rm' | 'rl' | 'lu' | 'll';

const P: Record<LobeKind, { sx: number; sy: number; sz: number; cy: number; taper: number }> = {
  ru: { sx: 0.95, sy: 1.02, sz: 0.78, cy: 0.78, taper: 0.34 },
  rm: { sx: 0.7, sy: 0.5, sz: 0.6, cy: -0.16, taper: 0.1 },
  rl: { sx: 1.0, sy: 1.12, sz: 0.84, cy: -0.84, taper: 0.16 },
  lu: { sx: 0.9, sy: 1.26, sz: 0.75, cy: 0.62, taper: 0.3 },
  ll: { sx: 0.98, sy: 1.1, sz: 0.82, cy: -0.84, taper: 0.15 },
};

export function lobeGeometry(kind: LobeKind, side: 1 | -1): THREE.BufferGeometry {
  const p = P[kind];
  const geo = new THREE.SphereGeometry(1, 48, 36);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color('#f3aab2');
  const cMid = new THREE.Color('#e58b95');
  const cLow = new THREE.Color('#cb6572');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let x = v.x * p.sx;
    let y = v.y * p.sy + p.cy;
    let z = v.z * p.sz;
    if (y > 1.0) {
      const k = Math.min((y - 1.0) / 0.9, 1);
      const n = 1 - k * p.taper;
      x *= n; z *= n;
    }
    if (y < -1.32) {
      const k = Math.min((-1.32 - y) / 0.8, 1);
      y = -1.32 - k * 0.2;
      const d = Math.hypot(x, z);
      y += d * d * 0.07;
    }
    if ((side > 0 && x < 0.15) || (side < 0 && x > -0.15)) { x *= 0.82; z *= 0.92; }
    const hy = y - 0.15, hz = z - 0.05;
    const hx = side > 0 ? x + 0.32 : x - 0.32;
    const dHil = Math.sqrt(hx * hx * 2.2 + hy * hy * 1.4 + hz * hz * 1.8);
    if (dHil < 0.75) {
      const dent = (0.75 - dHil) * 0.4;
      x += (side > 0 ? 1 : -1) * dent;
      z -= dent * 0.25;
    }
    if (kind === 'lu' && side < 0 && z > 0.12 && y > -0.55 && y < 0.72 && x > -0.18) {
      const k = Math.max(0, 1 - Math.hypot(y - 0.08, (x + 0.1) * 1.6) / 0.78);
      x -= k * 0.34; z -= k * 0.1;
    }
    pos.setXYZ(i, x, y, z);
    const t = THREE.MathUtils.clamp((y + 1.6) / 3.4, 0, 1);
    if (t > 0.62) tmp.lerpColors(cMid, cTop, (t - 0.62) / 0.38);
    else tmp.lerpColors(cLow, cMid, t / 0.62);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export interface Branch { pts: THREE.Vector3[]; r0: number; r1: number; level: number; lobe: string }
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function sub(start: THREE.Vector3, dir: THREE.Vector3, len: number, bend: THREE.Vector3): THREE.Vector3[] {
  return [
    start.clone(),
    start.clone().addScaledVector(dir, len * 0.4).addScaledVector(bend, 0.35),
    start.clone().addScaledVector(dir, len * 0.8).addScaledVector(bend, 0.8),
    start.clone().addScaledVector(dir, len).addScaledVector(bend, 1.0),
  ];
}

export function buildAirways(): Branch[] {
  const rnd = mulberry32(20261106);
  const out: Branch[] = [];
  const carina = V3(0, 1.15, 0.02);
  out.push({ pts: [V3(0, 3.55, 0), V3(0, 2.6, 0), V3(0, 1.8, 0.01), carina], r0: 0.3, r1: 0.27, level: 0, lobe: 'trachea' });
  const rEnd = V3(1.02, 0.62, -0.04);
  out.push({ pts: sub(carina, V3(0.85, -0.45, -0.05).normalize(), 1.25, V3(0.05, -0.05, 0)), r0: 0.235, r1: 0.195, level: 1, lobe: 'rmain' });
  out.push({ pts: sub(carina, V3(-0.82, -0.38, -0.05).normalize(), 1.32, V3(-0.05, -0.04, 0)), r0: 0.215, r1: 0.175, level: 1, lobe: 'lmain' });
  type Seed = { from: THREE.Vector3; dir: THREE.Vector3; len: number; r: number; lobe: string; depth: number };
  const seeds: Seed[] = [
    { from: V3(0.62, 0.86, -0.02), dir: V3(0.55, 0.62, 0.12).normalize(), len: 0.95, r: 0.145, lobe: 'ru', depth: 3 },
    { from: rEnd.clone(), dir: V3(0.18, -0.72, -0.02).normalize(), len: 0.9, r: 0.165, lobe: 'rint', depth: 2 },
    { from: V3(1.08, -0.02, 0.02), dir: V3(-0.05, -0.25, 0.95).normalize(), len: 0.75, r: 0.105, lobe: 'rm', depth: 3 },
    { from: V3(1.12, -0.12, -0.05), dir: V3(0.22, -0.9, -0.12).normalize(), len: 1.25, r: 0.155, lobe: 'rl', depth: 3 },
    { from: V3(-0.66, 0.88, -0.02), dir: V3(-0.55, 0.6, 0.12).normalize(), len: 1.0, r: 0.145, lobe: 'lu', depth: 3 },
    { from: V3(-0.95, 0.1, 0.05), dir: V3(-0.35, -0.35, 0.85).normalize(), len: 0.7, r: 0.088, lobe: 'lingula', depth: 2 },
    { from: V3(-1.08, 0.05, -0.05), dir: V3(-0.25, -0.92, -0.1).normalize(), len: 1.25, r: 0.155, lobe: 'll', depth: 3 },
  ];
  const spawn = (s: Seed) => {
    const pts = sub(s.from, s.dir, s.len, V3((rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2));
    out.push({ pts, r0: s.r, r1: s.r * 0.78, level: 4 - s.depth, lobe: s.lobe });
    if (s.depth <= 0) return;
    const end = pts[pts.length - 1];
    const base = s.dir.clone();
    const ax = Math.abs(base.y) > 0.7 ? V3(1, 0, 0) : V3(0, 1, 0);
    const p1 = new THREE.Vector3().crossVectors(base, ax).normalize();
    const p2 = new THREE.Vector3().crossVectors(base, p1).normalize();
    const a1 = 0.45 + rnd() * 0.3, a2 = 0.45 + rnd() * 0.3;
    const d1 = base.clone().applyAxisAngle(p2, a1).applyAxisAngle(base, rnd() * Math.PI * 2).normalize();
    const d2 = base.clone().applyAxisAngle(p2, -a2).applyAxisAngle(base, rnd() * Math.PI * 2).normalize();
    const nr = s.r * 0.62;
    spawn({ from: end, dir: d1, len: s.len * (0.62 + rnd() * 0.18), r: nr, lobe: s.lobe, depth: s.depth - 1 });
    spawn({ from: end, dir: d2, len: s.len * (0.62 + rnd() * 0.18), r: nr * 0.92, lobe: s.lobe, depth: s.depth - 1 });
  };
  seeds.forEach(spawn);
  return out;
}

export function tubeOf(b: Branch): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(b.pts);
  return new THREE.TubeGeometry(curve, Math.max(8, b.pts.length * 5), (b.r0 + b.r1) / 2, 7, false);
}
