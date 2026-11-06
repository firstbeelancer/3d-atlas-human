import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, Quaternion, Object3D, Vector3, type Group, type InstancedMesh } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { hash, smallPath, SMALL_MARKS } from './anatomy';
import { buildIntestine, type MeshDef } from './build';
import { IntestineContext, IntestinePart, PartLabel, type IntestineControl } from './IntestinePart';
import { makeGutUniforms, makeMaterials } from './materials';
import {
  AXIAL_VIEW,
  CUT_VIEW,
  FOCUS,
  MACRO_PART_IDS,
  MICRO_FOCUS,
  MICRO_ONLY,
  MICRO_VIEW,
  OVERVIEW,
  SPREAD_VIEW,
  type Focus,
} from './parts';
import { buildTextures, type IntestineTextures } from './textures';
import WallScene from './WallScene';

/*
  Кишечник, вид спереди: +y — вверх, +z — к зрителю. Справа пациента (слева на экране) — слепая кишка с червеобразным
  отростком и восходящая; слева пациента — нисходящая и сигмовидная. Тонкая кишка лежит петлями в середине,
  стенка у неё бежит волнами перистальтики, по просвету плывут порции химуса (видны на разрезе).
  Три вида: целый, фронтальный разрез и срез сверху; «Разобрать» раздвигает отделы и слои, «Стенка под микроскопом»
  показывает срез стенки с ворсинками.
*/

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части или к виду на разрез; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode, micro }: { ctrl: RefObject<IntestineControl>; selected: string | null; explode: number; micro: boolean }) {
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
    if (micro) f = (selected && MICRO_FOCUS[selected]) || MICRO_VIEW;
    else if (selected && FOCUS[selected]) f = FOCUS[selected];
    else if (spread) f = SPREAD_VIEW;
    else if (cut) f = kind === 'fundus' ? AXIAL_VIEW : CUT_VIEW;
    else f = OVERVIEW;
    goal.current = {
      at: new Vector3(...f.at),
      offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist),
    };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cut, kind, spread, micro, invalidate]);

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

/** Порции химуса плывут по тонкой кишке; видны на разрезе и при разборе слоёв. */
const BOLUS_COUNT = 64;
function Boluses({ state }: { state: ModelProps['state'] }) {
  const ref = useRef<InstancedMesh>(null);
  const curve = useMemo(() => {
    const pts: Vector3[] = [];
    for (let i = SMALL_MARKS.bulb; i < smallPath.n; i += 8) pts.push(new Vector3(smallPath.P[i * 3], smallPath.P[i * 3 + 1], smallPath.P[i * 3 + 2]));
    return new CatmullRomCurve3(pts, false, 'centripetal');
  }, []);
  const dummy = useMemo(() => new Object3D(), []);
  const pos = useMemo(() => new Vector3(), []);
  const tan = useMemo(() => new Vector3(), []);
  const q = useMemo(() => new Quaternion(), []);
  const z = useMemo(() => new Vector3(0, 0, 1), []);
  const base = useMemo(() => Array.from({ length: BOLUS_COUNT }, (_, i) => (i + (hash(i + 3) - 0.5) * 0.7) / BOLUS_COUNT), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = state.time.current;
    for (let i = 0; i < BOLUS_COUNT; i++) {
      const u = (base[i] + t * 0.017) % 1;
      curve.getPointAt(u, pos);
      curve.getTangentAt(u, tan);
      q.setFromUnitVectors(z, tan);
      dummy.position.copy(pos);
      dummy.quaternion.copy(q);
      const r = 0.085 + 0.045 * hash(i);
      dummy.scale.set(r, r, r * (1.8 + hash(i + 40) * 1.6));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BOLUS_COUNT]} frustumCulled={false} visible={false} userData={{ inner: true, hideOnExplode: true }}>
      <sphereGeometry args={[1, 12, 9]} />
      <meshPhysicalMaterial color="#d3c25c" roughness={0.3} clearcoat={0.7} clearcoatRoughness={0.2} emissive="#8a7a1c" emissiveIntensity={0.18} />
    </instancedMesh>
  );
}

/** Меши одной части. Материалы у каждой части свои, чтобы призрачный режим и подсветка не задевали соседей. */
function PartMeshes({ defs, tex, uni }: { defs: MeshDef[]; tex: IntestineTextures; uni: ReturnType<typeof makeGutUniforms> }) {
  const mats = useMemo(() => makeMaterials(tex, uni), [tex, uni]);
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );
  return (
    <>
      {defs.map((d, i) => (
        <mesh
          key={i}
          geometry={d.g}
          material={mats[d.m]}
          visible={!d.inner}
          userData={{ seg: d.seg, inner: d.inner, noPick: d.noPick, pickProxy: d.proxy }}
        />
      ))}
    </>
  );
}

export default function IntestineModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const G = useMemo(buildIntestine, []);
  const tex = useMemo(buildTextures, []);
  const uni = useMemo(makeGutUniforms, []);
  useEffect(
    () => () => {
      for (const defs of Object.values(G)) for (const d of defs) { d.g.dispose(); d.proxy?.dispose(); }
      Object.values(tex).forEach((t) => t.dispose());
    },
    [G, tex],
  );

  // вид «Стенка под микроскопом»: включается кнопкой или выбором части, которая видна только там
  const micro = !!state.modes.wall || (selected !== null && MICRO_ONLY.has(selected));
  const explodeTarget = state.explode ?? 0;

  const ctrl = useRef<IntestineControl>({
    cut: false,
    kind: 'side',
    explode: 0,
    isolate: true,
    selected: null,
    hidden: new Set(),
    labels: true,
  });
  ctrl.current.cut = state.cutaway;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;

  const root = useRef<Group>(null);
  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    uni.uTime.value = state.time.current;
  });

  return (
    <IntestineContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} micro={micro} />
      {micro ? (
        <WallScene state={state} names={names} tex={tex} />
      ) : (
        <group ref={root}>
          {MACRO_PART_IDS.map((id) => (
            <IntestinePart key={id} id={id}>
              <PartMeshes defs={G[id]} tex={tex} uni={uni} />
              {id === 'chyme' && <Boluses state={state} />}
              <PartLabel id={id} names={names} hide={explodeTarget > 0.02} />
            </IntestinePart>
          ))}
        </group>
      )}
    </IntestineContext.Provider>
  );
}
