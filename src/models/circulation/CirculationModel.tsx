import { Suspense, use, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, DoubleSide, Mesh, SphereGeometry, Vector3, type BufferGeometry, type Group } from 'three';
import { Flow } from '../../three/Flow';
import { Label } from '../../three/Label';
import { ModelPending } from '../../three/StageLoading';
import { Tissue, usePart, type TissueKind } from '../../three/materials';
import { useSelection } from '../../three/selection';
import type { ModelProps, StageState } from '../../three/types';
import { merge, tube, type V3 } from '../body/geo';
import { loadBodyPart } from '../body/loader';
import { PIVOTS } from '../body/meta';
import { HEART_GROUP, LUNG_GROUP, MICRO_GROUP, PART_GROUPS, spreadOf, type View } from './anatomy';
import { BODY_FLOOR, BODY_SCALE, OVERVIEW_CAMERA, OVERVIEW_TARGET } from './appearance';
import { buildStreams, buildVesselMeshes, type VesselMesh } from './geometry';

const bodyShift = new Vector3(0, BODY_FLOOR, 0);
const thoraxBounds = new Box3(new Vector3(-1.65, 11.3, -1.05), new Vector3(1.65, 14.85, 1.0));
const heartBounds = new Box3(new Vector3(-0.71, 11.88, -0.52), new Vector3(1.08, 13.48, 0.88));
const mainLabels = new Set(['aorta', 'carotid-arteries', 'subclavian-arteries', 'leg-arteries', 'vena-cava-inferior', 'vena-cava-superior', 'jugular-veins', 'iliac-arteries', 'renal-arteries', 'portal-vein']);
const lungLabels = new Set(['pulmonary-trunk', 'pulmonary-arteries', 'pulmonary-veins', 'lung-capillaries']);
const microLabels = new Set(['arterioles', 'tissue-capillaries', 'venules']);

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
interface Controls { target: Vector3; update(): void; addEventListener(type: 'start', listener: () => void): void; removeEventListener(type: 'start', listener: () => void): void; }
function CameraRig({ view, focus }: { view: View; focus: Box3 | undefined }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const invalidate = useThree((s) => s.invalidate);
  const { width, height } = useThree((s) => s.size);
  const moving = useRef(false);
  const goal = useMemo(() => {
    const aspect = Math.max(0.35, width / Math.max(1, height));
    const fit = (span: Vector3, padding: number) => Math.max(span.y, span.x / aspect) * padding / (2 * Math.tan(Math.PI * 16 / 180)) + span.z * 0.5;
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
    } else if (width < 540) { eye.multiplyScalar(1.17); target.y -= 0.25; eye.y -= 0.25; }
    return { target, eye };
  }, [focus, height, view, width]);
  useEffect(() => {
    if (!controls) return;
    moving.current = true; invalidate();
    const stop = () => { moving.current = false; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls, goal, invalidate]);
  useFrame(({ camera }, dt) => {
    if (!controls || !moving.current) return;
    const step = 1 - Math.exp(-7 * Math.min(dt, 1 / 120));
    camera.position.lerp(goal.eye, step);
    controls.target.lerp(goal.target, step);
    controls.update();
    moving.current = camera.position.distanceTo(goal.eye) > 0.016 || controls.target.distanceTo(goal.target) > 0.008;
    if (moving.current) invalidate();
  });
  return null;
}
function Skin({ hidden }: { hidden?: boolean }) {
  const { skin } = use(loadBodyPart('skin'));
  if (hidden) return null;
  return (<mesh geometry={skin} raycast={() => null} renderOrder={10}><meshStandardMaterial color="#8299b2" transparent opacity={0.16} depthWrite={false} roughness={0.82} /></mesh>);
}
function Organ({ id, geometry, kind, opacity }: { id: string; geometry: BufferGeometry; kind: TissueKind; opacity?: number }) {
  const { active, handlers } = usePart(id);
  const { selected, hovered } = useSelection();
  const group = PART_GROUPS[id];
  return (<mesh geometry={geometry} {...handlers} raycast={id === 'lungs' ? () => null : undefined}><Tissue kind={kind} active={active || selected === group || hovered === group} opacity={opacity} vertexColors={!!geometry.attributes.color} /></mesh>);
}

