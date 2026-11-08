import { Suspense, use, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, Mesh, Plane, Vector3, type Group, type MeshPhysicalMaterial } from 'three';
import type { CutKind, ModelProps } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { t } from '../../i18n';
import { ALSO, ALVEOLUS_PARTS, CUT_Y, CUT_Z, FOCUS, LABEL_AT, OUTER_KINDS, spreadOf, type Vec } from './anatomy';
import { loadLungGeometry, type LungEntity } from './loader';
import { makeLungMaterial } from './materials';
import { AlveolusScene } from './AlveolusScene';
import { CARINA } from './tree';

/** Состояние, которое части читают каждый кадр, не перерисовывая React. */
interface Ctrl {
  cut: boolean;
  kind: CutKind;
  explode: number;
  isolate: boolean;
  inside: boolean;
  selected: string | null;
  hovered: string | null;
  hidden: ReadonlySet<string>;
}

const GHOST = 0.05;
const INSIDE_ALPHA = 0.13;
const GLOW = new Color('#ffa77a');
const RIGHT_LOBES = new Set(['ru', 'rm', 'rl']);

function isFocus(sel: string | null, e: LungEntity): boolean {
  if (sel === null) return false;
  if (sel === e.part) return true;
  if (ALSO[sel]?.includes(e.part)) {
    if (sel === 'right-lung') return RIGHT_LOBES.has(e.where);
    if (sel === 'left-lung') return !RIGHT_LOBES.has(e.where) || e.where === 'R';
    return true;
  }
  if (sel === 'right-lung' && e.part === 'fissures') return true;
  return false;
}

