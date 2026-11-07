import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, Vector3, type Group, type Material } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import {
  CBD_PTS,
  CHD_PTS,
  CYSTIC_PTS,
  HEPATIC_ARTERY_PTS,
  LEFT_HEPATIC_PTS,
  PANCREATIC_DUCT_PTS,
  PAPILLA,
  PORTAL_PTS,
  RIGHT_HEPATIC_PTS,
  contraction,
  gbAxis,
  type V3,
} from './anatomy';
import { buildGallbladder, type MatKey, type MeshDef } from './build';
import { GbContext, GbPart, PartLabel, type GbControl } from './GallbladderPart';
import { makeMaterial } from './materials';
import { AXIAL_VIEW, CUT_VIEW, FOCUS, GB_PART_IDS, ORGAN_PARTS, OVERVIEW, SPREAD_VIEW, type Focus } from './parts';
import { buildTextures, type GbTextures } from './textures';

/*
  Желчный пузырь, вид спереди: +y — вверх, +z — к зрителю. Пузырь лежит слева на экране (правая сторона пациента),
  прикреплён к нижней поверхности печени; протоки идут вправо и вниз к двенадцатиперстной кишке.
  Анимация: печень непрерывно вырабатывает желчь, она течёт по протокам; после «жирной еды» пузырь сокращается
  и выдавливает концентрированную желчь через пузырный проток в кишку.
*/

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части или к виду на разрез; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode }: { ctrl: RefObject<GbControl>; selected: string | null; explode: number }) {
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
    else if (cut) f = kind === 'fundus' ? AXIAL_VIEW : CUT_VIEW;
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

const toCurve = (pts: V3[]) => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');

/** Меши одной части. Материалы у каждой части свои — подсветка и призрачный режим не задевают соседей. */
function PartMeshes({ defs, tex }: { defs: MeshDef[]; tex: GbTextures }) {
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
        <mesh key={i} geometry={d.g} material={mats.get(d.m)} userData={{ noPick: d.noPick, pickProxy: d.proxy }} />
      ))}
    </>
  );
}

/** Потоки желчи и крови: частицы по каналам. */
function Streams({ id, state }: { id: string; state: ModelProps['state'] }) {
  const curves = useMemo(() => {
    const hep = (a: V3[]) => toCurve([...a, ...CHD_PTS.slice(1), ...CBD_PTS.slice(1)]);
    const gbDuct = toCurve([gbAxis(0.78), gbAxis(0.9), gbAxis(1), ...CYSTIC_PTS.slice(1), ...CBD_PTS.slice(1, 3)]);
    return {
      right: hep(RIGHT_HEPATIC_PTS),
      left: hep(LEFT_HEPATIC_PTS),
      gb: gbDuct,
      panc: toCurve(PANCREATIC_DUCT_PTS),
      jet: toCurve([[PAPILLA[0] - 0.32, PAPILLA[1], PAPILLA[2]], [PAPILLA[0] - 0.75, PAPILLA[1] - 0.2, PAPILLA[2] + 0.02], [PAPILLA[0] - 1.35, PAPILLA[1] - 0.55, PAPILLA[2] + 0.05]]),
      portal: toCurve([...PORTAL_PTS].reverse().reverse()),
      artery: toCurve(HEPATIC_ARTERY_PTS),
    };
  }, []);
  const bile = '#c8d23c';
  if (id === 'common-hepatic-duct')
    return (
      <>
        <Flow path={curves.right} count={16} speed={0.04} color={bile} size={0.075} state={state} />
        <Flow path={curves.left} count={16} speed={0.04} color={bile} size={0.075} state={state} />
      </>
    );
  if (id === 'cystic-duct')
    return <Flow path={curves.gb} count={10} speed={0.09} color="#d6b13a" size={0.07} state={state} pulse={(t) => 0.05 + 3 * contraction(t)} />;
  if (id === 'pancreatic-duct') return <Flow path={curves.panc} count={9} speed={0.05} color="#f6e08a" size={0.055} state={state} />;
  if (id === 'papilla') return <Flow path={curves.jet} count={7} speed={0.25} color="#cdbf3a" size={0.06} state={state} pulse={(t) => 0.15 + 2.2 * contraction(t)} />;
  if (id === 'portal-vein') return <Flow path={curves.portal} count={10} speed={0.06} color="#7d86e0" size={0.12} state={state} />;
  if (id === 'hepatic-artery') return <Flow path={curves.artery} count={8} speed={0.1} color="#ff6b5a" size={0.075} state={state} pulse={(t) => 1 + 0.5 * Math.sin(t * 7)} />;
  return null;
}

/** Точка, вокруг которой пузырь сжимается при сокращении: конец шейки у протока. */
const SQUEEZE_ANCHOR = gbAxis(0.99);

export default function GallbladderModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const G = useMemo(buildGallbladder, []);
  const tex = useMemo(buildTextures, []);
  useEffect(
    () => () => {
      for (const defs of Object.values(G)) for (const d of defs) { d.g.dispose(); d.proxy?.dispose(); }
      Object.values(tex).forEach((t) => t.dispose());
    },
    [G, tex],
  );

  const explodeTarget = state.explode ?? 0;
  const ctrl = useRef<GbControl>({
    cut: false,
    kind: 'side',
    explode: 0,
    isolate: true,
    selected: null,
    hidden: new Set(),
    labels: true,
    squeeze: 0,
  });
  ctrl.current.cut = state.cutaway || explodeTarget > 0.02;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;

  const organ = useRef<Group>(null);
  const lastSqueeze = useRef(-1);
  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    const q = contraction(state.time.current);
    if (Math.abs(q - lastSqueeze.current) > 0.0008) {
      lastSqueeze.current = q;
      c.squeeze = q;
      // пузырь укорачивается и сжимается к шейке; при разборе на слои не трогаем
      const s = 1 - 0.13 * q * (1 - Math.min(1, c.explode * 3));
      organ.current?.scale.setScalar(s);
      organ.current?.position.set(SQUEEZE_ANCHOR[0] * (1 - s), SQUEEZE_ANCHOR[1] * (1 - s), SQUEEZE_ANCHOR[2] * (1 - s));
      invalidate();
    }
  });

  const hideLabels = explodeTarget > 0.02;
  const renderPart = (id: string) => (
    <GbPart key={id} id={id}>
      <PartMeshes defs={G[id]} tex={tex} />
      <Streams id={id} state={state} />
      <PartLabel id={id} names={names} hide={hideLabels} />
    </GbPart>
  );

  return (
    <GbContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} />
      <group ref={organ}>{GB_PART_IDS.filter((id) => ORGAN_PARTS.has(id)).map(renderPart)}</group>
      <group>{GB_PART_IDS.filter((id) => !ORGAN_PARTS.has(id)).map(renderPart)}</group>
    </GbContext.Provider>
  );
}