/** Детализация сердца: 4 камеры + перегородка + 4 клапана с анимацией. Всё — часть heart. */
function heartChambers(): Record<string, BufferGeometry> {
  const chamber = (c: V3, r: V3, squash = 1): BufferGeometry => {
    const g = new SphereGeometry(1, 28, 20);
    g.scale(r[0], r[1] * squash, r[2]);
    g.translate(c[0], c[1], c[2]);
    return g;
  };
  // координаты — дециметровая система тела (сердце y ~12-13.4)
  const ra = chamber([0.02, 12.75, 0.42], [0.30, 0.34, 0.28]);
  const la = chamber([0.02, 12.95, -0.28], [0.30, 0.30, 0.26]);
  const rv = chamber([-0.18, 12.35, 0.30], [0.30, 0.38, 0.30]);
  const lv = chamber([0.30, 12.40, -0.05], [0.32, 0.44, 0.32]);
  return { ra, la, rv, lv };
}
function valveRing(c: V3, r: number, squash: [number, number] = [1, 0.55]): BufferGeometry {
  const pts: V3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push([c[0] + Math.cos(a) * r * squash[0], c[1], c[2] + Math.sin(a) * r * squash[1]]);
  }
  return tube(pts, r * 0.22, { radial: 8, segments: 32 });
}
function HeartDetail({ state, showAll }: { state: StageState; showAll: (id: string) => boolean }) {
  const thorax = use(loadBodyPart('thorax'));
  const heart = useRef<Group>(null);
  const mitral = useRef<Mesh>(null);
  const tricuspid = useRef<Mesh>(null);
  const chambers = useMemo(heartChambers, []);
  useFrame(() => {
    if (heart.current) {
      const pulse = Math.max(0, Math.sin(state.time.current * 7.55)) ** 5;
      heart.current.scale.set(1 + 0.038 * pulse, 1 - 0.022 * pulse, 1 + 0.038 * pulse);
    }
    const open = (Math.sin(state.time.current * 7.55) > 0.15 ? 1 : 0.25);
    for (const m of [mitral.current, tricuspid.current]) {
      if (m) m.scale.set(1, 0.35 + 0.65 * open, 1);
    }
  });
  const { selected, isolate } = useSelection();
  const show = (id: string) => showAll(id);
  const cut = !!state.cutaway;
  return (
    <>
      <group ref={heart} position={PIVOTS.heart}>
        {show('heart') && (
          <>
            <Organ id="heart" geometry={thorax.heart} kind="myocardium" opacity={cut ? 0.35 : isolate && selected !== 'heart' ? 0.25 : undefined} />
            {/* камеры — полупрозрачные, видны на разрезе и в рентгене */}
            {(cut || selected === 'heart') && (
              <>
                <mesh geometry={chambers.ra} raycast={() => null}><meshPhysicalMaterial color="#c96a5e" transparent opacity={0.42} roughness={0.55} depthWrite={false} side={DoubleSide} /></mesh>
                <mesh geometry={chambers.la} raycast={() => null}><meshPhysicalMaterial color="#d0685e" transparent opacity={0.42} roughness={0.55} depthWrite={false} side={DoubleSide} /></mesh>
                <mesh geometry={chambers.rv} raycast={() => null}><meshPhysicalMaterial color="#8ea6e8" transparent opacity={0.42} roughness={0.55} depthWrite={false} side={DoubleSide} /></mesh>
                <mesh geometry={chambers.lv} raycast={() => null}><meshPhysicalMaterial color="#c0392b" transparent opacity={0.46} roughness={0.5} depthWrite={false} side={DoubleSide} /></mesh>
                <mesh ref={tricuspid} position={[-0.08, 12.55, 0.36]} raycast={() => null}><meshPhysicalMaterial color="#f1ddd2" roughness={0.6} side={DoubleSide} /><primitive object={valveRing([0, 0, 0], 0.13)} attach="geometry" /></mesh>
                <mesh ref={mitral} position={[0.14, 12.62, -0.12]} raycast={() => null}><meshPhysicalMaterial color="#f1ddd2" roughness={0.6} side={DoubleSide} /><primitive object={valveRing([0, 0, 0], 0.14)} attach="geometry" /></mesh>
              </>
            )}
          </>
        )}
        {show('coronary-arteries') && <Organ id="coronary-arteries" geometry={thorax.coronaryArteries} kind="coronary" />}
        {show('coronary-veins') && <Organ id="coronary-veins" geometry={thorax.coronaryVeins} kind="vein" />}
      </group>
      {show('heart') && <Label at={[0.53, 12.48, 0.72]} partId="heart" text="" labels={state.labels} inner />}
      {show('coronary-arteries') && <Label at={[0.27, 12.77, 0.65]} partId="coronary-arteries" text="" labels={false} inner />}
      {show('coronary-veins') && <Label at={[0.46, 12.56, 0.62]} partId="coronary-veins" text="" labels={false} inner />}
    </>
  );
}
/** Стенка капилляра под микроскопом: эндотелий, базальная мембрана, перициты, эритроциты. */
function MicroDetail(_props: { state: StageState }) {
  const { selected } = useSelection();
  const words = useMemo(() => {
    const endo: BufferGeometry[] = [];
    const peri: BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const y = (i - 3) * 0.43;
      for (let k = 0; k < 5; k++) {
        const t = k / 5;
        const x = -0.9 + t * 1.7;
        const z = 0.18 * Math.sin(i * 2 + k * 1.7);
        const g = new SphereGeometry(0.075, 10, 8);
        g.scale(1.6, 0.7, 0.9);
        g.translate(x, y + 0.06, z);
        endo.push(g);
        if (k % 2 === 0) {
          const pg = new SphereGeometry(0.05, 8, 6);
          pg.translate(x + 0.05, y - 0.09, z + 0.1);
          peri.push(pg);
        }
      }
    }
    return { endo: endo.length ? merge(endo) : null, peri: peri.length ? merge(peri) : null };
  }, []);
  if (selected && selected !== 'tissue-capillaries' && selected !== 'arterioles' && selected !== 'venules' && PART_GROUPS[selected] !== MICRO_GROUP) return null;
  return (
    <>
      {words.endo && (<mesh geometry={words.endo} raycast={() => null}><meshPhysicalMaterial color="#f2b8a8" transparent opacity={0.5} roughness={0.6} depthWrite={false} /></mesh>)}
      {words.peri && (<mesh geometry={words.peri} raycast={() => null}><Tissue kind="muscle" color="#c0503f" /></mesh>)}
    </>
  );
}
function VesselPart({ mesh, label, name, explode }: { mesh: VesselMesh; label: boolean; name?: string; explode: number }) {
  const { active, handlers } = usePart(mesh.id);
  const { selected, hovered } = useSelection();
  const spread = useMemo(() => spreadOf(mesh.id, mesh.group), [mesh.id, mesh.group]);
  const isArtery = mesh.group === 'g-systemic-arteries';
  return (
    <group position={explode > 0.001 ? [spread[0] * explode, spread[1] * explode, spread[2] * explode] : [0, 0, 0]}>
      <mesh geometry={mesh.geometry} {...handlers}>
        <Tissue kind={isArtery ? 'artery' : mesh.group === 'g-systemic-veins' ? 'vein' : 'artery'} color={mesh.color} vertexColors={mesh.gradient} opacity={mesh.group === 'g-microcirculation' ? 0.82 : undefined} active={active || selected === mesh.group || hovered === mesh.group} />
      </mesh>
      <Label at={mesh.at} partId={mesh.id} text={name} labels={label} inner />
    </group>
  );
}

