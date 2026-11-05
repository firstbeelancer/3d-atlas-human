import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Quaternion, Vector3, type Group } from 'three';
import type { ModelProps } from '../../three/types';
import { blobGeometry, blobSurface, curve, heartbeat, transformMatrix, type BlobShape, type Vec3 } from '../../three/geometry';
import { Tissue, usePart, type TissueKind } from '../../three/materials';
import { Vessel } from '../../three/Vessel';
import { Flow } from '../../three/Flow';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';

/*
  Сердце, вид спереди. Оси: +x — левая сторона человека (справа для зрителя), +y — вверх, +z — к зрителю.
  Верхушка смотрит влево-вниз, правый желудочек лежит спереди, левое предсердие — сзади.
*/

const LV: BlobShape = { taper: 0.16, power: 0.6, sx: 1.05, sy: 1.45, sz: 0.95, flattenBack: 0.85 };
const LV_POS: Vec3 = [0.38, -0.25, -0.1];
const LV_ROT: Vec3 = [0.12, -0.3, 0.55];

const RV: BlobShape = { taper: 0.3, power: 0.7, sx: 1.05, sy: 1.22, sz: 0.66 };
const RV_POS: Vec3 = [-0.18, -0.24, 0.32];
const RV_ROT: Vec3 = [0.15, 0.25, 0.42];

const ATRIUM: BlobShape = { taper: 0.75, power: 1, sx: 0.62, sy: 0.64, sz: 0.58 };
const LA_SHAPE: BlobShape = { taper: 0.8, power: 1, sx: 0.74, sy: 0.48, sz: 0.5 };
const AURICLE: BlobShape = { taper: 0.25, power: 0.8, sx: 0.3, sy: 0.44, sz: 0.2 };

const INTERIOR = new Set(['tricuspid-valve', 'mitral-valve', 'septum']);

const PATHS = {
  aorta: curve([
    [-0.02, 0.45, 0.05], [-0.08, 1.25, 0.2], [0.05, 1.95, 0.12], [0.55, 2.2, -0.35],
    [0.92, 1.85, -0.82], [0.95, 1.0, -0.98], [0.92, -0.6, -1.02],
  ]),
  pt: curve([[0.32, 0.55, 0.62], [0.42, 1.15, 0.62], [0.38, 1.55, 0.2]]),
  lpa: curve([[0.38, 1.55, 0.2], [0.9, 1.68, -0.1], [1.55, 1.58, -0.3]]),
  rpa: curve([[0.38, 1.55, 0.2], [-0.2, 1.7, -0.32], [-1.35, 1.62, -0.42]]),
  svc: curve([[-1.0, 1.05, -0.02], [-1.02, 1.9, -0.06], [-1.0, 2.75, -0.06]]),
  ivc: curve([[-0.95, 0.35, -0.3], [-0.97, -0.4, -0.38], [-0.95, -1.15, -0.42]]),
  pv: [
    curve([[0.05, 0.98, -0.85], [-0.35, 1.02, -0.95], [-0.75, 1.04, -1.0]]),
    curve([[0.05, 0.7, -0.85], [-0.35, 0.64, -0.95], [-0.75, 0.6, -0.98]]),
    curve([[0.7, 0.98, -0.8], [1.1, 1.04, -0.84], [1.45, 1.06, -0.85]]),
    curve([[0.7, 0.7, -0.8], [1.1, 0.64, -0.84], [1.45, 0.6, -0.85]]),
  ],
};

/** Пути крови внутри сердца (видны в разрезе). */
const BLOOD = {
  blueTop: curve([
    [-1.0, 2.7, -0.06], [-1.0, 1.3, -0.02], [-1.0, 0.72, 0.05], [-0.62, 0.3, 0.32], [-0.3, -0.45, 0.45],
    [0.2, 0.2, 0.6], [0.42, 1.1, 0.62], [0.38, 1.55, 0.2], [0.9, 1.68, -0.1], [1.5, 1.58, -0.3],
  ]),
  blueBottom: curve([
    [-0.95, -1.1, -0.42], [-0.96, 0.25, -0.3], [-1.0, 0.68, 0.0], [-0.62, 0.3, 0.32], [-0.2, -0.55, 0.4],
    [0.22, 0.25, 0.58], [0.42, 1.15, 0.62], [0.38, 1.55, 0.2], [-0.2, 1.7, -0.32], [-1.3, 1.62, -0.42],
  ]),
  redRight: curve([
    [-0.72, 1.03, -0.99], [0.1, 0.9, -0.8], [0.3, 0.6, -0.55], [0.25, 0.38, -0.38], [0.65, -0.6, -0.15],
    [0.35, -0.1, 0.0], [-0.02, 0.5, 0.06], [-0.08, 1.25, 0.2], [0.05, 1.95, 0.12], [0.55, 2.2, -0.35],
    [0.92, 1.85, -0.82], [0.95, 1.0, -0.98], [0.92, -0.55, -1.02],
  ]),
  redLeft: curve([
    [1.42, 1.05, -0.85], [0.6, 0.9, -0.78], [0.35, 0.6, -0.55], [0.25, 0.38, -0.38], [0.8, -0.85, -0.1],
    [0.4, -0.2, 0.0], [0.0, 0.5, 0.05], [-0.08, 1.25, 0.2], [0.05, 1.95, 0.12], [0.55, 2.2, -0.35],
    [0.92, 1.85, -0.82], [0.95, 1.0, -0.98], [0.92, -0.55, -1.02],
  ]),
};

