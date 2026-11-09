import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  LatheGeometry,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type CatmullRomCurve3,
  type InstancedMesh,
} from 'three';
import type { ModelProps } from '../../three/types';
import { Flow } from '../../three/Flow';
import { merge, tubePts } from '../gallbladder/geometry';
import { curveOf, squeeze, type V3 } from './anatomy';
import {
  CAPSULE,
  CENTRAL_PTS,
  ELLIPSOIDS,
  FOLLICLE,
  GERM,
  MARGINAL,
  PALS,
  PENICILLAR,
  PULP_VEIN,
  SINUSES,
  SINUS_R,
  TRABECULA,
  TRAB_ARTERY,
  TRAB_VEIN,
  CORD_PATHS,
  buildMicroData,
  type Ball,
  type Ell,
} from './micro';
import { SpleenPart, PartLabel } from './SpleenPart';

/*
  Селезёнка «под микроскопом» — сцена по данным из micro.ts. Слева белая пульпа, справа красная.
  Эритроциты текут по синусам и, на «нагрузке», быстрее; из эллипсоидов они выходят в тяжи
  и протискиваются к щелям между береговыми клетками.
*/

const Y_UP = new Vector3(0, 1, 0);
const o3 = new Object3D();
const q = new Quaternion();

function tint(base: string, amount: number, t: number): Color {
  return new Color(base).offsetHSL((t - 0.5) * amount * 0.5, 0, (t - 0.5) * amount);
}

/** Эллипсоидальные клетки одним вызовом отрисовки. */
function Cells({ list, color, spread = 0.12, rough = 0.42, emissive = '#000000', emi = 0 }: { list: Ell[]; color: string; spread?: number; rough?: number; emissive?: string; emi?: number }) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((e, i) => {
      o3.position.set(...e.p);
      q.setFromUnitVectors(Y_UP, new Vector3(...e.dir).normalize());
      o3.quaternion.copy(q);
      o3.scale.set(e.rs, e.rl, e.rs);
      o3.updateMatrix();
      m.setMatrixAt(i, o3.matrix);
      m.setColorAt(i, tint(color, spread, e.tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [list, color, spread, invalidate]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]}>
      <sphereGeometry args={[1, 20, 14]} />
      <meshPhysicalMaterial roughness={rough} clearcoat={0.6} clearcoatRoughness={0.3} sheen={0.5} sheenColor="#ffffff" emissive={emissive} emissiveIntensity={emi} />
    </instancedMesh>
  );
}

/** Шарики (ядра, клетки, включения). */
function Balls({ list, color, emissive, emi = 0.2, rough = 0.4, spread = 0.16 }: { list: Ball[]; color: string; emissive?: string; emi?: number; rough?: number; spread?: number }) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((b, i) => {
      o3.position.set(...b.p);
      o3.quaternion.identity();
      o3.scale.setScalar(b.r);
      o3.updateMatrix();
      m.setMatrixAt(i, o3.matrix);
      m.setColorAt(i, tint(color, spread, b.tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [list, color, spread, invalidate]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]}>
      <sphereGeometry args={[1, 18, 12]} />
      <meshPhysicalMaterial roughness={rough} clearcoat={0.55} clearcoatRoughness={0.3} emissive={emissive ?? color} emissiveIntensity={emi} />
    </instancedMesh>
  );
}

/** Двояковогнутый диск — эритроцит. Ось диска — Y. */
function discGeometry(): BufferGeometry {
  const top: Vector2[] = [];
  const bottom: Vector2[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const r = i / n;
    const h = Math.sqrt(Math.max(0, 1 - r * r)) * (0.12 + 0.7 * r * r - 0.45 * r ** 4);
    top.push(new Vector2(r, h));
    bottom.unshift(new Vector2(r, -h));
  }
  void bottom;
  const profile = [...top.map((p) => new Vector2(p.x, -p.y)), ...top.slice().reverse().slice(1)];
  return new LatheGeometry(profile, 20);
}

