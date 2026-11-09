import { Suspense, use, useEffect, useMemo, useRef, useSyncExternalStore, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, Matrix4, Quaternion, Vector3, type Group, type Material } from 'three';
import { ModelPending } from '../../three/StageLoading';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import {
  COCH_TH, CUT_DEFAULT_T, CUT_VIEWS, EAR_PART_IDS, FOCUS, GROUP_OF, INNER_ONLY_KEEP, INNER_VIEW, OSSICLE_AXIS, OVERVIEW, SCALE, SOUND_PATH, SPREAD_VIEW, TM_N, VEST_C, cochAt, cochTube,
  cutValue, T, type Focus, type V3,
} from './anatomy';
import { buildEar, type MatKey, type MeshDef } from './build';
import { EarContext, EarPart, PartLabel, type EarControl } from './EarPart';
import { STAPES } from './field';
import { getProgress, loadEar, subscribeProgress, type EarData } from './loader';
import { VIB, WAVE, buildTextures, makeMaterial, type EarTextures } from './materials';

/*
  Правое ухо, вид с наружной стороны: +x — наружу, +y — вверх, лицо — в сторону −z. Размеры в миллиметрах, общий масштаб — SCALE.
  Раковина, хрящ, височная кость, воздушные пространства и косточки — поля расстояний в фоновых потоках (jobs.ts);
  улитка, лабиринт, нервы, сосуды, связки — аналитические развёртки (build.ts).
  Анимация: перепонка и косточки дрожат от звука; в режиме «Путь звука» звук идёт по проходу, цепь косточек качается,
  по улитке бежит волна, жидкость улитки движется от овального окна к вершине и обратно к круглому.
*/

function Loading() {
  const { done, total } = useSyncExternalStore(subscribeProgress, getProgress);
  return <ModelPending progress={total ? done / total : undefined} />;
}

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части, виду на разрез или к лабиринту; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode, inner }: { ctrl: RefObject<EarControl>; selected: string | null; explode: number; inner: boolean }) {
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
    else if (inner) f = INNER_VIEW;
    else if (spread) f = SPREAD_VIEW;
    else if (cut) f = CUT_VIEWS[kind];
    else f = OVERVIEW;
    goal.current = { at: new Vector3(...f.at).multiplyScalar(SCALE), offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist * SCALE) };
    invalidate();
  }, [selected, cut, kind, spread, inner, invalidate]);

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

/* ------------------------------------------------------------------ части */

function sdfDefs(id: string, d: EarData): MeshDef[] {
  const one = (g: BufferGeometry | undefined, m: MatKey): MeshDef[] => (g ? [{ g, m }] : []);
  switch (GROUP_OF[id]) {
    case 'g-outer':
      return id === 'auricular-cartilage' ? one(d.cartilage, 'cartilage') : one(d.skin[id], 'skin');
    case 'g-meatus':
      return one(d.skin[id], 'skin');
    case 'g-middle':
      return one(d.air[id], 'mucosa');
    case 'g-bone':
      return one(d.bone[id], 'bone');
    case 'g-ossicles':
      return id === 'malleus' ? one(d.malleus, 'ossicle') : id === 'incus' ? one(d.incus, 'ossicle') : id === 'stapes' ? one(d.stapes, 'ossicle') : [];
    default:
      return [];
  }
}
type BufferGeometry = import('three').BufferGeometry;

function PartMeshes({ defs, tex }: { defs: MeshDef[]; tex: EarTextures }) {
  const mats = useMemo(() => {
    const map = new Map<MatKey, Material>();
    for (const d of defs) if (!map.has(d.m)) map.set(d.m, makeMaterial(d.m, tex));
    return map;
  }, [defs, tex]);
  useEffect(
    () => () => {
      mats.forEach((m) => m.dispose());
    },
    [mats],
  );
  return (
    <>
      {defs.map((d, i) => (
        <mesh key={i} geometry={d.g} material={mats.get(d.m)} userData={{ noPick: d.noPick }} />
      ))}
    </>
  );
}

const AX0 = new Vector3(...OSSICLE_AXIS[0]);
const AX1 = new Vector3(...OSSICLE_AXIS[1]);
const AX = AX1.clone().sub(AX0).normalize();
/** Знак поворота, при котором пупок смещается наружу. */
const ROCK_SIGN = (() => {
  const umbo = new Vector3(...T(0, -0.4, -2.1)).sub(AX0);
  return new Vector3().crossVectors(AX, umbo).dot(new Vector3(...TM_N)) >= 0 ? 1 : -1;
})();
const STAPES_S = new Vector3(...STAPES.s);

/** Группа, качающаяся вместе с цепью косточек (молоточек, наковальня) или поршнем (стремя). */
function Rock({ amp, time, mode, children }: { amp: MutableRefObject<number>; time: { current: number }; mode: 'chain' | 'piston'; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const last = useRef(9);
  const m = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const ph = Math.sin(time.current * 9);
    const a = amp.current;
    const key = Math.round(a * ph * 1000);
    if (key === last.current) return;
    last.current = key;
    if (mode === 'chain') {
      q.setFromAxisAngle(AX, ROCK_SIGN * 0.05 * a * ph);
      const p = AX0.clone().sub(AX0.clone().applyQuaternion(q));
      m.compose(p, q, new Vector3(1, 1, 1));
    } else {
      m.makeTranslation(...STAPES_S.clone().multiplyScalar(0.075 * a * Math.sin(time.current * 9 - 0.25)).toArray());
    }
    g.matrixAutoUpdate = false;
    g.matrix.copy(m);
    g.matrixWorldNeedsUpdate = true;
    invalidate();
  });
  return <group ref={ref}>{children}</group>;
}

