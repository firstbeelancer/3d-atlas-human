import { use, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, type BufferGeometry, type Group, type InstancedMesh } from 'three';
import type { ModelProps } from '../../three/types';
import { Tissue, usePart, type TissueKind } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { HEIGHT, JOINTS, VERTEBRAE, type VertebraSpot } from './anatomy';
import type { SkeletonGeometry } from './bones';
import { loadSkeletonGeometry } from './loader';
import { CUT_PARTS, GROUP_OF } from './parts';
import { poseAt, REST, type Pose } from './pose';
import { CutBone } from './CutBoneExhibit';
import type { V3 } from './sdf';

/*
  Скелет взрослого в полный рост. Модель строится в дециметрах (anatomy.ts) и уменьшается до
  высоты 5 единиц сцены, стопы стоят на полу сцены (y = -2,2). Правая рука машет — она собрана
  как зеркальная копия левой, и те же углы суставов дают зеркальное движение.
*/

const SCALE = 5 / HEIGHT;
const FLOOR = -2.2;
const neg = (p: V3): V3 => [-p[0], -p[1], -p[2]];

/** Подсветка части: выбрана сама кость, её группа в списке или на кость навели курсор. */
function useBone(partId: string) {
  const { handlers } = usePart(partId);
  const { selected, hovered } = useSelection();
  const group = GROUP_OF[partId];
  const active = selected === partId || hovered === partId || (!!group && (selected === group || hovered === group));
  return { active, handlers };
}

function Bone({ geometry, part, kind = 'bone' }: { geometry: BufferGeometry; part: string; kind?: TissueKind }) {
  const { active, handlers } = useBone(part);
  return (
    <mesh geometry={geometry} {...handlers}>
      <Tissue kind={kind} active={active} vertexColors={!!geometry.attributes.color} />
    </mesh>
  );
}

/** Шарнир: дочерние кости вращаются вокруг точки at. */
function Pivot({ at, pivotRef, order, children }: { at: V3; pivotRef?: RefObject<Group | null>; order?: 'XYZ' | 'YZX'; children: ReactNode }) {
  return (
    <group position={at}>
      <group ref={pivotRef} rotation={[0, 0, 0, order ?? 'XYZ']}>
        <group position={neg(at)}>{children}</group>
      </group>
    </group>
  );
}

const dummy = new Object3D();

function Vertebrae({ geometry, spots, part }: { geometry: BufferGeometry; spots: VertebraSpot[]; part: string }) {
  const ref = useRef<InstancedMesh>(null);
  const { active, handlers } = useBone(part);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    spots.forEach((s, i) => {
      dummy.position.set(0, s.y, s.z);
      dummy.rotation.set(s.tilt, 0, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, spots.length]} {...handlers}>
      <Tissue kind="bone" active={active} vertexColors={!!geometry.attributes.color} />
    </instancedMesh>
  );
}

/** Межпозвонковые диски — хрящевые прокладки между телами позвонков. */
function Discs({ geometry }: { geometry: BufferGeometry }) {
  const ref = useRef<InstancedMesh>(null);
  const items = useMemo(() => {
    const all = [
      ...VERTEBRAE.cervical.map((s) => ({ s, r: 0.13, h: 0.035 })),
      ...VERTEBRAE.thoracic.map((s) => ({ s, r: 0.135, h: 0.04 })),
      ...VERTEBRAE.lumbar.map((s) => ({ s, r: 0.2, h: 0.055 })),
    ];
    const out: { y: number; z: number; tilt: number; r: number; h: number }[] = [];
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i];
      const b = all[i + 1];
      out.push({ y: (a.s.y + b.s.y) / 2, z: (a.s.z + b.s.z) / 2, tilt: (a.s.tilt + b.s.tilt) / 2, r: b.r * b.s.scale, h: b.h });
    }
    const last = all[all.length - 1].s;
    out.push({ y: last.y - 0.19, z: last.z - 0.06, tilt: last.tilt - 0.3, r: 0.2, h: 0.05 });
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((d, i) => {
      dummy.position.set(0, d.y, d.z);
      dummy.rotation.set(d.tilt, 0, 0);
      dummy.scale.set(d.r, d.h / 0.32, d.r);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]}>
      <Tissue kind="cartilage" />
    </instancedMesh>
  );
}

