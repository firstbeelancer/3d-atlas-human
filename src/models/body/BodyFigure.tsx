import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { CapsuleGeometry, LatheGeometry, Quaternion, Vector2, Vector3, type Group, type Mesh } from 'three';
import type { ModelProps } from '../../three/types';
import { blobGeometry, heartbeat, type BlobShape, type Vec3 } from '../../three/geometry';
import { Label } from '../../three/Label';
import { useIsActive, useSelection } from '../../three/selection';
import { getSection } from '../../content/sections';

/*
  Стеклянная фигура человека с органами внутри — витрина главной страницы.
  Первое касание органа подписывает его, второе открывает раздел.
*/

const GLASS = {
  color: '#b9c6dc',
  transparent: true,
  opacity: 0.3,
  roughness: 0.2,
  clearcoat: 1,
  clearcoatRoughness: 0.15,
  depthWrite: false,
} as const;

function Limb({ from, to, radius }: { from: Vec3; to: Vec3; radius: number }) {
  const { geometry, position, quaternion } = useMemo(() => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    return {
      geometry: new CapsuleGeometry(radius, len, 8, 24),
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()),
    };
  }, [from, to, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} quaternion={quaternion} raycast={() => null}>
      <meshPhysicalMaterial {...GLASS} />
    </mesh>
  );
}

function Torso() {
  const geometry = useMemo(() => {
    const profile: [number, number][] = [
      [0.0, -1.05], [0.55, -1.0], [0.76, -0.62], [0.7, -0.1], [0.6, 0.35], [0.66, 0.9],
      [0.8, 1.5], [0.93, 1.92], [0.8, 2.16], [0.32, 2.28], [0.23, 2.45], [0.0, 2.52],
    ];
    return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 64);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} scale={[1, 1, 0.62]} raycast={() => null}>
      <meshPhysicalMaterial {...GLASS} />
    </mesh>
  );
}

interface OrganSpec {
  slug: string;
  shape: BlobShape;
  position: Vec3;
  rotation?: Vec3;
  color: string;
  label: Vec3;
  breathe?: boolean;
  beat?: boolean;
  mirror?: boolean;
}

const ROUND: BlobShape = { taper: 1, power: 1, sx: 1, sy: 1, sz: 1 };

const ORGANS: OrganSpec[] = [
  { slug: 'mozg', shape: { ...ROUND, sx: 0.52, sy: 0.42, sz: 0.6 }, position: [0, 3.08, -0.03], color: '#e6a9ad', label: [0.4, 3.35, 0] },
  { slug: 'glaz', shape: { ...ROUND, sx: 0.085, sy: 0.085, sz: 0.085 }, position: [0.2, 2.9, 0.5], color: '#f4f1ea', label: [0.3, 2.9, 0.5], mirror: true },
  { slug: 'uho', shape: { ...ROUND, sx: 0.05, sy: 0.14, sz: 0.09 }, position: [0.62, 2.88, -0.02], color: '#e3b29c', label: [0.75, 2.88, 0], mirror: true },
  { slug: 'legkie', shape: { taper: 0.55, power: 0.8, sx: 0.36, sy: 0.6, sz: 0.34 }, position: [0.44, 1.42, 0.0], color: '#ec9c9a', label: [0.75, 1.6, 0.1], breathe: true, mirror: true },
  { slug: 'serdce', shape: { taper: 0.2, power: 0.6, sx: 0.24, sy: 0.32, sz: 0.22 }, position: [0.12, 1.2, 0.2], rotation: [0, 0, 0.5], color: '#c3362e', label: [0.1, 1.15, 0.45], beat: true },
  { slug: 'pechen', shape: { taper: 0.35, power: 0.9, sx: 0.6, sy: 0.26, sz: 0.36 }, position: [-0.3, 0.6, 0.12], rotation: [0, 0, -0.25], color: '#8f3d2e', label: [-0.75, 0.62, 0.15] },
  { slug: 'zhelchnyj-puzyr', shape: { ...ROUND, sx: 0.07, sy: 0.12, sz: 0.07 }, position: [-0.2, 0.42, 0.36], color: '#4f8f52', label: [-0.25, 0.38, 0.4] },
  { slug: 'zheludok', shape: { taper: 0.5, power: 0.8, sx: 0.3, sy: 0.32, sz: 0.24 }, position: [0.36, 0.56, 0.14], rotation: [0, 0, 0.6], color: '#e0a36b', label: [0.7, 0.62, 0.2] },
  { slug: 'podzheludochnaya', shape: { ...ROUND, sx: 0.36, sy: 0.08, sz: 0.1 }, position: [0.12, 0.3, -0.06], rotation: [0, 0, 0.15], color: '#e8c47c', label: [0.4, 0.28, -0.05] },
  { slug: 'pochki', shape: { ...ROUND, sx: 0.12, sy: 0.19, sz: 0.09 }, position: [0.36, 0.2, -0.28], color: '#9c3c33', label: [0.5, 0.15, -0.3], mirror: true },
  { slug: 'kishechnik', shape: { taper: 0.9, power: 1, sx: 0.5, sy: 0.42, sz: 0.3 }, position: [0, -0.35, 0.1], color: '#e5b28d', label: [0.55, -0.4, 0.15] },
  { slug: 'mochevoj-puzyr', shape: { ...ROUND, sx: 0.15, sy: 0.13, sz: 0.13 }, position: [0, -0.92, 0.18], color: '#e7c264', label: [0.2, -0.95, 0.2] },
];

