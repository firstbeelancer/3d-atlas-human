import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Vector3, type BufferGeometry, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import type { GeometrySet } from '../body/transfer';
import { Flow } from '../../three/Flow';
import { Label } from '../../three/Label';
import { ModelPending } from '../../three/StageLoading';
import { Tissue, usePart } from '../../three/materials';
import { useSelection } from '../../three/selection';
import type { ModelProps, StageState } from '../../three/types';
import { curveOf, type V3 } from '../body/geo';
import { loadBodyPart } from '../body/loader';
import {
  BODY_FLOOR, BODY_SCALE, CRANIAL_GROUP, HEAD_BOX, KNOTS, LABEL_OVERRIDE, MAIN_LABELS, NERVES, NEURON_GROUP,
  OVERVIEW_CAMERA, OVERVIEW_TARGET, PART_GROUPS, REFLEX, REFLEX_BOX, REFLEX_GROUP, REFLEX_LABELS, cordPoint, viewOf, type View,
} from './anatomy';
import { loadNerves } from './loader';
import { buildNeuron, impulsePath, nodes, axonPoint, SOMA, SYNAPSE_BOUTON, POST_DENDRITE_X } from './neuron';

const bodyShift = new Vector3(0, BODY_FLOOR, 0);
const NEURON_LABELS = new Set(['dendrites', 'neuron-body', 'myelin', 'ranvier-nodes', 'synapse']);

/** Цвета частей: нервы жёлтые, как в атласах; вегетативная часть темнее; рефлекс — чувствительный синий, двигательный красный. */
const COLORS: Record<string, string> = {
  brain: '#e6aeb0',
  cerebellum: '#d79ba3',
  'spinal-cord': '#efe1b4',
  'cervical-enlargement': '#f3dfa2',
  'lumbar-enlargement': '#f3dfa2',
  'cauda-equina': '#e8cd78',
  'spinal-ganglia': '#d6a03e',
  'sympathetic-trunk': '#cf8d38',
  'sympathetic-ganglia': '#c47f2c',
  'celiac-plexus': '#cf8d38',
  'vagus-nerve': '#e0b13a',
  'sensory-neuron': '#3f86e6',
  'skin-receptor': '#3f86e6',
  interneuron: '#9a62d8',
  'motor-neuron': '#e2483a',
  'effector-muscle': '#c0503f',
  'neuron-body': '#e6a58c',
  nucleus: '#6d4a96',
  dendrites: '#e6a58c',
  'axon-hillock': '#e6a58c',
  axon: '#e7c04c',
  myelin: '#f4efe2',
  'ranvier-nodes': '#ff7a4a',
  'axon-terminals': '#e6a58c',
  synapse: '#86afe0',
};
const OPACITY: Record<string, number> = { 'neuron-body': 0.62, 'axon-terminals': 0.72, myelin: 0.9, 'effector-muscle': 0.5 };

/** Где подписать часть: явная точка, иначе середина её первого пути или первый узел (левая сторона). */
function labelAnchors(): Record<string, V3> {
  const at: Record<string, V3> = {};
  for (const path of NERVES) {
    if (at[path.part] || path.points[0][0] < -0.01) continue;
    const p = curveOf(path.points).getPointAt(0.55);
    at[path.part] = [p.x, p.y, p.z];
  }
  for (const k of KNOTS) at[k.part] ??= k.at;
  return { ...at, ...LABEL_OVERRIDE };
}

