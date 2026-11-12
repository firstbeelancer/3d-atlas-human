import { Suspense, use, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Vector3, type BufferGeometry, type Group } from 'three';
import { Flow } from '../../three/Flow';
import { Label } from '../../three/Label';
import { ModelPending } from '../../three/StageLoading';
import { Tissue, usePart, type TissueKind } from '../../three/materials';
import { useSelection } from '../../three/selection';
import type { ModelProps, StageState } from '../../three/types';
import type { V3 } from '../body/geo';
import { loadBodyPart } from '../body/loader';
import { PIVOTS } from '../body/meta';
import { ARTERY_GROUP, HEART_GROUP, LUNG_GROUP, MICRO_GROUP, PART_GROUPS, VEIN_GROUP, WALL_PARTS, spreadOf, type View } from './anatomy';
import { BODY_FLOOR, BODY_SCALE, OVERVIEW_CAMERA, OVERVIEW_TARGET } from './appearance';
import { CapillaryWall } from './CapillaryWall';
import { buildStreams, buildVesselMeshes, type VesselMesh } from './geometry';

const bodyShift = new Vector3(0, BODY_FLOOR, 0);
const thoraxBounds = new Box3(new Vector3(-1.65, 11.3, -1.05), new Vector3(1.65, 14.85, 1.0));
const heartBounds = new Box3(new Vector3(-0.71, 11.88, -0.52), new Vector3(1.08, 13.48, 0.88));
const mainLabels = new Set(['aorta', 'carotid-arteries', 'leg-arteries', 'vena-cava-inferior']);
const lungLabels = new Set(['pulmonary-trunk', 'pulmonary-veins', 'lung-capillaries']);
const microLabels = new Set(['arterioles', 'tissue-capillaries', 'venules']);
const regionalFocus = new Set(['palmar-arches', 'hand-arteries', 'foot-arteries', 'plantar-arteries']);

function currentView(modes: StageState['modes'], selected: string | null, group: string | undefined): View {
  if (selected && WALL_PARTS.has(selected)) return 'wall';
  if (group === MICRO_GROUP) return 'micro';
  if (group === LUNG_GROUP) return 'pulmonary';
  if (group === ARTERY_GROUP || group === VEIN_GROUP) {
    return modes.pulmonary || modes['capillary-bed'] || modes['capillary-wall'] || modes.systemic ? 'systemic' : 'overview';
  }
  if (group === HEART_GROUP && !modes.pulmonary) return 'overview';
  if (modes['capillary-wall']) return 'wall';
  if (modes['capillary-bed']) return 'micro';
  if (modes.pulmonary) return 'pulmonary';
  return modes.systemic ? 'systemic' : 'overview';
}

function isInView(id: string, group: string, view: View) {
  if (view === 'wall') return WALL_PARTS.has(id);
  if (view === 'micro') return group === MICRO_GROUP && !WALL_PARTS.has(id);
  if (view === 'pulmonary') return group === LUNG_GROUP || group === HEART_GROUP;
  return group !== MICRO_GROUP && (view !== 'systemic' || group !== LUNG_GROUP);
}

function offset(id: string, group: string, explode: number): V3 {
  const [x, y, z] = spreadOf(id, group);
  return [x * explode, y * explode, z * explode];
}

interface Controls {
  target: Vector3;
  update(): void;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

function CameraRig({ view, focus }: { view: View; focus: Box3 | undefined }) {
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
    if (focus) {
      focus.getCenter(target);
      eye.copy(target).add(new Vector3(0.13, 0.19, Math.max(0.96, fit(focus.getSize(new Vector3()), 1.44))));
    } else if (view === 'wall') {
      target.set(0, 0, -0.02);
      eye.set(0.55, 1.48, fit(new Vector3(5.8, 1.85, 1.20), width < 480 ? 1.22 : 1.38));
    } else if (view === 'micro') {
      target.set(0, 0, 0);
      eye.set(0.12, 0.55, fit(new Vector3(6.9, 3.10, 0.9), width < 480 ? 1.15 : 1.26));
    } else if (view === 'pulmonary') {
      thoraxBounds.getCenter(target).multiplyScalar(BODY_SCALE).add(bodyShift);
      eye.copy(target).add(new Vector3(0.25, 0.15, fit(new Vector3(1.04, 1.16, 0.68), 1.38)));
    } else if (width > 0 && width < 480) {
      eye.copy(target).add(new Vector3(0.72, 0.23, 10.7));
    }
    return { target, eye };
  }, [focus, height, view, width]);

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
    const step = 1 - Math.exp(-7 * Math.min(0.08, Math.max(dt, 1 / 120)));
    camera.position.lerp(goal.eye, step);
    controls.target.lerp(goal.target, step);
    controls.update();
    moving.current = camera.position.distanceTo(goal.eye) > 0.016 || controls.target.distanceTo(goal.target) > 0.008;
    if (moving.current) invalidate();
  });
  return null;
}

