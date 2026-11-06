import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DoubleSide, Vector3, type BufferGeometry, type Mesh } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { buildEye } from './build';
import { EyeContext, EyePart, PartLabel, type EyeControl } from './EyePart';
import {
  CUT_VIEW,
  FOCUS,
  FUNDUS_VIEW,
  OVERVIEW,
  SCALE,
  SPREAD_VIEW,
  SPREAD,
  type Focus,
} from './parts';
import {
  choroidTexture,
  conjunctivaTexture,
  discTexture,
  foveaTexture,
  irisTexture,
  limbusTexture,
  maculaTexture,
  retinaTexture,
  scleraTexture,
} from './textures';

/*
  Глаз правый, вид спереди: +z — вперёд (роговица), +y — вверх, +x — к носу.
  Размеры в миллиметрах; общий масштаб — SCALE. Подробности анатомии — в anatomy.ts.
*/

/** Срез: плоская «крышка» на плоскости разреза. Видна только в своём режиме разреза и сама не обрезается. */
function Cap({
  kind,
  geometry,
  color,
  opacity = 1,
  level = 0,
}: {
  kind: 'side' | 'fundus';
  geometry: BufferGeometry | null;
  color: string;
  opacity?: number;
  level?: number;
}) {
  if (!geometry) return null;
  const off = level * 0.012;
  return (
    <mesh geometry={geometry} position={kind === 'side' ? [0, off, 0] : [0, 0, off]} userData={{ cap: kind }} visible={false}>
      <meshStandardMaterial
        color={color}
        roughness={0.72}
        side={DoubleSide}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity >= 1}
        polygonOffset
        polygonOffsetFactor={-(level + 1)}
        polygonOffsetUnits={-(level + 1)}
        userData={{ noClip: true }}
      />
    </mesh>
  );
}

function Iris({ geometry, pupil, time, map }: { geometry: ReturnType<typeof buildEye>['iris']; pupil: RefObject<Mesh | null>; time: { current: number }; map: ReturnType<typeof irisTexture> }) {
  const last = useRef(-1);
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    // зрачок медленно сужается и расширяется, как на свету и в темноте
    const rp = 1.72 + 0.5 * Math.sin(time.current * 0.8);
    if (Math.abs(rp - last.current) < 0.004) return;
    last.current = rp;
    geometry.update(rp);
    pupil.current?.scale.set(rp + 0.05, rp + 0.05, 1);
    invalidate();
  });
  return (
    <>
      <mesh geometry={geometry.front} frustumCulled={false}>
        <meshPhysicalMaterial map={map} bumpMap={map} bumpScale={1.4} roughness={0.52} clearcoat={0.35} clearcoatRoughness={0.3} sheen={0.4} sheenColor="#ffe9c9" />
      </mesh>
      <mesh geometry={geometry.back} frustumCulled={false}>
        <meshStandardMaterial color="#2a1812" roughness={0.8} />
      </mesh>
      <mesh geometry={geometry.rim} frustumCulled={false}>
        <meshStandardMaterial color="#3a2216" roughness={0.7} side={DoubleSide} />
      </mesh>
      <mesh geometry={geometry.cap} frustumCulled={false} userData={{ cap: 'side' }} visible={false}>
        <meshStandardMaterial color="#a77c52" roughness={0.7} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} userData={{ noClip: true }} />
      </mesh>
    </>
  );
}

interface Rig {
  position: Vector3;
  update(): void;
  target: Vector3;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части или к виду на разрез; пользователь может перехватить управление в любой момент. */
function CameraRig({ ctrl, selected, explode }: { ctrl: RefObject<EyeControl>; selected: string | null; explode: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Rig | null;
  const invalidate = useThree((s) => s.invalidate);
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
      return;
    }
    let f: Focus;
    if (selected && FOCUS[selected]) {
      f = FOCUS[selected];
      const sp = SPREAD[selected];
      if (sp && explode > 0) {
        // при разносе часть сместилась — смотрим туда, где она сейчас
        f = { ...f, at: [f.at[0] * (1 + (sp.k ?? 0) * explode), f.at[1] * (1 + (sp.k ?? 0) * explode), f.at[2] * (1 + (sp.k ?? 0) * explode) + (sp.dz ?? 0) * explode] };
      }
    } else if (spread) f = SPREAD_VIEW;
    else if (cut) f = kind === 'fundus' ? FUNDUS_VIEW : CUT_VIEW;
    else f = OVERVIEW;
    goal.current = {
      at: new Vector3(...f.at).multiplyScalar(SCALE),
      offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist),
    };
    invalidate();
    // explode намеренно не в списке: разнос двигает камеру только при включении и выключении
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cut, kind, spread, invalidate]);

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

