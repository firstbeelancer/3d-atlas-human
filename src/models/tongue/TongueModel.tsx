import { use, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Material } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import { curveOf } from './geometry';
import { buildScene, type MatKey, type MeshDef, type SceneData } from './build';
import { MOLECULE_PATH, SIGNAL_PATH } from './buildBud';
import { chordaPts, cutPlane, deepArteryPts, lingualArteryPts, lingualNervePts, motionAt, submandibularDuctPts, type SceneId } from './anatomy';
import { MOTION, buildTongueTextures, makeMaterial, type TongueTextures } from './materials';
import { budSection, tongueSection } from './section';
import { CUT_VIEWS, DISSECTION, EXTERIOR, FOCUS, GROUP_OF, MOVING, OVERVIEW, SCENE_PARTS, SPREAD_VIEW, UNDERSIDE, sceneOf, type Focus } from './parts';
import { activeCut, PartLabel, TongueContext, TonguePart, type TongueControl } from './TonguePart';

/*
  Язык: две сцены в одной модели. По умолчанию — язык в сантиметрах с мышцами, костями, сосудами, нервами и железами;
  режим «Вкусовая почка под микроскопом» переключает на грибовидный сосочек в разрезе. Выбор части из другой сцены
  переключает сцену сам. Анимация: «Движение языка» (высунуть, поднять кончик к нёбу, в стороны, желобок перед глотком),
  кровь по артериям, слюна по протокам, вкусовой сигнал по барабанной струне; в микросцене — молекулы входят в пору,
  сигнал бежит по нервным волокнам вниз.
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
function CameraRig({ ctrl, selected, explode, scene, underside, dissection }: {
  ctrl: RefObject<TongueControl>; selected: string | null; explode: number; scene: SceneId; underside: boolean; dissection: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Rig | null;
  const invalidate = useThree((s) => s.invalidate);
  const { width, height } = useThree((s) => s.size);
  const widthFit = Math.max(1, ((scene === 'bud' ? 0.85 : 0.73) * height) / Math.max(1, width));
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
      if (widthFit <= 1.02 && scene === 'tongue' && !cut && !selected && !underside && !dissection && !spread) return;
    }
    let f: Focus;
    if (selected && FOCUS[selected]) f = FOCUS[selected];
    else if (spread) f = SPREAD_VIEW[scene];
    else if (cut) f = CUT_VIEWS[scene][kind];
    else if (dissection) f = DISSECTION;
    else if (underside) f = UNDERSIDE;
    else f = OVERVIEW[scene];
    const distance = Math.min(69, f.dist * widthFit);
    goal.current = { at: new Vector3(...f.at), offset: new Vector3(...f.dir).normalize().multiplyScalar(distance) };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cut, kind, spread, scene, widthFit, underside, dissection, invalidate]);

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
function PartMeshes({ defs, tex, moving }: { defs: MeshDef[]; tex: TongueTextures; moving: boolean }) {
  const mats = useMemo(() => {
    const map = new Map<MatKey, Material>();
    for (const d of defs) if (!map.has(d.m)) map.set(d.m, makeMaterial(d.m, tex, moving));
    return map;
  }, [defs, tex, moving]);
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

function SectionFace({ parts, tex, scene, kind, at, hidden }: {
  parts: SceneData['parts']; tex: TongueTextures; scene: SceneId; kind: TongueControl['kind']; at: number; hidden?: ReadonlySet<string>;
}) {
  const defs = useMemo(() => (scene === 'tongue' ? tongueSection : budSection)(parts, cutPlane(scene, kind, at), hidden), [parts, scene, kind, at, hidden]);
  useEffect(() => () => defs.forEach(({ g }) => g.dispose()), [defs]);
  return <PartMeshes defs={defs} tex={tex} moving={false} />;
}

const pulse = (t: number) => 1 + 0.5 * Math.sin(t * 7);
const red = '#ff6b5a';
const FLOW = {
  artery: curveOf([...lingualArteryPts(1), ...deepArteryPts(1).slice(1)]),
  arteryR: curveOf([...lingualArteryPts(-1), ...deepArteryPts(-1).slice(1)]),
  saliva: curveOf(submandibularDuctPts(1)),
  salivaR: curveOf(submandibularDuctPts(-1)),
  // вкус с передних двух третей идёт по язычному нерву, затем по барабанной струне к мозгу
  taste: curveOf([...lingualNervePts(1).slice(2).reverse(), ...chordaPts(1).reverse()]),
};

/** Потоки: кровь, слюна, вкусовой сигнал; в микросцене — молекулы и нервный импульс. */
function Streams({ id, state }: { id: string; state: ModelProps['state'] }) {
  switch (id) {
    case 'deep-lingual-artery':
      return (
        <>
          <Flow path={FLOW.artery} count={16} speed={0.05} color={red} size={0.08} state={state} pulse={pulse} />
          <Flow path={FLOW.arteryR} count={16} speed={0.05} color={red} size={0.08} state={state} pulse={pulse} />
        </>
      );
    case 'submandibular-duct':
      return (
        <>
          <Flow path={FLOW.saliva} count={6} speed={0.06} color="#bfe8ff" size={0.07} state={state} />
          <Flow path={FLOW.salivaR} count={6} speed={0.06} color="#bfe8ff" size={0.07} state={state} />
        </>
      );
    case 'chorda-tympani':
      return <Flow path={FLOW.taste} count={7} speed={0.12} color="#fff3a0" size={0.06} state={state} />;
    case 'b-saliva':
      return <Flow path={MOLECULE_PATH} count={6} speed={0.09} color="#7bd0ff" size={0.09} state={state} />;
    case 'b-nerve':
      return <Flow path={SIGNAL_PATH} count={6} speed={0.16} color="#fff3a0" size={0.14} state={state} />;
    default:
      return null;
  }
}

