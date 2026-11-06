import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, IcosahedronGeometry, Object3D, Vector3, type InstancedMesh } from 'three';
import type { ModelProps } from '../../three/types';
import { Tissue, usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { isolatedSet, type Vec } from './anatomy';
import { rng } from './tubes';

/*
  Печёночная долька — шестигранная призма: в центре центральная вена, по углам портальные триады
  (ветка воротной вены, артериола, желчный проток). От центра к краю идут балки гепатоцитов,
  между ними — синусоиды, по которым кровь течёт к центру; жёлчь в капиллярах внутри балок — наоборот, к краю.
  Передняя часть дольки «вырезана», чтобы заглянуть внутрь.
*/

const R = 1.7;
const H = 2.3;
const APOTHEM = R * Math.cos(Math.PI / 6);
const TAU = Math.PI * 2;
const PLATES = 24;
const ROWS = 10;
const R_IN = 0.3;

const dir = (a: number): [number, number] => [Math.sin(a), Math.cos(a)];

function rmax(a: number): number {
  const d = ((((a - Math.PI / 6) % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3)) - Math.PI / 6;
  return APOTHEM / Math.cos(d);
}

/** Угол от направления на зрителя, −π..π. */
const wrap = (a: number) => a - Math.round(a / TAU) * TAU;
const open = (a: number) => Math.abs(wrap(a)) < 0.9;

/** Заполняет экземпляры при каждом появлении сетки на сцене (часть можно скрыть и показать снова). */
function useInstances(count: number, fill: (i: number, o: Object3D, c: Color) => void) {
  return useCallback(
    (mesh: InstancedMesh | null) => {
      if (!mesh) return;
      const o = new Object3D();
      const c = new Color();
      for (let i = 0; i < count; i++) {
        c.set('#ffffff');
        fill(i, o, c);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
    [count, fill],
  );
}

/** Бегущие частицы: движутся по радиусу между rA и rB на своей высоте и в своём канале. */
function RadialFlow({ channels, color, speed, from, time, size = 0.032 }: { channels: { a: number; y: number; r0: number; r1: number }[]; color: string; speed: number; from: 0 | 1; time: { current: number }; size?: number }) {
  const per = 4;
  const total = channels.length * per;
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const phase = useMemo(() => {
    const r = rng(77 + total);
    return Array.from({ length: total }, () => r());
  }, [total]);
  const col = useMemo(() => new Color(color), [color]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < total; i++) {
      const ch = channels[Math.floor(i / per)];
      const f = (phase[i] + (i % per) / per + time.current * speed) % 1;
      const t = from === 0 ? f : 1 - f;
      const r = ch.r0 + (ch.r1 - ch.r0) * t;
      const [dx, dz] = dir(ch.a);
      dummy.position.set(dx * r, ch.y, dz * r);
      dummy.scale.setScalar(size * (0.5 + 0.5 * Math.min(1, f * 6, (1 - f) * 6)));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, total]} raycast={() => null} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.7} roughness={0.4} />
    </instancedMesh>
  );
}

function Part({ id, children }: { id: string; children: ReactNode }) {
  const { handlers } = usePart(id);
  return (
    <group {...handlers}>
      {children}
    </group>
  );
}

export function LobuleScene({ state, names }: ModelProps & { names: Record<string, string> }) {
  const { selected, isolate, hovered } = useSelection();
  const set = isolate && selected ? isolatedSet(selected) : null;
  const show = (id: string) => !set || set.has(id);
  const isActive = (id: string) => [selected, hovered].some((s) => s === id || s === 'g-lobule');
  const activeOnly = (id: string) => selected === id || hovered === id;

  const plates = useMemo(() => {
    const out: { a: number; rm: number }[] = [];
    for (let i = 0; i < PLATES; i++) {
      const a = (i / PLATES) * TAU;
      if (!open(a)) out.push({ a, rm: rmax(a) });
    }
    return out;
  }, []);
  const channels = useMemo(
    () =>
      plates.flatMap((p) => {
        const a = p.a + TAU / PLATES / 2;
        if (open(a)) return [];
        const rm = rmax(a);
        return [0.8, 0.35, -0.1, -0.55, -0.9].map((y) => ({ a, y, r0: R_IN + 0.02, r1: rm - 0.1 }));
      }),
    [plates],
  );
  const canals = useMemo(() => plates.flatMap((p) => [0.62, 0.05, -0.62].map((y) => ({ a: p.a, y, r0: R_IN + 0.02, r1: p.rm - 0.12 }))), [plates]);

  // гепатоциты: ряды клеток вдоль балок
  const beads = useMemo(() => {
    const list: { a: number; r: number; y: number; seed: number }[] = [];
    let seed = 0;
    for (const p of plates) {
      for (let j = 0; j < ROWS; j++) {
        const y = -H * 0.46 + ((j + 0.5) * H * 0.92) / ROWS;
        for (let r = R_IN + 0.12; r < p.rm - 0.14; r += 0.175) list.push({ a: p.a, r, y, seed: seed++ });
      }
    }
    return list;
  }, [plates]);
  const fillBead = useMemo(
    () => (i: number, o: Object3D, c: Color) => {
      const b = beads[i];
      const rnd = rng(b.seed * 7 + 3);
      const [dx, dz] = dir(b.a);
      o.position.set(dx * b.r + (rnd() - 0.5) * 0.02, b.y + (rnd() - 0.5) * 0.015, dz * b.r + (rnd() - 0.5) * 0.02);
      o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      const s = 0.082 + rnd() * 0.014;
      o.scale.set(s * 1.1, s * 0.92, s * 1.1);
      c.setHSL(0.03 + rnd() * 0.02, 0.38 + rnd() * 0.1, 0.72 + rnd() * 0.07);
    },
    [beads],
  );
  const beadRef = useInstances(beads.length, fillBead);

  // клетки Купфера на стенках синусоидов
  const kupffer = useMemo(() => {
    const r = rng(4242);
    const used = channels.filter((_, i) => i % 5 === 0);
    return used.slice(0, 20).map((ch, i) => ({ a: ch.a, r: 0.6 + r() * (ch.r1 - 0.45), y: ch.y + (r() - 0.5) * 0.3, s: 0.075 + r() * 0.03, rot: i }));
  }, [channels]);
  const spiky = useMemo(() => {
    const g = new IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    const v = new Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const k = 1 + 0.85 * Math.pow(Math.abs(Math.sin(4.2 * v.x + 1) * Math.sin(4.2 * v.y + 2) * Math.sin(4.2 * v.z + 3)), 0.6);
      p.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const fillK = useMemo(
    () => (i: number, o: Object3D, c: Color) => {
      const k = kupffer[i];
      const [dx, dz] = dir(k.a);
      o.position.set(dx * k.r, k.y, dz * k.r);
      o.rotation.set(k.rot, k.rot * 2, 0);
      o.scale.setScalar(k.s);
      c.set('#ffffff');
    },
    [kupffer],
  );
  const kRef = useInstances(kupffer.length, fillK);

  const edges = useMemo(() => {
    const pts: Vector3[] = [];
    const corner = (k: number, y: number) => new Vector3(Math.sin((k * Math.PI) / 3) * R, y, Math.cos((k * Math.PI) / 3) * R);
    for (let k = 0; k < 6; k++) {
      for (const y of [-H / 2, H / 2]) pts.push(corner(k, y), corner(k + 1, y));
      pts.push(corner(k, -H / 2), corner(k, H / 2));
    }
    return new BufferGeometry().setFromPoints(pts);
  }, []);

  const corner = (k: number, s = 0.93): Vec => [Math.sin((k * Math.PI) / 3) * R * s, 0, Math.cos((k * Math.PI) / 3) * R * s];
  const lab = (id: string, at: Vec) => <Label labels={state.labels} partId={id} text={names[id]} at={at} />;
  const triadK = [0, 1, 2, 3, 4, 5];

  return (
    <group scale={1.75}>
      {show('hepatic-lobule') && (
        <group>
          <mesh raycast={() => null}>
            <cylinderGeometry args={[R, R, H, 6, 1, true]} />
            <Tissue kind="glass" opacity={isActive('hepatic-lobule') ? 0.26 : undefined} />
          </mesh>
          <mesh position={[0, -H / 2 - 0.03, 0]} raycast={() => null}>
            <cylinderGeometry args={[R, R, 0.05, 6]} />
            <Tissue kind="glass" opacity={0.35} />
          </mesh>
          <lineSegments geometry={edges} raycast={() => null}>
            <lineBasicMaterial color={isActive('hepatic-lobule') ? '#e8734a' : '#5a6b8a'} />
          </lineSegments>
          <Label labels={state.labels} partId="hepatic-lobule" text={names['hepatic-lobule']} at={[Math.sin(Math.PI / 3) * R, H / 2, Math.cos(Math.PI / 3) * R]} />
        </group>
      )}

      {show('central-vein') && (
        <Part id="central-vein">
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, H + 0.14, 28, 1, true]} />
            <Tissue kind="vein" opacity={0.78} active={activeOnly('central-vein') || selected === 'g-lobule'} />
          </mesh>
          <mesh position={[0, H / 2 + 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.025, 10, 28]} />
            <Tissue kind="vein" active={activeOnly('central-vein')} />
          </mesh>
          {lab('central-vein', [0, H / 2 + 0.1, 0])}
        </Part>
      )}

      {show('portal-triad') && (
        <Part id="portal-triad">
          {triadK.map((k) => {
            const [x, , z] = corner(k, 0.95);
            const a = (k * Math.PI) / 3;
            const tx = Math.cos(a);
            const tz = -Math.sin(a);
            const act = activeOnly('portal-triad');
            return (
              <group key={k} position={[x, 0, z]}>
                <mesh>
                  <cylinderGeometry args={[0.11, 0.11, H + 0.12, 20]} />
                  <Tissue kind="portal" active={act} />
                </mesh>
                <mesh position={[tx * 0.19, 0, tz * 0.19]}>
                  <cylinderGeometry args={[0.058, 0.058, H + 0.12, 14]} />
                  <Tissue kind="artery" active={act} />
                </mesh>
                <mesh position={[-tx * 0.17, 0, -tz * 0.17]}>
                  <cylinderGeometry args={[0.068, 0.068, H + 0.12, 14]} />
                  <Tissue kind="duct" active={act} />
                </mesh>
              </group>
            );
          })}
          {lab('portal-triad', [corner(5)[0], H / 2 + 0.1, corner(5)[2]])}
        </Part>
      )}

      {show('hepatocytes') && (
        <Part id="hepatocytes">
          <instancedMesh ref={beadRef} args={[undefined, undefined, beads.length]}>
            <icosahedronGeometry args={[1, 1]} />
            <Tissue kind="hepatocyte" active={activeOnly('hepatocytes') || selected === 'g-lobule'} />
          </instancedMesh>
          {lab('hepatocytes', [Math.sin(1.2) * 1.05, 0.45, Math.cos(1.2) * 1.05])}
        </Part>
      )}

      {show('sinusoids') && (
        <Part id="sinusoids">
          {channels
            .filter((c) => c.y === 0.35)
            .map((c, i) => {
              const [dx, dz] = dir(c.a);
              const mid = (c.r0 + c.r1) / 2;
              return (
                <mesh key={i} position={[dx * mid, 0, dz * mid]} rotation={[0, c.a - Math.PI / 2, 0]}>
                  <boxGeometry args={[c.r1 - c.r0, H * 0.92, 0.05]} />
                  <Tissue kind="sinusoid" opacity={activeOnly('sinusoids') ? 0.85 : undefined} />
                </mesh>
              );
            })}
          <RadialFlow channels={channels} color="#ff5a48" speed={0.16} from={1} time={state.time} />
          {lab('sinusoids', [Math.sin(-1.31) * 1.15, -0.35, Math.cos(-1.31) * 1.15])}
        </Part>
      )}

      {show('kupffer-cells') && (
        <Part id="kupffer-cells">
          <instancedMesh ref={kRef} args={[spiky, undefined, kupffer.length]}>
            <Tissue kind="kupffer" active={activeOnly('kupffer-cells') || selected === 'g-lobule'} />
          </instancedMesh>
          {kupffer[0] && lab('kupffer-cells', [Math.sin(kupffer[0].a) * kupffer[0].r, kupffer[0].y + 0.1, Math.cos(kupffer[0].a) * kupffer[0].r])}
        </Part>
      )}

      {show('bile-canaliculi') && (
        <Part id="bile-canaliculi">
          {canals.map((c, i) => {
            const [dx, dz] = dir(c.a);
            const mid = (c.r0 + c.r1) / 2;
            return (
              <mesh key={i} position={[dx * mid, c.y, dz * mid]} rotation={[0, c.a - Math.PI / 2, Math.PI / 2]}>
                <cylinderGeometry args={[0.014, 0.014, c.r1 - c.r0, 6]} />
                <Tissue kind="canaliculus" active={activeOnly('bile-canaliculi') || selected === 'g-lobule'} />
              </mesh>
            );
          })}
          <RadialFlow channels={canals} color="#7dff98" speed={0.12} from={0} time={state.time} size={0.026} />
          {lab('bile-canaliculi', [Math.sin(-1.6) * 0.9, -0.62, Math.cos(-1.6) * 0.9])}
        </Part>
      )}
    </group>
  );
}
