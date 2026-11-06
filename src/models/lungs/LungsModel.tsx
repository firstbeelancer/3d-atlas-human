import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import type { ModelProps } from '../../three/types';
import { Tissue, usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { ALVEOLUS_PARTS, EXPLODE, INNER_PARTS, isolatedSet, type Vec } from './anatomy';
import { buildAirways, lobeGeometry, tubeOf, type Branch } from './geometry';
import { AlveolusScene } from './AlveolusScene';

const LOBES = [
  { id: 'upper-lobe-right', kind: 'ru' as const, side: 1 as const },
  { id: 'middle-lobe', kind: 'rm' as const, side: 1 as const },
  { id: 'lower-lobe-right', kind: 'rl' as const, side: 1 as const },
  { id: 'upper-lobe-left', kind: 'lu' as const, side: -1 as const },
  { id: 'lower-lobe-left', kind: 'll' as const, side: -1 as const },
];

const LABELED = new Set(['right-lung', 'left-lung', 'trachea', 'main-bronchi', 'pleura', 'diaphragm', 'pulmonary-trunk', 'alveoli']);

function Piece({ id, geometry, vec, explode, opacity, ghost, children }: { id: string; geometry: object; vec: Vec; explode: MutableRefObject<number>; opacity?: number; ghost?: boolean; children?: import('react').ReactNode }) {
  const { handlers, active } = usePart(id);
  const ref = useRef<Group>(null);
  useFrame(() => ref.current?.position.set(vec[0] * explode.current, vec[1] * explode.current, vec[2] * explode.current));
  return (
    <group ref={ref}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <mesh geometry={geometry as any} {...handlers}>
        <Tissue kind="inner" active={active} opacity={opacity ?? (ghost ? 0.16 : undefined)} vertexColors color={active ? undefined : '#e58b95'} />
      </mesh>
      {children}
    </group>
  );
}

function Tube({ branch, partId, explode, vec }: { branch: Branch; partId: string; explode: MutableRefObject<number>; vec: Vec }) {
  const { handlers, active } = usePart(partId);
  const geo = useMemo(() => tubeOf(branch), [branch]);
  const ref = useRef<Group>(null);
  useFrame(() => ref.current?.position.set(vec[0] * explode.current, vec[1] * explode.current, vec[2] * explode.current));
  const kind = partId === 'pulmonary-trunk' ? 'artery' : partId === 'pulmonary-veins' ? 'vein' : partId === 'nerves' ? 'nerve' : 'cartilage';
  return (
    <group ref={ref}>
      <mesh geometry={geo} {...handlers}>
        <Tissue kind={kind as never} active={active} />
      </mesh>
    </group>
  );
}

function Organ({ state, names }: ModelProps) {
  const { selected, isolate } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const ghost = !!state.modes.inside || (selected !== null && INNER_PARTS.has(selected));
  const explodeOn = !!state.modes.explode;
  const set = useMemo(() => (isolate && selected ? isolatedSet(selected) : null), [isolate, selected]);
  const show = (id: string) => !set || set.has(id);

  const geos = useMemo(() => LOBES.map((l) => lobeGeometry(l.kind, l.side)), []);
  const airways = useMemo(() => buildAirways(), []);
  const tubes = useMemo(
    () =>
      airways
        .filter((b) => b.lobe !== 'trachea')
        .map((b) => ({
          b,
          partId: b.level <= 1 ? 'main-bronchi' : b.level === 2 ? 'lobar-bronchi' : b.level === 3 ? 'segmental-bronchi' : 'bronchioles',
        })),
    [airways],
  );

  const ex = useRef(0);
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const breath = useRef(0);

  useFrame((st, dt) => {
    const o = outer.current, g = inner.current;
    if (!o || !g) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    ex.current += ((explodeOn && !set ? 1 : 0) - ex.current) * k;
    if (!state.paused) {
      const rate = 14 / 60;
      const ph = (st.clock.elapsedTime * rate) % 1;
      const target = ph < 0.42 ? 0.5 - 0.5 * Math.cos((ph / 0.42) * Math.PI) : 0.5 + 0.5 * Math.cos(((ph - 0.42) / 0.58) * Math.PI);
      breath.current += (target - breath.current) * k;
    }
    const b = breath.current;
    o.scale.setScalar((1 + b * 0.055) * (explodeOn ? 0.86 : 1));
    o.position.y = b * 0.12;
    // плавный разнос долей
    LOBES.forEach(() => {});
    invalidate();
  });

  const label = (id: string) => {
    const nn = names ?? {};
    const anchors: Record<string, Vec> = {
      trachea: [0, 3.0, 0.3],
      'right-lung': [1.9, 0.6, 0.2],
      'left-lung': [-1.9, 0.6, 0.2],
      'main-bronchi': [0.5, 0.7, 0.5],
      pleura: [1.7, -0.4, 0.3],
      diaphragm: [-1.2, -2.0, 0.4],
      'pulmonary-trunk': [-0.5, 1.5, 0.3],
      alveoli: [1.1, -1.0, 0.5],
    };
    const at = anchors[id];
    if (!at) return null;
    return <Label labels={state.labels} partId={id} text={nn[id]} at={at} />;
  };

  return (
    <group ref={outer}>
      <group ref={inner}>
        {LOBES.map((l, i) => {
          if (!show(l.id) && !show('right-lung') && !show('left-lung')) return null;
          const v = EXPLODE[l.id] ?? [0, 0, 0];
          return (
            <Piece key={l.id} id={l.id} geometry={geos[i]} vec={v} explode={ex} ghost={ghost}>
              {LABELED.has(l.id) ? label(l.id) : null}
            </Piece>
          );
        })}
        {/* трахея */}
        {(!set || set.has('trachea')) && (
          <Tube branch={airways[0]} partId="trachea" explode={ex} vec={EXPLODE.trachea ?? [0, 0, 0]} />
        )}
        {/* бронхи */}
        {tubes.slice(0, 90).map(({ b, partId }, i) => {
          if (!show(partId)) return null;
          if (!ghost && b.level >= 4 && selected !== 'bronchioles') return null;
          return <Tube key={i} branch={b} partId={partId} explode={ex} vec={[0, 0, 0]} />;
        })}
        {/* лёгочный ствол */}
        {(!set || set.has('pulmonary-trunk')) && (
          <group>
            <mesh position={[0.05, 1.35, 0.12]}>
              <cylinderGeometry args={[0.2, 0.23, 0.9, 18]} />
              <Tissue kind="artery" active={selected === 'pulmonary-trunk'} />
            </mesh>
          </group>
        )}
        {/* диафрагма */}
        {(!set || set.has('diaphragm')) && (
          <mesh position={[0, -2.05 - breath.current * 0.4, -0.1]}>
            <sphereGeometry args={[2.15, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
            <Tissue kind="muscle" active={selected === 'diaphragm'} />
          </mesh>
        )}
        {/* подписи */}
        {['trachea', 'right-lung', 'left-lung', 'main-bronchi', 'pleura', 'diaphragm', 'pulmonary-trunk', 'alveoli'].map((id) =>
          state.labels || selected === id ? <group key={id}>{label(id)}</group> : null,
        )}
        {/* лёгкий намёк на плевральную оболочку */}
        {(!set || set.has('pleura')) && (
          <mesh scale={1.04} raycast={() => null}>
            <sphereGeometry args={[1.9, 24, 18]} />
            <Tissue kind="membrane" active={selected === 'pleura'} opacity={0.14} />
          </mesh>
        )}
      </group>
    </group>
  );
}

export default function LungsModel(props: ModelProps) {
  const { selected } = useSelection();
  const micro = selected !== null && ALVEOLUS_PARTS.has(selected);
  void Vector3;
  if (micro) return <AlveolusScene state={props.state} names={props.names} />;
  return <Organ {...props} />;
}
