import { Suspense, use, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, DoubleSide, Mesh, Vector3 } from 'three';
import { curve, type Vec3 } from '../../three/geometry';
import { Flow } from '../../three/Flow';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { ModelPending } from '../../three/StageLoading';
import type { ModelProps } from '../../three/types';
import { AFFERENT, COLLECTING, DISTAL, EFFERENT, GROUP_OF, HENLE, KIDNEY_CAMERA, KIDNEY_TARGET, MICRO_IDS, PELVIS, PROXIMAL, TISSUE_IDS, URETER, VASCULAR_IDS, hilarPath, placeKidney } from './anatomy';
import type { Piece } from './build';
import { getProgress, loadKidney, subscribeProgress } from './loader';

const ANCHORS: Record<string, Vec3> = {
  'right-kidney': placeKidney([-0.8, 0.8, 0.74], false),
  'left-kidney': placeKidney([-0.8, 0.8, 0.62], true),
  capsule: placeKidney([-1.54, 0.66, 0.07], true),
  cortex: placeKidney([-1.20, 0.91, 0.09], true),
  columns: placeKidney([-0.94, 0.31, 0.01], true),
  pyramids: placeKidney([-0.74, 1.44, 0.25], true),
  pelvis: placeKidney([0.66, -0.23, 0.51], true),
  ureters: placeKidney([1.03, -2.26, 0.06], false),
  glomerulus: [-1.85, 1.81, 0.58],
  henle: [0.05, -2.34, 0.14],
  collecting: [1.61, -1.12, 0.12],
};

const streams = [
  { id: 'renal-arteries', path: curve(hilarPath(true, false).reverse()), color: '#ffb39f', size: 0.046 },
  { id: 'renal-veins', path: curve(hilarPath(true, true)), color: '#c0e2ff', size: 0.050 },
  { id: 'ureters', path: curve([...PELVIS, ...URETER.slice(1)].map((p) => placeKidney(p, true))), color: '#ffe276', size: 0.057 },
  { id: 'afferent', path: curve(AFFERENT), color: '#ffc0b2', size: 0.053 },
  { id: 'efferent', path: curve(EFFERENT), color: '#ffc0b2', size: 0.042 },
  { id: 'proximal', path: curve(PROXIMAL), color: '#fff3a0', size: 0.066 },
  { id: 'henle', path: curve(HENLE), color: '#fff3a0', size: 0.041 },
  { id: 'distal', path: curve(DISTAL), color: '#fff3a0', size: 0.058 },
  { id: 'collecting', path: curve(COLLECTING.slice(1)), color: '#fff3a0', size: 0.067 },
];

interface Rig {
  target: Vector3;
  update(): void;
  addEventListener(type: 'start', fn: () => void): void;
  removeEventListener(type: 'start', fn: () => void): void;
}

function CameraRig({ micro, focus }: { micro: boolean; focus?: Box3 }) {
  const controls = useThree((s) => s.controls) as unknown as Rig | null;
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const moving = useRef(false);
  const goal = useMemo(() => {
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height));
    const target = new Vector3(...(micro ? [-0.42, 0.01, 0] as Vec3 : KIDNEY_TARGET));
    const eye = new Vector3(...KIDNEY_CAMERA);
    if (micro) eye.set(-0.24, 0.4, 13.7);
    if (focus) {
      focus.getCenter(target);
      const span = focus.getSize(new Vector3());
      const fit = Math.max(span.y, span.x / aspect, span.z);
      eye.copy(target).add(new Vector3(0.12, 0.28, Math.max(micro ? 2.75 : 3.4, fit * 2.25)));
    } else {
      const width = micro ? 6.55 : 8.35;
      const distance = width / (2 * aspect * Math.tan(31 * Math.PI / 360));
      eye.z = Math.max(eye.z, distance);
      if (size.width < 440 && aspect > 0.83) {
        eye.z *= 1.13;
        target.y += 0.45;
        eye.y += 0.45;
      }
    }
    return { eye, target };
  }, [micro, focus, size.width, size.height]);

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
    const factor = 1 - Math.exp(-8 * Math.max(dt, 1 / 120));
    camera.position.lerp(goal.eye, factor);
    controls.target.lerp(goal.target, factor);
    controls.update();
    moving.current = camera.position.distanceTo(goal.eye) > 0.025 || controls.target.distanceTo(goal.target) > 0.01;
    if (moving.current) invalidate();
  });
  return null;
}

function Pending() {
  const progress = useSyncExternalStore(subscribeProgress, getProgress);
  return <ModelPending progress={progress} />;
}