function Blob({
  shape,
  position,
  rotation = [0, 0, 0],
  scale = 1,
  kind,
  active,
  opacity,
  handlers,
}: {
  shape: BlobShape;
  position: Vec3;
  rotation?: Vec3;
  scale?: number;
  kind: TissueKind;
  active?: boolean;
  opacity?: number;
  handlers?: object;
}) {
  const geometry = useMemo(() => blobGeometry(shape), [shape]);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation} scale={scale} {...handlers}>
      <Tissue kind={kind} active={active} opacity={opacity} />
    </mesh>
  );
}

function Valve({
  center,
  normal,
  leaflets,
  partId,
  open,
}: {
  center: Vec3;
  normal: Vec3;
  leaflets: number;
  partId: string;
  open: React.MutableRefObject<number>;
}) {
  const { active, handlers } = usePart(partId);
  const flaps = useRef<(Group | null)[]>([]);
  // локальная ось −y кольца смотрит по току крови (из предсердия в желудочек)
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), new Vector3(...normal).normalize()),
    [normal],
  );

  useFrame(() => {
    const angle = 0.2 + 0.95 * open.current;
    flaps.current.forEach((f) => f && (f.rotation.x = angle));
  });

  return (
    <group position={center} quaternion={quaternion} {...handlers}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.035, 12, 40]} />
        <Tissue kind="valve" active={active} />
      </mesh>
      {Array.from({ length: leaflets }, (_, i) => (
        <group key={i} rotation={[0, (i / leaflets) * Math.PI * 2, 0]}>
          <group
            position={[0, 0, 0.22]}
            ref={(el) => {
              flaps.current[i] = el;
            }}
          >
            <mesh position={[0, -0.16, -0.06]} scale={[leaflets === 2 ? 0.26 : 0.17, 0.2, 0.025]}>
              <sphereGeometry args={[1, 18, 12]} />
              <Tissue kind="valve" active={active} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

export default function HeartModel({ state }: ModelProps) {
  const { selected } = useSelection();
  const cut = state.cutaway || (selected !== null && INTERIOR.has(selected));
  const wall = cut ? 0.2 : undefined;
  const tube = cut ? 0.38 : undefined;

  const ventricles = useRef<Group>(null);
  const atria = useRef<Group>(null);
  const valveOpen = useRef(1);

  const parts = {
    ra: usePart('right-atrium'),
    la: usePart('left-atrium'),
    rv: usePart('right-ventricle'),
    lv: usePart('left-ventricle'),
    ao: usePart('aorta'),
    pt: usePart('pulmonary-trunk'),
    svc: usePart('superior-vena-cava'),
    ivc: usePart('inferior-vena-cava'),
    pv: usePart('pulmonary-veins'),
    sep: usePart('septum'),
    cor: usePart('coronary-arteries'),
  };

  const coronary = useMemo(() => {
    const lvSurf = blobSurface(LV, transformMatrix(LV_POS, LV_ROT));
    const rvSurf = blobSurface(RV, transformMatrix(RV_POS, RV_ROT));
    const lad: Vector3[] = [];
    for (let k = 0; k <= 14; k++) lad.push(lvSurf(-0.42 + k * 0.02, 0.45 + k * 0.17, 0.035));
    const rca: Vector3[] = [];
    for (let k = 0; k <= 12; k++) rca.push(rvSurf(0.1 - k * 0.2, 0.62 + k * 0.05, 0.03));
    const lcx: Vector3[] = [];
    for (let k = 0; k <= 10; k++) lcx.push(lvSurf(0.25 + k * 0.2, 0.62 + k * 0.03, 0.03));
    const diag: Vector3[] = [];
    for (let k = 0; k <= 8; k++) diag.push(lvSurf(-0.1 + k * 0.09, 0.85 + k * 0.14, 0.03));
    return [curve(lad), curve(rca), curve(lcx), curve(diag)];
  }, []);

  const archBranches = useMemo(
    () =>
      [0.34, 0.41, 0.48].map((t, i) => {
        const p = PATHS.aorta.getPointAt(t);
        return curve([
          [p.x, p.y, p.z],
          [p.x - 0.05 + i * 0.06, p.y + 0.4, p.z + 0.02],
          [p.x - 0.12 + i * 0.14, p.y + 0.85, p.z + 0.05],
        ]);
      }),
    [],
  );

  useFrame(() => {
    const { a, v, phase } = heartbeat(state.time.current);
    ventricles.current?.scale.setScalar(1 - 0.05 * v);
    atria.current?.scale.setScalar(1 - 0.07 * a);
    // клапаны между предсердиями и желудочками открыты, пока желудочки расслаблены
    const target = phase > 0.15 && phase < 0.45 ? 0 : 1;
    valveOpen.current += (target - valveOpen.current) * 0.25;
  });

  const ejection = (time: number) => 0.35 + 1.6 * heartbeat(time).v;

  return (
    <group position={[0, -0.35, 0]}>
      {/* Желудочки: масштабируются вокруг своего центра при сокращении */}
      <group position={[0.1, -0.35, 0.15]}>
        <group ref={ventricles}>
          <group position={[-0.1, 0.35, -0.15]}>
            <Blob shape={LV} position={LV_POS} rotation={LV_ROT} kind="myocardium" active={parts.lv.active} opacity={wall} handlers={parts.lv.handlers} />
            <Blob shape={RV} position={RV_POS} rotation={RV_ROT} kind="myocardium" active={parts.rv.active} opacity={wall} handlers={parts.rv.handlers} />
            {coronary.map((c, i) => (
              <Vessel key={i} path={c} radius={i === 3 ? 0.03 : 0.042} endScale={0.45} kind="coronary" active={parts.cor.active} opacity={tube} caps={false} handlers={parts.cor.handlers} />
            ))}
            {cut && (
              <>
                <Blob shape={LV} position={LV_POS} rotation={LV_ROT} scale={0.6} kind="artery" opacity={0.55} active={parts.lv.active} handlers={parts.lv.handlers} />
                <Blob shape={RV} position={[RV_POS[0] - 0.02, RV_POS[1], RV_POS[2] + 0.05]} rotation={RV_ROT} scale={0.58} kind="vein" opacity={0.55} active={parts.rv.active} handlers={parts.rv.handlers} />
                <mesh position={[0.02, -0.3, 0.2]} rotation={[0, 0.64, 0.45]} scale={[0.07, 0.9, 0.5]} {...parts.sep.handlers}>
                  <sphereGeometry args={[1, 32, 24]} />
                  <Tissue kind="myocardium" active={parts.sep.active} />
                </mesh>
              </>
            )}
          </group>
        </group>
      </group>

      {/* Предсердия */}
      <group position={[-0.3, 0.8, -0.3]}>
        <group ref={atria}>
          <group position={[0.3, -0.8, 0.3]}>
            <Blob shape={ATRIUM} position={[-1.02, 0.72, 0.02]} kind="atrium" active={parts.ra.active} opacity={wall} handlers={parts.ra.handlers} />
            <Blob shape={AURICLE} position={[-0.6, 1.0, 0.52]} rotation={[0.3, 0, 1.9]} kind="atrium" active={parts.ra.active} opacity={wall} handlers={parts.ra.handlers} />
            <Blob shape={LA_SHAPE} position={[0.32, 0.85, -0.72]} kind="atrium" active={parts.la.active} opacity={wall} handlers={parts.la.handlers} />
            <Blob shape={AURICLE} position={[0.98, 0.8, 0.12]} rotation={[0.2, 0, -1.7]} kind="atrium" active={parts.la.active} opacity={wall} handlers={parts.la.handlers} />
            {cut && (
              <>
                <Blob shape={ATRIUM} position={[-1.0, 0.7, 0.04]} scale={0.6} kind="vein" opacity={0.55} active={parts.ra.active} handlers={parts.ra.handlers} />
                <Blob shape={LA_SHAPE} position={[0.32, 0.85, -0.7]} scale={0.6} kind="artery" opacity={0.55} active={parts.la.active} handlers={parts.la.handlers} />
              </>
            )}
          </group>
        </group>
      </group>

      {/* Крупные сосуды */}
      <Vessel path={PATHS.aorta} radius={0.25} kind="artery" active={parts.ao.active} opacity={tube} handlers={parts.ao.handlers} />
      {archBranches.map((c, i) => (
        <Vessel key={i} path={c} radius={0.085} endScale={0.85} kind="artery" active={parts.ao.active} opacity={tube} handlers={parts.ao.handlers} />
      ))}
      <Vessel path={PATHS.pt} radius={0.23} kind="vein" active={parts.pt.active} opacity={tube} handlers={parts.pt.handlers} />
      <Vessel path={PATHS.lpa} radius={0.14} endScale={0.8} kind="vein" active={parts.pt.active} opacity={tube} handlers={parts.pt.handlers} />
      <Vessel path={PATHS.rpa} radius={0.14} endScale={0.8} kind="vein" active={parts.pt.active} opacity={tube} handlers={parts.pt.handlers} />
      <Vessel path={PATHS.svc} radius={0.21} kind="vein" active={parts.svc.active} opacity={tube} handlers={parts.svc.handlers} />
      <Vessel path={PATHS.ivc} radius={0.23} kind="vein" active={parts.ivc.active} opacity={tube} handlers={parts.ivc.handlers} />
      {PATHS.pv.map((c, i) => (
        <Vessel key={i} path={c} radius={0.09} kind="artery" active={parts.pv.active} opacity={tube} handlers={parts.pv.handlers} />
      ))}

      {/* Клапаны и кровоток — в разрезе */}
      {cut && (
        <>
          <Valve center={[-0.62, 0.3, 0.32]} normal={[0.45, -0.75, 0.3]} leaflets={3} partId="tricuspid-valve" open={valveOpen} />
          <Valve center={[0.25, 0.38, -0.38]} normal={[0.3, -0.85, 0.2]} leaflets={2} partId="mitral-valve" open={valveOpen} />
          <Flow path={BLOOD.blueTop} count={26} speed={0.11} color="#5b82e6" state={state} pulse={ejection} />
          <Flow path={BLOOD.blueBottom} count={26} speed={0.11} color="#5b82e6" state={state} pulse={ejection} />
          <Flow path={BLOOD.redRight} count={30} speed={0.1} color="#ff5a48" state={state} pulse={ejection} />
          <Flow path={BLOOD.redLeft} count={30} speed={0.1} color="#ff5a48" state={state} pulse={ejection} />
        </>
      )}

      {/* Подписи */}
      <Label labels={state.labels} partId="right-atrium" text="Правое предсердие" at={[-1.45, 0.62, 0.25]} />
      <Label labels={state.labels} partId="right-ventricle" text="Правый желудочек" at={[-0.45, -0.75, 0.9]} />
      <Label labels={state.labels} partId="left-ventricle" text="Левый желудочек" at={[1.25, -0.7, 0.3]} />
      <Label labels={state.labels} partId="aorta" text="Аорта" at={[0.4, 2.12, 0.05]} side="right" />
      <Label labels={state.labels} partId="pulmonary-trunk" text="Лёгочный ствол" at={[0.6, 1.2, 0.8]} side="right" />
      <Label labels={state.labels} partId="superior-vena-cava" text="Верхняя полая вена" at={[-1.2, 2.35, 0.1]} />
      <Label labels={false} partId="left-atrium" text="Левое предсердие" at={[0.95, 0.95, -0.7]} />
      <Label labels={false} partId="inferior-vena-cava" text="Нижняя полая вена" at={[-1.15, -0.9, -0.3]} />
      <Label labels={false} partId="pulmonary-veins" text="Лёгочные вены" at={[1.5, 0.82, -0.85]} />
      <Label labels={false} partId="coronary-arteries" text="Коронарные артерии" at={[0.3, -0.2, 0.95]} side="right" />
      {cut && (
        <>
          <Label labels={state.labels} partId="tricuspid-valve" text="Трёхстворчатый клапан" at={[-0.75, 0.25, 0.5]} inner />
          <Label labels={state.labels} partId="mitral-valve" text="Митральный клапан" at={[0.45, 0.3, -0.3]} side="right" inner />
          <Label labels={state.labels} partId="septum" text="Перегородка" at={[0.05, -0.6, 0.55]} side="right" inner />
        </>
      )}
    </group>
  );
}
