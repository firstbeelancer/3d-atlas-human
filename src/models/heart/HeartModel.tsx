import { Suspense, use, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, Color, Mesh, Plane, Vector3, type MeshPhysicalMaterial } from 'three';
import type { CutKind, ModelProps } from '../../three/types';
import { heartbeat } from '../../three/geometry';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { Flow } from '../../three/Flow';
import { useSelection } from '../../three/selection';
import { ModelPending } from '../../three/StageLoading';
import { ALSO, FLOW_BLUE, FLOW_RED, FOCUS, INTERIOR, LABEL_AT, spreadOf, type Vec } from './anatomy';
import { cutPlane, type CutKey } from './field';
import { loadHeart, loadHeartCut, type HeartPiece } from './loader';
import { BEAT, makeHeartMaterial } from './materials';

/*
  Сердце: стенка, сосуды, клапаны с хордами, коронарные сосуды, жир и проводящая система.
  Разрез — отдельные сетки с «крышкой» среза, они строятся в фоне по требованию; пока разрез не готов,
  целая стенка просто обрезается плоскостью.
*/

interface Ctrl {
  cut: boolean;
  kind: CutKey;
  explode: number;
  isolate: boolean;
  inside: boolean;
  selected: string | null;
  hovered: string | null;
  hidden: ReadonlySet<string>;
  ready: Record<CutKey, boolean>;
  /** Раскрытие клапанов 0..1: предсердно-желудочковых и полулунных. */
  av: number;
  sl: number;
}

const GHOST = 0.05;
const INSIDE_ALPHA = 0.13;
const GLOW = new Color('#ffa77a');

const PLANES: Record<CutKey, Plane> = (['side', 'fundus'] as CutKey[]).reduce(
  (acc, k) => {
    const p = cutPlane(k);
    acc[k] = new Plane(new Vector3(-p.n[0], -p.n[1], -p.n[2]), p.c);
    return acc;
  },
  {} as Record<CutKey, Plane>,
);

function isFocus(sel: string | null, part: string): boolean {
  if (sel === null) return false;
  return sel === part || !!ALSO[sel]?.includes(part);
}

const GHOSTED_KINDS = new Set(['wall', 'fat']);

