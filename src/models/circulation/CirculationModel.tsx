import { Suspense, use, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Vector3, type BufferGeometry, type Group } from 'three';
import { Flow } from '../../three/Flow';
import { Label } from '../../three/Label';
import { ModelPending } from '../../three/StageLoading';
import { Tissue, usePart, type TissueKind } from '../../three/materials';
import { useSelection } from '../../three/selection';
import type { ModelProps, StageState } from '../../three/types';
import { loadBodyPart } from '../body/loader';
import { PIVOTS } from '../body/meta';
import {
  HEART_GROUP, LUNG_GROUP, MICRO_GROUP, PART_GROUPS, type View,
} from './anatomy';
import { BODY_FLOOR, BODY_SCALE, OVERVIEW_CAMERA, OVERVIEW_TARGET } from './appearance';
import { buildStreams, buildVesselMeshes, type VesselMesh } from './geometry';

const bodyShift = new Vector3(0, BODY_FLOOR, 0);
const thoraxBounds = new Box3(new Vector3(-1.65, 11.3, -1.05), new Vector3(1.65, 14.85, 1.0));
const heartBounds = new Box3(new Vector3(-0.71, 11.88, -0.52), new Vector3(1.08, 13.48, 0.88));
const mainLabels = new Set(['aorta', 'carotid-arteries', 'leg-arteries', 'vena-cava-inferior']);
const lungLabels = new Set(['pulmonary-trunk', 'pulmonary-veins', 'lung-capillaries']);

function currentView(modes: StageState['modes'], group: string | undefined): View {
  if (group === MICRO_GROUP || (modes['capillary-bed'] && !group)) return 'micro';
  if (group === LUNG_GROUP || (modes.pulmonary && (!group || group === HEART_GROUP))) return 'pulmonary';
  if (modes.systemic || (group && group !== HEART_GROUP && (modes.pulmonary || modes['capillary-bed']))) return 'systemic';
  return 'overview';
}

function isInView(group: string, view: View) {
  if (view === 'micro') return group === MICRO_GROUP;
  if (view === 'pulmonary') return group === LUNG_GROUP || group === HEART_GROUP;
  return group !== MICRO_GROUP && (view !== 'systemic' || group !== LUNG_GROUP);
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
      const span = focus.getSize(new Vector3());
      eye.copy(target).add(new Vector3(0.16, 0.22, Math.max(1.22, fit(span, 1.40))));
    } else if (view === 'micro') {
      target.set(0, -0.02, 0);
      eye.set(0.20, 0.78, fit(new Vector3(6.9, 3.1, 0.9), 1.15));
    } else if (view === 'pulmonary') {
      thoraxBounds.getCenter(target).multiplyScalar(BODY_SCALE).add(bodyShift);
      eye.copy(target).add(new Vector3(0.19, 0.12, fit(new Vector3(1.06, 1.13, 0.68), 1.40)));
    } else if (width < 540) {
      eye.multiplyScalar(1.17);
      target.y -= 0.25;
      eye.y -= 0.25;
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
    const step = 1 - Math.exp(-7 * Math.max(dt, 1 / 120));
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
      <meshStandardMaterial color="#8299b2" transparent opacity={0.22} depthWrite={false} roughness={0.82} />
    </mesh>
  );
}

function Organ({ id, geometry, kind, opacity }: { id: string; geometry: BufferGeometry; kind: TissueKind; opacity?: number }) {
  const { active, handlers } = usePart(id);
  const { selected, hovered } = useSelection();
  const group = PART_GROUPS[id];
  return (
    <mesh geometry={geometry} {...handlers} raycast={id === 'lungs' ? () => null : undefined}>
      <Tissue kind={kind} active={active || selected === group || hovered === group} opacity={opacity} vertexColors={!!geometry.attributes.color} />
    </mesh>
  );
}