function KidneyScene({ state, names = {} }: ModelProps) {
  const pieces = use(loadKidney());
  const { selected, hovered, isolate, select, hover } = useSelection();
  const micro = selected ? MICRO_IDS.has(selected) : !!state.modes.nephron;
  const vascular = (!micro && state.cutaway && state.cutKind === 'fundus')
    || !!(selected && (VASCULAR_IDS.has(selected) || selected === 'vessels'));
  const section = !micro && !vascular && (state.cutaway || !!(selected &&
    (TISSUE_IDS.has(selected) || GROUP_OF[selected] === 'drainage' || selected === 'hilum' || selected === 'tissue')));
  const matches = (id: string) => id === selected || GROUP_OF[id] === selected;
  const visible = (piece: Piece) => {
    if (state.hidden?.has(piece.id) || (isolate && !matches(piece.id))) return false;
    if (micro) return piece.view === 'micro';
    if (piece.view === 'micro') return false;
    if (piece.view === 'cover') return !section && !vascular;
    if (piece.view === 'cut') return section || matches(piece.id);
    if (piece.view === 'internal') return section || matches(piece.id);
    if (piece.view === 'vessel') return vascular;
    return true;
  };

  const focus = useMemo(() => {
    if (!selected || !GROUP_OF[selected]) return undefined;
    const bounds = new Box3();
    pieces.filter((p) => p.id === selected && (p.view === 'micro') === micro).forEach(({ geometry }) => {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox!);
    });
    return bounds.isEmpty() ? undefined : bounds;
  }, [micro, pieces, selected]);

  const showing = pieces.filter(visible);
  const flow = !!state.modes['renal-flow'];
  const explode = state.explode ?? 0;
  const byId = new Map<string, Piece[]>();
  showing.forEach((piece) => {
    const group = byId.get(piece.id);
    if (group) group.push(piece);
    else byId.set(piece.id, [piece]);
  });
  return (
    <>
      <CameraRig micro={micro} focus={focus} />
      {Array.from(byId, ([id, group]) => {
        const active = matches(id);
        const hot = hovered === id;
        const dimmed = !!selected && !active && (state.isolate ?? true);
        const flowPart = flow && streams.some((stream) => stream.id === id);
        const geo = group[0].geometry;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        const center = geo.boundingSphere!.center;
        const anchor: Vec3 = ANCHORS[id] ?? [center.x, center.y, center.z];
        const direction = center.clone().sub(new Vector3(micro ? -0.42 : 0, -0.2, -0.55)).normalize();
        const separated = direction.multiplyScalar(explode * (micro ? 0.80 : 1.04) * (1 + 0.15 * (id.length % 4)));
        const defaultLabel = micro ? id === 'glomerulus' || id === 'henle' : id === 'right-kidney' || (section ? id === 'cortex' : id === 'left-kidney');
        return (
          <group
            key={id}
            position={separated}
            onClick={(event) => { event.stopPropagation(); select(selected === id ? null : id); }}
            onPointerOver={(event) => { event.stopPropagation(); hover(id); }}
            onPointerOut={() => hover(null)}
          >
            {group.map((piece, i) => {
              const opacity = (piece.opacity && !active ? piece.opacity : 1) * (dimmed ? 0.16 : flowPart ? 0.50 : 1);
              return (
                <mesh key={i} geometry={piece.geometry} dispose={null}
                  raycast={(piece.opacity && !active) || dimmed ? () => null : Mesh.prototype.raycast}>
                  <meshStandardMaterial
                    vertexColors side={DoubleSide} roughness={piece.roughness ?? 0.5}
                    emissive={active || hot ? '#ffac76' : '#000'}
                    emissiveIntensity={hot ? 0.23 : active ? 0.13 : 0}
                    opacity={opacity} transparent={opacity < 1} depthWrite={opacity >= 0.95}
                  />
                </mesh>
              );
            })}
            {!dimmed && (defaultLabel || selected === id || hot) && (
              <Label at={anchor} partId={id} text={names[id]} labels={state.labels} inner={micro || section} />
            )}
          </group>
        );
      })}
      {flow && explode < 0.01 && streams.filter((stream) => byId.has(stream.id)).map((stream) => (
        <Flow key={stream.id} path={stream.path} count={stream.id === 'ureters' ? 20 : 10} speed={0.26}
          color={stream.color} size={stream.size} state={state} />
      ))}
    </>
  );
}

export default function KidneyModel(props: ModelProps) {
  return <Suspense fallback={<Pending />}><KidneyScene {...props} /></Suspense>;
}