interface Controls {
  target: Vector3;
  update(): void;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

const boxOf = ({ min, max }: { min: V3; max: V3 }) =>
  new Box3(new Vector3(...min).multiplyScalar(BODY_SCALE).add(bodyShift), new Vector3(...max).multiplyScalar(BODY_SCALE).add(bodyShift));

/** Плавный подлёт камеры: к выбранной части, к руке с рефлексом или к нейрону. */
function CameraRig({ view, focus, cranial }: { view: View; focus: Box3 | undefined; cranial: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const invalidate = useThree((s) => s.invalidate);
  const { width, height } = useThree((s) => s.size);
  const moving = useRef(false);
  const goal = useMemo(() => {
    const aspect = Math.max(0.35, width / Math.max(1, height));
    const fit = (span: Vector3, padding: number) =>
      Math.max(span.y, span.x / aspect) * padding / (2 * Math.tan(Math.PI * 16 / 180)) + span.z * 0.5;
    const target = new Vector3(...OVERVIEW_TARGET);
    const eye = new Vector3(...OVERVIEW_CAMERA);
    const frame = (box: Box3, padding: number, side: Vector3) => {
      box.getCenter(target);
      const span = box.getSize(new Vector3());
      eye.copy(target).add(side.multiplyScalar(Math.max(0.5, fit(span, padding))));
    };
    if (focus) frame(focus.clone(), 1.45, (cranial ? new Vector3(0.6, -0.12, 1) : new Vector3(0.14, 0.18, 1)).normalize());
    else if (view === 'neuron') frame(new Box3(new Vector3(-3.7, -1.4, -0.6), new Vector3(3.9, 1.4, 0.6)), 1.18, new Vector3(0.05, 0.16, 1).normalize());
    else if (view === 'reflex') frame(boxOf(REFLEX_BOX), 1.15, new Vector3(0.32, 0.12, 1).normalize());
    else if (width < 540) {
      eye.multiplyScalar(1.17);
      target.y -= 0.25;
      eye.y -= 0.25;
    }
    return { target, eye };
  }, [cranial, focus, height, view, width]);

  useEffect(() => {
    if (!controls) return;
    moving.current = true;
    invalidate();
    const stop = () => { moving.current = false; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls, goal, invalidate]);

  useFrame(({ camera }, dt) => {
    if (!controls || !moving.current) return;
    const step = 1 - Math.exp(-7 * Math.max(dt, 1 / 120));
    camera.position.lerp(goal.eye, step);
    controls.target.lerp(goal.target, step);
    controls.update();
    moving.current = camera.position.distanceTo(goal.eye) > 0.016 || controls.target.distanceTo(goal.target) > 0.008;
    if (moving.current) invalidate();
  });
  return null;
}

function Skin({ faint }: { faint: boolean }) {
  const { skin } = use(loadBodyPart('skin'));
  return (
    <mesh geometry={skin} raycast={() => null} renderOrder={10}>
      <meshStandardMaterial color="#8299b2" transparent opacity={faint ? 0.12 : 0.2} depthWrite={false} roughness={0.82} />
    </mesh>
  );
}

function Part({ id, geometry, opacity, raycast = true }: { id: string; geometry: BufferGeometry; opacity?: number; raycast?: boolean }) {
  const { active, handlers } = usePart(id);
  const { selected, hovered } = useSelection();
  const group = PART_GROUPS[id];
  const own = OPACITY[id];
  const alpha = opacity !== undefined ? Math.min(opacity, own ?? 1) : own;
  return (
    <mesh geometry={geometry} {...handlers} raycast={raycast ? undefined : () => null}>
      <Tissue
        kind="nerve"
        color={COLORS[id]}
        vertexColors={!!geometry.attributes.color}
        opacity={alpha}
        active={active || selected === group || hovered === group}
      />
    </mesh>
  );
}

/** Импульс рефлекторной дуги: укол пальца, бег к спинному мозгу, переключение, бег к мышце, сокращение. */
function ReflexImpulse({ state, muscle: muscleGeometry }: { state: StageState; muscle?: BufferGeometry }) {
  const curves = useMemo(() => ({
    sensory: curveOf(REFLEX.sensory),
    inter: curveOf(REFLEX.inter),
    motor: curveOf(REFLEX.motor),
  }), []);
  const spark = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const muscle = useRef<MeshBasicMaterial>(null);
  const touch = useRef<Mesh>(null);
  const color = useMemo(() => ({ sensory: '#7fb4ff', inter: '#c9a2ff', motor: '#ff8a6a' }), []);
  useFrame(() => {
    const { period, sensory, inter, motor } = REFLEX.timing;
    const phase = (state.time.current / period) % 1;
    const s = spark.current;
    const mat = s?.material as MeshStandardMaterial | undefined;
    if (s && mat) {
      const seg = phase < sensory[1] ? 'sensory' : phase < inter[1] ? 'inter' : 'motor';
      const [a, b] = seg === 'sensory' ? sensory : seg === 'inter' ? inter : motor;
      const t = Math.max(0, Math.min(1, (phase - a) / (b - a)));
      s.visible = phase >= sensory[0] && phase <= motor[1];
      s.position.copy(curves[seg].getPointAt(t));
      mat.color.set(color[seg]);
      mat.emissive.set(color[seg]);
      if (halo.current) {
        halo.current.position.copy(s.position);
        halo.current.visible = s.visible;
        halo.current.scale.setScalar(1 + 0.35 * Math.sin(state.time.current * 18));
      }
    }
    const contract = phase > motor[1] - 0.02 ? Math.sin(Math.min(1, (phase - motor[1] + 0.02) / 0.1) * Math.PI) : 0;
    if (muscle.current) muscle.current.opacity = 0.6 * Math.max(0, contract);
    if (touch.current) {
      const k = phase < sensory[0] + 0.05 ? 1 - Math.abs(phase - sensory[0]) / 0.05 : 0;
      touch.current.scale.setScalar(0.02 + 0.06 * Math.max(0, k));
      touch.current.visible = k > 0;
    }
  });
  return (
    <>
      <mesh ref={spark} raycast={() => null}>
        <sphereGeometry args={[0.05, 14, 10]} />
        <meshStandardMaterial emissiveIntensity={1.2} roughness={0.3} />
      </mesh>
      <mesh ref={halo} raycast={() => null}>
        <sphereGeometry args={[0.085, 14, 10]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <mesh ref={touch} position={REFLEX.receptor} raycast={() => null}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {muscleGeometry && (
        <mesh geometry={muscleGeometry} raycast={() => null} scale={1} renderOrder={12}>
          <meshBasicMaterial ref={muscle} color="#ff7a5a" transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

function Body({ view, state, names }: { view: View; state: StageState; names: Record<string, string> }) {
  const set = use(loadNerves());
  const { selected, isolate } = useSelection();
  const group = selected ? PART_GROUPS[selected] ?? selected : undefined;
  const anchors = useMemo(labelAnchors, []);
  const reflex = view === 'reflex';
  const flows = useMemo(() => {
    const left = (part: string) => NERVES.find((p) => p.part === part && p.points[0][0] >= 0)!.points;
    return [
      { key: 'cord', path: curveOf([15.9, 14.5, 13, 11.6, 11.15].map((y) => cordPoint(y))), count: 4, speed: 0.12 },
      { key: 'sciatic', path: curveOf(left('sciatic-nerve')), count: 2, speed: 0.22 },
      { key: 'tibial', path: curveOf(left('tibial-nerve')), count: 2, speed: 0.22 },
      { key: 'median', path: curveOf(left('median-nerve')), count: 3, speed: 0.18 },
      { key: 'vagus', path: curveOf(NERVES.find((p) => p.part === 'vagus-nerve' && p.points.length > 6)!.points), count: 2, speed: 0.2 },
    ];
  }, []);
  const visible = (id: string) => {
    const g = PART_GROUPS[id];
    if (g === REFLEX_GROUP && !reflex) return false;
    return !isolate || selected === id || selected === g;
  };
  const opacityOf = (id: string): number | undefined => {
    const g = PART_GROUPS[id];
    if (reflex && g !== REFLEX_GROUP) return id === 'brain' || id === 'cerebellum' ? 0.18 : 0.3;
    if ((id === 'brain' || id === 'cerebellum') && (group === CRANIAL_GROUP || (selected && PART_GROUPS[selected] === CRANIAL_GROUP))) return 0.3;
    return undefined;
  };
  const labeled = (id: string) =>
    state.labels && !selected && (reflex ? REFLEX_LABELS.has(id) : MAIN_LABELS.has(id));
  return (
    <>
      {Object.entries(set).filter(([id]) => visible(id)).map(([id, geometry]) => (
        <group key={id}>
          <Part id={id} geometry={geometry} opacity={opacityOf(id)} raycast={!reflex || PART_GROUPS[id] === REFLEX_GROUP} />
          {anchors[id] && <Label at={anchors[id]} partId={id} text={names[id]} labels={labeled(id)} inner />}
        </group>
      ))}
      {reflex && <ReflexImpulse state={state} muscle={set['effector-muscle']} />}
      {!reflex && !isolate && flows.map((f) => (
        <Flow key={f.key} path={f.path} count={f.count} speed={f.speed} size={0.035} color="#fff1a8" state={state} />
      ))}
    </>
  );
}

/** Нейрон крупно: импульс прыгает от перехвата к перехвату (сальтаторное проведение). */
function NeuronScene({ state, names }: { state: StageState; names: Record<string, string> }) {
  const parts = useMemo(buildNeuron, []);
  const path = useMemo(impulsePath, []);
  const hops = useMemo(() => nodes(), []);
  const { selected, isolate } = useSelection();
  const spark = useRef<Mesh>(null);
  useFrame(() => {
    const s = spark.current;
    if (!s) return;
    const steps = hops.length + 2;
    const k = (state.time.current * 3.2) % steps;
    const i = Math.floor(k);
    const local = k - i;
    const hop = Math.min(1, local * 3);
    const xs = [axonPoint(-1.75)[0], ...hops, SYNAPSE_BOUTON[0]];
    const from = xs[Math.min(i, xs.length - 1)];
    const to = xs[Math.min(i + 1, xs.length - 1)];
    const x = from + (to - from) * hop;
    const u = Math.max(0, Math.min(1, (x - path.getPointAt(0).x) / (SYNAPSE_BOUTON[0] - path.getPointAt(0).x)));
    s.position.copy(path.getPointAt(u));
    s.scale.setScalar(i >= xs.length - 1 ? 0.0001 : 1 + 0.4 * (1 - hop));
  });
  const anchors: Record<string, V3> = {
    'neuron-body': [SOMA[0] + 0.1, SOMA[1] - 0.4, 0.3],
    nucleus: [SOMA[0] - 0.04, SOMA[1] + 0.02, 0.2],
    dendrites: [SOMA[0] - 1.1, SOMA[1] + 0.7, 0.2],
    'axon-hillock': [SOMA[0] + 0.62, 0.1, 0.12],
    axon: axonPoint(-1.78),
    myelin: [axonPoint(-0.6)[0], axonPoint(-0.6)[1] + 0.12, 0.05],
    'ranvier-nodes': axonPoint(hops[4]),
    'axon-terminals': [3.25, 0.62, 0.15],
    synapse: [POST_DENDRITE_X + 0.04, SYNAPSE_BOUTON[1] - 0.75, 0],
  };
  return (
    <>
      {Object.entries(parts).filter(([id]) => !isolate || selected === id || selected === NEURON_GROUP).map(([id, geometry]) => (
        <group key={id}>
          <Part id={id} geometry={geometry} />
          <Label at={anchors[id]} partId={id} text={names[id]} labels={state.labels && !selected && NEURON_LABELS.has(id)} inner />
        </group>
      ))}
      {!isolate && (
        <mesh ref={spark} raycast={() => null}>
          <sphereGeometry args={[0.075, 16, 12]} />
          <meshStandardMaterial color="#fff3a0" emissive="#ffd64a" emissiveIntensity={1.4} />
        </mesh>
      )}
    </>
  );
}

function useFocus(view: View): Box3 | undefined {
  const { selected } = useSelection();
  const neuron = useMemo(() => (view === 'neuron' ? buildNeuron() : null), [view]);
  const set = useNervesSet();
  return useMemo(() => {
    if (!selected) return undefined;
    const group = PART_GROUPS[selected] ?? selected;
    const box = new Box3();
    if (group === NEURON_GROUP) {
      for (const [id, g] of Object.entries(neuron ?? {})) if (id === selected || PART_GROUPS[id] === selected) box.union(g.boundingBox!);
      return box.isEmpty() ? undefined : box;
    }
    if (selected === CRANIAL_GROUP) return boxOf(HEAD_BOX);
    for (const [id, g] of Object.entries(set ?? {})) {
      if (id !== selected && PART_GROUPS[id] !== selected) continue;
      if (!g.boundingBox) g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    if (box.isEmpty()) return undefined;
    box.min.multiplyScalar(BODY_SCALE).add(bodyShift);
    box.max.multiplyScalar(BODY_SCALE).add(bodyShift);
    return box;
  }, [neuron, selected, set]);
}

/** Сетки нервов, когда они готовы: нужны для подлёта камеры, не останавливая сцену в Suspense. */
function useNervesSet(): GeometrySet | null {
  const [set, setSet] = useState<GeometrySet | null>(null);
  useEffect(() => {
    let alive = true;
    loadNerves().then((s) => alive && setSet(s), () => undefined);
    return () => { alive = false; };
  }, []);
  return set;
}

export default function NervesModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const group = selected ? PART_GROUPS[selected] ?? selected : undefined;
  const view = viewOf(state.modes, group);
  const focus = useFocus(view);
  return (
    <>
      <CameraRig view={view} focus={focus} cranial={group === CRANIAL_GROUP} />
      {view === 'neuron' ? (
        <NeuronScene state={state} names={names} />
      ) : (
        <group scale={BODY_SCALE} position={[0, BODY_FLOOR, 0]}>
          <Suspense fallback={<ModelPending />}><Skin faint={view === 'reflex'} /></Suspense>
          <Suspense fallback={<ModelPending />}><Body view={view} state={state} names={names} /></Suspense>
        </group>
      )}
    </>
  );
}
