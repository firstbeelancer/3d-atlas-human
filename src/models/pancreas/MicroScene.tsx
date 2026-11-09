import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, Color, DoubleSide, Object3D, Plane, SphereGeometry, TorusGeometry, Quaternion, Vector3, type BufferGeometry, type InstancedMesh } from 'three';
import type { ModelProps } from '../../three/types';
import { Flow } from '../../three/Flow';
import { curveOf, merge, tubePts } from '../gallbladder/geometry';
import { secretion, type V3 } from './anatomy';
import { ACINI, ISLET, SEPTUM, SEPTUM_ARTERY, SEPTUM_DUCT, SEPTUM_NERVE, SEPTUM_VEIN, TRUNK, buildMicroData, type Ell } from './micro';
import { PancPart, PartLabel } from './PancreasPart';
import { MICRO_PART_IDS } from './parts';

/*
  Железа «под микроскопом» — сцена по данным из micro.ts. Слева — долька, справа — островок.
  Гранулы в ацинусе плывут к просвету; после «обеда» вставочные протоки наполняются соком,
  а у островка быстрее бежит кровь с инсулином.
*/

const Y_UP = new Vector3(0, 1, 0);
const o3 = new Object3D();
const q = new Quaternion();

function tint(base: string, amount: number, t: number): Color {
  return new Color(base).offsetHSL((t - 0.5) * amount * 0.5, 0, (t - 0.5) * amount);
}

/** Эллипсоидальные клетки одним вызовом отрисовки. */
function Cells({ list, color, spread = 0.12, rough = 0.42, emissive = '#000000', emi = 0, clip }: { list: Ell[]; color: string; spread?: number; rough?: number; emissive?: string; emi?: number; clip?: Plane[] }) {
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
      <sphereGeometry args={[1, 24, 18]} />
      <meshPhysicalMaterial
        roughness={rough}
        clearcoat={0.6}
        clearcoatRoughness={0.3}
        sheen={0.5}
        sheenColor={new Color('#ffffff')}
        emissive={emissive}
        emissiveIntensity={emi}
        clippingPlanes={clip}
      />
    </instancedMesh>
  );
}

/** Шарики одного цвета (ядра, гранулы, окончания). */
function Balls({ list, color, emissive, emi = 0.3, rough = 0.4, mat }: { list: { p: V3; r: number; tint: number }[]; color: string; emissive?: string; emi?: number; rough?: number; mat?: (m: InstancedMesh | null) => void }) {
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
      m.setColorAt(i, tint(color, 0.16, b.tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    mat?.(m);
    invalidate();
  }, [list, color, invalidate, mat]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]}>
      <sphereGeometry args={[1, 14, 10]} />
      <meshPhysicalMaterial roughness={rough} clearcoat={0.5} emissive={emissive ?? color} emissiveIntensity={emi} />
    </instancedMesh>
  );
}

