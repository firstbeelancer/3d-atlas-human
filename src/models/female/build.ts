import { BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import {
  CYCLE_SIDE, ENDO_MAX, ENDO_MIN, FOLLICLES, OVARY_CENTER, OVARY_RADII, S, SIDES, TUBE_S, UTERUS_AXIS, VAGINA_AXIS,
  VAGINA_CEILING_S, VAGINA_FORNIX_S, mirror, tubeAxis, tubeInner, tubeOuter, uterusInnerX, uterusInnerZ, uterusOuterX, uterusOuterZ,
  vaginaInnerX, vaginaInnerZ, vaginaOuterX, vaginaOuterZ,
} from './anatomy';
import {
  Mesher, blob, curveOf, fbm, mergeGeos, noise3, patch, profile, shellOf, smooth, tubeSolid, wallSolid, type LoftSpec, type V3,
} from './geometry';
import { FEMALE_PART_IDS } from './parts';

export type MatKey =
  | 'serosa' | 'cervixSurface' | 'perimetrium' | 'myometrium' | 'cervixStroma' | 'endometrium' | 'cavityVolume' | 'canal' | 'osRing'
  | 'tube' | 'tubeLumen' | 'fimbria' | 'ovary' | 'primordial' | 'follicle' | 'fluid' | 'luteum' | 'albicans' | 'oocyte'
  | 'sheet' | 'ligament' | 'cord' | 'vagina' | 'vaginaLumen' | 'rugae' | 'fornix' | 'fornixLumen' | 'artery' | 'vein' | 'nerve'
  | 'ganglion' | 'node' | 'bladder' | 'bladderLumen' | 'urethra' | 'urethraLumen' | 'ureter' | 'rectum' | 'rectumLumen' | 'bone'
  | 'cartilage' | 'floor' | 'skin' | 'skinInner' | 'glans' | 'erectile' | 'gland' | 'hymen' | 'labiaMinora' | 'meatus' | 'hair';

export type CapKey =
  | 'myo' | 'cervix' | 'endo' | 'tube' | 'ovary' | 'vagina' | 'fornix' | 'follicle' | 'fluid' | 'luteum' | 'albicans' | 'artery'
  | 'vein' | 'nerve' | 'node' | 'bladder' | 'urethra' | 'ureter' | 'rectum' | 'bone' | 'cartilage' | 'cord' | 'skin' | 'erectile' | 'gland' | 'fat';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Замкнутое тело: на разрезе из него получается заглушка этого цвета. */
  cap?: CapKey;
  /** Чем больше, тем выше заглушка там, где несколько срезов лежат в одной плоскости. */
  prio?: number;
  noPick?: boolean;
  proxy?: BufferGeometry;
  /** Эндометрий: вторая форма (толстый слой) как морф-цель. */
  morph?: boolean;
}

/* ---------- помощники ---------- */

const UPZ = new Vector3(0, 0, 1);
const sp = (curve: CatmullRomCurve3, rx: (s: number) => number, rz?: (s: number) => number, mod?: LoftSpec['mod'], up?: Vector3): LoftSpec => ({ curve, rx, rz, mod, up });
const off = (f: (s: number) => number, d: number) => (s: number) => {
  const v = f(s);
  return v < 1e-3 ? 0 : Math.max(0.002, v + d);
};
const shrink = (spec: LoftSpec, d: number): LoftSpec => ({ ...spec, rx: off(spec.rx, -d), rz: off(spec.rz ?? spec.rx, -d) });
const grow = (spec: LoftSpec, d: number): LoftSpec => ({ ...spec, rx: off(spec.rx, d), rz: off(spec.rz ?? spec.rx, d) });
const skin = (th: number, s: number, a = 0.012) => 1 + a * noise3(Math.cos(th) * 2.5, s * 7, Math.sin(th) * 2.5);

interface Hollow {
  outer: LoftSpec;
  inner: LoftSpec;
  s0?: number;
  s1?: number;
  i0?: number;
  i1?: number;
  rings: number;
  around: number;
  mat: MatKey;
  innerMat: MatKey;
  cap: CapKey;
  prio?: number;
  uv?: [number, number];
}

/** Полая часть: толстостенное тело (для среза и вида снаружи) + тонкая оболочка просвета другого материала. */
function hollow(o: Hollow): MeshDef[] {
  const base = { outer: o.outer, inner: o.inner, s0: o.s0, s1: o.s1, i0: o.i0, i1: o.i1, uv: o.uv };
  const g = wallSolid({ ...base, rings: o.rings, around: o.around });
  const proxy = wallSolid({ ...base, rings: Math.max(6, o.rings >> 2), around: Math.max(10, o.around >> 1) });
  const lumen = shellOf(shrink(o.inner, 0.014), o.i0 ?? o.s0 ?? 0, o.i1 ?? o.s1 ?? 1, o.rings, o.around, true, o.uv ?? [2, 3]);
  return [
    { g, m: o.mat, cap: o.cap, prio: o.prio, proxy },
    { g: lumen, m: o.innerMat, noPick: true },
  ];
}

