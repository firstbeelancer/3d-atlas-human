import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, Vector3, type Group, type Mesh, type MeshPhysicalMaterial } from 'three';
import type { ModelProps } from '../../three/types';
import { Tissue, usePart, type TissueKind } from '../../three/materials';
import { Label } from '../../three/Label';
import { Vessel } from '../../three/Vessel';
import { useSelection } from '../../three/selection';
import { GROUP_OF } from './parts';
import {
  backHalf, bottomCaps, cartilageCap, compactFace, frontHalf, periosteum, spongyFace, trabeculae, yellowFace,
} from './cutBone';

function useLayer(partId: string) {
  const { handlers } = usePart(partId);
  const { selected, hovered } = useSelection();
  const g = GROUP_OF[partId];
  const active = selected === partId || hovered === partId || selected === g || hovered === g;
  return { active, handlers };
}

function Layer({ geometry, part, kind }: { geometry: import('three').BufferGeometry; part: string; kind: TissueKind }) {
  const { active, handlers } = useLayer(part);
  return (
    <mesh geometry={geometry} {...handlers}>
      <Tissue kind={kind} active={active} />
    </mesh>
  );
}

/**
 * Длинная кость в разрезе. При включении разреза передняя половина кости отъезжает вперёд
 * и растворяется — открывается плоскость распила со всеми слоями.
 */
export function CutBone({ state, names = {} }: ModelProps) {
  const geo = useMemo(() => {
    const cap = cartilageCap();
    const per = periosteum();
    const bottom = bottomCaps();
    return {
      back: backHalf(),
      front: frontHalf(),
      compact: compactFace(),
      spongy: spongyFace(),
      yellow: yellowFace(),
      trab: trabeculae(),
      capShell: cap.shell,
      capFace: cap.face,
      perShell: per.shell,
      perFace: per.face,
      ring: bottom.ring,
      ringMarrow: bottom.marrow,
    };
  }, []);
  const artery = useMemo(
    () => new CatmullRomCurve3([new Vector3(0.95, -0.35, -0.25), new Vector3(0.55, -0.5, -0.2), new Vector3(0.36, -0.62, -0.12), new Vector3(0.18, -0.7, -0.05)]),
    [],
  );
  const lid = useRef<Group>(null);
  const lidMesh = useRef<Mesh>(null);
  const opened = useRef(0);
  const turn = useRef<Group>(null);

  useFrame((_, dt) => {
    // на паузе (и при «меньше движения») разрез сразу открыт
    opened.current = state.paused ? 1 : Math.min(1, opened.current + dt / 1.4);
    const k = opened.current;
    const e = k * k * (3 - 2 * k);
    if (lid.current) {
      lid.current.position.set(0.5 * e, 0, 1.6 * e);
      lid.current.rotation.y = 0.5 * e;
      lid.current.visible = k < 1;
    }
    const mat = lidMesh.current?.material as MeshPhysicalMaterial | undefined;
    if (mat) mat.opacity = 1 - e;
    if (turn.current) turn.current.rotation.y = -0.42 + (state.paused ? 0 : Math.sin(state.time.current * 0.35) * 0.16);
  });

  const compact = useLayer('compact-bone');
  const per = useLayer('periosteum');
  const lb = state.labels;

  return (
    <group position={[0, 0.02, 0]} scale={1.22}>
      <group ref={turn} rotation={[0, -0.42, 0]}>
        <mesh geometry={geo.back} {...compact.handlers}>
          <Tissue kind="bone" active={compact.active} />
        </mesh>
        <Layer geometry={geo.compact} part="compact-bone" kind="bone" />
        <Layer geometry={geo.ring} part="compact-bone" kind="bone" />
        <Layer geometry={geo.yellow} part="yellow-marrow" kind="fat" />
        <Layer geometry={geo.ringMarrow} part="yellow-marrow" kind="fat" />
        <Layer geometry={geo.spongy} part="red-marrow" kind="marrow" />
        <Layer geometry={geo.trab} part="spongy-bone" kind="bone" />
        <Layer geometry={geo.capShell} part="articular-cartilage" kind="cartilage" />
        <Layer geometry={geo.capFace} part="articular-cartilage" kind="cartilage" />
        <mesh geometry={geo.perShell} {...per.handlers}>
          <Tissue kind="periosteum" active={per.active} />
        </mesh>
        <Layer geometry={geo.perFace} part="periosteum" kind="periosteum" />
        <Vessel path={artery} radius={0.03} endScale={0.6} kind="artery" active={per.active} handlers={per.handlers} />

        <group ref={lid}>
          <mesh ref={lidMesh} geometry={geo.front}>
            <Tissue kind="bone" opacity={0.999} />
          </mesh>
        </group>

        <Label labels={lb} inner partId="articular-cartilage" text={names['articular-cartilage']} at={[0.32, 2.2, 0.06]} />
        <Label labels={lb} inner partId="spongy-bone" text={names['spongy-bone']} at={[-0.38, 1.6, 0.03]} />
        <Label labels={lb} inner partId="red-marrow" text={names['red-marrow']} at={[0.25, 1.15, 0.02]} />
        <Label labels={lb} inner partId="compact-bone" text={names['compact-bone']} at={[-0.3, -0.45, 0.02]} />
        <Label labels={lb} inner partId="yellow-marrow" text={names['yellow-marrow']} at={[0.02, -1.0, 0.02]} />
        <Label labels={lb} inner partId="periosteum" text={names.periosteum} at={[0.4, -1.25, 0.0]} />
        <Label labels={false} inner partId="g-cut" text={names['g-cut']} at={[0, 2.35, 0]} />
      </group>
    </group>
  );
}