function Skin() {
  const { skin } = use(loadBodyPart('skin'));
  return (
    <mesh geometry={skin} raycast={() => null} renderOrder={10}>
      <meshStandardMaterial color="#8299b2" transparent opacity={0.19} depthWrite={false} roughness={0.82} />
    </mesh>
  );
}

function Organ({ id, geometry, kind, opacity }: { id: string; geometry: BufferGeometry; kind: TissueKind; opacity?: number }) {
  const { active, handlers } = usePart(id);
  const { selected, hovered } = useSelection();
  const group = PART_GROUPS[id];
  return (
    <mesh geometry={geometry} {...handlers} raycast={id === 'lungs' ? () => null : undefined}>
      <Tissue kind={kind} color={id === 'lungs' ? '#a98b9e' : undefined}
        active={active || selected === group || hovered === group} opacity={opacity} vertexColors={!!geometry.attributes.color} />
    </mesh>
  );
}

const ORGANS: { id: string; mesh: string; kind: TissueKind; at: V3 }[] = [
  { id: 'heart', mesh: 'heart', kind: 'myocardium', at: [0.45, 12.49, 0.70] },
  { id: 'coronary-arteries', mesh: 'coronaryArteries', kind: 'coronary', at: [0.27, 12.77, 0.65] },
  { id: 'coronary-veins', mesh: 'coronaryVeins', kind: 'vein', at: [0.46, 12.56, 0.62] },
];

function Thorax({ view, state, names, visible, dimmed, explode }: {
  view: View; state: StageState; names: Record<string, string>; visible: (id: string) => boolean; dimmed: (id: string) => boolean; explode: number;
}) {
  const thorax = use(loadBodyPart('thorax'));
  const { selected } = useSelection();
  const heart = useRef<Group>(null);
  useFrame(() => {
    if (!heart.current) return;
    const beat = Math.max(0, Math.sin(state.time.current * 7.55)) ** 5;
    heart.current.scale.set(1 + 0.025 * beat, 1 - 0.017 * beat, 1 + 0.025 * beat);
  });
  return (
    <>
      {visible('lungs') && view === 'pulmonary' && (
        <group position={offset('lungs', LUNG_GROUP, explode)}>
          <group position={PIVOTS.lungL}><Organ id="lungs" geometry={thorax.lungL} kind="inner" opacity={dimmed('lungs') ? 0.09 : selected === 'lungs' ? 0.44 : 0.28} /></group>
          <group position={PIVOTS.lungR}><Organ id="lungs" geometry={thorax.lungR} kind="inner" opacity={dimmed('lungs') ? 0.09 : selected === 'lungs' ? 0.44 : 0.28} /></group>
          <Label at={[1.30, 13.43, 0.35]} partId="lungs" text={names.lungs} labels={false} inner />
        </group>
      )}
      <group position={offset('heart', HEART_GROUP, explode)}>
        <group position={PIVOTS.heart} ref={heart}>
          {ORGANS.filter(({ id }) => visible(id)).map(({ id, mesh, kind }) => (
            <Organ key={id} id={id} geometry={thorax[mesh]} kind={kind}
              opacity={dimmed(id) ? 0.16 : id === 'heart' && view === 'pulmonary' && !selected ? 0.64 : undefined} />
          ))}
        </group>
        {ORGANS.filter(({ id }) => visible(id)).map(({ id, at }) => (
          <Label key={id} at={at} partId={id} text={names[id]} labels={state.labels && !selected && id === 'heart' && view !== 'pulmonary'} inner />
        ))}
      </group>
    </>
  );
}

function VesselPart({ mesh, label, name, explode, dimmed }: { mesh: VesselMesh; label: boolean; name?: string; explode: number; dimmed: boolean }) {
  const { active, handlers } = usePart(mesh.id);
  const { selected, hovered } = useSelection();
  return (
    <group position={offset(mesh.id, mesh.group, explode)}>
      <mesh geometry={mesh.geometry} {...handlers}>
        <Tissue kind={mesh.venous ? 'vein' : 'artery'} color={mesh.color} vertexColors={mesh.gradient} opacity={dimmed ? 0.15 : mesh.group === MICRO_GROUP ? 0.84 : undefined}
          active={active || selected === mesh.group || hovered === mesh.group} />
      </mesh>
      <Label at={mesh.at} partId={mesh.id} text={name} labels={label} inner />
    </group>
  );
}