function solidTube(curve: CatmullRomCurve3, r: number | ((s: number) => number), m: MatKey, cap: CapKey, o: { prio?: number; around?: number; rz?: number; s0?: number; s1?: number } = {}): MeshDef {
  const f = typeof r === 'number' ? () => r : r;
  const len = curve.getLength();
  const rings = Math.max(8, Math.min(90, Math.round(len * 5)));
  if (o.rz) {
    const g = wallSolid({ outer: sp(curve, f, () => o.rz!, undefined, new Vector3(1, 0, 0)), rings, around: o.around ?? 12, s0: o.s0, s1: o.s1, uv: [1, Math.max(2, len)] });
    return { g, m, cap, prio: o.prio };
  }
  return { g: tubeSolid(curve, f, { rings, around: o.around ?? 12, s0: o.s0, s1: o.s1 }), m, cap, prio: o.prio };
}

/** Спираль вокруг базовой линии: извитые артерии и «лозовидное» сплетение вен. */
function coil(base: CatmullRomCurve3, amp: number, waves: number, phase = 0, taper = true): CatmullRomCurve3 {
  const pts: Vector3[] = [];
  const n = Math.max(30, Math.round(base.getLength() * 9));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = base.getPointAt(t);
    const T = base.getTangentAt(t);
    const ref = Math.abs(T.z) > 0.9 ? new Vector3(1, 0, 0) : UPZ;
    const a = new Vector3().crossVectors(T, ref).normalize();
    const b = new Vector3().crossVectors(T, a).normalize();
    const k = taper ? smooth(0, 0.08, t) * smooth(1, 0.92, t) : 1;
    const ang = t * waves * Math.PI * 2 + phase;
    p.addScaledVector(a, Math.cos(ang) * amp * k).addScaledVector(b, Math.sin(ang) * amp * k);
    pts.push(p);
  }
  return new CatmullRomCurve3(pts);
}

function torusAt(c: Vector3, n: Vector3, R: number, r: number): BufferGeometry {
  const nn = n.clone().normalize();
  const ref = Math.abs(nn.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = new Vector3().crossVectors(ref, nn).normalize();
  const w = new Vector3().crossVectors(nn, u);
  const rows: Vector3[][] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const row: Vector3[] = [];
    for (let j = 0; j <= 12; j++) {
      const b = (j / 12) * Math.PI * 2;
      const rad = R + r * Math.cos(b);
      row.push(c.clone().addScaledVector(u, Math.cos(a) * rad).addScaledVector(w, Math.sin(a) * rad).addScaledVector(nn, r * Math.sin(b)));
    }
    rows.push(row);
  }
  return new Mesher().grid(rows, true).geometry();
}

/** Кольцо-торец: плоская поверхность между внешним и внутренним кольцом (торец шейки у наружного зева). */
function annulus(outer: LoftSpec, inner: LoftSpec, s: number, shift: number): BufferGeometry {
  const T = outer.curve.getTangentAt(s).normalize();
  const up = outer.up ?? new Vector3(1, 0, 0);
  const U = up.clone().sub(T.clone().multiplyScalar(up.dot(T))).normalize();
  const W = new Vector3().crossVectors(T, U);
  const C = outer.curve.getPointAt(s).addScaledVector(T, shift);
  const ringOf = (spec: LoftSpec) => {
    const pts: Vector3[] = [];
    for (let j = 0; j <= 40; j++) {
      const th = (j / 40) * Math.PI * 2;
      pts.push(C.clone().addScaledVector(U, Math.cos(th) * spec.rx(s)).addScaledVector(W, Math.sin(th) * (spec.rz ?? spec.rx)(s)));
    }
    return pts;
  };
  return new Mesher().grid([ringOf(outer), ringOf(inner)], true, 2, 1).geometry();
}

/* ---------- матка ---------- */

const uterusOuter = sp(UTERUS_AXIS, uterusOuterX, uterusOuterZ, (s, th) => skin(th, s, 0.01));
const uterusInner = sp(UTERUS_AXIS, uterusInnerX, uterusInnerZ);

/** Полость матки при заданной толщине эндометрия. */
function cavitySpec(t: number): LoftSpec {
  const taper = (s: number) => Math.min(1, Math.max(0, (S.cavityTop - s) / 0.025));
  return sp(
    UTERUS_AXIS,
    (s) => Math.max(0.05, uterusInnerX(s) - t) * taper(s),
    (s) => Math.max(0.04, uterusInnerZ(s) - t * 0.85) * taper(s),
  );
}

