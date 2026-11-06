import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, DoubleSide, Object3D, Vector3, type Group, type Mesh } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import { fillFraction, orificePoint, radiusAt, urineLevelY, URETHRAL_ORIFICE } from './anatomy';
import { buildBladder, ureterPath, type MatKey } from './build';
import { BladderContext, BladderPart, PartLabel, type BladderControl } from './BladderPart';
import { CUT_VIEW, FOCUS, FUNDUS_VIEW, OVERVIEW, SPREAD_VIEW, BLADDER_PART_IDS, type Focus } from './parts';
import {
  adventitiaTexture,
  detrusorTexture,
  mucosaTexture,
  serosaTexture,
  striatedTexture,
  submucosaTexture,
  surfaceTexture,
} from './textures';

/*
  Мочевой пузырь, вид спереди: +z — к лобку, +y — вверх (верхушка), дно — назад-вниз.
  Пузырь медленно наполняется и опорожняется: уровень мочи растёт, стенка чуть
  расширяется, из устьев мочеточников время от времени вылетают струйки.
*/

type Tex = ReturnType<typeof surfaceTexture>;

/** Материалы частей пузыря: ткани по традиции атласов, с процедурными текстурами. */
function BMaterial({ kind, tex }: { kind: MatKey; tex: Record<string, Tex> }) {
  switch (kind) {
    case 'surface':
      return <meshPhysicalMaterial map={tex.surface} bumpMap={tex.surface} bumpScale={0.6} roughness={0.38} clearcoat={0.55} clearcoatRoughness={0.3} sheen={0.5} sheenColor="#ffd9cc" />;
    case 'surfaceBack':
      return <meshPhysicalMaterial map={tex.surface} color="#e6c3ae" roughness={0.42} clearcoat={0.45} clearcoatRoughness={0.35} sheen={0.4} sheenColor="#ffd9cc" />;
    case 'serosa':
      return <meshStandardMaterial map={tex.serosa} transparent opacity={0.5} roughness={0.25} metalness={0} depthWrite={false} side={DoubleSide} />;
    case 'adventitia':
      return <meshStandardMaterial map={tex.adventitia} roughness={0.85} side={DoubleSide} />;
    case 'detrusor':
      return <meshPhysicalMaterial map={tex.detrusor} bumpMap={tex.detrusor} bumpScale={1.1} roughness={0.55} clearcoat={0.25} clearcoatRoughness={0.4} sheen={0.4} sheenColor="#ff9d8a" />;
    case 'submucosa':
      return <meshStandardMaterial map={tex.submucosa} roughness={0.65} side={DoubleSide} />;
    case 'mucosa':
      return <meshPhysicalMaterial map={tex.mucosa} bumpMap={tex.mucosa} bumpScale={0.8} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.18} sheen={0.6} sheenColor="#ffb7a8" side={DoubleSide} />;
    case 'mucosaDark':
      return <meshStandardMaterial map={tex.mucosa} color="#c98a76" roughness={0.45} />;
    case 'trigone':
      return <meshPhysicalMaterial map={tex.mucosa} color="#f0c0ab" roughness={0.32} clearcoat={0.75} clearcoatRoughness={0.2} sheen={0.5} sheenColor="#ffd2c2" side={DoubleSide} />;
    case 'ridge':
      return <meshStandardMaterial color="#eab09c" roughness={0.4} />;
    case 'urine':
      return <meshStandardMaterial color="#e7b93e" transparent opacity={0.36} roughness={0.12} metalness={0} depthWrite={false} side={DoubleSide} />;
    case 'artery':
      return <meshStandardMaterial color="#c3362e" roughness={0.4} emissive="#300000" emissiveIntensity={0.08} />;
    case 'vein':
      return <meshStandardMaterial color="#46589e" roughness={0.42} />;
    case 'nerve':
      return <meshStandardMaterial color="#e2bd45" roughness={0.55} />;
    case 'lymph':
      return <meshStandardMaterial color="#8fa653" roughness={0.55} />;
    case 'lymphDuct':
      return <meshStandardMaterial color="#a9bd76" roughness={0.55} />;
    case 'bone':
      return <meshStandardMaterial color="#eadfc6" roughness={0.72} />;
    case 'cartilage':
      return <meshStandardMaterial color="#cddfe4" roughness={0.38} />;
    case 'striated':
      return <meshStandardMaterial map={tex.striated} bumpMap={tex.striated} bumpScale={0.7} roughness={0.6} side={DoubleSide} />;
    case 'sphincterIn':
      return <meshStandardMaterial map={tex.detrusor} color="#d8a58f" roughness={0.55} />;
    case 'fibrous':
      return <meshStandardMaterial color="#e6d7bd" roughness={0.75} />;
    case 'lumenDark':
      return <meshStandardMaterial color="#4a2320" roughness={0.65} side={DoubleSide} />;
    case 'ureterWall':
      return <meshStandardMaterial map={tex.surface} color="#e2b49c" roughness={0.5} />;
    case 'ureterSheath':
      return <meshStandardMaterial color="#e8dcc8" transparent opacity={0.32} roughness={0.55} depthWrite={false} />;
    case 'urethraWall':
      return <meshStandardMaterial map={tex.mucosa} color="#dfb49f" roughness={0.55} />;
    case 'cutA':
      return <meshStandardMaterial color="#cf9a80" roughness={0.82} side={DoubleSide} />;
    case 'cutB':
      return <meshStandardMaterial color="#b4715a" roughness={0.82} side={DoubleSide} />;
    case 'cutC':
      return <meshStandardMaterial color="#e8b7a4" roughness={0.82} side={DoubleSide} />;
  }
}

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части или к виду на разрез; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode }: { ctrl: RefObject<BladderControl>; selected: string | null; explode: number }) {
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
    if (selected && FOCUS[selected]) f = FOCUS[selected];
    else if (spread) f = SPREAD_VIEW;
    else if (cut) f = kind === 'fundus' ? FUNDUS_VIEW : CUT_VIEW;
    else f = OVERVIEW;
    goal.current = {
      at: new Vector3(...f.at),
      offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist),
    };
    invalidate();
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

