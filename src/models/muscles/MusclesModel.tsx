import { Suspense, createContext, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type Group } from 'three';
import type { CutKind, ModelProps } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { ModelPending } from '../../three/StageLoading';
import { useSelection } from '../../three/selection';
import SkeletonModel from '../skeleton/SkeletonModel';
import { CUT_RANGE, FLOOR, GROUP_OF, LAYER_SPREAD, SCALE } from './anatomy';
import { buildMuscles, type BuiltMuscle } from './build';
import { makeMuscleMaterial } from './materials';

/*
  Мышцы взрослого человека в полный рост: около восьмидесяти мышц и сухожилий, у каждой своя форма.
  Строится левая половина, правая — зеркальная копия. Скелет (тот же, что в разделе «Скелет») можно включить
  под мышцами. Режимы: «Скелет» — кости видны сквозь полупрозрачные мышцы; «Работа мышц» — мышцы-антагонисты
  по очереди напрягаются; «Глубокие мышцы» — поверхностный слой снят. Разнос раздвигает слои, разрез — плоскость
  в трёх положениях с ползунком.
*/

interface Control {
  cut: boolean;
  kind: CutKind;
  cutV: number;
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  skeleton: boolean;
  deep: boolean;
  work: boolean;
  time: { current: number };
}

const Ctl = createContext<MutableRefObject<Control> | null>(null);

const GHOST = 0.05;
const SKELETON_GHOST = 0.3;
const GLOW = new Color('#ffa77a');
const MAIN = {
  front: new Set(['sternocleidomastoid', 'pectoralis-major', 'biceps-brachii', 'rectus-abdominis', 'rectus-femoris', 'tibialis-anterior']),
  back: new Set(['trapezius', 'latissimus-dorsi', 'triceps-brachii', 'gluteus-maximus', 'biceps-femoris', 'gastrocnemius']),
};
const MIRRORED_LABELS = new Set(['biceps-brachii', 'tibialis-anterior', 'triceps-brachii', 'biceps-femoris']);

function MusclePart({ built, names, labels }: { built: BuiltMuscle; names: Record<string, string>; labels: boolean }) {
  const { def, geometry, label, spread } = built;
  const ref = useContext(Ctl)!;
  const { selected, hovered, isolate } = useSelection();
  const { handlers } = usePart(def.id);
  const invalidate = useThree((s) => s.invalidate);
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const mat = useMemo(() => makeMuscleMaterial(), []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const lastKey = useRef('');
  const lastFlex = useRef(0);
  const planes = useContext(PlanesCtx)!;

  const grp = GROUP_OF[def.id];
  const focus = selected === def.id || selected === grp;
  const active = focus || hovered === def.id || hovered === grp;
  const hot = hovered === def.id || hovered === grp;

  useEffect(() => () => mat.dispose(), [mat]);

  useEffect(() => {
    mat.userData.base = { opacity: 1, transparent: false, depthWrite: true };
    // выбор мышью не должен попадать в скрытые, призрачные части и в срезанную половину
    [left.current, right.current].forEach((g) => {
      g?.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const original = o.raycast.bind(o);
        o.raycast = (raycaster, intersects) => {
          if (!interactive.current) return;
          const start = intersects.length;
          original(raycaster, intersects);
          if (ref.current.cut) {
            for (let i = intersects.length - 1; i >= start; i--) {
              if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
            }
          }
        };
      });
    });
  }, [mat, planes, ref]);

  useEffect(() => {
    invalidate();
  });

  useFrame((_, dt) => {
    const c = ref.current;
    const L = left.current;
    const R = right.current;
    if (!L || !R) return;
    const hiddenByUser = c.hidden.has(def.id) || (c.deep && def.layer === 1 && !isolate) || (isolate && !focus);
    let target = 1;
    if (hiddenByUser) target = 0;
    else if (c.isolate && c.selected !== null && !focus) target = GHOST;
    else if (c.skeleton && !focus) target = SKELETON_GHOST;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    L.visible = R.visible = a > 0.012;
    interactive.current = !hiddenByUser && a > 0.012 && (!selected || focus || !c.isolate);

    // сокращение
    let flex = 0;
    if (c.work && def.phase !== undefined) {
      const s = Math.sin(c.time.current * 2.3);
      flex = Math.max(0, def.phase === 0 ? s : -s);
      flex = flex * flex * (3 - 2 * flex);
    }
    if (Math.abs(flex - lastFlex.current) > 0.001) {
      lastFlex.current = flex;
      mat.userData.flex.value = flex;
      invalidate();
    }

    // разнос слоёв
    const e = c.explode * LAYER_SPREAD[def.layer];
    const ox = spread[0] * e;
    const oz = spread[2] * e;
    L.position.set(ox, 0, oz);
    R.position.set(-ox, 0, oz);

    const cutOn = c.cut;
    const key = [cutOn ? c.kind : '-', cutOn ? Math.round(c.cutV * 40) : 0, active ? 1 : 0, hot ? 1 : 0, Math.round(a * 250), focus ? 1 : 0].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;
    const transparent = a < 0.995;
    if (mat.transparent !== transparent) {
      mat.transparent = transparent;
      mat.needsUpdate = true;
    }
    mat.opacity = a;
    mat.depthWrite = a > 0.9;
    mat.clippingPlanes = cutOn ? planes : null;
    if (active && a > 0.5) {
      mat.emissive.copy(GLOW);
      mat.emissiveIntensity = hot ? 0.2 : 0.12;
    } else {
      mat.emissive.set('#000000');
      mat.emissiveIntensity = 0;
    }
  });

  const c0 = ref.current;
  const offset = c0.explode * LAYER_SPREAD[def.layer];
  const x = label[0] + spread[0] * offset;
  const z = label[2] + spread[2] * offset;
  const cutAt = (side: number) => c0.cut && (c0.kind === 'side' ? z : c0.kind === 'fundus' ? label[1] : x * side) > c0.cutV;
  const hidden = c0.hidden.has(def.id) || (c0.deep && def.layer === 1 && !isolate) || (isolate && !focus);
  const showLabel = !hidden && (!selected || focus || !c0.isolate) && !!names[def.id] && (labels || active);
  const caption = showLabel && <Label labels={labels} partId={def.id} text={names[def.id]} at={label} />;
  const leftCut = cutAt(1);
  const rightCut = cutAt(-1);
  const rightLabel = !rightCut && (leftCut || (!active && MIRRORED_LABELS.has(def.id)));
  return (
    <>
      <group ref={left}>
        <mesh geometry={geometry} material={mat} {...handlers} />
        {!rightLabel && !leftCut && caption}
      </group>
      <group ref={right} scale={[-1, 1, 1]}>
        <mesh geometry={geometry} material={mat} {...handlers} />
        {rightLabel && caption}
      </group>
    </>
  );
}