const toCurve = (pts: V3[]) => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');

/** Потоки: звуковая волна в проходе и перилимфа в улитке (вверх по лестнице преддверия, вниз по барабанной). */
function Streams({ state }: { state: ModelProps['state'] }) {
  const paths = useMemo(() => {
    const up: V3[] = [];
    const down: V3[] = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const th = (COCH_TH * i) / n;
      const r = cochTube(th);
      up.push(cochAt(th, 0.1 * r, 0.45 * r));
    }
    for (let i = n; i >= 0; i--) {
      const th = (COCH_TH * i) / n;
      const r = cochTube(th);
      down.push(cochAt(th, 0.1 * r, -0.45 * r));
    }
    const win: V3[] = [VEST_C];
    return { air: toCurve(SOUND_PATH), fluid: toCurve([...win, ...up, ...down]) };
  }, []);
  const pulse = (tm: number) => 0.4 + 1.6 * Math.abs(Math.sin(tm * 4.5));
  return (
    <>
      <Flow path={paths.air} count={26} speed={0.16} color="#8fd0ff" size={0.55} state={state} pulse={pulse} />
      <Flow path={paths.fluid} count={34} speed={0.05} color="#9cc7ff" size={0.17} state={state} pulse={pulse} />
    </>
  );
}

function Scene({ state, names = {} }: ModelProps) {
  const data = use(loadEar());
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const analytic = useMemo(buildEar, []);
  const tex = useMemo(buildTextures, []);
  useEffect(
    () => () => {
      for (const defs of Object.values(analytic)) for (const d of defs) d.g.dispose();
      tex.dispose();
    },
    [analytic, tex],
  );
  const partDefs = useMemo(() => {
    const out: Record<string, MeshDef[]> = {};
    for (const id of EAR_PART_IDS) out[id] = analytic[id] ?? sdfDefs(id, data);
    return out;
  }, [analytic, data]);

  const explodeTarget = state.explode ?? 0;
  const inner = !!state.modes.inner;
  const sound = !!state.modes.sound;
  const modeHidden = useMemo<ReadonlySet<string>>(() => (inner ? new Set(EAR_PART_IDS.filter((id) => !INNER_ONLY_KEEP.has(id))) : new Set()), [inner]);
  const ctrl = useRef<EarControl>({ cut: false, kind: 'side', cutV: 0, explode: 0, isolate: true, selected: null, hidden: new Set(), modeHidden: new Set(), labels: true });
  const kind = state.cutKind ?? 'side';
  ctrl.current.cut = state.cutaway;
  ctrl.current.kind = kind;
  ctrl.current.cutV = cutValue(kind, state.cutAt ?? CUT_DEFAULT_T[kind]);
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.modeHidden = modeHidden;
  ctrl.current.labels = state.labels;

  const amp = useRef(0.2);
  const lastTm = useRef(9);
  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    // громкость: слабое дрожание всегда, сильное — в режиме «Путь звука»
    const goal = sound ? 1 : 0.2;
    amp.current += (goal - amp.current) * Math.min(1, dt * 4);
    const tm = state.time.current;
    const v = amp.current * 0.26 * Math.sin(tm * 9);
    if (Math.abs(v - lastTm.current) > 0.002) {
      lastTm.current = v;
      VIB.uVib.value = v;
      WAVE.uT.value = tm;
      WAVE.uP.value = 0.5 + 0.42 * Math.sin(tm * 0.33);
      WAVE.uA.value = sound ? 1 : 0.12 * amp.current;
      invalidate();
    }
  });

  const hideLabels = explodeTarget > 0.02;
  const wrap = (id: string, body: ReactNode): ReactNode => {
    if (id === 'malleus' || id === 'incus' || id === 'incudomalleolar-joint' || id === 'ossicular-ligaments')
      return id === 'ossicular-ligaments' ? body : <Rock amp={amp} time={state.time} mode="chain">{body}</Rock>;
    if (id === 'stapes') return <Rock amp={amp} time={state.time} mode="piston">{body}</Rock>;
    return body;
  };

  return (
    <EarContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} inner={inner} />
      <group scale={SCALE}>
        {EAR_PART_IDS.map((id) => (
          <EarPart key={id} id={id}>
            {wrap(id, <PartMeshes defs={partDefs[id]} tex={tex} />)}
            <PartLabel id={id} names={names} hide={hideLabels} />
          </EarPart>
        ))}
        {sound && <Streams state={state} />}
      </group>
    </EarContext.Provider>
  );
}

export default function EarModel(props: ModelProps) {
  return (
    <Suspense fallback={<Loading />}>
      <Scene {...props} />
    </Suspense>
  );
}