/** Поверхность мочи: плоский диск на текущем уровне наполнения. */
/** Волна перистальтики: вздутие стенки бежит по мочеточнику сверху вниз и приносит порцию мочи. */
function Peristalsis({ curves, state, tex }: { curves: CatmullRomCurve3[]; state: ModelProps['state']; tex: Record<string, Tex> }) {
  const refs = useRef<(Mesh | null)[]>([]);
  const pos = useMemo(() => new Vector3(), []);
  const tan = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const t = state.time.current;
    curves.forEach((cv, i) => {
      const m = refs.current[i];
      if (!m) return;
      const u = (t * 0.05 + i * 0.5) % 1;
      cv.getPointAt(u, pos);
      cv.getTangentAt(u, tan);
      m.position.copy(pos);
      m.lookAt(pos.x + tan.x, pos.y + tan.y, pos.z + tan.z);
      const s = 0.8 + 0.35 * Math.sin(u * Math.PI);
      m.scale.set(s, s, 1.3);
    });
  });
  return (
    <>
      {curves.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          userData={{ noPick: true }}
        >
          <sphereGeometry args={[0.205, 14, 10]} />
          <BMaterial kind="ureterWall" tex={tex} />
        </mesh>
      ))}
    </>
  );
}

function UrineSurface({ ctrl }: { ctrl: RefObject<BladderControl> }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const y = ctrl.current!.fillY;
    const r = Math.max(0.1, radiusAt(y) - 0.56);
    m.position.set(0, y, 0.34 - 0.22 * ((y + 3) / 6.22));
    m.scale.set(r, r * 0.84, 1);
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} userData={{ noPick: true }}>
      <circleGeometry args={[1, 48]} />
      <meshPhysicalMaterial color="#f0cd60" transparent opacity={0.7} roughness={0.08} clearcoat={1} clearcoatRoughness={0.06} depthWrite={false} />
    </mesh>
  );
}