function endometrium(): MeshDef {
  const outer = shrink(uterusInner, 0.012);
  const build = (t: number) => wallSolid({ outer, inner: cavitySpec(t), s0: S.internalOs, s1: S.cavityTop, rings: 56, around: 40, uv: [2, 3] });
  const g = build(ENDO_MIN);
  const thick = build(ENDO_MAX);
  g.morphAttributes.position = [thick.getAttribute('position')];
  g.morphAttributes.normal = [thick.getAttribute('normal')];
  g.morphTargetsRelative = false;
  return { g, m: 'endometrium', cap: 'endo', prio: 1, morph: true, proxy: wallSolid({ outer, inner: cavitySpec(0.1), s0: S.internalOs, s1: S.cavityTop, rings: 10, around: 12 }) };
}

function uterus(out: Record<string, MeshDef[]>) {
  const region = (id: string, s0: number, s1: number, mat: MatKey, rings: number) => {
    const g = shellOf(grow(uterusOuter, 0.03), s0, s1, rings, 44, false, [3, 2]);
    const proxy = shellOf(grow(uterusOuter, 0.03), s0, s1, Math.max(4, rings >> 2), 14);
    out[id] = [{ g, m: mat, proxy }];
  };
  region('fundus', S.bodyEnd, 1, 'serosa', 24);
  region('body', S.isthmusEnd, S.bodyEnd, 'serosa', 34);
  region('isthmus', S.cervixEnd, S.isthmusEnd, 'cervixSurface', 8);
  region('cervix', 0, S.cervixEnd, 'cervixSurface', 26);
  // торец шейки у наружного зева (плоский «пятачок» с отверстием)
  out.cervix.push({ g: annulus(grow(uterusOuter, 0.03), shrink(uterusInner, -0.04), 0.0, -0.012), m: 'cervixSurface', noPick: true });

  out.perimetrium = [{ g: shellOf(grow(uterusOuter, 0.075), S.cervixEnd + 0.04, 1, 60, 44, false, [3, 2]), m: 'perimetrium', noPick: true }];

  const myoOuter = shrink(uterusOuter, 0.05);
  const cer = wallSolid({ outer: myoOuter, inner: uterusInner, s0: 0, s1: S.internalOs, rings: 36, around: 40 });
  const bod = wallSolid({ outer: myoOuter, inner: uterusInner, s0: S.internalOs, s1: 1, i0: S.internalOs, i1: S.cavityTop, rings: 64, around: 44 });
  out.myometrium = [
    { g: cer, m: 'cervixStroma', cap: 'cervix', proxy: wallSolid({ outer: myoOuter, inner: uterusInner, s0: 0, s1: S.internalOs, rings: 6, around: 12 }) },
    { g: bod, m: 'myometrium', cap: 'myo', proxy: wallSolid({ outer: myoOuter, inner: uterusInner, s0: S.internalOs, s1: 1, i0: S.internalOs, i1: S.cavityTop, rings: 12, around: 14 }) },
  ];
  out.endometrium = [endometrium()];
  const cav = cavitySpec(ENDO_MIN);
  const cavThick = cavitySpec(ENDO_MAX);
  const vol = wallSolid({ outer: shrink(cav, 0.0), s0: S.internalOs, s1: S.cavityTop, rings: 48, around: 32 });
  const volThick = wallSolid({ outer: cavThick, s0: S.internalOs, s1: S.cavityTop, rings: 48, around: 32 });
  vol.morphAttributes.position = [volThick.getAttribute('position')];
  vol.morphAttributes.normal = [volThick.getAttribute('normal')];
  out['uterine-cavity'] = [{ g: vol, m: 'cavityVolume', noPick: false, morph: true }];

  const canalSpec: LoftSpec = {
    ...shrink(uterusInner, 0.014),
    mod: (s, th) => 1 - 0.2 * Math.pow(Math.max(0, Math.sin(th * 5 + s * 30)), 2) * smooth(0.02, 0.1, s) * smooth(0.37, 0.3, s),
  };
  out['cervical-canal'] = [{ g: shellOf(canalSpec, 0, S.internalOs + 0.005, 40, 36, true, [2, 3]), m: 'canal' }];
  const ios = UTERUS_AXIS.getPointAt(S.internalOs);
  const eos = UTERUS_AXIS.getPointAt(0.0).addScaledVector(UTERUS_AXIS.getTangentAt(0), -0.04);
  out['internal-os'] = [{ g: torusAt(ios, UTERUS_AXIS.getTangentAt(S.internalOs), 0.2, 0.065), m: 'osRing' }];
  out['external-os'] = [{ g: torusAt(eos, UTERUS_AXIS.getTangentAt(0), 0.27, 0.075), m: 'osRing' }];
}

/* ---------- трубы ---------- */