const PlanesCtx = createContext<Plane[] | null>(null);

/** Скелет под мышцами: стоит в покое, не ловит клики, кости видны всегда. */
function SkeletonUnder({ state, visible }: { state: ModelProps['state']; visible: boolean }) {
  const holder = useRef<Group>(null);
  const frozen = useMemo(() => ({ current: 0 }), []);
  const invalidate = useThree((s) => s.invalidate);
  const done = useRef(false);
  useFrame(() => {
    const g = holder.current;
    if (!g) return;
    g.visible = visible;
    if (done.current) return;
    let n = 0;
    g.traverse((o) => {
      if (o instanceof Mesh) {
        o.raycast = () => undefined;
        n++;
      }
    });
    if (n > 5) {
      done.current = true;
      invalidate();
    }
  });
  const st = useMemo(() => ({ ...state, cutaway: false, labels: false, time: frozen }), [state, frozen]);
  return (
    <group ref={holder}>
      <Suspense fallback={visible ? <ModelPending /> : null}>
        <SkeletonModel state={st} names={{}} />
      </Suspense>
    </group>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function MusclesModel({ state, names = {} }: ModelProps) {
  const built = useMemo(buildMuscles, []);
  const { selected, isolate } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const root = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const everSkeleton = useRef(false);
  const [facing, setFacing] = useState<'front' | 'back' | null>('front');
  const lastFacing = useRef(facing);
  const skeleton = !!state.modes.skeleton;
  if (skeleton) everSkeleton.current = true;

  const kind = state.cutKind ?? 'side';
  const [lo, hi] = CUT_RANGE[kind];
  const ctl = useRef<Control>(null as never);
  ctl.current = {
    cut: state.cutaway,
    kind,
    cutV: lerp(lo, hi, state.cutAt ?? 0.5),
    explode: state.explode ?? 0,
    isolate: !!state.isolate,
    selected,
    hidden: state.hidden ?? new Set(),
    skeleton,
    deep: !!state.modes.peel,
    work: !!state.modes.work,
    time: state.time,
  };

  const tmpN = useMemo(() => new Vector3(), []);
  const direction = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldDirection(direction);
    const next = direction.z < -0.28 ? 'front' : direction.z > 0.28 ? 'back' : null;
    if (next !== lastFacing.current) {
      lastFacing.current = next;
      setFacing(next);
    }
    const g = root.current;
    const c = ctl.current;
    if (!g || !c.cut) return;
    g.updateWorldMatrix(true, false);
    // оставляем точки с n·p + const ≥ 0 в системе модели
    if (c.kind === 'side') tmpN.set(0, 0, -1);
    else if (c.kind === 'fundus') tmpN.set(0, -1, 0);
    else tmpN.set(-1, 0, 0);
    planes[0].set(tmpN, c.cutV).applyMatrix4(g.matrixWorld);
  });

  useEffect(() => {
    invalidate();
  });

  return (
    <PlanesCtx.Provider value={planes}>
      <Ctl.Provider value={ctl}>
        <group ref={root} position={[0, FLOOR, 0]} scale={SCALE}>
          {built.map((b) => (
            <MusclePart key={b.def.id} built={b} names={names} labels={state.labels && facing !== null && MAIN[facing].has(b.def.id)} />
          ))}
        </group>
        {everSkeleton.current && <SkeletonUnder state={state} visible={skeleton && !isolate} />}
      </Ctl.Provider>
    </PlanesCtx.Provider>
  );
}
