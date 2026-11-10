import { use, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Material } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import { curveOf, type V3 } from './geometry';
import { buildScene, type MatKey, type MeshDef, type SceneData } from './build';
import type { SceneId } from './anatomy';
import { buildHairTextures, makeMaterial, type HairTextures } from './materials';
import { CUT_VIEWS, FOCUS, NAIL_ROT, OVERVIEW, SCENE_PARTS, SPREAD_VIEW, sceneOf, type Focus } from './parts';
import { HairContext, HairPart, PartLabel, type HairControl } from './HairPart';

/*
  Волосы и ногти: четыре сцены в одной модели. По умолчанию — блок кожи с волосяным фолликулом; режимы переключают
  на цикл роста, волос под микроскопом и ноготь на кончике пальца. Выбор части из другой сцены переключает сцену сам.
  Анимация: кровь по сосудам, сало из желёз, «мурашки» — мышца поднимает волос.
*/

const cache = new Map<SceneId, Promise<SceneData>>();

/** Геометрия сцены строится один раз за сессию, с паузой, чтобы успел показаться индикатор. */
function loadScene(scene: SceneId): Promise<SceneData> {
  let p = cache.get(scene);
  if (!p) {
    p = new Promise<SceneData>((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(buildScene(scene));
        } catch (e) {
          reject(e);
        }
      }, 40);
    });
    p.catch(() => cache.delete(scene));
    cache.set(scene, p);
  }
  return p;
}

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части, к виду на срез или к общему виду сцены; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode, scene }: { ctrl: RefObject<HairControl>; selected: string | null; explode: number; scene: SceneId }) {
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
    else if (spread) f = SPREAD_VIEW[scene];
    else if (cut) f = CUT_VIEWS[scene][kind];
    else f = OVERVIEW[scene];
    goal.current = { at: new Vector3(...f.at), offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist) };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cut, kind, spread, scene, invalidate]);

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
function PartMeshes({ defs, tex }: { defs: MeshDef[]; tex: HairTextures }) {
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

const pulse = (t: number) => 1 + 0.5 * Math.sin(t * 7);
const red = '#ff6b5a';
const blue = '#8c94ea';
const path = (pts: V3[]) => curveOf(pts);
const FLOW = {
  hairArtery: path([[-8.4, -9.1, -1.1], [-5.2, -8.8, -0.9], [-2.4, -8.3, -0.6], [0.2, -8.15, -0.4], [1.2, -8.1, -0.2], [1.6, -7.9, 0]]),
  hairVein: path([[8.8, -9.3, -1.0], [7.0, -9.0, -0.8], [5.2, -8.45, -0.5], [3.4, -8.15, -0.3], [2.35, -7.95, -0.1]]),
  papilla: path([[1.5, -7.95, -0.3], [1.55, -7.2, -0.3], [1.65, -6.8, -0.3], [1.8, -7.2, -0.3], [1.9, -7.95, -0.3]]),
  sebum: path([[0.9, -1.5, 0], [1.7, -1.3, 0.05], [2.45, -1.12, 0.03], [3.05, -1.06, 0]]),
  sebumR: path([[6.3, -1.55, 0], [5.4, -1.3, 0.03], [4.7, -1.12, 0.02], [4.15, -1.05, 0]]),
  arteryN: path([[-13.8, -1.55, -3.5], [-6, -1.6, -3.5], [2, -1.5, -3.55], [10, -1.2, -3.5], [16.5, -1.05, -3.2], [19.6, -0.7, -2.5], [21.4, -0.3, -1.2]]),
  arcade: path([[2.5, -1.5, -3.5], [2.6, 0.5, -4.7], [2.9, 2.3, -3.9], [3.2, 2.75, -2.0], [3.3, 2.8, 0]]),
  veinN: path([[0.4, 3.35, -1.3], [-3, 3.5, -1.9], [-8, 3.55, -2.3], [-13.8, 3.45, -2.1]]),
};

/** Потоки: кровь по сосудам и сало из железы. */
function Streams({ id, state }: { id: string; state: ModelProps['state'] }) {
  switch (id) {
    case 'follicular-artery':
      return <Flow path={FLOW.hairArtery} count={12} speed={0.06} color={red} size={0.17} state={state} pulse={pulse} />;
    case 'follicular-vein':
      return <Flow path={FLOW.hairVein} count={9} speed={0.05} color={blue} size={0.19} state={state} />;
    case 'papilla-capillaries':
      return <Flow path={FLOW.papilla} count={4} speed={0.12} color={red} size={0.08} state={state} pulse={pulse} />;
    case 'sebum':
      return (
        <>
          <Flow path={FLOW.sebum} count={4} speed={0.05} color="#ffe27a" size={0.1} state={state} />
          <Flow path={FLOW.sebumR} count={3} speed={0.04} color="#ffe27a" size={0.08} state={state} />
        </>
      );
    case 'digital-artery':
      return <Flow path={FLOW.arteryN} count={18} speed={0.05} color={red} size={0.34} state={state} pulse={pulse} />;
    case 'nail-arcade':
      return <Flow path={FLOW.arcade} count={6} speed={0.07} color={red} size={0.2} state={state} pulse={pulse} />;
    case 'digital-vein':
      return <Flow path={FLOW.veinN} count={7} speed={0.04} color={blue} size={0.22} state={state} />;
    default:
      return null;
  }
}

export default function HairModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const modeScene: SceneId = state.modes.nail ? 'nail' : state.modes.shaft ? 'shaft' : state.modes.cycle ? 'cycle' : 'follicle';
  const scene: SceneId = (selected ? sceneOf(selected) : null) ?? modeScene;
  const data = use(loadScene(scene));
  const tex = useMemo(buildHairTextures, []);
  useEffect(() => () => tex.dispose(), [tex]);

  const explodeTarget = state.explode ?? 0;
  const gooseOn = !!state.modes.goose && scene === 'follicle';
  const ctrl = useRef<HairControl>({ scene, cut: false, kind: 'side', cutT: 0.5, explode: 0, isolate: true, selected: null, hidden: new Set(), labels: true, xray: false, goose: 0 });
  const c = ctrl.current;
  c.scene = scene;
  c.cut = state.cutaway;
  c.kind = state.cutKind ?? 'side';
  c.cutT = state.cutAt ?? 0.5;
  c.isolate = state.isolate ?? true;
  c.selected = selected;
  c.hidden = state.hidden ?? new Set();
  c.labels = state.labels;
  c.xray = !!state.modes.xray;

  useFrame((_, dt) => {
    const k = ctrl.current;
    const diff = explodeTarget - k.explode;
    if (Math.abs(diff) > 0.001) {
      k.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else k.explode = explodeTarget;
    // «мурашки»: мышца напрягается и расслабляется по циклу около 7 секунд
    const wave = gooseOn ? 0.5 - 0.5 * Math.cos(state.time.current * 0.9) : 0;
    const gTarget = gooseOn ? Math.min(1, wave * 1.5) : 0;
    const gd = gTarget - k.goose;
    if (Math.abs(gd) > 0.001) {
      k.goose += gd * Math.min(1, dt * 6);
      invalidate();
    } else k.goose = gTarget;
  });

  const ids = SCENE_PARTS[scene];
  const hideLabels = explodeTarget > 0.02;
  return (
    <HairContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} scene={scene} />
      <group rotation={[0, 0, scene === 'nail' ? NAIL_ROT : 0]}>
        {data.context.length > 0 && (
          <HairPart id="ctx-skin">
            <PartMeshes defs={data.context} tex={tex} />
          </HairPart>
        )}
        {ids.map((id) => {
          const defs = data.parts[id];
          if (!defs) return null;
          return (
            <HairPart key={id} id={id}>
              <PartMeshes defs={defs} tex={tex} />
              <Streams id={id} state={state} />
              <PartLabel id={id} names={names} hide={hideLabels} />
            </HairPart>
          );
        })}
      </group>
    </HairContext.Provider>
  );
}