function boundsFor(mesh: VesselMesh, region: boolean): Box3 {
  const bounds = mesh.geometry.boundingBox!.clone();
  if (!region) return bounds;
  const p = mesh.geometry.attributes.position;
  const point = new Vector3();
  const side = Math.sign(mesh.at[0]);
  const oneSide = new Box3();
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i);
    if (point.x * side > 0) oneSide.expandByPoint(point);
  }
  return oneSide.isEmpty() ? bounds : oneSide;
}

const beat = (time: number) => 1 + 0.42 * Math.max(0, Math.sin(time * 7.55)) ** 4;

export default function CirculationModel({ state, names = {} }: ModelProps) {
  const meshes = useMemo(buildVesselMeshes, []);
  const streams = useMemo(buildStreams, []);
  useEffect(() => () => meshes.forEach(({ geometry }) => geometry.dispose()), [meshes]);
  const { selected, isolate } = useSelection();
  const group = selected ? PART_GROUPS[selected] ?? selected : undefined;
  const view = currentView(state.modes, selected, group);
  const microscopic = view === 'micro' || view === 'wall';
  const explode = state.explode ?? 0;
  const focus = useMemo(() => {
    if (!selected || view === 'wall') return undefined;
    const bounds = new Box3();
    for (const mesh of meshes) {
      if (mesh.id === selected || mesh.group === selected) {
        bounds.union(boundsFor(mesh, regionalFocus.has(selected)).translate(new Vector3(...offset(mesh.id, mesh.group, explode))));
      }
    }
    if (group === HEART_GROUP) bounds.union(heartBounds.clone().translate(new Vector3(...offset('heart', HEART_GROUP, explode))));
    if (selected === 'lungs' || selected === LUNG_GROUP) bounds.union(thoraxBounds.clone().translate(new Vector3(...offset('lungs', LUNG_GROUP, explode))));
    if (bounds.isEmpty()) return undefined;
    if (!microscopic) {
      bounds.min.multiplyScalar(BODY_SCALE).add(bodyShift);
      bounds.max.multiplyScalar(BODY_SCALE).add(bodyShift);
    }
    return bounds;
  }, [explode, group, meshes, microscopic, selected, view]);
  const visible = (id: string) => {
    const layer = PART_GROUPS[id];
    return isInView(id, layer, view) && !state.hidden?.has(id) && !state.hidden?.has(layer) &&
      (!isolate || selected === id || selected === layer);
  };
  const dimmed = (id: string) => !!selected && !!state.isolate && selected !== id && selected !== PART_GROUPS[id];
  const labeled = (id: string) => state.labels && !selected &&
    (view === 'micro' ? microLabels.has(id) : view === 'pulmonary' ? lungLabels.has(id) : mainLabels.has(id));
  return (
    <>
      <CameraRig view={view} focus={focus} />
      <group scale={microscopic ? 1 : BODY_SCALE} position={microscopic ? [0, 0, 0] : [0, BODY_FLOOR, 0]}>
        {!microscopic && (
          <>
            {view !== 'pulmonary' && !isolate && <Suspense fallback={<ModelPending />}><Skin /></Suspense>}
            <Suspense fallback={<ModelPending />}><Thorax view={view} state={state} names={names} visible={visible} dimmed={dimmed} explode={explode} /></Suspense>
          </>
        )}
        {view === 'wall' && <CapillaryWall state={state} names={names} visible={visible} dimmed={dimmed} labels={state.labels && !selected} />}
        {meshes.filter((mesh) => visible(mesh.id)).map((mesh) =>
          <VesselPart key={mesh.id} mesh={mesh} label={labeled(mesh.id)} name={names[mesh.id]} explode={explode} dimmed={dimmed(mesh.id)} />,
        )}
        {streams.filter((flow) => visible(flow.part) && !dimmed(flow.part)).map((flow) => (
          <group key={flow.key} position={offset(flow.part, flow.group, explode)}>
            <Flow path={flow.path} count={flow.count} speed={flow.speed} size={flow.size} color={flow.color} state={state} pulse={flow.arterial ? beat : undefined} />
          </group>
        ))}
      </group>
    </>
  );
}