/** Устье мочеточника: кратер на внутренней стенке и струйка мочи в просвет. */
function Orifice({ side, state }: { side: 1 | -1; state: ModelProps['state'] }) {
  const pos = orificePoint(side);
  const quat = useMemo(() => {
    const o = new Object3D();
    o.position.set(...pos);
    o.lookAt(0, -2.1, 0.6);
    return o.quaternion;
  }, [pos]);
  const jetPath = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(...pos),
        new Vector3(pos[0] * 0.62, pos[1] - 0.18, pos[2] * 0.55),
        new Vector3(pos[0] * 0.3, pos[1] - 0.42, pos[2] * 0.2),
      ]),
    [pos],
  );
  return (
    <>
      <group position={pos} quaternion={quat}>
        <mesh>
          <torusGeometry args={[0.115, 0.05, 12, 24]} />
          <BMaterial kind="ridge" tex={EMPTY_TEX} />
        </mesh>
        <mesh position={[0, 0, -0.015]}>
          <circleGeometry args={[0.1, 20]} />
          <BMaterial kind="lumenDark" tex={EMPTY_TEX} />
        </mesh>
      </group>
      <Flow path={jetPath} count={6} speed={0.5} color="#eec95e" size={0.05} state={state} pulse={(t) => ((t / 6 + (side === 1 ? 0 : 0.5)) % 1 < 0.3 ? 1 : 0.02)} />
    </>
  );
}

const EMPTY_TEX = {} as Record<string, Tex>;

export default function BladderModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const G = useMemo(() => buildBladder(), []);
  const tex = useMemo(
    () => ({
      surface: surfaceTexture(),
      detrusor: detrusorTexture(),
      submucosa: submucosaTexture(),
      mucosa: mucosaTexture(),
      serosa: serosaTexture(),
      adventitia: adventitiaTexture(),
      striated: striatedTexture(),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const defs of Object.values(G)) for (const d of defs) { d.g.dispose(); d.proxy?.dispose(); }
      Object.values(tex).forEach((t) => t.dispose());
    },
    [G, tex],
  );

  const explodeTarget = state.explode ?? 0;
  const ctrl = useRef<BladderControl>({
    cut: false,
    kind: 'side',
    explode: 0,
    isolate: true,
    selected: null,
    hidden: new Set(),
    labels: true,
    fillY: urineLevelY(fillFraction(0)),
    fill: fillFraction(0),
  });
  ctrl.current.cut = state.cutaway || explodeTarget > 0.02;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;

  const organ = useRef<Group>(null);
  const lastFill = useRef(-1);
  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    const fill = fillFraction(state.time.current);
    c.fill = fill;
    c.fillY = urineLevelY(fill);
    if (Math.abs(fill - lastFill.current) > 0.0006) {
      lastFill.current = fill;
      // наполняясь, пузырь чуть расширяется и приподнимает верхушку
      organ.current?.scale.set(0.97 + 0.05 * fill, 0.98 + 0.045 * fill, 0.97 + 0.05 * fill);
      invalidate();
    }
  });

  const ureterCurves = useMemo(
    () => [1, -1].map((side) => new CatmullRomCurve3(ureterPath(side as 1 | -1).map((p) => new Vector3(...p)))),
    [],
  );

  return (
    <BladderContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} />
      <group ref={organ}>
        {BLADDER_PART_IDS.map((id) => (
          <BladderPart key={id} id={id}>
            {G[id].map((d, i) => (
              <mesh key={i} geometry={d.g} userData={{ cap: d.cap, noPick: d.noPick, fillClip: d.fillClip, pickProxy: d.proxy }}>
                <BMaterial kind={d.m} tex={tex} />
              </mesh>
            ))}
            {id === 'urine' && <UrineSurface ctrl={ctrl} />}
            {id === 'ureteric-orifices' && (
              <>
                <Orifice side={1} state={state} />
                <Orifice side={-1} state={state} />
              </>
            )}
            {id === 'urethral-orifice' && (
              <group position={URETHRAL_ORIFICE} rotation={[1.15, 0, 0]}>
                <mesh>
                  <torusGeometry args={[0.29, 0.085, 12, 28]} />
                  <BMaterial kind="ridge" tex={tex} />
                </mesh>
                <mesh position={[0, 0, -0.02]}>
                  <circleGeometry args={[0.26, 24]} />
                  <BMaterial kind="lumenDark" tex={tex} />
                </mesh>
              </group>
            )}
            {id === 'ureters' && (
              <>
                {ureterCurves.map((path, i) => (
                  <Flow key={i} path={path} count={9} speed={0.1} color="#eec95e" size={0.055} state={state} pulse={(t) => 0.7 + 0.6 * Math.max(0, Math.sin(t * 2.2 + i * 2.4))} />
                ))}
                <Peristalsis curves={ureterCurves} state={state} tex={tex} />
              </>
            )}
            <PartLabel id={id} names={names} />
          </BladderPart>
        ))}
      </group>
    </BladderContext.Provider>
  );
}