interface ArmRefs {
  girdle: RefObject<Group | null>;
  shoulder: RefObject<Group | null>;
  elbow: RefObject<Group | null>;
  wrist: RefObject<Group | null>;
}

function useArmRefs(): ArmRefs {
  return {
    girdle: useRef<Group>(null),
    shoulder: useRef<Group>(null),
    elbow: useRef<Group>(null),
    wrist: useRef<Group>(null),
  };
}

function applyArm(refs: ArmRefs, p: Pose) {
  refs.girdle.current?.rotation.set(0, 0, p.girdle);
  refs.shoulder.current?.rotation.set(0, p.shoulderY, p.shoulderZ, 'YZX');
  refs.elbow.current?.rotation.set(0, 0, p.elbowZ);
  refs.wrist.current?.rotation.set(0, 0, p.wristZ);
}

function Arm({ g, refs, labels, names }: { g: SkeletonGeometry; refs: ArmRefs; labels?: boolean; names: Record<string, string> }) {
  const L = labels !== undefined;
  return (
    <Pivot at={JOINTS.sternoclavicular} pivotRef={refs.girdle}>
      <Bone geometry={g.clavicle} part="clavicle" />
      <Bone geometry={g.scapula} part="scapula" />
      {L && <Label labels={!!labels} partId="clavicle" text={names.clavicle} at={[1.0, 14.47, 0.72]} />}
      {L && <Label labels={false} partId="scapula" text={names.scapula} at={[1.15, 13.4, -0.9]} />}
      <Pivot at={JOINTS.shoulder} pivotRef={refs.shoulder} order="YZX">
        <Bone geometry={g.humerus} part="humerus" />
        {L && <Label labels={!!labels} partId="humerus" text={names.humerus} at={[1.9, 12.6, -0.25]} />}
        {L && <Label labels={false} partId="g-arm" text={names['g-arm']} at={[1.95, 11.6, -0.25]} />}
        <Pivot at={JOINTS.elbow} pivotRef={refs.elbow}>
          <Bone geometry={g.radius} part="radius" />
          <Bone geometry={g.ulna} part="ulna" />
          {L && <Label labels={false} partId="radius" text={names.radius} at={[2.12, 9.6, -0.18]} />}
          {L && <Label labels={false} partId="ulna" text={names.ulna} at={[1.76, 9.7, -0.26]} />}
          <Pivot at={JOINTS.wrist} pivotRef={refs.wrist}>
            <Bone geometry={g.hand} part="hand-bones" />
            {L && <Label labels={!!labels} partId="hand-bones" text={names['hand-bones']} at={[2.12, 7.45, 0.02]} />}
          </Pivot>
        </Pivot>
      </Pivot>
    </Pivot>
  );
}

function Leg({ g }: { g: SkeletonGeometry }) {
  return (
    <>
      <Bone geometry={g.hipBone} part="hip-bone" />
      <Bone geometry={g.femur} part="femur" />
      <Bone geometry={g.patella} part="patella" />
      <Bone geometry={g.tibia} part="tibia" />
      <Bone geometry={g.fibula} part="fibula" />
      <Bone geometry={g.foot} part="foot-bones" />
    </>
  );
}