function tubes(out: Record<string, MeshDef[]>) {
  const ids = ['intramural-tube', 'tube-isthmus', 'ampulla', 'infundibulum', 'fimbriae'];
  ids.forEach((id) => (out[id] = []));
  const T = TUBE_S;
  for (const side of SIDES) {
    const curve = tubeAxis(side);
    const fold = (s: number) => smooth(0.2, 0.42, s) * (1 - 0.35 * smooth(0.9, 1, s));
    const outer = sp(curve, tubeOuter, undefined, (s, th) => 1 + 0.015 * noise3(Math.cos(th) * 2, s * 18, Math.sin(th) * 2), UPZ);
    const inner = sp(curve, tubeInner, undefined, (s, th) => 1 + 0.34 * fold(s) * Math.cos(th * 7 + s * 6), UPZ);
    const seg = (id: string, s0: number, s1: number, rings: number, around: number, mat: MatKey, lumen: MatKey, prio: number) => {
      out[id].push(...hollow({ outer, inner, s0, s1, rings, around, mat, innerMat: lumen, cap: 'tube', prio, uv: [1, 6] }));
    };
    seg('intramural-tube', 0, T.intramural, 8, 16, 'tube', 'tubeLumen', 3);
    seg('tube-isthmus', T.intramural, T.isthmus, 22, 18, 'tube', 'tubeLumen', 2);
    seg('ampulla', T.isthmus, T.ampulla, 56, 28, 'tube', 'tubeLumen', 2);
    seg('infundibulum', T.ampulla, 1, 22, 28, 'tube', 'tubeLumen', 2);

    // фимбрии: пальцевидные отростки воронки, самая длинная — яичниковая — тянется к яичнику
    const mouth = curve.getPointAt(1);
    const tan = curve.getTangentAt(1).normalize();
    const oc = new Vector3(...OVARY_CENTER(side));
    const frs: BufferGeometry[] = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const u = new Vector3().crossVectors(tan, UPZ).normalize();
      const w = new Vector3().crossVectors(tan, u);
      const radial = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
      const base = mouth.clone().addScaledVector(radial, 1.0);
      const toOvary = oc.clone().sub(base).normalize();
      const long = i === 3;
      const len = long ? 2.1 : 0.55 + 0.35 * noise3(i * 1.7, 0.3, 2.2) + 0.25;
      const mid = base.clone().addScaledVector(radial, len * 0.45).addScaledVector(tan, len * 0.28).addScaledVector(toOvary, long ? len * 0.35 : len * 0.1);
      const tip = base.clone().addScaledVector(radial, len * 0.55).addScaledVector(tan, len * 0.55).addScaledVector(toOvary, long ? len * 0.8 : len * 0.2);
      const c = new CatmullRomCurve3([base.clone().addScaledVector(radial, -0.12), base, mid, tip]);
      frs.push(
        wallSolid({ outer: sp(c, (s) => (0.17 - 0.12 * s) * (long ? 1.15 : 1), (s) => 0.06 - 0.035 * s, undefined, tan), rings: 10, around: 8, uv: [1, 2] }),
      );
    }
    out.fimbriae.push({ g: mergeGeos(frs), m: 'fimbria', cap: 'tube', prio: 1 });
  }
}

/* ---------- яичники ---------- */

export interface FollicleGeos {
  smooth: BufferGeometry;
  rough: BufferGeometry;
  scar: BufferGeometry;
  fluid: BufferGeometry;
}

export function makeFollicleGeos(): FollicleGeos {
  const unit = (bump: (x: number, y: number, z: number) => number, detail = 18, radii: V3 = [1, 1, 1]) => blob([0, 0, 0], radii, { detail, bump });
  return {
    smooth: unit((x, y, z) => 0.03 * noise3(x * 2.2, y * 2.2, z * 2.2)),
    rough: unit((x, y, z) => 0.14 * fbm(x * 3, y * 3, z * 3, 3), 22),
    scar: unit((x, y, z) => 0.12 * fbm(x * 4 + 2, y * 4, z * 4, 3), 14, [1, 0.7, 0.8]),
    fluid: unit(() => 0, 16),
  };
}