/** Эритроциты в тяжах: неподвижные диски в случайных положениях. */
function Discs({ list, color, scale = 1 }: { list: Ell[]; color: string; scale?: number }) {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(discGeometry, []);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((e, i) => {
      o3.position.set(...e.p);
      q.setFromUnitVectors(Y_UP, new Vector3(...e.dir).normalize());
      o3.quaternion.copy(q);
      o3.scale.setScalar(e.rl * scale);
      o3.updateMatrix();
      m.setMatrixAt(i, o3.matrix);
      m.setColorAt(i, tint(color, 0.14, e.tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [list, color, scale, invalidate]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, list.length]}>
      <meshPhysicalMaterial roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.3} color="#ffffff" emissive="#4a0a0a" emissiveIntensity={0.18} />
    </instancedMesh>
  );
}

/** Эритроциты, плывущие по трубке: диски вдоль кривой, скорость растёт на «нагрузке». */
function RbcFlow({ path, count, speed, state, color = '#d33a36', size = 0.2 }: { path: CatmullRomCurve3; count: number; speed: number; state: ModelProps['state']; color?: string; size?: number }) {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(discGeometry, []);
  const phase = useRef(0);
  const last = useRef(0);
  const offs = useMemo(() => Array.from({ length: count }, (_, i) => i / count + ((i * 7919) % 13) * 0.004), [count]);
  const col = useMemo(() => new Color(color), [color]);
  const tan = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const now = state.time.current;
    const dt = Math.max(0, now - last.current);
    last.current = now;
    phase.current += dt * speed * (0.6 + 2.2 * squeeze(now));
    for (let i = 0; i < count; i++) {
      const t = (offs[i] + phase.current) % 1;
      path.getPointAt(t, o3.position);
      path.getTangentAt(t, tan);
      // диск плывёт ребром вперёд, слегка вращаясь
      q.setFromUnitVectors(Y_UP, tan.clone().cross(new Vector3(0, 0, 1)).normalize());
      o3.quaternion.copy(q);
      o3.rotateOnAxis(Y_UP, 0);
      o3.rotateX(now * 1.2 + i);
      const fade = Math.min(1, t * 10, (1 - t) * 10);
      o3.scale.setScalar(size * (0.3 + 0.7 * fade));
      o3.updateMatrix();
      m.setMatrixAt(i, o3.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
      <meshPhysicalMaterial color={col} emissive={col} emissiveIntensity={0.3} roughness={0.38} clearcoat={0.6} />
    </instancedMesh>
  );
}

/** Палочковидные береговые клетки: вытянутые капсулы вдоль стенки синуса. */
function Staves({ list }: { list: { a: V3; b: V3 }[] }) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((s, i) => {
      const a = new Vector3(...s.a);
      const b = new Vector3(...s.b);
      const dir = b.clone().sub(a);
      const len = dir.length();
      o3.position.copy(a).add(b).multiplyScalar(0.5);
      q.setFromUnitVectors(Y_UP, dir.normalize());
      o3.quaternion.copy(q);
      o3.scale.set(0.082, len * 0.52, 0.062);
      o3.updateMatrix();
      m.setMatrixAt(i, o3.matrix);
      m.setColorAt(i, tint('#efbcae', 0.12, (i * 0.37) % 1));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [list, invalidate]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshPhysicalMaterial roughness={0.4} clearcoat={0.6} clearcoatRoughness={0.3} emissive="#7a3a30" emissiveIntensity={0.12} />
    </instancedMesh>
  );
}

const glassMat = { transparent: true, depthWrite: false, side: DoubleSide } as const;

export default function MicroScene({ state, names = {} }: ModelProps) {
  const D = useMemo(buildMicroData, []);
  const invalidate = useThree((s) => s.invalidate);

  const geo = useMemo(() => {
    const capsule = new BoxGeometry(CAPSULE.x1 - CAPSULE.x0, CAPSULE.y1 - CAPSULE.y0, CAPSULE.z1 - CAPSULE.z0);
    capsule.translate((CAPSULE.x0 + CAPSULE.x1) / 2, (CAPSULE.y0 + CAPSULE.y1) / 2, (CAPSULE.z0 + CAPSULE.z1) / 2);
    const trab = new BoxGeometry(TRABECULA.x1 - TRABECULA.x0, TRABECULA.y1 - TRABECULA.y0, TRABECULA.z1 - TRABECULA.z0);
    trab.translate((TRABECULA.x0 + TRABECULA.x1) / 2, (TRABECULA.y0 + TRABECULA.y1) / 2, (TRABECULA.z0 + TRABECULA.z1) / 2);

    const axis = new Vector3(...PALS.b).sub(new Vector3(...PALS.a));
    const pals = new CylinderGeometry(PALS.r, PALS.r, axis.length(), 40, 1, true);
    pals.applyQuaternion(new Quaternion().setFromUnitVectors(Y_UP, axis.clone().normalize()));
    pals.translate((PALS.a[0] + PALS.b[0]) / 2, (PALS.a[1] + PALS.b[1]) / 2, (PALS.a[2] + PALS.b[2]) / 2);
    const palsCap = [PALS.a, PALS.b].map((p) => {
      const g = new SphereGeometry(PALS.r, 28, 18);
      g.translate(...p);
      return g;
    });
    void palsCap;

    const follicle = new SphereGeometry(FOLLICLE.r, 40, 28);
    follicle.translate(...FOLLICLE.c);
    const germ = new SphereGeometry(GERM.r, 32, 22);
    germ.translate(...GERM.c);
    const marginal = new SphereGeometry(1, 48, 32);
    marginal.scale(...MARGINAL.r);
    marginal.translate(...MARGINAL.c);

    const sheaths = ELLIPSOIDS.map((e) => {
      const g = new SphereGeometry(1, 28, 20);
      g.scale(0.5, 0.95, 0.5);
      g.applyQuaternion(new Quaternion().setFromUnitVectors(Y_UP, new Vector3(...e.dir).normalize()));
      g.translate(...e.c);
      return g;
    });
    const ellCaps = ELLIPSOIDS.map((e) => {
      const d = new Vector3(...e.dir).normalize();
      const a = new Vector3(...e.c).addScaledVector(d, -0.85);
      const b = new Vector3(...e.c).addScaledVector(d, 0.85);
      return tubePts([[a.x, a.y, a.z], [b.x, b.y, b.z]], 0.13, 0.1, { radial: 10, capEnd: true });
    });

    const sinusCurves = SINUSES.map((p) => curveOf(p));
    const cordsBox = new BoxGeometry(11.2, 12.4, 5.2);
    cordsBox.translate(6.6, -0.1, 0);
    return {
      capsule,
      trab,
      trabArtery: tubePts(TRAB_ARTERY, 0.3, 0.3, { radial: 14, capStart: true, capEnd: true }),
      trabVein: tubePts(TRAB_VEIN, 0.36, 0.36, { radial: 14, capStart: true, capEnd: true }),
      trabArteryCurve: curveOf(TRAB_ARTERY),
      trabVeinCurve: curveOf([...TRAB_VEIN].reverse()),
      central: tubePts(CENTRAL_PTS, 0.27, 0.17, { radial: 14, capEnd: true }),
      centralCurve: curveOf(CENTRAL_PTS),
      pals,
      follicle,
      germ,
      marginal,
      peni: merge(PENICILLAR.map((p) => tubePts(p, 0.13, 0.08, { radial: 10, capEnd: true }))),
      peniCurves: PENICILLAR.map((p) => curveOf(p)),
      sheaths: merge(sheaths),
      ellCaps: merge(ellCaps),
      cordsBox,
      retic: merge(D.reticular.map((p) => tubePts(p, 0.032, 0.028, { radial: 5, segs: 8 }))),
      sinusWall: merge(SINUSES.map((p) => tubePts(p, SINUS_R - 0.02, SINUS_R - 0.02, { radial: 24, capStart: false }))),
      sinusCurves,
      hoops: merge(D.hoops.map((h) => {
        const g = new TorusGeometry(h.R, 0.028, 6, 36);
        g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...h.t).normalize()));
        g.translate(...h.c);
        return g;
      })),
      pulpVein: tubePts(PULP_VEIN, 0.66, 0.66, { radial: 20, capEnd: true }),
      pulpVeinCurve: curveOf([...PULP_VEIN].reverse()),
      cordCurves: CORD_PATHS.map((p) => curveOf(p)),
    };
  }, [D]);

  useLayoutEffect(() => {
    invalidate();
    return () => {
      for (const v of Object.values(geo)) if ((v as BufferGeometry).isBufferGeometry) (v as BufferGeometry).dispose();
    };
  }, [geo, invalidate]);

  const label = (id: string) => <PartLabel id={id} names={names} micro at={D.anchors[id]} />;
  const rush = (t: number) => 0.7 + 2.2 * squeeze(t);

  return (
    <group>
      {/* Каркас: капсула, трабекула, трабекулярные сосуды */}
      <SpleenPart id="m-capsule" micro>
        <mesh geometry={geo.capsule}>
          <meshPhysicalMaterial {...glassMat} color="#f4e4cc" opacity={0.3} roughness={0.2} clearcoat={0.8} />
        </mesh>
        <Cells list={D.capsuleNuclei} color="#5a3a78" spread={0.1} emissive="#3a2250" emi={0.2} />
        {label('m-capsule')}
      </SpleenPart>
      <SpleenPart id="m-trabecula" micro>
        <mesh geometry={geo.trab}>
          <meshPhysicalMaterial {...glassMat} color="#f4e4cc" opacity={0.28} roughness={0.2} clearcoat={0.8} />
        </mesh>
        <Cells list={D.trabNuclei} color="#5a3a78" spread={0.1} emissive="#3a2250" emi={0.2} />
        {label('m-trabecula')}
      </SpleenPart>
      <SpleenPart id="m-trab-artery" micro>
        <mesh geometry={geo.trabArtery}>
          <meshPhysicalMaterial color="#c3362e" roughness={0.34} clearcoat={0.6} emissive="#300000" emissiveIntensity={0.1} />
        </mesh>
        <Flow path={geo.trabArteryCurve} count={9} speed={0.05} color="#ff7a68" size={0.12} state={state} pulse={rush} />
        {label('m-trab-artery')}
      </SpleenPart>
      <SpleenPart id="m-trab-vein" micro>
        <mesh geometry={geo.trabVein}>
          <meshPhysicalMaterial {...glassMat} color="#5a6cc0" opacity={0.62} roughness={0.25} clearcoat={0.8} />
        </mesh>
        <Flow path={geo.trabVeinCurve} count={9} speed={0.04} color="#7d8ae6" size={0.14} state={state} pulse={rush} />
        {label('m-trab-vein')}
      </SpleenPart>

      {/* Белая пульпа */}
      <SpleenPart id="m-central-artery" micro>
        <mesh geometry={geo.central}>
          <meshPhysicalMaterial color="#c3362e" roughness={0.34} clearcoat={0.6} emissive="#300000" emissiveIntensity={0.1} />
        </mesh>
        <Flow path={geo.centralCurve} count={14} speed={0.06} color="#ff7a68" size={0.1} state={state} pulse={rush} />
        {label('m-central-artery')}
      </SpleenPart>
      <SpleenPart id="m-pals" micro>
        <mesh geometry={geo.pals}>
          <meshPhysicalMaterial {...glassMat} color="#c9bdf0" opacity={0.14} roughness={0.15} clearcoat={0.9} />
        </mesh>
        <Balls list={D.tCells} color="#5b4fb0" emissive="#2d2470" emi={0.18} />
        {label('m-pals')}
      </SpleenPart>
      <SpleenPart id="m-follicle" micro>
        <mesh geometry={geo.follicle}>
          <meshPhysicalMaterial {...glassMat} color="#bcd0f4" opacity={0.14} roughness={0.15} clearcoat={0.9} />
        </mesh>
        <Balls list={D.bMantle} color="#4f86d8" emissive="#2a5aa6" emi={0.2} />
        {label('m-follicle')}
      </SpleenPart>
      <SpleenPart id="m-germinal" micro>
        <mesh geometry={geo.germ}>
          <meshPhysicalMaterial {...glassMat} color="#fff1c2" opacity={0.2} roughness={0.15} clearcoat={0.9} />
        </mesh>
        <Balls list={D.germ} color="#f2dc9a" emissive="#b89a3a" emi={0.2} rough={0.35} />
        <Balls list={D.tingible} color="#b9766a" emissive="#6a2e2a" emi={0.15} />
        {label('m-germinal')}
      </SpleenPart>
      <SpleenPart id="m-marginal-zone" micro>
        <mesh geometry={geo.marginal}>
          <meshPhysicalMaterial {...glassMat} color="#f0d4ea" opacity={0.07} roughness={0.12} clearcoat={1} />
        </mesh>
        <Balls list={D.mzCells} color="#b886d8" emissive="#7a4aa0" emi={0.18} />
        <Balls list={D.mzMacro} color="#d98598" emissive="#8a3a4c" emi={0.15} />
        {label('m-marginal-zone')}
      </SpleenPart>

      {/* Красная пульпа */}
      <SpleenPart id="m-penicillar" micro>
        <mesh geometry={geo.peni}>
          <meshPhysicalMaterial color="#c3362e" roughness={0.34} clearcoat={0.6} emissive="#300000" emissiveIntensity={0.1} />
        </mesh>
        {geo.peniCurves.map((c, i) => (
          <Flow key={i} path={c} count={5} speed={0.07} color="#ff7a68" size={0.08} state={state} pulse={rush} />
        ))}
        {label('m-penicillar')}
      </SpleenPart>
      <SpleenPart id="m-ellipsoid" micro>
        <mesh geometry={geo.sheaths}>
          <meshPhysicalMaterial {...glassMat} color="#f0b8c6" opacity={0.3} roughness={0.2} clearcoat={0.9} />
        </mesh>
        <mesh geometry={geo.ellCaps}>
          <meshPhysicalMaterial color="#c3362e" roughness={0.34} clearcoat={0.6} />
        </mesh>
        {label('m-ellipsoid')}
      </SpleenPart>
      <SpleenPart id="m-cords" micro>
        <mesh geometry={geo.cordsBox}>
          <meshPhysicalMaterial {...glassMat} color="#e8a8a8" opacity={0.05} roughness={0.2} clearcoat={0.5} />
        </mesh>
        <mesh geometry={geo.retic}>
          <meshPhysicalMaterial color="#e6d5b5" roughness={0.5} />
        </mesh>
        {label('m-cords')}
      </SpleenPart>
      <SpleenPart id="m-macrophage" micro>
        <Balls list={D.macros} color="#cf7688" emissive="#7e2e40" emi={0.14} rough={0.5} />
        <Balls list={D.macroInclusions} color="#6e1424" emissive="#3a0610" emi={0.15} />
        {label('m-macrophage')}
      </SpleenPart>
      <SpleenPart id="m-plasma" micro>
        <Cells list={D.plasma} color="#a58be8" spread={0.1} emissive="#5b3fb0" emi={0.18} />
        {label('m-plasma')}
      </SpleenPart>
      <SpleenPart id="m-sinus" micro>
        <mesh geometry={geo.sinusWall}>
          <meshPhysicalMaterial {...glassMat} color="#c8d0f2" opacity={0.1} roughness={0.1} clearcoat={1} />
        </mesh>
        {geo.sinusCurves.map((c, i) => (
          <RbcFlow key={i} path={c} count={18} speed={0.045} state={state} size={0.19} />
        ))}
        {label('m-sinus')}
      </SpleenPart>
      <SpleenPart id="m-littoral" micro>
        <Staves list={D.staves} />
        {label('m-littoral')}
      </SpleenPart>
      <SpleenPart id="m-annular" micro>
        <mesh geometry={geo.hoops}>
          <meshPhysicalMaterial color="#d9c9a0" roughness={0.45} clearcoat={0.4} emissive="#6a5a30" emissiveIntensity={0.15} />
        </mesh>
        {label('m-annular')}
      </SpleenPart>
      <SpleenPart id="m-rbc" micro>
        <Discs list={D.rbcCords} color="#d33a36" />
        {geo.cordCurves.map((c, i) => (
          <RbcFlow key={i} path={c} count={5} speed={0.06} state={state} size={0.18} />
        ))}
        {label('m-rbc')}
      </SpleenPart>
      <SpleenPart id="m-old-rbc" micro>
        <Cells list={D.oldRbc} color="#8c2a2a" spread={0.12} emissive="#3a0a0a" emi={0.2} rough={0.55} />
        {label('m-old-rbc')}
      </SpleenPart>
      <SpleenPart id="m-pulp-vein" micro>
        <mesh geometry={geo.pulpVein}>
          <meshPhysicalMaterial {...glassMat} color="#5a6cc0" opacity={0.5} roughness={0.2} clearcoat={0.9} />
        </mesh>
        <RbcFlow path={geo.pulpVeinCurve} count={14} speed={0.04} state={state} size={0.2} color="#a8423e" />
        {label('m-pulp-vein')}
      </SpleenPart>
    </group>
  );
}
