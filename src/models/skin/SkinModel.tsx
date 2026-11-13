import { use, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Material } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import { curveOf, type V3 } from './geometry';
import { buildSkin } from './build';
import { buildSkinTextures, makeMaterial, type SkinTextures } from './materials';
import { CUT_VIEWS, FOCUS, OVERVIEW, SKIN_PART_IDS, SPREAD_VIEW, type Focus } from './parts';
import { SkinContext, SkinPart, PartLabel, type SkinControl } from './SkinPart';
import { sweatPores } from './anatomy';
import type { MeshDef } from './types';
import type { MatKey } from './types';

/*
  Кожа: блок кожного покрова со всеми структурами. По умолчанию показан фронтальный срез,
  чтобы были видны слои, железы, сосуды и рецепторы. Режимы: «Просвечивание», «Мурашки»,
  «Потоотделение» и «Путь сигнала». Анимация: кровь по сплетениям, лимфа, сало и пот, нервные импульсы.
*/

let cache: Promise<Record<string, MeshDef[]>> | null = null;

/** Геометрия строится один раз за сессию, с паузой, чтобы успел показаться индикатор. */
function loadSkin(): Promise<Record<string, MeshDef[]>> {
  if (!cache) {
    cache = new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(buildSkin());
        } catch (e) {
          reject(e);
        }
      }, 40);
    });
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части, к виду на срез или к общему виду; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode }: { ctrl: RefObject<SkinControl>; selected: string | null; explode: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Rig | null;
  const invalidate = useThree((s) => s.invalidate);
  const { width, height } = useThree((s) => s.size);
  const widthFit = Math.max(1, (0.76 * height) / Math.max(1, width));
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
      if (widthFit <= 1.02) return;
    }
    let f: Focus;
    if (selected && FOCUS[selected]) f = FOCUS[selected];
    else if (spread) f = SPREAD_VIEW;
    else if (cut) f = CUT_VIEWS[kind];
    else f = OVERVIEW;
    const distance = selected && FOCUS[selected] ? f.dist : Math.min(120, f.dist * widthFit);
    goal.current = { at: new Vector3(...f.at), offset: new Vector3(...f.dir).normalize().multiplyScalar(distance) };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cut, kind, spread, widthFit, invalidate]);

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