export default function TongueModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const modeScene: SceneId = state.modes.bud ? 'bud' : 'tongue';
  const scene: SceneId = (selected ? sceneOf(selected) : null) ?? modeScene;
  const data = use(loadScene(scene));
  const tex = useMemo(buildTongueTextures, []);
  useEffect(() => () => tex.dispose(), [tex]);

  const explodeTarget = state.explode ?? 0;
  const spread = explodeTarget > 0.02;
  const underside = scene === 'tongue' && !!state.modes.tongueUnderside;
  const dissection = scene === 'tongue' && !!state.modes.xray;
  const moveOn = !!state.modes.move && scene === 'tongue' && !state.cutaway && !spread && selected === null;
  const ctrl = useRef<TongueControl>({ scene, cut: false, kind: 'side', cutT: 0.5, explode: 0, isolate: true, selected: null, hidden: new Set(), labels: true, xray: false });
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

  const amp = useRef(0);
  useEffect(() => () => void MOTION.value.set(0, 0, 0, 0), []);
  useFrame((_, dt) => {
    const k = ctrl.current;
    const diff = explodeTarget - k.explode;
    if (Math.abs(diff) > 0.001) {
      k.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else k.explode = explodeTarget;
    // движение языка плавно включается и выключается; при разносе на части язык стоит
    const aTarget = moveOn && k.explode < 0.02 ? 1 : 0;
    const ad = aTarget - amp.current;
    if (Math.abs(ad) > 0.001) amp.current += ad * Math.min(1, dt * 3);
    else amp.current = aTarget;
    if (amp.current > 0.0005) {
      const m = motionAt(state.time.current);
      const a = amp.current;
      MOTION.value.set(m.protrude * a, m.tipUp * a, m.side * a, m.groove * a);
      invalidate();
    } else if (MOTION.value.lengthSq() > 0) {
      MOTION.value.set(0, 0, 0, 0);
      invalidate();
    }
  });

  const ids = SCENE_PARTS[scene];
  const hideLabels = spread || moveOn;
  return (
    <TongueContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} scene={scene} underside={underside} dissection={dissection} />
      {activeCut(c) && !spread && !state.modes.xray && selected === null && (
        <SectionFace parts={data.parts} tex={tex} scene={scene} kind={c.cut ? c.kind : 'side'} at={c.cut ? c.cutT : 0.5} hidden={state.hidden} />
      )}
      {ids.map((id) => {
        const defs = data.parts[id];
        if (!defs || (scene === 'tongue' && !EXTERIOR.has(id) && !dissection && !spread && selected !== id && selected !== GROUP_OF[id])) return null;
        const moving = scene === 'tongue' && MOVING.has(id);
        const overviewLabel = scene === 'bud'
          ? !state.cutaway || c.kind === 'side'
          : !dissection && !state.cutaway && (underside ? id === 'frenulum' || id === 'deep-lingual-vein' : id === 'apex' || id === 'vallate');
        return (
          <TonguePart key={id} id={id}>
            <PartMeshes defs={defs} tex={tex} moving={moving} />
            {!moveOn && <Streams id={id} state={state} />}
            <PartLabel id={id} names={names} hide={hideLabels} overview={overviewLabel} />
          </TonguePart>
        );
      })}
    </TongueContext.Provider>
  );
}