function ovaries(out: Record<string, MeshDef[]>) {
  out.ovary = [];
  out['follicle-primordial'] = [];
  const rnd = (() => {
    let s = 17;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  for (const side of SIDES) {
    const c = OVARY_CENTER(side);
    const bump = (x: number, y: number, z: number) => 0.045 * fbm(x * 3.6, y * 3.6, z * 3.6, 3) + 0.012 * noise3(x * 15, y * 15, z * 15);
    const g = blob(c, OVARY_RADII, { detail: 44, rot: [0, 0, 0.12 * side], bump, seed: side * 3 });
    out.ovary.push({ g, m: 'ovary', cap: 'ovary', proxy: blob(c, OVARY_RADII, { detail: 10, rot: [0, 0, 0.12 * side] }) });
    // примордиальные фолликулы: россыпь крошечных светлых точек в коре
    const dots: BufferGeometry[] = [];
    for (let i = 0; i < 90; i++) {
      const th = rnd() * Math.PI * 2;
      const u = rnd() * 2 - 1;
      const k = Math.sqrt(1 - u * u);
      const nx = k * Math.cos(th), ny = u, nz = k * Math.sin(th);
      if (nz < -0.3 && rnd() < 0.5) continue;
      const rr = 0.935;
      const x = nx * OVARY_RADII[0] * rr, y = ny * OVARY_RADII[1] * rr, z = nz * OVARY_RADII[2] * rr;
      const ca = Math.cos(0.12 * side), sa = Math.sin(0.12 * side);
      dots.push(blob([c[0] + x * ca - y * sa, c[1] + x * sa + y * ca, c[2] + z], [0.04, 0.04, 0.04], { detail: 5 }));
    }
    out['follicle-primordial'].push({ g: mergeGeos(dots), m: 'primordial', cap: 'follicle', prio: 2 });
  }
}

/* ---------- связки ---------- */

function ligaments(out: Record<string, MeshDef[]>) {
  const ids = ['broad-ligament', 'mesosalpinx', 'mesovarium', 'round-ligament', 'ovarian-ligament', 'suspensory-ligament', 'cardinal-ligament', 'uterosacral-ligament'];
  ids.forEach((id) => (out[id] = []));
  for (const side of SIDES) {
    out['broad-ligament'].push({
      g: patch((u, v) => {
        const reach = 5.65 - 2.2 * v * v - 0.5 * Math.sin(v * 9 + side) * 0.2;
        const x = 2.35 + u * reach;
        const top = 3.55 - 0.18 * (x - 2.35) - 0.4 * u * u;
        const y = top + (-1.0 - top) * v;
        const z = 0.1 + 0.16 * Math.sin(u * Math.PI) - 0.28 * v * u + 0.05 * noise3(x * 1.2, y * 1.2, 0);
        return [x * side, y, z];
      }, 28, 22, [4, 3]),
      m: 'sheet',
    });
    const tube = tubeAxis(side);
    const oc = new Vector3(...OVARY_CENTER(side));
    out.mesosalpinx.push({
      g: patch((u, v) => {
        const t = 0.1 + u * 0.86;
        const p = tube.getPointAt(t);
        const to = oc.clone().sub(p);
        const d = Math.max(0.3, Math.min(1.35, to.length() - 0.8)) * (1 + 0.12 * Math.sin(u * 22));
        const q = p.clone().addScaledVector(to.normalize(), d * v);
        q.z += 0.03 * Math.sin(v * 3 + u * 9);
        return [q.x, q.y, q.z];
      }, 60, 8, [8, 1]),
      m: 'sheet',
    });
    out.mesovarium.push({
      g: patch((u, v) => {
        const y = 1.0 + u * 2.4;
        return [(4.62 - 0.9 * v) * side, y, -0.32 + 0.42 * v];
      }, 10, 6, [2, 1]),
      m: 'sheet',
    });
    out['round-ligament'].push(
      solidTube(curveOf(mirror([[2.1, 3.5, 1.05], [3.2, 3.0, 2.6], [4.6, 2.2, 4.0], [6.0, 1.0, 5.6], [7.0, -0.5, 6.6]], side)), (s) => 0.12 - 0.03 * s, 'cord', 'cord'),
    );
    out['ovarian-ligament'].push(solidTube(curveOf(mirror([[4.55, 1.45, -0.3], [3.6, 2.4, -0.3], [2.4, 3.3, -0.2]], side)), 0.13, 'cord', 'cord'));
    out['suspensory-ligament'].push({
      g: wallSolid({ outer: sp(curveOf(mirror([[5.9, 3.7, -0.8], [6.7, 6.2, -1.8], [7.6, 9.3, -3.2]], side)), () => 0.34, () => 0.09, undefined, new Vector3(1, 0, 0)), rings: 20, around: 12 }),
      m: 'ligament',
      cap: 'cord',
    });
    out['cardinal-ligament'].push({
      g: patch((u, v) => {
        const x = 1.9 + u * 5.4;
        const y = -1.0 + (-3.3 - 1.3 * u + 1.0) * v;
        return [x * side, y, -0.1 - 0.35 * u + 0.12 * Math.sin(v * 3 + u * 5)];
      }, 22, 14, [3, 2]),
      m: 'ligament',
    });
    out['uterosacral-ligament'].push(
      solidTube(curveOf(mirror([[0.95, -1.1, -0.9], [1.7, -1.3, -3.0], [1.95, -1.9, -5.5], [1.4, -2.9, -8.0]], side)), (s) => 0.2 - 0.05 * s, 'cord', 'cord', { rz: 0.1 }),
    );
  }
}

/* ---------- влагалище ---------- */

function vagina(out: Record<string, MeshDef[]>) {
  const mod = (s: number, th: number) => skin(th, s, 0.008);
  const outer = sp(VAGINA_AXIS, vaginaOuterX, vaginaOuterZ, mod);
  const inner = sp(VAGINA_AXIS, vaginaInnerX, vaginaInnerZ);
  out.vagina = hollow({ outer, inner, s0: 0, s1: VAGINA_FORNIX_S, rings: 54, around: 44, mat: 'vagina', innerMat: 'vaginaLumen', cap: 'vagina', uv: [2, 5] });
  out['vaginal-fornix'] = hollow({ outer, inner, s0: VAGINA_FORNIX_S, s1: 1, i0: VAGINA_FORNIX_S, i1: VAGINA_CEILING_S, rings: 26, around: 44, mat: 'fornix', innerMat: 'fornixLumen', cap: 'fornix', uv: [2, 2] });
  const rug: LoftSpec = {
    ...shrink(inner, 0.02),
    mod: (s, th) => 1 - 0.1 * Math.pow(Math.max(0, Math.sin(s * 150 + 1.2 * noise3(th * 2, s * 5, 0))), 1.4) * (0.15 + 0.85 * Math.pow(Math.sin(th), 2)) * smooth(0.04, 0.12, s) * smooth(0.8, 0.66, s),
  };
  out['vaginal-rugae'] = [{ g: shellOf(rug, 0.02, 0.8, 130, 40, true, [2, 6]), m: 'rugae' }];
}

/* ---------- сосуды, нервы, лимфоузлы ---------- */

function supply(out: Record<string, MeshDef[]>) {
  const ids = ['uterine-artery', 'ovarian-artery', 'vaginal-artery', 'uterine-veins', 'ovarian-veins', 'pelvic-nerves', 'lymph-nodes'];
  ids.forEach((id) => (out[id] = []));
  for (const side of SIDES) {
    const approach = curveOf(mirror([[6.6, -1.6, -1.2], [5.0, -1.9, -0.4], [3.4, -1.75, 0.35], [2.3, -1.2, 0.45], [1.75, -0.5, 0.3]], side));
    const ascend = coil(curveOf(mirror([[1.75, -0.5, 0.3], [1.95, 0.6, 0.5], [2.4, 1.8, 0.62], [2.65, 3.0, 0.65], [2.6, 4.0, 0.45]], side)), 0.13, 8, side);
    const toOvary = curveOf(mirror([[2.6, 4.0, 0.45], [3.4, 3.6, 0.15], [4.4, 3.2, -0.05], [5.0, 2.7, -0.35]], side));
    out['uterine-artery'].push(solidTube(approach, 0.17, 'artery', 'artery', { prio: 4 }), solidTube(ascend, (s) => 0.15 - 0.03 * s, 'artery', 'artery', { prio: 4 }), solidTube(toOvary, 0.1, 'artery', 'artery', { prio: 4 }));

    const ovBase = curveOf(mirror([[7.6, 9.3, -3.2], [7.0, 6.6, -1.9], [6.2, 4.5, -1.0], [5.5, 3.1, -0.55], [5.0, 2.6, -0.4]], side));
    out['ovarian-artery'].push(solidTube(coil(ovBase, 0.06, 7, 0), 0.1, 'artery', 'artery', { prio: 4 }));
    out['vaginal-artery'].push(solidTube(coil(curveOf(mirror([[2.7, -2.0, 0.15], [2.2, -3.6, 0.3], [1.95, -5.5, 0.5], [1.9, -7.5, 0.75], [1.85, -9.5, 1.05]], side)), 0.06, 8, 1), 0.08, 'artery', 'artery', { prio: 4, around: 10 }));

    const vUt = curveOf(mirror([[1.5, -0.6, -0.25], [1.7, 0.6, -0.2], [2.1, 1.8, -0.05], [2.4, 3.0, 0.0], [2.4, 4.0, -0.1], [3.2, 3.5, -0.3], [4.3, 3.1, -0.3], [4.9, 2.6, -0.5]], side));
    const vLat = curveOf(mirror([[1.5, -0.6, -0.25], [2.4, -1.5, -0.1], [3.8, -2.1, -0.2], [5.2, -2.2, -0.7], [6.6, -1.9, -1.4]], side));
    out['uterine-veins'].push(solidTube(coil(vUt, 0.07, 6, 2), 0.12, 'vein', 'vein', { prio: 4 }), solidTube(vLat, 0.14, 'vein', 'vein', { prio: 4 }));
    for (const dz of [-0.45, 0.45]) {
      out['uterine-veins'].push(solidTube(coil(curveOf(mirror([[2.0, -2.5, dz * 0.7], [2.25, -4.0, dz * 0.6 + 0.2], [2.2, -6.0, dz * 0.55 + 0.4], [2.1, -8.0, dz * 0.5 + 0.7]], side)), 0.05, 6, dz), 0.09, 'vein', 'vein', { prio: 4, around: 10 }));
    }
    for (let k = 0; k < 3; k++) out['ovarian-veins'].push(solidTube(coil(ovBase, 0.17, 6, (k * Math.PI * 2) / 3, false), 0.07, 'vein', 'vein', { prio: 4, around: 10 }));

    const hypo = curveOf(mirror([[0.5, 8.5, -6.8], [1.2, 5.0, -6.9], [1.9, 1.5, -5.5], [2.3, -1.2, -2.6], [2.4, -1.8, -1.4]], side));
    out['pelvic-nerves'].push(solidTube(hypo, 0.11, 'nerve', 'nerve', { prio: 5, around: 10 }));
    for (const [pts, r] of [
      [[[2.4, -1.8, -1.4], [1.9, -0.6, -0.9], [1.45, 1.2, -0.7], [1.5, 2.8, -0.55]], 0.06],
      [[[2.4, -1.8, -1.4], [2.2, -3.6, -1.0], [2.0, -5.6, -0.6], [1.9, -7.6, -0.2]], 0.06],
      [[[2.4, -1.8, -1.4], [3.0, -1.0, -0.6], [3.8, 0.4, -0.5], [4.6, 1.8, -0.5]], 0.05],
    ] as [V3[], number][]) out['pelvic-nerves'].push(solidTube(curveOf(mirror(pts, side)), r, 'nerve', 'nerve', { prio: 5, around: 8 }));
    out['pelvic-nerves'].push({ g: blob([2.4 * side, -1.8, -1.4], [0.55, 0.38, 0.28], { detail: 16, bump: (x, y, z) => 0.1 * noise3(x * 3, y * 3, z * 3) }), m: 'ganglion', cap: 'nerve', prio: 5 });

    const nodes: V3[] = [[6.4, 1.0, -2.2], [6.7, 3.0, -2.8], [6.0, -1.5, -1.8], [7.0, 5.0, -3.2], [3.3, -2.5, -1.0], [1.8, -3.6, -2.0]];
    nodes.forEach(([x, y, z], i) => out['lymph-nodes'].push({ g: blob([x * side, y, z], [0.38, 0.26, 0.24], { detail: 14, rot: [0, 0, 0.5 * side * (i % 2 ? 1 : -1)], bump: (a, b, c) => 0.07 * noise3(a * 3 + i, b * 3, c * 3) }), m: 'node', cap: 'node', prio: 3 }));
  }
  out['pelvic-nerves'].push(solidTube(curveOf([[0, 9.2, -7.0], [0.5, 8.5, -6.8]]), 0.14, 'nerve', 'nerve', { prio: 5, around: 10 }));
}

/* ---------- соседи ---------- */

function neighbors(out: Record<string, MeshDef[]>) {
  const bAxis = curveOf([[0, -6.2, 4.0], [0, -3.8, 4.2], [0, -1.2, 3.8]]);
  const bx = profile([[0, 0], [0.03, 1.0], [0.2, 1.8], [0.5, 2.25], [0.8, 1.9], [0.97, 0.9], [1, 0]]);
  const bz = profile([[0, 0], [0.03, 0.9], [0.2, 1.6], [0.5, 2.0], [0.8, 1.7], [0.97, 0.8], [1, 0]]);
  const bOuter = sp(bAxis, bx, bz, (s, th) => skin(th, s, 0.015));
  const bInner = sp(bAxis, (s) => Math.max(0, bx(s) - 0.5) * (s > 0.04 && s < 0.97 ? 1 : 0), (s) => Math.max(0, bz(s) - 0.5) * (s > 0.04 && s < 0.97 ? 1 : 0));
  out.bladder = hollow({ outer: bOuter, inner: bInner, s0: 0, s1: 1, i0: 0.05, i1: 0.96, rings: 36, around: 36, mat: 'bladder', innerMat: 'bladderLumen', cap: 'bladder', uv: [2, 2] });

  const urAxis = curveOf([[0, -5.9, 3.9], [0, -7.8, 3.9], [0, -9.9, 3.6]]);
  out.urethra = hollow({ outer: sp(urAxis, () => 0.5, () => 0.45), inner: sp(urAxis, () => 0.16, () => 0.12), rings: 14, around: 16, mat: 'urethra', innerMat: 'urethraLumen', cap: 'urethra', uv: [1, 2] });

  out.ureters = [];
  for (const side of SIDES) {
    const c = curveOf(mirror([[6.2, 9.0, -3.5], [6.0, 3.0, -3.2], [5.0, -0.5, -2.0], [3.6, -2.5, 0.3], [2.6, -3.3, 2.2], [1.7, -4.3, 2.6]], side));
    out.ureters.push(...hollow({ outer: sp(c, () => 0.17), inner: sp(c, () => 0.055), rings: 70, around: 12, mat: 'ureter', innerMat: 'urethraLumen', cap: 'ureter', prio: 3, uv: [1, 8] }));
  }

  const rAxis = curveOf([[0, 8.0, -6.6], [0, 4.0, -6.3], [0, 0.0, -5.6], [0, -4.0, -4.4], [0, -8.0, -3.0], [0, -11.2, -2.0]]);
  out.rectum = hollow({
    outer: sp(rAxis, (s) => 1.55 - 0.25 * smooth(0.82, 1, s), (s) => 1.3 - 0.2 * smooth(0.82, 1, s), (s, th) => skin(th, s, 0.02) * (1 + 0.04 * Math.sin(s * 60))),
    inner: sp(rAxis, (s) => 1.0 - 0.2 * smooth(0.82, 1, s), (s) => 0.78 - 0.15 * smooth(0.82, 1, s)),
    rings: 60, around: 32, mat: 'rectum', innerMat: 'rectumLumen', cap: 'rectum', uv: [2, 8],
  });

  const sAxis = curveOf([[0, 9.5, -9.5], [0, 3.0, -10.0], [0, -3.5, -8.6], [0, -8.5, -6.3]]);
  out.sacrum = [{
    g: wallSolid({ outer: sp(sAxis, profile([[0, 3.2], [0.04, 3.7], [0.3, 3.4], [0.7, 1.9], [0.93, 0.8], [1, 0.4]]), profile([[0, 1.2], [0.5, 1.0], [1, 0.4]]), (s, th) => skin(th, s, 0.03)), rings: 40, around: 28 }),
    m: 'bone', cap: 'bone',
  }];

  const bone = (x: number) => blob([x, -7.6, 7.4], [0.8, 1.35, 0.5], { detail: 22, rot: [0, 0, -0.2 * Math.sign(x)], bump: (a, b, c) => 0.04 * noise3(a * 2, b * 2, c * 2) });
  out['pubic-symphysis'] = [
    { g: bone(1.4), m: 'bone', cap: 'bone' },
    { g: bone(-1.4), m: 'bone', cap: 'bone' },
    { g: blob([0, -7.6, 7.4], [0.24, 1.2, 0.44], { detail: 14 }), m: 'cartilage', cap: 'cartilage', prio: 2 },
  ];

  // тазовое дно: воронка мышц вокруг отверстий для уретры, влагалища и прямой кишки
  const pg = new Mesher();
  const floorRows: Vector3[][] = [];
  for (let j = 0; j <= 14; j++) {
    const rho = j / 14;
    const row: Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const front = Math.sin(a) > 0;
      const rx = 2.0 + rho * 4.5;
      const rz = front ? 2.6 + rho * 3.2 : 3.2 + rho * 3.0;
      row.push(new Vector3(rx * Math.cos(a), -9.4 + 6.0 * Math.pow(rho, 0.85) + 0.14 * noise3(i * 0.3, j * 0.4, 1), 1.0 + rz * Math.sin(a)));
    }
    floorRows.push(row);
  }
  out['pelvic-floor'] = [{ g: pg.grid(floorRows, false, 6, 2).geometry(), m: 'floor' }];
}

/* ---------- сборка ---------- */

export function buildFemale(): Record<string, MeshDef[]> {
  const out: Record<string, MeshDef[]> = {};
  uterus(out);
  tubes(out);
  ovaries(out);
  ligaments(out);
  vagina(out);
  supply(out);
  neighbors(out);
  for (const id of FEMALE_PART_IDS) out[id] ??= [];
  return out;
}

/* ---------- подписи и камера, вычисленные по геометрии ---------- */

export interface Anchor {
  at: V3;
  center: V3;
  size: number;
}

/** Точка подписи: вершина первой сетки части, ближайшая к её центру среди смотрящих на зрителя. Центр и размер — для камеры. */
export function anchorOf(defs: MeshDef[]): Anchor | null {
  const g = defs.find((d) => !d.noPick)?.g ?? defs[0]?.g;
  if (!g) return null;
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const center = bb.getCenter(new Vector3());
  const size = bb.getSize(new Vector3()).length();
  let best = -1, bestFront = -1, d = 1e9, dFront = 1e9;
  for (let i = 0; i < p.count; i += 1) {
    const dx = p.getX(i) - center.x, dy = p.getY(i) - center.y, dz = p.getZ(i) - center.z;
    const dd = dx * dx + dy * dy + dz * dz * 0.4;
    if (dd < d) { d = dd; best = i; }
    if (n.getZ(i) > 0.35 && dd < dFront) { dFront = dd; bestFront = i; }
  }
  const i = bestFront >= 0 ? bestFront : best;
  return { at: [p.getX(i), p.getY(i), p.getZ(i)], center: [center.x, center.y, center.z], size };
}

export function dynamicAnchor(id: string): Anchor | null {
  const kindOf: Record<string, string> = { 'follicle-primary': 'primary', 'follicle-secondary': 'secondary', 'follicle-antral': 'antral', 'follicle-graafian': 'graafian', 'corpus-luteum': 'luteum', 'corpus-albicans': 'albicans', oocyte: 'graafian' };
  const kind = kindOf[id];
  if (!kind) return null;
  const f = FOLLICLES.find((x) => x.kind === kind && x.ovary === CYCLE_SIDE);
  if (!f) return null;
  const c = OVARY_CENTER(f.ovary);
  const at: V3 = [c[0] + f.at[0], c[1] + f.at[1], c[2] + f.at[2] + f.r * 0.8];
  return { at, center: [c[0] + f.at[0], c[1] + f.at[1], c[2] + f.at[2]], size: 3 };
}