export default function CirculationModel({ state, names = {} }: ModelProps) {
  const meshes = useMemo(buildVesselMeshes, []);
  const streams = useMemo(buildStreams, []);
  const { selected, isolate } = useSelection();
  const group = selected ? PART_GROUPS[selected] ?? selected : undefined;
  const view = currentView(state.modes, group);
  const micro = view === 'micro';
  const explode = state.explode ?? 0;
  const hidden = state.hidden;
  const cutaway = !!state.cutaway;
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
    } else if (explode > 0.001) {
      const c = new Vector3();
      bounds.getCenter(c);
      bounds.min.add(new Vector3(c.x * 0.15 * explode, 0, 0));
      bounds.max.add(new Vector3(-c.x * 0.15 * explode, 0, 0));
    }
    return bounds;
  }, [explode, group, meshes, selected]);
  const isHidden = (id: string, layer: string) => !!hidden && (hidden.has(id) || hidden.has(layer));
  const visible = (id: string, layer: string) => isInView(layer, view) && !isHidden(id, layer) && (!isolate || selected === id || selected === layer);
  const labeled = (id: string) => {
    if (!state.labels || selected) return false;
    if (micro) return microLabels.has(id);
    if (view === 'pulmonary') return lungLabels.has(id);
    return mainLabels.has(id);
  };
  const beat = (t: number) => 1 + 0.55 * Math.max(0, Math.sin(t * 7.55)) ** 4;
  const showAll = (id: string) => {
    const layer = PART_GROUPS[id] ?? id;
    if (!isInView(layer, view)) return false;
    if (isHidden(id, layer)) return false;
    if (!isolate) return true;
    return selected === id || selected === layer;
  };
  return (
    <>
      <CameraRig view={view} focus={focus} />
      <group scale={micro ? 1 : BODY_SCALE} position={micro ? [0, 0, 0] : [0, BODY_FLOOR, 0]}>
        {!micro && (
          <>
            {view !== 'pulmonary' && !isolate && !cutaway && (<Suspense fallback={<ModelPending />}><Skin hidden={false} /></Suspense>)}
            <Suspense fallback={<ModelPending />}><HeartDetail state={state} showAll={showAll} /></Suspense>

          </>
        )}
        {!micro && view === 'pulmonary' && (
          <Suspense fallback={<ModelPending />}>
            <PulmonaryLungs visible={showAll('lungs')} selected={selected} />
          </Suspense>
        )}
        {meshes.filter((mesh) => visible(mesh.id, mesh.group)).map((mesh) => (
          <VesselPart key={mesh.id} mesh={mesh} label={labeled(mesh.id)} name={names[mesh.id]} explode={mesh.group === MICRO_GROUP ? 0 : explode} />
        ))}
        {micro && <MicroDetail state={state} />}
        {streams.filter((flow) => visible(flow.part, flow.group)).map((flow) => (
          <Flow key={flow.key} path={flow.path} count={flow.count} speed={flow.speed} size={flow.size} color={flow.color} state={state} pulse={(flow as { arterial?: boolean }).arterial ? beat : undefined} />
        ))}
      </group>
    </>
  );
}
function PulmonaryLungs({ visible, selected }: { visible: boolean; selected: string | null }) {
  if (!visible) return null;
  const thorax = use(loadBodyPart('thorax'));
  if (!thorax) return null;
  return (
    <>
      <group position={PIVOTS.lungL}><Organ id="lungs" geometry={thorax.lungL} kind="inner" opacity={selected === 'lungs' ? 0.43 : 0.22} /></group>
      <group position={PIVOTS.lungR}><Organ id="lungs" geometry={thorax.lungR} kind="inner" opacity={selected === 'lungs' ? 0.43 : 0.22} /></group>
      <Label at={[1.3, 13.43, 0.35]} partId="lungs" text="" labels={false} inner />
    </>
  );
}