function Organ({ spec, state, x = 1 }: { spec: OrganSpec; state: ModelProps['state']; x?: 1 | -1 }) {
  const geometry = useMemo(() => blobGeometry(spec.shape, 48), [spec.shape]);
  const ref = useRef<Mesh>(null);
  const active = useIsActive(spec.slug);
  const { selected, select, hover } = useSelection();
  const navigate = useNavigate();

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const time = state.time.current;
    if (spec.breathe) {
      const b = 0.5 + 0.5 * Math.sin(time * 1.4);
      m.scale.set(1 + 0.05 * b, 1 + 0.07 * b, 1 + 0.05 * b);
    } else if (spec.beat) {
      m.scale.setScalar(1 - 0.08 * heartbeat(time).v);
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (selected === spec.slug) navigate(`/razdel/${spec.slug}`);
    else select(spec.slug);
  };

  const pos: Vec3 = [spec.position[0] * x, spec.position[1], spec.position[2]];
  const rot: Vec3 = spec.rotation ? [spec.rotation[0], spec.rotation[1], spec.rotation[2] * x] : [0, 0, 0];

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      position={pos}
      rotation={rot}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(spec.slug);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hover(null);
        document.body.style.cursor = '';
      }}
    >
      <meshPhysicalMaterial
        color={spec.color}
        roughness={0.5}
        clearcoat={0.35}
        clearcoatRoughness={0.4}
        sheen={0.4}
        sheenColor="#ffd9cc"
        emissive={active ? '#ffb38a' : '#000000'}
        emissiveIntensity={active ? 0.45 : 0}
      />
    </mesh>
  );
}

export default function BodyFigure({ state }: ModelProps) {
  const group = useRef<Group>(null);
  useFrame(() => {
    // фигура едва заметно «дышит»
    const g = group.current;
    if (g) g.position.y = -0.35 + 0.02 * Math.sin(state.time.current * 1.4);
  });

  return (
    <group ref={group} position={[0, -0.35, 0]}>
      {/* голова и шея */}
      <mesh position={[0, 2.95, 0]} scale={[0.62, 0.74, 0.66]} raycast={() => null}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshPhysicalMaterial {...GLASS} />
      </mesh>
      <Torso />
      {/* руки */}
      {([1, -1] as const).map((s) => (
        <group key={s}>
          <Limb from={[0.98 * s, 1.95, 0]} to={[1.22 * s, 0.6, 0]} radius={0.19} />
          <Limb from={[1.22 * s, 0.6, 0]} to={[1.38 * s, -0.62, 0.12]} radius={0.15} />
          <Limb from={[1.38 * s, -0.7, 0.12]} to={[1.42 * s, -1.05, 0.14]} radius={0.12} />
        </group>
      ))}
      {/* ноги */}
      {([1, -1] as const).map((s) => (
        <group key={s}>
          <Limb from={[0.38 * s, -0.85, 0]} to={[0.42 * s, -2.55, 0.02]} radius={0.27} />
          <Limb from={[0.42 * s, -2.55, 0.02]} to={[0.45 * s, -4.1, -0.04]} radius={0.2} />
          <Limb from={[0.45 * s, -4.25, 0.0]} to={[0.48 * s, -4.3, 0.32]} radius={0.12} />
        </group>
      ))}

      {ORGANS.map((spec) =>
        spec.mirror ? (
          <group key={spec.slug}>
            <Organ spec={spec} state={state} x={1} />
            <Organ spec={spec} state={state} x={-1} />
          </group>
        ) : (
          <Organ key={spec.slug} spec={spec} state={state} />
        ),
      )}

      {ORGANS.map((spec) => (
        <Label key={spec.slug} labels={false} partId={spec.slug} text={getSection(spec.slug)?.title ?? spec.slug} at={spec.label} />
      ))}
    </group>
  );
}