interface Base {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/** Одна сетка: разнос, подсветка, призрачный режим, скрытие, разрез и фильтр выбора мышью. */
function Piece({ e, ctrl }: { e: LungEntity; ctrl: MutableRefObject<Ctrl> }) {
  const { handlers } = usePart(e.part);
  const invalidate = useThree((s) => s.invalidate);
  const mat = useMemo<MeshPhysicalMaterial>(() => makeLungMaterial(e.kind), [e.kind]);
  const base = useMemo<Base>(() => ({ opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite }), [mat]);
  const mesh = useRef<Mesh>(null);
  const sidePlane = useMemo(() => new Plane(new Vector3(0, 0, -1), CUT_Z), []);
  const axialPlane = useMemo(() => new Plane(new Vector3(0, -1, 0), CUT_Y), []);
  const planes = useMemo(() => [sidePlane], [sidePlane]);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const lastKey = useRef('');
  const spread = useMemo<Vec>(() => spreadOf(e.part, e.where), [e.part, e.where]);
  const emissiveOff = useMemo(() => new Color('#000000'), []);

  useEffect(() => () => mat.dispose(), [mat]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const original = m.raycast.bind(m);
    m.raycast = (raycaster, intersects) => {
      if (!interactive.current || !m.visible) return;
      const start = intersects.length;
      original(raycaster, intersects);
      const c = ctrl.current;
      if (c.cut && c.explode <= 0.02) {
        const p = c.kind === 'side' ? sidePlane : axialPlane;
        for (let i = intersects.length - 1; i >= start; i--) if (p.distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
      }
    };
  }, [ctrl, sidePlane, axialPlane]);

  useFrame((_, dt) => {
    const m = mesh.current;
    const c = ctrl.current;
    if (!m) return;
    m.position.set(spread[0] * c.explode, spread[1] * c.explode, spread[2] * c.explode);

    const hiddenByUser = c.hidden.has(e.part);
    const focus = isFocus(c.selected, e);
    let target = 1;
    if (hiddenByUser) target = 0;
    else if (c.isolate && c.selected !== null && !focus) target = GHOST;
    else if (c.inside && OUTER_KINDS.has(e.kind) && !focus) target = INSIDE_ALPHA;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;

    const sel = c.selected;
    const innerOn = c.cut || c.explode > 0.02 || c.inside || sel !== null;
    let visible = a > 0.012;
    if (e.kind === 'cavity') visible = visible && (sel === 'pleural-cavity' || c.explode > 0.02 || c.cut);
    if (e.kind === 'acinus') visible = visible && (c.inside || sel === 'bronchioles' || sel === 'alveoli' || c.explode > 0.02 || c.cut);
    m.visible = visible;
    interactive.current =
      !hiddenByUser && a > 0.5 &&
      !(e.kind === 'pleura' && sel !== 'pleura') && !(e.kind === 'cavity' && sel !== 'pleural-cavity') && !(e.kind === 'hilum' && sel !== 'hilum') &&
      !(c.inside && OUTER_KINDS.has(e.kind) && !focus);

    const cutOn = c.cut && c.explode <= 0.02;
    const active = c.selected === e.part || c.hovered === e.part || (!!c.selected && !!ALSO[c.selected]?.includes(e.part) && focus);
    const hot = c.hovered === e.part;
    const key = [cutOn ? c.kind : '-', active ? 1 : 0, hot ? 1 : 0, Math.round(a * 250), innerOn ? 1 : 0].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (cutOn) planes[0] = c.kind === 'side' ? sidePlane : axialPlane;
    const transparent = base.transparent || a < 0.995;
    if (mat.transparent !== transparent) {
      mat.transparent = transparent;
      mat.needsUpdate = true;
    }
    const solid = focus && c.isolate && base.transparent ? Math.min(0.9, base.opacity * 2.6 + 0.06) : base.opacity;
    mat.opacity = solid * a;
    mat.depthWrite = base.depthWrite && a > 0.9;
    mat.clippingPlanes = cutOn ? planes : null;
    if (active && a > 0.5) {
      mat.emissive.copy(GLOW);
      mat.emissiveIntensity = hot ? 0.28 : 0.15;
    } else {
      mat.emissive.copy(emissiveOff);
      mat.emissiveIntensity = 0;
    }
  });

  return <mesh ref={mesh} geometry={e.geometry} material={mat} dispose={null} {...handlers} />;
}

interface Rig {
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Камера плавно летит к выбранной части или к виду на разрез; пользователь может перехватить управление. */
function CameraRig({ ctrl }: { ctrl: MutableRefObject<Ctrl> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Rig | null;
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ at: Vector3; offset: Vector3 } | null>(null);
  const first = useRef(true);
  const { selected } = useSelection();
  const c = ctrl.current;
  const spread = c.explode > 0.02;

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
    let at: Vec = [0, 0.55, 0];
    let dir: Vec = [0.04, 0.11, 1];
    let dist = 11.6;
    const f = selected ? FOCUS[selected] : undefined;
    if (f) {
      at = f.at;
      dist = f.dist;
    } else if (spread) {
      at = [0, 0.3, 0];
      dir = [0.1, 0.12, 1];
      dist = 17;
    } else if (c.cut) {
      if (c.kind === 'side') {
        at = [0, 0.4, -0.2];
        dir = [0.25, 0.1, 1];
        dist = 10.5;
      } else {
        at = [0, 0.55, -0.1];
        dir = [0.02, 1, 0.2];
        dist = 9.5;
      }
    }
    goal.current = { at: new Vector3(...at), offset: new Vector3(...dir).normalize().multiplyScalar(dist) };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, c.cut, c.kind, spread, invalidate]);

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

function Building() {
  return (
    <Html center>
      <div style={{ fontSize: 13, color: '#556', whiteSpace: 'nowrap' }}>{t('stage.building')}</div>
    </Html>
  );
}

function Organ({ state, names = {} }: ModelProps) {
  const entities = use(loadLungGeometry());
  const { selected, hovered } = useSelection();
  const invalidate = useThree((s) => s.invalidate);

  const ctrl = useRef<Ctrl>({ cut: false, kind: 'side', explode: 0, isolate: true, inside: false, selected: null, hovered: null, hidden: new Set() });
  ctrl.current.cut = state.cutaway;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.inside = !!state.modes.inside;
  ctrl.current.selected = selected;
  ctrl.current.hovered = hovered;
  ctrl.current.hidden = state.hidden ?? new Set();
  const explodeTarget = state.explode ?? 0;

  useEffect(
    () => () => {
      for (const e of entities) e.geometry.dispose();
    },
    [entities],
  );

  const breath = useRef<Group>(null);
  const b = useRef(0);
  useFrame((st, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    // дыхание: вдох короче выдоха; на разрезе и при разносе лёгкие замирают, чтобы срез не «плыл»
    const frozen = c.cut || c.explode > 0.02;
    const rate = 14 / 60;
    const ph = (state.time.current * rate) % 1;
    const wave = ph < 0.42 ? 0.5 - 0.5 * Math.cos((ph / 0.42) * Math.PI) : 0.5 + 0.5 * Math.cos(((ph - 0.42) / 0.58) * Math.PI);
    const goal = frozen ? 0 : wave;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    if (Math.abs(goal - b.current) > 0.0005) {
      b.current += (goal - b.current) * k;
      invalidate();
    }
    void st;
    const g = breath.current;
    if (g) {
      const s: Vec = [1 + b.current * 0.035, 1 + b.current * 0.05, 1 + b.current * 0.04];
      g.scale.set(...s);
      // масштаб вокруг киля трахеи
      g.position.set(CARINA[0] * (1 - s[0]), CARINA[1] * (1 - s[1]), CARINA[2] * (1 - s[2]));
    }
  });

  const hidden = state.hidden ?? new Set<string>();
  const showLabels = explodeTarget <= 0.02;

  return (
    <>
      <CameraRig ctrl={ctrl} />
      <group ref={breath}>
        {entities.map((e) => (
          <Piece key={e.key} e={e} ctrl={ctrl} />
        ))}
        {showLabels &&
          Object.entries(LABEL_AT).map(([id, cfg]) => {
            if (hidden.has(id)) return null;
            if (state.isolate !== false && selected !== null && selected !== id && !cfg.inner) return null;
            return <Label key={id} at={cfg.at} partId={id} text={names[id]} labels={state.labels && (!!cfg.main || selected === id)} inner={cfg.inner} />;
          })}
      </group>
    </>
  );
}

export default function LungsModel(props: ModelProps) {
  const { selected } = useSelection();
  const micro = !!props.state.modes.alveolus || (selected !== null && ALVEOLUS_PARTS.has(selected));
  return <Suspense fallback={<Building />}>{micro ? <AlveolusScene state={props.state} names={props.names} /> : <Organ {...props} />}</Suspense>;
}

