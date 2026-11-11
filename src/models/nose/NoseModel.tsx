import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, Vector3, type Group, type Material } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import { AXIAL_VIEW, CORONAL_VIEW, FOCUS, NOSE_PART_IDS, OVERVIEW, SCALE, SIDE_CUT_VIEW, SPREAD_VIEW, airwayPath, smellPath, type Focus, type V3 } from './anatomy';
import { buildNose, type MatKey, type MeshDef } from './build';
import { NoseContext, NosePart, PartLabel, type NoseControl } from './NosePart';
import { buildTextures, makeMaterial, type NoseTextures } from './materials';

/*
  Нос, вид спереди: +y — вверх, +z — к зрителю, +x — влево от пациента (вправо на экране).
  Модель в миллиметрах внутри группы с масштабом SCALE. Лицо показано призрачной маской для ориентира.
  Анимация: дыхание (крылья чуть раздуваются на вдохе), в режиме «Путь воздуха» частицы бегут от ноздрей
  через общий носовой ход к хоанам и вниз по носоглотке; в режиме «Путь запаха» сигналы поднимаются
  от обонятельной области через решётчатую пластинку к луковице и по тракту.
*/

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части или к виду на срез; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode }: { ctrl: RefObject<NoseControl>; selected: string | null; explode: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Rig | null;
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ at: Vector3; offset: Vector3 } | null>(null);
  const first = useRef(true);
  const cut = ctrl.current!.cut;
  const kind = ctrl.current!.kind;
  const spread = explode > 0.02;

  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      goal.current = null;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let f: Focus;
    if (selected && FOCUS[selected]) f = FOCUS[selected];
    else if (spread) f = SPREAD_VIEW;
    else if (cut) f = kind === 'fundus' ? AXIAL_VIEW : kind === 'coronal' ? CORONAL_VIEW : SIDE_CUT_VIEW;
    else f = OVERVIEW;
    goal.current = {
      at: new Vector3(...f.at),
      offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist),
    };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cut, kind, spread, invalidate]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-dt * 4.2);
    const offset = camera.position.clone().sub(controls.target);
    controls.target.lerp(g.at, k);
    offset.lerp(g.offset, k);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    invalidate();
    if (controls.target.distanceTo(g.at) < 0.004 && offset.distanceTo(g.offset) < 0.01) goal.current = null;
  });
  return null;
}

/** Меши одной части. Материалы у каждой части свои — подсветка и призрачный режим не задевают соседей. */
function PartMeshes({ defs, tex }: { defs: MeshDef[]; tex: NoseTextures }) {
  const mats = useMemo(() => {
    const map = new Map<MatKey, Material>();
    for (const d of defs) if (!map.has(d.m)) map.set(d.m, makeMaterial(d.m, tex));
    return map;
  }, [defs, tex]);
  useEffect(
    () => () => {
      mats.forEach((m) => m.dispose());
    },
    [mats],
  );
  return (
    <>
      {defs.map((d, i) => (
        <mesh key={i} geometry={d.g} material={mats.get(d.m)} userData={{ noPick: d.noPick }} castShadow receiveShadow />
      ))}
    </>
  );
}

const toCurve = (pts: V3[]) => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');
/** Дыхание: вдох около 1,6 с, выдох около 2,4 с; возвращает скорость потока со знаком. */
export function breath(t: number): number {
  const T = 4;
  const ph = (t % T) / T;
  return ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) : -0.7 * Math.sin(((ph - 0.4) / 0.6) * Math.PI);
}

/** Поток воздуха на вдохе и выдохе: по общему носовому ходу обеих половин. */
function Airflow({ state }: { state: ModelProps['state'] }) {
  const curves = useMemo(() => [toCurve(airwayPath(1)), toCurve(airwayPath(-1))], []);
  const inhale = (t: number) => Math.max(0, breath(t)) * 2.2;
  const exhale = (t: number) => Math.max(0, -breath(t)) * 2.2;
  return (
    <>
      {curves.map((c, i) => (
        <Flow key={`in${i}`} path={c} count={22} speed={0.12} color="#8fd3ff" size={1.1} state={state} pulse={inhale} />
      ))}
      {curves.map((_, i) => (
        <Flow key={`out${i}`} path={toCurve([...(i === 0 ? airwayPath(1) : airwayPath(-1))].reverse())} count={14} speed={0.1} color="#ffd29a" size={0.9} state={state} pulse={exhale} />
      ))}
    </>
  );
}

/** Сигналы запаха: от обонятельной щели через решётчатую пластинку к луковице и по тракту. */
function Smell({ state }: { state: ModelProps['state'] }) {
  const curves = useMemo(() => {
    const out: CatmullRomCurve3[] = [];
    for (const s of [1, -1] as const) for (let k = 0; k < 4; k++) out.push(toCurve(smellPath(s, k)));
    return out;
  }, []);
  return (
    <>
      {curves.map((c, i) => (
        <Flow key={i} path={c} count={6} speed={0.22} color="#ffe27a" size={0.7} state={state} pulse={(t) => 0.6 + 0.6 * Math.max(0, breath(t))} />
      ))}
    </>
  );
}

export default function NoseModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const G = useMemo(buildNose, []);
  const tex = useMemo(buildTextures, []);
  useEffect(
    () => () => {
      for (const defs of Object.values(G)) for (const d of defs) d.g.dispose();
      Object.values(tex).forEach((t) => t?.dispose());
    },
    [G, tex],
  );

  const explodeTarget = state.explode ?? 0;
  const ctrl = useRef<NoseControl>({
    cut: false,
    kind: 'side',
    cutAt: 0.5,
    explode: 0,
    isolate: true,
    selected: null,
    hidden: new Set(),
    labels: true,
    xray: false,
  });
  ctrl.current.cut = state.cutaway;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.cutAt = state.cutAt ?? 0.5;
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;
  ctrl.current.xray = !!state.modes.xray;

  const alaL = useRef<Group>(null);
  const alaR = useRef<Group>(null);
  const lastB = useRef(-9);
  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    // крылья носа чуть расходятся на вдохе
    const b = Math.max(0, breath(state.time.current));
    if (Math.abs(b - lastB.current) > 0.004) {
      lastB.current = b;
      const k = 1 + 0.035 * b * (1 - Math.min(1, c.explode * 3));
      alaL.current?.scale.set(k, 1, 1);
      alaR.current?.scale.set(k, 1, 1);
      invalidate();
    }
  });

  const hideLabels = explodeTarget > 0.02;
  const renderPart = (id: string) => (
    <NosePart key={id} id={id}>
      <PartMeshes defs={G[id]} tex={tex} />
      <PartLabel id={id} names={names} hide={hideLabels} />
    </NosePart>
  );

  const airflow = !!state.modes.airflow;
  const smell = !!state.modes.smell;

  return (
    <NoseContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} />
      <group scale={SCALE}>
        <group ref={alaL}>{renderPart('ala-left')}</group>
        <group ref={alaR}>{renderPart('ala-right')}</group>
        {NOSE_PART_IDS.filter((id) => id !== 'ala-left' && id !== 'ala-right').map(renderPart)}
        {airflow && <Airflow state={state} />}
        {smell && <Smell state={state} />}
      </group>
    </NoseContext.Provider>
  );
}