/** Меши одной части. Материалы у каждой части свои — подсветка и призрачный режим не задевают соседей. */
function PartMeshes({ defs, tex }: { defs: MeshDef[]; tex: SkinTextures }) {
  const mats = useMemo(() => {
    const map = new Map<MatKey, Material>();
    for (const def of defs) if (!map.has(def.m)) map.set(def.m, makeMaterial(def.m, tex));
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
      {defs.map((def, i) => (
        <mesh key={i} geometry={def.g} material={mats.get(def.m)} userData={{ noPick: def.noPick }} />
      ))}
    </>
  );
}

const pulse = (t: number) => 1 + 0.5 * Math.sin(t * 7);
const red = '#ff6b5a';
const blue = '#8c94ea';
const path = (pts: V3[]) => curveOf(pts);

const FLOW = {
  deepArt: path([[-9.4, -6.7, -0.5], [0, -6.72, -0.5], [9.4, -6.7, -0.5]]),
  deepVein: path([[9.4, -6.95, 1.4], [0, -6.97, 1.4], [-9.4, -6.95, 1.4]]),
  dermArt: path([[-9.4, -3.8, 2], [0, -3.82, 2], [9.4, -3.8, 2]]),
  sub: path([[-9.4, -2.15, 0.5], [0, -2.17, 0.5], [9.4, -2.15, 0.5]]),
  loop: path([[-2.6, -2.15, 0], [-2.5, -1.35, 0], [-2.4, -2.15, 0]]),
  papilla: path([[1.64, -8.0, 0], [1.7, -7.4, 0], [1.78, -7.15, 0], [1.86, -7.4, 0], [1.92, -8.0, 0]]),
  lymph: path([[-9.2, -7.4, -4.6], [0, -7.47, -4.4], [9.2, -7.4, -4.4]]),
  sebum: path([[1.3, -1.9, 0], [2.1, -1.6, 0.04], [2.6, -1.3, 0.02], [2.95, -1.12, 0]]),
  sweat: path([[-5.2, -6.8, 0.5], [-5.1, -5.4, 0.6], [-5.3, -3.6, 0.45], [-5.2, -2.5, 0.5], [-5.2, -1.0, 0.47], [-5.2, 0.0, 0.45]]),
  signalMei: path([[-7.6, -1.0, 0.9], [-7.6, -2.3, 0.9], [-7, -5.5, -1.0], [-2, -6.2, -1.6]]),
  signalPac: path([[-1.6, -8.8, 2.0], [-1.6, -6.0, 2.0], [2, -5.6, -1.0], [6, -5.4, -0.6]]),
  signalFree: path([[-7.0, -0.9, -0.4], [-7, -2.3, -0.3], [-7, -5.5, -1.0], [-2, -6.2, -1.6]]),
};

/** Капли пота на порах: растут и срываются, пока включено «Потоотделение». */
function SweatDrops({ state }: { state: ModelProps['state'] }) {
  const refs = useRef<(import('three').Mesh | null)[]>([]);
  useFrame(() => {
    const t = state.time.current;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const ph = (t * 0.5 + i * 0.5) % 1;
      const s = 0.04 + 0.12 * ph;
      m.scale.setScalar(s);
      const mat = m.material as import('three').MeshPhysicalMaterial;
      mat.opacity = 0.65 * (1 - ph * 0.6);
    });
  });
  return (
    <>
      {sweatPores.map((p, i) => (
        <mesh key={i} position={[p[0], 0.06, p[2]]} ref={(el) => { refs.current[i] = el; }} raycast={() => null}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshPhysicalMaterial color="#cfe8f7" transparent opacity={0.6} roughness={0.05} clearcoat={1} clearcoatRoughness={0.04} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

/** Потоки: кровь, лимфа, сало, пот и нервные сигналы. */
function Streams({ id, state, selected }: { id: string; state: ModelProps['state']; selected: string | null }) {
  const sweatOn = !!state.modes.sweat || selected === 'eccrine-duct' || selected === 'eccrine-gland' || selected === 'sweat-pore';
  const senseOn = !!state.modes.sense;
  switch (id) {
    case 'deep-plexus':
      return (
        <>
          <Flow path={FLOW.deepArt} count={16} speed={0.05} color={red} size={0.16} state={state} pulse={pulse} />
          <Flow path={FLOW.deepVein} count={12} speed={0.04} color={blue} size={0.18} state={state} />
        </>
      );
    case 'dermal-plexus':
      return <Flow path={FLOW.dermArt} count={12} speed={0.05} color={red} size={0.1} state={state} pulse={pulse} />;
    case 'subpapillary-plexus':
      return <Flow path={FLOW.sub} count={12} speed={0.05} color={red} size={0.07} state={state} pulse={pulse} />;
    case 'capillary-loops':
      return <Flow path={FLOW.loop} count={4} speed={0.1} color={red} size={0.05} state={state} pulse={pulse} />;
    case 'hair-papilla':
      return <Flow path={FLOW.papilla} count={4} speed={0.12} color={red} size={0.06} state={state} pulse={pulse} />;
    case 'lymph-capillaries':
      return <Flow path={FLOW.lymph} count={10} speed={0.025} color="#bfe3c0" size={0.1} state={state} />;
    case 'sebaceous-gland':
      return <Flow path={FLOW.sebum} count={4} speed={0.05} color="#ffe27a" size={0.08} state={state} />;
    case 'eccrine-duct':
      return sweatOn ? <Flow path={FLOW.sweat} count={8} speed={0.06} color="#cfe8f7" size={0.07} state={state} /> : null;
    case 'sweat-pore':
      return sweatOn ? <SweatDrops state={state} /> : null;
    case 'meissner':
      return senseOn ? <Flow path={FLOW.signalMei} count={5} speed={0.18} color="#ffd75e" size={0.09} state={state} /> : null;
    case 'pacinian':
      return senseOn ? <Flow path={FLOW.signalPac} count={5} speed={0.18} color="#ffd75e" size={0.1} state={state} /> : null;
    case 'free-endings':
      return senseOn ? <Flow path={FLOW.signalFree} count={5} speed={0.18} color="#ffd75e" size={0.07} state={state} /> : null;
    default:
      return null;
  }
}

export default function SkinModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const data = use(loadSkin());
  const tex = useMemo(buildSkinTextures, []);
  useEffect(() => () => tex.dispose(), [tex]);

  const explodeTarget = state.explode ?? 0;
  const gooseOn = !!state.modes.goose;
  const ctrl = useRef<SkinControl>({ cut: false, kind: 'side', cutT: 0.5, explode: 0, isolate: true, selected: null, hidden: new Set(), labels: true, xray: false, goose: 0 });
  const c = ctrl.current;
  c.cut = state.cutaway;
  c.kind = state.cutKind ?? 'side';
  c.cutT = state.cutAt ?? 0.5;
  c.isolate = state.isolate ?? true;
  c.selected = selected;
  c.hidden = state.hidden ?? new Set();
  c.labels = state.labels;
  c.xray = !!state.modes.xray;

  useFrame((_, dt) => {
    const k = ctrl.current;
    const diff = explodeTarget - k.explode;
    if (Math.abs(diff) > 0.001) {
      k.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else k.explode = explodeTarget;
    // «мурашки»: мышца напрягается и расслабляется по циклу около 7 секунд
    const wave = gooseOn ? 0.5 - 0.5 * Math.cos(state.time.current * 0.9) : 0;
    const gTarget = gooseOn ? Math.min(1, wave * 1.5) : 0;
    const gd = gTarget - k.goose;
    if (Math.abs(gd) > 0.001) {
      k.goose += gd * Math.min(1, dt * 6);
      invalidate();
    } else k.goose = gTarget;
  });

  const hideLabels = explodeTarget > 0.02;
  return (
    <SkinContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} />
      <group>
        {SKIN_PART_IDS.map((id) => {
          const defs = data[id];
          if (!defs) return null;
          return (
            <SkinPart key={id} id={id}>
              <PartMeshes defs={defs} tex={tex} />
              <Streams id={id} state={state} selected={selected} />
              <PartLabel id={id} names={names} hide={hideLabels} />
            </SkinPart>
          );
        })}
      </group>
    </SkinContext.Provider>
  );
}