/** Гранулы в ацинусе плывут к просвету и гаснут у него; после «обеда» — чаще. */
function Granules({ list, state }: { list: { p: V3; r: number; tint: number }[]; state: ModelProps['state'] }) {
  const ref = useRef<InstancedMesh>(null);
  const hero = ACINI[0];
  const phase = useRef(0);
  const last = useRef(0);
  const data = useMemo(
    () =>
      list.map((g) => {
        const d = new Vector3(g.p[0] - hero.c[0], g.p[1] - hero.c[1], g.p[2] - hero.c[2]);
        const r = d.length();
        return { dir: d.divideScalar(r), r, size: g.r, off: g.tint };
      }),
    [list, hero],
  );
  const col = useMemo(() => new Color('#ff8a3d'), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    data.forEach((_, i) => m.setColorAt(i, col.clone().offsetHSL((data[i].off - 0.5) * 0.06, 0, (data[i].off - 0.5) * 0.15)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [data, col]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const now = state.time.current;
    const dt = Math.max(0, now - last.current);
    last.current = now;
    phase.current += dt * (0.025 + 0.16 * secretion(now));
    const lumen = hero.R * 0.28;
    data.forEach((g, i) => {
      const f = (g.off + phase.current) % 1;
      const r = g.r - (g.r - lumen) * f * f;
      const fade = Math.min(1, (1 - f) * 5);
      o3.position.set(hero.c[0] + g.dir.x * r, hero.c[1] + g.dir.y * r, hero.c[2] + g.dir.z * r);
      o3.quaternion.identity();
      o3.scale.setScalar(g.size * (0.35 + 0.65 * fade));
      o3.updateMatrix();
      m.setMatrixAt(i, o3.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, data.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 14, 10]} />
      <meshPhysicalMaterial color="#ff8a3d" emissive="#c2551a" emissiveIntensity={0.35} roughness={0.35} clearcoat={0.7} />
    </instancedMesh>
  );
}

const glassMat = { transparent: true, depthWrite: false, side: DoubleSide } as const;

export default function MicroScene({ state, names = {} }: ModelProps) {
  const D = useMemo(buildMicroData, []);
  const invalidate = useThree((s) => s.invalidate);

  const geo = useMemo(() => {
    const trunk = curveOf(TRUNK);
    const ac = ACINI[0];
    const membranes = ACINI.filter((a) => !a.hero).map((a) => {
      const g = new SphereGeometry(a.R * 1.04, 36, 24);
      g.translate(...a.c);
      return g;
    });
    const lumens = ACINI.map((a) => {
      const g = new SphereGeometry(a.R * 0.27, 20, 14);
      g.translate(...a.c);
      return g;
    });
    const heroMembrane = new SphereGeometry(ac.R * 1.04, 48, 32);
    heroMembrane.translate(...ac.c);
    const rings = D.capLoops.map((l) => {
      const g = new TorusGeometry(l.R, 0.045, 8, 48);
      const qq = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...l.tilt));
      g.applyQuaternion(qq);
      g.translate(...l.c);
      return g;
    });
    const septum = new BoxGeometry(SEPTUM.t, SEPTUM.y1 - SEPTUM.y0, SEPTUM.z1 - SEPTUM.z0);
    septum.translate(SEPTUM.x, (SEPTUM.y0 + SEPTUM.y1) / 2, (SEPTUM.z0 + SEPTUM.z1) / 2);
    const isletShell = new SphereGeometry(ISLET.r + 0.14, 48, 32);
    isletShell.translate(...ISLET.c);
    return {
      trunkWall: tubePts(TRUNK, 0.33, 0.24, { radial: 18, capStart: false }),
      trunkCore: tubePts(TRUNK, 0.2, 0.14, { radial: 14, capEnd: true }),
      trunkCurve: trunk,
      membranes: merge(membranes),
      heroMembrane,
      lumens: merge(lumens),
      inter: merge(D.intercalated.map((p) => tubePts(p, 0.1, 0.07, { radial: 10, segs: 14 }))),
      interCore: merge(D.intercalated.map((p) => tubePts(p, 0.05, 0.035, { radial: 8, segs: 14, capEnd: true }))),
      interCurves: D.intercalated.map((p) => curveOf(p)),
      rings: merge(rings),
      capPaths: merge(D.capPaths.map((p) => tubePts(p, 0.11, 0.09, { radial: 10 }))),
      septum,
      sepDuct: tubePts(SEPTUM_DUCT, 0.34, 0.34, { radial: 16 }),
      sepArt: tubePts(SEPTUM_ARTERY, 0.2, 0.2, { radial: 12 }),
      sepVein: tubePts(SEPTUM_VEIN, 0.24, 0.24, { radial: 12 }),
      sepNerve: tubePts(SEPTUM_NERVE, 0.09, 0.09, { radial: 8 }),
      isletShell,
      isletCaps: merge(D.isletCaps.map((p) => tubePts(p, 0.17, 0.17, { radial: 12 }))),
      isletFeed: merge([tubePts(D.isletFeed.artery, 0.2, 0.17, { radial: 12, capStart: true }), tubePts(D.isletFeed.vein, 0.19, 0.24, { radial: 12, capEnd: true })]),
      isletCapCurves: D.isletCaps.map((p) => curveOf(p)),
      feedArtery: curveOf(D.isletFeed.artery),
      feedVein: curveOf(D.isletFeed.vein),
      nerve: merge(D.nerve.map((p, i) => tubePts(p, i ? 0.05 : 0.09, i ? 0.035 : 0.06, { radial: 8, capEnd: true }))),
      cutAcinus: new Plane(new Vector3(0, 0, -1), ACINI[0].c[2] + ACINI[0].R * 0.42 * 1.04),
      cutIslet: new Plane(new Vector3(0, 0, -1), 0.82),
    };
  }, [D]);

  const planeAcinus = useMemo(() => [geo.cutAcinus], [geo]);
  const planeIslet = useMemo(() => [geo.cutIslet], [geo]);

  useLayoutEffect(() => {
    invalidate();
    return () => {
      for (const v of Object.values(geo)) if ((v as BufferGeometry).isBufferGeometry) (v as BufferGeometry).dispose();
    };
  }, [geo, invalidate]);

  const label = (id: string) => <PartLabel id={id} names={names} micro at={D.anchors[id]} />;
  const meal = (t: number) => 0.2 + 3.2 * secretion(t);
  const cells = D.cells;
  const ids = [...MICRO_PART_IDS];
  void ids;

  return (
    <group>
      {/* Ацинус: базальная мембрана, просвет и гроздь соседних */}
      <PancPart id="acinus" micro>
        <mesh geometry={geo.membranes}>
          <meshPhysicalMaterial {...glassMat} color="#f3e6f2" opacity={0.14} roughness={0.1} clearcoat={1} />
        </mesh>
        <mesh geometry={geo.heroMembrane}>
          <meshPhysicalMaterial {...glassMat} color="#f3e6f2" opacity={0.14} roughness={0.1} clearcoat={1} clippingPlanes={planeAcinus} />
        </mesh>
        <mesh geometry={geo.lumens}>
          <meshPhysicalMaterial color="#a8d9ee" transparent opacity={0.55} roughness={0.1} clearcoat={1} emissive="#4a9fc4" emissiveIntensity={0.25} depthWrite={false} />
        </mesh>
        {label('acinus')}
      </PancPart>

      <PancPart id="acinar-cell" micro>
        <Cells list={cells} color="#d79cc3" spread={0.16} />
        <Balls list={D.nuclei} color="#5a3a8c" emi={0.1} />
        {label('acinar-cell')}
      </PancPart>

      <PancPart id="zymogen" micro>
        <Granules list={D.granules} state={state} />
        {label('zymogen')}
      </PancPart>

      <PancPart id="centroacinar" micro>
        <Cells list={D.centro} color="#8fd0e8" spread={0.1} emissive="#3b8fb0" emi={0.18} />
        {label('centroacinar')}
      </PancPart>

      <PancPart id="intercalated-duct" micro>
        <mesh geometry={geo.inter}>
          <meshPhysicalMaterial {...glassMat} color="#c9e8ee" opacity={0.5} roughness={0.12} clearcoat={1} />
        </mesh>
        <mesh geometry={geo.interCore}>
          <meshPhysicalMaterial color="#f4c95a" emissive="#b0800f" emissiveIntensity={0.3} roughness={0.3} />
        </mesh>
        {geo.interCurves.map((c, i) => (
          <Flow key={i} path={c} count={4} speed={0.06} color="#ffd36a" size={0.06} state={state} pulse={meal} />
        ))}
        {label('intercalated-duct')}
      </PancPart>

      <PancPart id="intralobular-duct" micro>
        <mesh geometry={geo.trunkWall}>
          <meshPhysicalMaterial {...glassMat} color="#c9e8ee" opacity={0.5} roughness={0.12} clearcoat={1} />
        </mesh>
        <mesh geometry={geo.trunkCore}>
          <meshPhysicalMaterial color="#f4c95a" emissive="#b0800f" emissiveIntensity={0.3} roughness={0.3} />
        </mesh>
        <Flow path={geo.trunkCurve} count={9} speed={0.05} color="#ffd36a" size={0.1} state={state} pulse={meal} />
        {label('intralobular-duct')}
      </PancPart>

      <PancPart id="septum" micro>
        <mesh geometry={geo.septum}>
          <meshPhysicalMaterial {...glassMat} color="#f3e3b8" opacity={0.28} roughness={0.3} clearcoat={0.6} />
        </mesh>
        <mesh geometry={geo.sepDuct}>
          <meshPhysicalMaterial {...glassMat} color="#c9e8ee" opacity={0.6} roughness={0.12} clearcoat={1} />
        </mesh>
        <mesh geometry={geo.sepArt}>
          <meshPhysicalMaterial color="#c3362e" roughness={0.35} clearcoat={0.6} />
        </mesh>
        <mesh geometry={geo.sepVein}>
          <meshPhysicalMaterial color="#46589e" roughness={0.38} clearcoat={0.5} />
        </mesh>
        <mesh geometry={geo.sepNerve}>
          <meshPhysicalMaterial color="#e8c64c" roughness={0.5} />
        </mesh>
        {label('septum')}
      </PancPart>

      <PancPart id="acinar-capillary" micro>
        <mesh geometry={geo.rings}>
          <meshPhysicalMaterial color="#d24a44" roughness={0.35} clearcoat={0.6} emissive="#4a0000" emissiveIntensity={0.12} />
        </mesh>
        <mesh geometry={geo.capPaths}>
          <meshPhysicalMaterial color="#d24a44" roughness={0.35} clearcoat={0.6} emissive="#4a0000" emissiveIntensity={0.12} />
        </mesh>
        {label('acinar-capillary')}
      </PancPart>

      {/* Островок Лангерганса */}
      <PancPart id="islet" micro>
        <mesh geometry={geo.isletShell}>
          <meshPhysicalMaterial {...glassMat} color="#fff3e0" opacity={0.12} roughness={0.08} clearcoat={1} clippingPlanes={planeIslet} />
        </mesh>
        {label('islet')}
      </PancPart>

      <PancPart id="beta-cell" micro>
        <Cells list={D.islet.beta} color="#3aa0e0" spread={0.1} emissive="#1c6fa8" emi={0.22} clip={planeIslet} />
        {label('beta-cell')}
      </PancPart>
      <PancPart id="alpha-cell" micro>
        <Cells list={D.islet.alpha} color="#f08a3a" spread={0.1} emissive="#b4531a" emi={0.22} clip={planeIslet} />
        {label('alpha-cell')}
      </PancPart>
      <PancPart id="delta-cell" micro>
        <Cells list={D.islet.delta} color="#58c46a" spread={0.1} emissive="#2a8a3c" emi={0.22} clip={planeIslet} />
        {label('delta-cell')}
      </PancPart>
      <PancPart id="pp-cell" micro>
        <Cells list={D.islet.pp} color="#a76be0" spread={0.1} emissive="#6b3aa8" emi={0.25} clip={planeIslet} />
        {label('pp-cell')}
      </PancPart>

      <PancPart id="islet-capillary" micro>
        <mesh geometry={geo.isletCaps}>
          <meshPhysicalMaterial {...glassMat} color="#e0615a" opacity={0.6} roughness={0.2} clearcoat={0.8} />
        </mesh>
        <mesh geometry={geo.isletFeed}>
          <meshPhysicalMaterial {...glassMat} color="#d9524a" opacity={0.55} roughness={0.2} clearcoat={0.8} />
        </mesh>
        {geo.isletCapCurves.map((c, i) => (
          <Flow key={`r${i}`} path={c} count={9} speed={0.05} color="#b3201c" size={0.1} state={state} />
        ))}
        {geo.isletCapCurves.map((c, i) => (
          <Flow key={`i${i}`} path={c} count={6} speed={0.035} color="#9fe3ff" size={0.055} state={state} pulse={(t) => 0.4 + 3 * secretion(t)} />
        ))}
        <Flow path={geo.feedArtery} count={5} speed={0.05} color="#b3201c" size={0.1} state={state} />
        <Flow path={geo.feedVein} count={5} speed={0.05 * 1.4} color="#7a86d8" size={0.1} state={state} pulse={(t) => 0.6 + 2 * secretion(t)} />
        {label('islet-capillary')}
      </PancPart>

      <PancPart id="islet-nerve" micro>
        <mesh geometry={geo.nerve}>
          <meshPhysicalMaterial color="#e8c64c" roughness={0.5} clearcoat={0.3} />
        </mesh>
        <Balls list={D.nerveBulbs.map((p) => ({ p, r: 0.1, tint: 0.5 }))} color="#f2d45e" emi={0.35} />
        {label('islet-nerve')}
      </PancPart>
    </group>
  );
}