export default function EyeModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const G = useMemo(() => buildEye(), []);
  const tex = useMemo(
    () => ({
      sclera: scleraTexture(),
      conj: conjunctivaTexture(),
      limbus: limbusTexture(),
      iris: irisTexture(),
      choroid: choroidTexture(),
      retina: retinaTexture(),
      macula: maculaTexture(),
      fovea: foveaTexture(),
      disc: discTexture(),
    }),
    [],
  );
  useEffect(
    () => () => {
      G.dispose();
      Object.values(tex).forEach((t) => t.dispose());
    },
    [G, tex],
  );

  const explodeTarget = state.explode ?? 0;
  const ctrl = useRef<EyeControl>({
    cut: false,
    kind: 'side',
    explode: 0,
    isolate: true,
    selected: null,
    hidden: new Set(),
    labels: true,
  });
  ctrl.current.cut = state.cutaway || explodeTarget > 0.02;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;

  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
  });

  const pupil = useRef<Mesh>(null);

  return (
    <EyeContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} />
      <group scale={SCALE} rotation={[0, 0, 0]}>
        {/* ---- Наружная оболочка ---- */}
        <EyePart id="sclera">
          <mesh geometry={G.sclera.outer}>
            <meshPhysicalMaterial map={tex.sclera} roughness={0.46} clearcoat={0.5} clearcoatRoughness={0.25} sheen={0.3} sheenColor="#fff2ec" />
          </mesh>
          <mesh geometry={G.sclera.inner}>
            <meshStandardMaterial color="#4b2f24" roughness={0.85} />
          </mesh>
          <Cap kind="side" geometry={G.sclera.cap} color="#efe3cf" />
          <Cap kind="fundus" geometry={G.sclera.ring} color="#efe3cf" />
          <PartLabel id="sclera" names={names} />
        </EyePart>

        <EyePart id="cornea">
          <mesh geometry={G.cornea.body} renderOrder={4}>
            <meshPhysicalMaterial
              color="#eaf4fb"
              transparent
              opacity={0.17}
              roughness={0.02}
              clearcoat={1}
              clearcoatRoughness={0.015}
              ior={1.376}
              envMapIntensity={2.4}
              depthWrite={false}
            />
          </mesh>
          <Cap kind="side" geometry={G.cornea.cap} color="#bcd8e6" opacity={0.7} />
          <PartLabel id="cornea" names={names} />
        </EyePart>

        <EyePart id="limbus">
          <mesh geometry={G.limbus} renderOrder={3}>
            <meshStandardMaterial map={tex.limbus} color="#9aa6ab" transparent depthWrite={false} roughness={0.6} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
          <PartLabel id="limbus" names={names} />
        </EyePart>

        <EyePart id="conjunctiva">
          <mesh geometry={G.conjunctiva} renderOrder={3}>
            <meshPhysicalMaterial map={tex.conj} transparent depthWrite={false} roughness={0.28} clearcoat={0.8} clearcoatRoughness={0.2} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
          <PartLabel id="conjunctiva" names={names} />
        </EyePart>

        {/* ---- Сосудистая оболочка ---- */}
        <EyePart id="iris">
          <Iris geometry={G.iris} pupil={pupil} time={state.time} map={tex.iris} />
          <PartLabel id="iris" names={names} />
        </EyePart>

        <EyePart id="pupil">
          <mesh ref={pupil} position={[0, 0, 8.8]}>
            <circleGeometry args={[1, 48]} />
            <meshPhysicalMaterial color="#030303" roughness={0.12} metalness={0.1} clearcoat={1} clearcoatRoughness={0.05} />
          </mesh>
          <PartLabel id="pupil" names={names} />
        </EyePart>

        <EyePart id="ciliary-muscle">
          <mesh geometry={G.ciliaryMuscle.outer}>
            <meshStandardMaterial color="#9c5648" roughness={0.65} />
          </mesh>
          <mesh geometry={G.ciliaryMuscle.inner}>
            <meshStandardMaterial color="#c07464" roughness={0.6} />
          </mesh>
          <mesh geometry={G.ciliaryMuscle.rim}>
            <meshStandardMaterial color="#b0685a" roughness={0.6} side={DoubleSide} />
          </mesh>
          <Cap kind="side" geometry={G.ciliaryMuscle.cap} color="#bf6b5b" level={1} />
          <PartLabel id="ciliary-muscle" names={names} />
        </EyePart>

        <EyePart id="ciliary-processes">
          <mesh geometry={G.processes.body}>
            <meshPhysicalMaterial color="#e3ab9c" roughness={0.45} clearcoat={0.4} sheen={0.6} sheenColor="#ffd5c8" />
          </mesh>
          <Cap kind="side" geometry={G.processes.cap} color="#dc9a8a" level={2} />
          <PartLabel id="ciliary-processes" names={names} />
        </EyePart>

        <EyePart id="choroid">
          <mesh geometry={G.choroid.outer}>
            <meshStandardMaterial color="#4a1a14" roughness={0.8} />
          </mesh>
          <mesh geometry={G.choroid.inner}>
            <meshPhysicalMaterial map={tex.choroid} roughness={0.5} clearcoat={0.3} />
          </mesh>
          <mesh geometry={G.choroid.rim}>
            <meshStandardMaterial color="#5a1d17" side={DoubleSide} />
          </mesh>
          <Cap kind="side" geometry={G.choroid.cap} color="#7d211b" level={1} />
          <Cap kind="fundus" geometry={G.choroid.ring} color="#7d211b" level={1} />
          <PartLabel id="choroid" names={names} />
        </EyePart>

        {/* ---- Прозрачные среды ---- */}
        <EyePart id="aqueous">
          <mesh geometry={G.aqueous.body} renderOrder={2}>
            <meshPhysicalMaterial color="#bfeeff" transparent opacity={0.1} roughness={0.05} clearcoat={0.6} depthWrite={false} />
          </mesh>
          <Cap kind="side" geometry={G.aqueous.cap} color="#bdebf7" opacity={0.42} level={1} />
          <PartLabel id="aqueous" names={names} />
        </EyePart>

        <EyePart id="lens">
          <mesh geometry={G.lens.body} renderOrder={3}>
            <meshPhysicalMaterial color="#f4f8ff" transparent opacity={0.34} roughness={0.04} clearcoat={1} clearcoatRoughness={0.03} ior={1.41} envMapIntensity={1.8} depthWrite={false} />
          </mesh>
          <Cap kind="side" geometry={G.lens.cap} color="#d6e7f4" opacity={0.7} level={2} />
          <PartLabel id="lens" names={names} />
        </EyePart>

        <EyePart id="lens-nucleus">
          <mesh geometry={G.nucleus.body} renderOrder={3}>
            <meshPhysicalMaterial color="#f0d98c" transparent opacity={0.72} roughness={0.25} clearcoat={0.6} depthWrite={false} />
          </mesh>
          <Cap kind="side" geometry={G.nucleus.cap} color="#eed27a" level={3} />
          <PartLabel id="lens-nucleus" names={names} />
        </EyePart>

        <EyePart id="zonule">
          <mesh geometry={G.zonule}>
            <meshStandardMaterial color="#f6f1e2" roughness={0.45} emissive="#ffffff" emissiveIntensity={0.05} />
          </mesh>
          <PartLabel id="zonule" names={names} />
        </EyePart>

        <EyePart id="vitreous">
          <mesh geometry={G.vitreous.body} renderOrder={1}>
            <meshPhysicalMaterial color="#c5ece6" transparent opacity={0.08} roughness={0.1} clearcoat={0.5} depthWrite={false} />
          </mesh>
          <Cap kind="side" geometry={G.vitreous.cap} color="#bfe9e3" opacity={0.3} level={1} />
          <Cap kind="fundus" geometry={G.vitreous.disc} color="#bfe9e3" opacity={0.3} level={2} />
          <PartLabel id="vitreous" names={names} />
        </EyePart>

        {/* ---- Сетчатка ---- */}
        <EyePart id="pigment-epithelium">
          <mesh geometry={G.rpe.outer}>
            <meshStandardMaterial color="#2c1a12" roughness={0.6} />
          </mesh>
          <mesh geometry={G.rpe.inner}>
            <meshPhysicalMaterial color="#2c1a12" roughness={0.4} clearcoat={0.5} />
          </mesh>
          <mesh geometry={G.rpe.rim}>
            <meshStandardMaterial color="#2c1a12" side={DoubleSide} />
          </mesh>
          <Cap kind="side" geometry={G.rpe.cap} color="#1f120c" level={2} />
          <Cap kind="fundus" geometry={G.rpe.ring} color="#1f120c" level={2} />
          <PartLabel id="pigment-epithelium" names={names} />
        </EyePart>

        <EyePart id="retina">
          <mesh geometry={G.retina.outer}>
            <meshStandardMaterial color="#b8573d" roughness={0.7} />
          </mesh>
          <mesh geometry={G.retina.inner}>
            <meshPhysicalMaterial map={tex.retina} roughness={0.42} clearcoat={0.45} clearcoatRoughness={0.3} sheen={0.4} sheenColor="#ffb08a" />
          </mesh>
          <mesh geometry={G.retina.rim}>
            <meshStandardMaterial color="#d9805a" side={DoubleSide} />
          </mesh>
          <Cap kind="side" geometry={G.retina.cap} color="#efa56b" level={3} />
          <Cap kind="fundus" geometry={G.retina.ring} color="#efa56b" level={3} />
          <PartLabel id="retina" names={names} />
        </EyePart>

        <EyePart id="macula">
          <mesh geometry={G.macula} renderOrder={2}>
            <meshStandardMaterial map={tex.macula} transparent depthWrite={false} roughness={0.5} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
          <PartLabel id="macula" names={names} />
        </EyePart>

        <EyePart id="fovea">
          <mesh geometry={G.fovea} renderOrder={3}>
            <meshStandardMaterial map={tex.fovea} transparent depthWrite={false} roughness={0.45} side={DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
          </mesh>
          <PartLabel id="fovea" names={names} />
        </EyePart>

        <EyePart id="optic-disc">
          <mesh geometry={G.disc} renderOrder={3}>
            <meshStandardMaterial map={tex.disc} transparent depthWrite={false} roughness={0.5} side={DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
          </mesh>
          <PartLabel id="optic-disc" names={names} />
        </EyePart>

        <EyePart id="retinal-vessels">
          <mesh geometry={G.arteries}>
            <meshPhysicalMaterial color="#d3322a" roughness={0.35} clearcoat={0.7} emissive="#400000" emissiveIntensity={0.1} />
          </mesh>
          <mesh geometry={G.veins}>
            <meshPhysicalMaterial color="#7e1626" roughness={0.38} clearcoat={0.7} />
          </mesh>
          <PartLabel id="retinal-vessels" names={names} />
        </EyePart>

        {/* ---- Зрительный нерв ---- */}
        <EyePart id="optic-nerve">
          <mesh geometry={G.nerve.core.geometry}>
            <meshStandardMaterial color="#f1e1b0" roughness={0.55} />
          </mesh>
          <mesh geometry={G.nv.artery.geometry}>
            <meshStandardMaterial color="#cf2f27" roughness={0.4} />
          </mesh>
          <mesh geometry={G.nv.vein.geometry}>
            <meshStandardMaterial color="#7f1828" roughness={0.4} />
          </mesh>
          <Cap kind="side" geometry={G.nerveCaps.core} color="#f4e7bd" level={4} />
          <Cap kind="side" geometry={G.nerveCaps.artery} color="#cf2f27" level={5} />
          <Cap kind="side" geometry={G.nerveCaps.vein} color="#7f1828" level={5} />
          <PartLabel id="optic-nerve" names={names} />
        </EyePart>

        <EyePart id="optic-sheath">
          <mesh geometry={G.nerve.subarachnoid.geometry} renderOrder={2}>
            <meshPhysicalMaterial color="#d8efee" transparent opacity={0.3} roughness={0.2} clearcoat={0.5} depthWrite={false} />
          </mesh>
          <mesh geometry={G.nerve.dura.geometry}>
            <meshStandardMaterial color="#e9dcc6" roughness={0.5} side={DoubleSide} />
          </mesh>
          <Cap kind="side" geometry={G.nerveCaps.csf} color="#cfe9e8" opacity={0.55} level={3} />
          <Cap kind="side" geometry={G.nerveCaps.dura} color="#e3d4bb" level={4} />
          <PartLabel id="optic-sheath" names={names} />
        </EyePart>

        {/* ---- Мышцы ---- */}
        {G.muscles.map((m) => (
          <EyePart key={m.id} id={m.id}>
            <mesh geometry={m.geometry}>
              <meshPhysicalMaterial vertexColors roughness={0.5} sheen={0.7} sheenColor="#ff9a8a" clearcoat={0.2} />
            </mesh>
            <Cap kind="side" geometry={m.sideCap} color="#c4483c" level={3} />
            <Cap kind="fundus" geometry={m.fundusCap} color="#c4483c" level={4} />
            {m.id === 'oblique-superior' && (
              <mesh geometry={G.trochlea} position={[8.9, 14.9, 4.4]} rotation={[0.2, 1.1, 0.4]}>
                <meshPhysicalMaterial color="#dfeaec" roughness={0.3} clearcoat={0.7} />
              </mesh>
            )}
            <PartLabel id={m.id} names={names} />
          </EyePart>
        ))}
      </group>
    </EyeContext.Provider>
  );
}