function Thorax({ view, state, names }: ModelProps & { view: View }) {
  const thorax = use(loadBodyPart('thorax'));
  const { selected, isolate } = useSelection();
  const heart = useRef<Group>(null);
  useFrame(() => {
    if (heart.current) {
      const pulse = Math.max(0, Math.sin(state.time.current * 7.55)) ** 5;
      heart.current.scale.set(1 + 0.038 * pulse, 1 - 0.022 * pulse, 1 + 0.038 * pulse);
    }
  });
  const show = (id: string) => !isolate || selected === id || selected === PART_GROUPS[id];
  return (
    <>
      {view === 'pulmonary' && show('lungs') && (
        <>
          <group position={PIVOTS.lungL}>
            <Organ id="lungs" geometry={thorax.lungL} kind="inner" opacity={selected === 'lungs' ? 0.43 : 0.25} />
          </group>
          <group position={PIVOTS.lungR}>
            <Organ id="lungs" geometry={thorax.lungR} kind="inner" opacity={selected === 'lungs' ? 0.43 : 0.25} />
          </group>
          <Label at={[1.3, 13.43, 0.35]} partId="lungs" text={names?.lungs} labels={false} inner />
        </>
      )}
      <group ref={heart} position={PIVOTS.heart}>
        {show('heart') && <Organ id="heart" geometry={thorax.heart} kind="myocardium" opacity={view === 'pulmonary' && !isolate ? 0.78 : undefined} />}
        {show('coronary-arteries') && <Organ id="coronary-arteries" geometry={thorax.coronaryArteries} kind="coronary" />}
        {show('coronary-veins') && <Organ id="coronary-veins" geometry={thorax.coronaryVeins} kind="vein" />}
      </group>
      {show('heart') && <Label at={[0.53, 12.48, 0.72]} partId="heart" text={names?.heart} labels={state.labels} inner />}
      {show('coronary-arteries') && <Label at={[0.27, 12.77, 0.65]} partId="coronary-arteries" text={names?.['coronary-arteries']} labels={false} inner />}
      {show('coronary-veins') && <Label at={[0.46, 12.56, 0.62]} partId="coronary-veins" text={names?.['coronary-veins']} labels={false} inner />}
    </>
  );
}

function VesselPart({ mesh, label, name }: { mesh: VesselMesh; label: boolean; name?: string }) {
  const { active, handlers } = usePart(mesh.id);
  const { selected, hovered } = useSelection();
  return (
    <>
      <mesh geometry={mesh.geometry} {...handlers}>
        <Tissue
          kind="artery"
          color={mesh.color}
          vertexColors={mesh.gradient}
          opacity={mesh.group === MICRO_GROUP ? 0.74 : undefined}
          active={active || selected === mesh.group || hovered === mesh.group}
        />
      </mesh>
      <Label at={mesh.at} partId={mesh.id} text={name} labels={label} inner />
    </>
  );
}

export default function CirculationModel({ state, names = {} }: ModelProps) {
  const meshes = useMemo(buildVesselMeshes, []);
  const streams = useMemo(buildStreams, []);
  const { selected, isolate } = useSelection();
  const group = selected ? PART_GROUPS[selected] ?? selected : undefined;
  const view = currentView(state.modes, group);
  const micro = view === 'micro';
  const focus = useMemo(() => {
    if (!selected) return undefined;
    const bounds = new Box3();
    for (const mesh of meshes) {
      if (mesh.id === selected || mesh.group === selected) bounds.union(mesh.geometry.boundingBox!);
    }
    if (group === HEART_GROUP) bounds.union(heartBounds);
    if (selected === 'lungs' || selected === LUNG_GROUP) bounds.union(thoraxBounds);
    if (bounds.isEmpty()) return undefined;
    if (group !== MICRO_GROUP) {
      bounds.min.multiplyScalar(BODY_SCALE).add(bodyShift);
      bounds.max.multiplyScalar(BODY_SCALE).add(bodyShift);
    }
    return bounds;
  }, [group, meshes, selected]);

  const visible = (id: string, layer: string) =>
    isInView(layer, view) && (!isolate || selected === id || selected === layer);
  const labeled = (id: string) =>
    state.labels && !selected && (micro || (view === 'pulmonary' ? lungLabels.has(id) : mainLabels.has(id)));
  return (
    <>
      <CameraRig view={view} focus={focus} />
      <group scale={micro ? 1 : BODY_SCALE} position={micro ? [0, 0, 0] : [0, BODY_FLOOR, 0]}>
        {!micro && (
          <>
            {view !== 'pulmonary' && !isolate && <Suspense fallback={<ModelPending />}><Skin /></Suspense>}
            <Suspense fallback={<ModelPending />}><Thorax view={view} state={state} names={names} /></Suspense>
          </>
        )}
        {meshes.filter((mesh) => visible(mesh.id, mesh.group)).map((mesh) =>
          <VesselPart key={mesh.id} mesh={mesh} label={labeled(mesh.id)} name={names[mesh.id]} />,
        )}
        {streams.filter((flow) => visible(flow.part, flow.group)).map((flow) => (
          <Flow key={flow.key} path={flow.path} count={flow.count} speed={flow.speed} size={flow.size} color={flow.color} state={state} />
        ))}
      </group>
    </>
  );
}