function Skeleton({ g, state, names }: { g: SkeletonGeometry; state: ModelProps['state']; names: Record<string, string> }) {
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const chest = useRef<Group>(null);
  const right = useArmRefs();
  const left = useArmRefs();

  useFrame(() => {
    const p = poseAt(state.time.current);
    applyArm(right, p);
    applyArm(left, REST);
    head.current?.rotation.set(0, p.headY, p.headZ);
    body.current?.rotation.set(0, 0, p.sway);
    const b = p.breath;
    chest.current?.scale.set(1 + 0.012 * b, 1 + 0.004 * b, 1 + 0.02 * b);
  });

  const lb = state.labels;
  return (
    <group position={[0, FLOOR, 0]} scale={SCALE}>
      <group ref={body}>
        {/* Голова */}
        <Pivot at={JOINTS.head} pivotRef={head}>
          <Bone geometry={g.skull} part="skull" />
          <Bone geometry={g.mandible} part="mandible" />
          <Label labels={lb} partId="skull" text={names.skull} at={[0.7, 16.95, 0.15]} />
          <Label labels={false} partId="mandible" text={names.mandible} at={[0.4, 15.28, 0.5]} />
          <Label labels={false} partId="g-skull" text={names['g-skull']} at={[0, 17.35, 0.3]} />
        </Pivot>

        {/* Позвоночник */}
        <Vertebrae geometry={g.cervical} spots={VERTEBRAE.cervical} part="cervical-vertebrae" />
        <Vertebrae geometry={g.thoracic} spots={VERTEBRAE.thoracic} part="thoracic-vertebrae" />
        <Vertebrae geometry={g.lumbar} spots={VERTEBRAE.lumbar} part="lumbar-vertebrae" />
        <Discs geometry={g.disc} />
        <Bone geometry={g.sacrum} part="sacrum" />
        <Bone geometry={g.coccyx} part="coccyx" />
        <Label labels={false} partId="cervical-vertebrae" text={names['cervical-vertebrae']} at={[0.24, 15.2, -0.2]} />
        <Label labels={false} partId="thoracic-vertebrae" text={names['thoracic-vertebrae']} at={[0.2, 12.2, -0.62]} />
        <Label labels={lb} partId="lumbar-vertebrae" text={names['lumbar-vertebrae']} at={[0.3, 10.65, -0.1]} />
        <Label labels={false} partId="sacrum" text={names.sacrum} at={[0.3, 9.45, -0.65]} />
        <Label labels={false} partId="coccyx" text={names.coccyx} at={[0, 8.72, -0.85]} />
        <Label labels={false} partId="g-spine" text={names['g-spine']} at={[0.35, 11.2, -0.15]} />

        {/* Грудная клетка */}
        <group position={[0, 13, -0.3]}>
          <group ref={chest}>
            <group position={[0, -13, 0.3]}>
              <Bone geometry={g.sternum} part="sternum" />
              <Bone geometry={g.ribs} part="ribs" />
              <Bone geometry={g.cartilage} part="ribs" kind="cartilage" />
              <group scale={[-1, 1, 1]}>
                <Bone geometry={g.ribs} part="ribs" />
                <Bone geometry={g.cartilage} part="ribs" kind="cartilage" />
              </group>
            </group>
          </group>
        </group>
        <Label labels={false} partId="sternum" text={names.sternum} at={[0, 13.3, 1.2]} />
        <Label labels={lb} partId="ribs" text={names.ribs} at={[-1.32, 12.6, 0.45]} />
        <Label labels={false} partId="g-chest" text={names['g-chest']} at={[0, 12.9, 1.25]} />

        {/* Руки: левая стоит, правая (зеркальная копия) машет */}
        <Arm g={g} refs={left} labels={lb} names={names} />
        <group scale={[-1, 1, 1]}>
          <Arm g={g} refs={right} names={names} />
        </group>

        {/* Таз и ноги */}
        <Leg g={g} />
        <group scale={[-1, 1, 1]}>
          <Leg g={g} />
        </group>
        <Label labels={lb} partId="hip-bone" text={names['hip-bone']} at={[-1.36, 10.2, 0.1]} />
        <Label labels={false} partId="g-pelvis" text={names['g-pelvis']} at={[0, 10.05, 0.65]} />
        <Label labels={lb} partId="femur" text={names.femur} at={[-1.0, 7.2, 0.12]} />
        <Label labels={false} partId="patella" text={names.patella} at={[0.58, 5.05, 0.42]} />
        <Label labels={lb} partId="tibia" text={names.tibia} at={[-0.55, 2.8, 0.17]} />
        <Label labels={false} partId="fibula" text={names.fibula} at={[0.88, 2.6, -0.08]} />
        <Label labels={lb} partId="foot-bones" text={names['foot-bones']} at={[0.78, 0.25, 0.9]} />
        <Label labels={false} partId="g-leg" text={names['g-leg']} at={[0.95, 6.2, 0.2]} />
      </group>
    </group>
  );
}

export default function SkeletonModel({ state, names = {} }: ModelProps) {
  const g = use(loadSkeletonGeometry());
  const { selected } = useSelection();
  const cut = state.cutaway || (selected !== null && CUT_PARTS.has(selected));
  return cut ? <CutBone state={state} names={names} /> : <Skeleton g={g} state={state} names={names} />;
}

