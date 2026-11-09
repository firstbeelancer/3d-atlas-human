import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Material } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import {
  ACCESSORY_DUCT_PTS,
  BILE_DUCT_PTS,
  HEPATIC_ARTERY_PTS,
  MAIN_DUCT_PTS,
  PORTAL_PTS,
  SMA_PTS,
  SMV_PTS,
  SPLENIC_ARTERY_PTS,
  SPLENIC_VEIN_PTS,
  secretion,
  type V3,
} from './anatomy';
import { buildStatic, glandParts, type MatKey, type MeshDef, type PancGeometry } from './build';
import { loadGlandMesh } from './loader';
import { makeMaterial } from './materials';
import { CUT_VIEWS, FOCUS, MACRO_PART_IDS, MICRO_ONLY, MICRO_VIEW, OVERVIEW, SPREAD_VIEW, type Focus } from './parts';
import { PancContext, PancPart, PartLabel, type PancControl } from './PancreasPart';
import { buildTextures, type PancTextures } from './textures';
import { curveOf } from '../gallbladder/geometry';
import MicroScene from './MicroScene';

/*
  Поджелудочная железа, вид спереди: +y — вверх, +z — к зрителю, +x — налево от пациента (вправо на экране).
  Анимация: между приёмами пищи сок сочится по главному протоку медленно; по циклу около 36 с «обед» — железа
  выделяет сок быстрее, сфинктер Одди открывается и струя желчи и сока уходит из большого сосочка в кишку.
*/

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части или к виду на срез; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode, micro }: { ctrl: RefObject<PancControl>; selected: string | null; explode: number; micro: boolean }) {
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
    else if (micro) f = MICRO_VIEW;
    else if (spread) f = SPREAD_VIEW;
    else if (cut) f = CUT_VIEWS[kind];
    else f = OVERVIEW;
    goal.current = { at: new Vector3(...f.at), offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist) };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cut, kind, spread, micro, invalidate]);

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
function PartMeshes({ defs, tex }: { defs: MeshDef[]; tex: PancTextures }) {
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
        <mesh key={i} geometry={d.g} material={mats.get(d.m)} userData={{ noPick: d.noPick }} />
      ))}
    </>
  );
}

const toCurve = (pts: V3[]) => curveOf(pts);
const heart = (t: number) => 1 + 0.5 * Math.sin(t * 7);

const JET: V3[] = [[-8.7, -2.75, -1.72], [-9.1, -3.1, -1.8], [-9.25, -4.5, -1.85]];

/** Потоки сока, желчи и крови: частицы по каналам. */
function Streams({ id, state }: { id: string; state: ModelProps['state'] }) {
  const c = useMemo(
    () => ({
      main: toCurve(MAIN_DUCT_PTS),
      acc: toCurve(ACCESSORY_DUCT_PTS),
      bile: toCurve(BILE_DUCT_PTS),
      jet: toCurve(JET),
      splenicA: toCurve(SPLENIC_ARTERY_PTS),
      hepA: toCurve(HEPATIC_ARTERY_PTS),
      sma: toCurve(SMA_PTS),
      splenicV: toCurve([...SPLENIC_VEIN_PTS].reverse()),
      smv: toCurve(SMV_PTS),
      portal: toCurve(PORTAL_PTS),
    }),
    [],
  );
  const juice = '#f4c95a';
  switch (id) {
    case 'main-duct':
      return <Flow path={c.main} count={24} speed={0.035} color={juice} size={0.11} state={state} pulse={(t) => 0.3 + 3.4 * secretion(t)} />;
    case 'accessory-duct':
      return <Flow path={c.acc} count={5} speed={0.05} color={juice} size={0.075} state={state} pulse={(t) => 0.3 + 2.5 * secretion(t)} />;
    case 'bile-duct':
      return <Flow path={c.bile} count={14} speed={0.04} color="#c8d23c" size={0.1} state={state} pulse={(t) => 0.5 + 2 * secretion(t)} />;
    case 'major-papilla':
      return <Flow path={c.jet} count={9} speed={0.2} color="#d8c24a" size={0.09} state={state} pulse={(t) => 0.05 + 2.4 * secretion(t)} />;
    case 'splenic-artery':
      return <Flow path={c.splenicA} count={16} speed={0.07} color="#ff6b5a" size={0.12} state={state} pulse={heart} />;
    case 'hepatic-artery':
      return <Flow path={c.hepA} count={8} speed={0.08} color="#ff6b5a" size={0.11} state={state} pulse={heart} />;
    case 'sma':
      return <Flow path={c.sma} count={14} speed={0.07} color="#ff6b5a" size={0.15} state={state} pulse={heart} />;
    case 'splenic-vein':
      return <Flow path={c.splenicV} count={14} speed={0.05} color="#8c94ea" size={0.14} state={state} />;
    case 'smv':
      return <Flow path={c.smv} count={12} speed={0.05} color="#7d86e0" size={0.16} state={state} />;
    case 'portal-vein':
      return <Flow path={c.portal} count={10} speed={0.055} color="#7d86e0" size={0.18} state={state} />;
    default:
      return null;
  }
}

export default function PancreasModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const base = useMemo(buildStatic, []);
  const tex = useMemo(buildTextures, []);
  const [gland, setGland] = useState<PancGeometry | null>(null);

  useEffect(() => {
    let alive = true;
    loadGlandMesh()
      .then((d) => alive && setGland(glandParts(d)))
      .catch(() => {
        /* без железы остальная сцена работает, раздел показывает текст */
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    invalidate();
  }, [gland, invalidate]);

  useEffect(
    () => () => {
      for (const defs of Object.values(base)) for (const d of defs) d.g.dispose();
      Object.values(tex).forEach((t) => t.dispose());
    },
    [base, tex],
  );
  useEffect(
    () => () => {
      if (gland) for (const defs of Object.values(gland)) for (const d of defs) d.g.dispose();
    },
    [gland],
  );

  const micro = !!state.modes.micro || (selected !== null && MICRO_ONLY.has(selected));
  const explodeTarget = state.explode ?? 0;
  const ctrl = useRef<PancControl>({ cut: false, kind: 'side', cutT: 0.5, explode: 0, isolate: true, selected: null, hidden: new Set(), labels: true, secretion: 0 });
  ctrl.current.cut = state.cutaway;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.cutT = state.cutAt ?? 0.5;
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;

  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    c.secretion = secretion(state.time.current);
  });

  const hideLabels = explodeTarget > 0.02;
  return (
    <PancContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} micro={micro} />
      {micro ? (
        <MicroScene state={state} names={names} />
      ) : (
        <group>
          {MACRO_PART_IDS.map((id) => {
            const defs = gland?.[id] ?? base[id];
            if (!defs) return null;
            return (
              <PancPart key={id} id={id}>
                <PartMeshes defs={defs} tex={tex} />
                <Streams id={id} state={state} />
                <PartLabel id={id} names={names} hide={hideLabels} />
              </PancPart>
            );
          })}
        </group>
      )}
    </PancContext.Provider>
  );
}