/** Одна сетка: разнос, подсветка, призрачный режим, скрытие, разрез и створки. */
function Piece({ e, ctrl }: { e: HeartPiece; ctrl: MutableRefObject<Ctrl> }) {
  const { handlers } = usePart(e.part);
  const invalidate = useThree((s) => s.invalidate);
  const mat = useMemo<MeshPhysicalMaterial>(() => makeHeartMaterial(e.kind), [e.kind]);
  const mesh = useMemo(() => new Mesh(e.geometry, mat), [e.geometry, mat]);
  const baseTransparent = mat.transparent;
  const alpha = useRef(1);
  const interactive = useRef(true);
  const lastKey = useRef('');
  const spread = useMemo<Vec>(() => spreadOf(e.part), [e.part]);
  const emissiveOff = useMemo(() => new Color(e.kind === 'conduction' || e.kind === 'node' ? '#7a5a00' : '#000000'), [e.kind]);
  const clipRef = useRef<Plane[] | null>(null);

  useEffect(() => () => mat.dispose(), [mat]);

  useEffect(() => {
    const original = mesh.raycast.bind(mesh);
    mesh.raycast = (raycaster, intersects) => {
      if (!interactive.current || !mesh.visible) return;
      const start = intersects.length;
      original(raycaster, intersects);
      const planes = clipRef.current;
      if (planes) for (let i = intersects.length - 1; i >= start; i--) if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
    };
  }, [mesh]);

  useFrame((_, dt) => {
    const c = ctrl.current;
    mesh.position.set(spread[0] * c.explode, spread[1] * c.explode, spread[2] * c.explode);

    const cutOn = c.cut && c.explode <= 0.02;
    const sel = c.selected;
    const hiddenByUser = c.hidden.has(e.part);
    const focus = isFocus(sel, e.part);
    // выбор внутренней части делает стенку прозрачной, чтобы её было видно
    const inside = c.inside || (sel !== null && INTERIOR.has(sel) && !cutOn);

    let present = true;
    if (e.kind === 'wall') {
      if (e.variant === 'whole') present = !(cutOn && c.ready[c.kind]);
      else present = cutOn && e.variant === c.kind;
    } else if (e.kind === 'conduction' || e.kind === 'node') {
      present = c.inside || cutOn || c.explode > 0.02 || sel === 'conduction-system';
    }

    let target = 1;
    if (hiddenByUser) target = 0;
    else if (c.isolate && sel !== null && !focus) target = GHOST;
    else if (inside && GHOSTED_KINDS.has(e.kind) && !focus) target = INSIDE_ALPHA;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;

    mesh.visible = present && a > 0.012;
    interactive.current = present && !hiddenByUser && a > 0.5;

    const clipped = cutOn && (e.kind !== 'wall' || (e.variant === 'whole' && !c.ready[c.kind]));
    clipRef.current = clipped ? [PLANES[c.kind]] : null;

    if (e.anim && mesh.morphTargetInfluences) mesh.morphTargetInfluences[0] = e.anim === 'aortic' || e.anim === 'pulmonary' ? c.sl : c.av;

    const active = sel === e.part || c.hovered === e.part || focus;
    const hot = c.hovered === e.part;
    const key = [clipped ? c.kind : '-', active ? 1 : 0, hot ? 1 : 0, Math.round(a * 250)].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    const transparent = baseTransparent || a < 0.995;
    if (mat.transparent !== transparent) {
      mat.transparent = transparent;
      mat.needsUpdate = true;
    }
    mat.opacity = a;
    mat.depthWrite = a > 0.9;
    mat.clippingPlanes = clipped ? clipRef.current : null;
    if (active && a > 0.5) {
      mat.emissive.copy(GLOW);
      mat.emissiveIntensity = hot ? 0.28 : 0.16;
    } else {
      mat.emissive.copy(emissiveOff);
      mat.emissiveIntensity = e.kind === 'conduction' ? 0.35 : e.kind === 'node' ? 0.4 : 0;
    }
  });

  return <primitive object={mesh} dispose={null} {...handlers} />;
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
    let at: Vec = [0, 0.4, 0];
    let dir: Vec = [0.05, 0.08, 1];
    let dist = 12;
    const f = selected ? FOCUS[selected] : undefined;
    if (f) {
      at = f.at;
      dist = f.dist;
    } else if (spread) {
      at = [0, 0.3, 0];
      dist = 17;
    } else if (c.cut) {
      if (c.kind === 'side') {
        const n = cutPlane('side').n;
        at = [0.15, 0.0, 0.1];
        dir = [n[0] + 0.12, n[1] + 0.05, n[2]];
        dist = 9;
      } else {
        at = [0.1, -0.8, 0.1];
        dir = [0.04, 1, 0.22];
        dist = 8.5;
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


const toCurve = (pts: Vec[]) => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');

function Organ({ state, names = {} }: ModelProps) {
  const main = use(loadHeart());
  const { selected, hovered } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const [cuts, setCuts] = useState<Partial<Record<CutKey, HeartPiece[]>>>({});

  const kind: CutKey = (state.cutKind as CutKind | undefined) === 'fundus' ? 'fundus' : 'side';
  const ctrl = useRef<Ctrl>({
    cut: false, kind: 'side', explode: 0, isolate: true, inside: false, selected: null, hovered: null, hidden: new Set(),
    ready: { side: false, fundus: false }, av: 1, sl: 0,
  });
  const c = ctrl.current;
  c.cut = state.cutaway;
  c.kind = kind;
  c.isolate = state.isolate ?? true;
  c.inside = !!state.modes.xray;
  c.selected = selected;
  c.hovered = hovered;
  c.hidden = state.hidden ?? new Set();
  c.ready = { side: !!cuts.side, fundus: !!cuts.fundus };
  const explodeTarget = state.explode ?? 0;

  // срезы строятся по требованию; первый заранее, когда сцена уже показана
  useEffect(() => {
    let alive = true;
    const want = (k: CutKey) =>
      loadHeartCut(k).then((list) => {
        if (alive) setCuts((prev) => (prev[k] ? prev : { ...prev, [k]: list }));
      });
    if (state.cutaway) void want(kind);
    else {
      const id = window.setTimeout(() => void want('side'), 2500);
      return () => {
        alive = false;
        window.clearTimeout(id);
      };
    }
    return () => {
      alive = false;
    };
  }, [state.cutaway, kind]);

  useEffect(
    () => () => {
      for (const e of main) e.geometry.dispose();
    },
    [main],
  );
  useEffect(
    () => () => {
      for (const list of Object.values(cuts)) for (const e of list ?? []) e.geometry.dispose();
    },
    [cuts],
  );

  const blue = useMemo(() => FLOW_BLUE.map(toCurve), []);
  const red = useMemo(() => FLOW_RED.map(toCurve), []);

  useFrame((_, dt) => {
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    const { a, v, phase } = heartbeat(state.time.current);
    BEAT.uV.value = v;
    BEAT.uA.value = a;
    // предсердно-желудочковые клапаны открыты, пока желудочки расслаблены; полулунные — во время выброса
    const avTarget = phase > 0.14 && phase < 0.45 ? 0 : 1;
    const slTarget = phase > 0.17 && phase < 0.42 ? 1 : 0;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 22);
    c.av += (avTarget - c.av) * k;
    c.sl += (slTarget - c.sl) * k;
  });

  const hidden = state.hidden ?? new Set<string>();
  const showLabels = explodeTarget <= 0.02;
  const cutOn = state.cutaway && explodeTarget <= 0.02;
  const showFlow = (cutOn || !!state.modes.xray) && explodeTarget <= 0.02;
  const planes = cutOn ? [PLANES[kind]] : undefined;

  return (
    <>
      <CameraRig ctrl={ctrl} />
      <group>
        {main.map((e) => (
          <Piece key={e.key} e={e} ctrl={ctrl} />
        ))}
        {(['side', 'fundus'] as CutKey[]).flatMap((k) => (cuts[k] ?? []).map((e) => <Piece key={e.key} e={e} ctrl={ctrl} />))}
        {showFlow && (
          <>
            {blue.map((p, i) => (
              <Flow key={`b${i}`} path={p} count={26} speed={0.1} color="#5b82e6" size={0.045} state={state} planes={planes} pulse={(time) => 0.35 + 1.6 * heartbeat(time).v} />
            ))}
            {red.map((p, i) => (
              <Flow key={`r${i}`} path={p} count={28} speed={0.095} color="#ff5a48" size={0.045} state={state} planes={planes} pulse={(time) => 0.35 + 1.6 * heartbeat(time).v} />
            ))}
          </>
        )}
        {showLabels &&
          Object.entries(LABEL_AT).map(([id, cfg]) => {
            if (hidden.has(id)) return null;
            if (state.isolate !== false && selected !== null && selected !== id && !cfg.inner) return null;
            if (cfg.inner && !cutOn && !state.modes.xray && selected !== id) return null;
            return <Label key={id} at={cfg.at} partId={id} text={names[id]} labels={state.labels && (!!cfg.main || selected === id)} inner={cfg.inner} />;
          })}
      </group>
    </>
  );
}

export default function HeartModel(props: ModelProps) {
  return (
    <Suspense fallback={<ModelPending />}>
      <Organ {...props} />
    </Suspense>
  );
}
