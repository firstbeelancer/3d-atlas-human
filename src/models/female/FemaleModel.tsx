import { lazy, Suspense, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CatmullRomCurve3, DoubleSide, Vector3, type Group, type Mesh, type MeshPhysicalMaterial, type PerspectiveCamera, type Texture } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { t } from '../../i18n';
import {
  CUT_DEFAULT_T, CUTS, CYCLE_SIDE, ENDO_MAX, ENDO_MIN, FOLLICLES, OVARY_CENTER, OVERVIEW, PELVIS_CENTER, SIDE_VIEW, TOP_VIEW, dayOf,
  endometriumThickness, follicleScale, phaseName, phaseOf, tubeAxis, type FollicleDef, type FollicleKind,
} from './anatomy';
import { anchorOf, buildFemale, dynamicAnchor, makeFollicleGeos, type FollicleGeos, type MatKey } from './build';
import { FemaleContext, FemalePart, MetaContext, PartLabel, SPREAD_RADIAL, type FemaleControl, type PartMeta } from './FemalePart';
import { FEMALE_GROUPS, FEMALE_PART_IDS, GROUP_OF, SPREAD } from './parts';
import { smooth, type V3 } from './geometry';
import { EXTRA_FOCUS } from './focus';
import { makeTextures, type FemaleTextures } from './textures';

/*
  Женская репродуктивная система, вид спереди: +z — к лобку, +y — вверх.
  Цикл идёт сам: растёт эндометрий, зреет фолликул, происходит овуляция, яйцеклетка бежит по трубе в матку.
*/

const Vulva = lazy(() => import('./adult/Vulva'));

type Tx = FemaleTextures;

function FMaterial({ kind, tex }: { kind: MatKey; tex: Tx }) {
  switch (kind) {
    case 'serosa':
      return <meshPhysicalMaterial map={tex.serosa} bumpMap={tex.serosa} bumpScale={0.5} roughness={0.42} clearcoat={0.5} clearcoatRoughness={0.3} sheen={0.5} sheenColor="#ffd9cc" />;
    case 'cervixSurface':
      return <meshPhysicalMaterial map={tex.cervix} bumpMap={tex.cervix} bumpScale={0.4} roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.28} sheen={0.4} sheenColor="#ffd9cc" />;
    case 'perimetrium':
      return <meshPhysicalMaterial color="#ffe4dc" transparent opacity={0.12} roughness={0.12} clearcoat={1} clearcoatRoughness={0.08} depthWrite={false} side={DoubleSide} />;
    case 'myometrium':
      return <meshPhysicalMaterial map={tex.myometrium} bumpMap={tex.myometrium} bumpScale={1} roughness={0.6} sheen={0.4} sheenColor="#ff9d8a" side={DoubleSide} />;
    case 'cervixStroma':
      return <meshStandardMaterial map={tex.cervix} color="#e5b0a8" roughness={0.6} side={DoubleSide} />;
    case 'endometrium':
      return <meshPhysicalMaterial map={tex.endometrium} bumpMap={tex.endometrium} bumpScale={1.2} roughness={0.35} clearcoat={0.7} clearcoatRoughness={0.2} sheen={0.7} sheenColor="#ff9fb0" side={DoubleSide} />;
    case 'cavityVolume':
      return <meshPhysicalMaterial color="#9fd2ea" transparent opacity={0.2} roughness={0.1} clearcoat={1} depthWrite={false} side={DoubleSide} />;
    case 'canal':
      return <meshPhysicalMaterial map={tex.mucosa} color="#f2a3a0" roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.18} sheen={0.6} sheenColor="#ffb7a8" side={DoubleSide} />;
    case 'osRing':
      return <meshStandardMaterial color="#c9605f" roughness={0.38} />;
    case 'tube':
      return <meshPhysicalMaterial map={tex.serosa} color="#f2c0b6" roughness={0.42} clearcoat={0.5} clearcoatRoughness={0.3} sheen={0.5} sheenColor="#ffd9cc" side={DoubleSide} />;
    case 'tubeLumen':
      return <meshPhysicalMaterial map={tex.endometrium} color="#e8909a" roughness={0.3} clearcoat={0.7} clearcoatRoughness={0.2} side={DoubleSide} />;
    case 'fimbria':
      return <meshPhysicalMaterial map={tex.endometrium} color="#ef9ca4" roughness={0.4} clearcoat={0.5} sheen={0.6} sheenColor="#ffb7bf" />;
    case 'ovary':
      return <meshPhysicalMaterial map={tex.ovary} bumpMap={tex.ovary} bumpScale={1.4} roughness={0.55} sheen={0.5} sheenColor="#ffe5d5" />;
    case 'primordial':
      return <meshStandardMaterial color="#fff4e0" roughness={0.3} emissive="#fff1d6" emissiveIntensity={0.25} />;
    case 'follicle':
      return <meshPhysicalMaterial color="#f6dfa8" transparent opacity={0.62} roughness={0.2} clearcoat={0.9} clearcoatRoughness={0.12} depthWrite={false} />;
    case 'fluid':
      return <meshPhysicalMaterial color="#cfe6f2" transparent opacity={0.55} roughness={0.05} clearcoat={1} depthWrite={false} />;
    case 'luteum':
      return <meshPhysicalMaterial color="#e8b92d" roughness={0.5} sheen={0.6} sheenColor="#ffe28a" clearcoat={0.3} />;
    case 'albicans':
      return <meshStandardMaterial color="#f2ecda" roughness={0.75} />;
    case 'oocyte':
      return <meshPhysicalMaterial color="#fff6e8" roughness={0.25} clearcoat={1} emissive="#fff0d0" emissiveIntensity={0.35} />;
    case 'sheet':
      return <meshStandardMaterial map={tex.sheet} transparent opacity={0.3} roughness={0.5} depthWrite={false} side={DoubleSide} />;
    case 'ligament':
      return <meshStandardMaterial map={tex.sheet} color="#f1d8c8" transparent opacity={0.4} roughness={0.6} depthWrite={false} side={DoubleSide} />;
    case 'cord':
      return <meshStandardMaterial color="#eadcc2" roughness={0.6} />;
    case 'vagina':
      return <meshPhysicalMaterial map={tex.serosa} color="#e9a9a0" bumpMap={tex.serosa} bumpScale={0.4} roughness={0.5} clearcoat={0.35} sheen={0.4} sheenColor="#ffd2c2" side={DoubleSide} />;
    case 'vaginaLumen':
      return <meshPhysicalMaterial map={tex.mucosa} bumpMap={tex.mucosa} bumpScale={0.7} roughness={0.28} clearcoat={0.85} clearcoatRoughness={0.16} sheen={0.6} sheenColor="#ffb7a8" side={DoubleSide} />;
    case 'rugae':
      return <meshPhysicalMaterial map={tex.mucosa} color="#f3a6a3" bumpMap={tex.mucosa} bumpScale={1} roughness={0.25} clearcoat={0.9} clearcoatRoughness={0.14} sheen={0.7} sheenColor="#ffbdb0" side={DoubleSide} />;
    case 'fornix':
      return <meshPhysicalMaterial map={tex.serosa} color="#e29a97" roughness={0.45} clearcoat={0.4} side={DoubleSide} />;
    case 'fornixLumen':
      return <meshPhysicalMaterial map={tex.mucosa} color="#e48a8c" roughness={0.28} clearcoat={0.85} clearcoatRoughness={0.16} side={DoubleSide} />;
    case 'artery':
      return <meshStandardMaterial color="#c3362e" roughness={0.4} emissive="#300000" emissiveIntensity={0.1} />;
    case 'vein':
      return <meshStandardMaterial color="#46589e" roughness={0.42} />;
    case 'nerve':
      return <meshStandardMaterial color="#e6c24a" roughness={0.5} />;
    case 'ganglion':
      return <meshStandardMaterial color="#d9b53d" roughness={0.5} />;
    case 'node':
      return <meshStandardMaterial color="#9bb15a" roughness={0.55} />;
    case 'bladder':
      return <meshPhysicalMaterial color="#e5b49d" roughness={0.45} clearcoat={0.5} sheen={0.5} sheenColor="#ffd9cc" transparent opacity={0.5} depthWrite={false} side={DoubleSide} />;
    case 'bladderLumen':
      return <meshStandardMaterial color="#d99b8a" roughness={0.4} side={DoubleSide} />;
    case 'urethra':
      return <meshStandardMaterial color="#dfb49f" roughness={0.5} side={DoubleSide} />;
    case 'urethraLumen':
      return <meshStandardMaterial color="#9c5a52" roughness={0.5} side={DoubleSide} />;
    case 'ureter':
      return <meshStandardMaterial color="#e2b49c" roughness={0.5} side={DoubleSide} />;
    case 'rectum':
      return <meshPhysicalMaterial color="#c98a7c" roughness={0.5} clearcoat={0.3} transparent opacity={0.85} side={DoubleSide} />;
    case 'rectumLumen':
      return <meshStandardMaterial color="#a96358" roughness={0.45} side={DoubleSide} />;
    case 'bone':
      return <meshStandardMaterial color="#e9dec4" roughness={0.75} />;
    case 'cartilage':
      return <meshStandardMaterial color="#cddfe4" roughness={0.38} />;
    case 'floor':
      return <meshStandardMaterial color="#b9605a" transparent opacity={0.26} roughness={0.7} depthWrite={false} side={DoubleSide} />;
    default:
      return <meshStandardMaterial color="#e8b69f" roughness={0.6} side={DoubleSide} />;
  }
}

/* ---------- камера ---------- */

interface Focus {
  at: V3;
  dir: V3;
  dist: number;
}

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

const SPREAD_VIEW: Focus = { at: [0, -1.2, 1.5], dir: [0.55, 0.22, 0.8], dist: 56 };

function CameraRig({ ctrl, selected, explode, focus }: { ctrl: RefObject<FemaleControl>; selected: string | null; explode: number; focus: Record<string, Focus> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Rig | null;
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ at: Vector3; offset: Vector3 } | null>(null);
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
    if (!controls) return;
    const f: Focus | undefined = selected ? focus[selected] ?? EXTRA_FOCUS[selected] : undefined;
    let v: Focus = OVERVIEW;
    let span = 21;
    if (f) v = f;
    else if (spread) {
      v = SPREAD_VIEW;
      span = 30;
    } else if (cut) {
      v = kind === 'fundus' ? { ...TOP_VIEW } : kind === 'coronal' ? { ...SIDE_VIEW } : OVERVIEW;
      span = kind === 'fundus' ? 16 : 21;
    }
    const aspect = Math.max(0.3, width / Math.max(1, height));
    const fov = (camera as PerspectiveCamera).fov;
    const fit = span / (2 * aspect * Math.tan((fov * Math.PI) / 360));
    const fitV = (f ? 0 : spread ? 28 : 26.5) / (2 * Math.tan((fov * Math.PI) / 360));
    const distance = f ? f.dist : Math.max(v.dist, fit, fitV);
    goal.current = { at: new Vector3(...v.at), offset: new Vector3(...v.dir).normalize().multiplyScalar(distance) };
    invalidate();
  }, [camera, controls, selected, cut, kind, spread, width, height, invalidate, focus]);

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

/* ---------- фолликулы, яйцеклетка, цикл ---------- */

const KIND_OF_PART: Record<string, FollicleKind> = {
  'follicle-primary': 'primary',
  'follicle-secondary': 'secondary',
  'follicle-antral': 'antral',
  'follicle-graafian': 'graafian',
  'corpus-luteum': 'luteum',
  'corpus-albicans': 'albicans',
};

function FollicleBody({ f, geos, tex, state }: { f: FollicleDef; geos: FollicleGeos; tex: Tx; state: ModelProps['state'] }) {
  const g = useRef<Group>(null);
  const c = OVARY_CENTER(f.ovary);
  const hollowKind = f.kind === 'antral' || f.kind === 'graafian';
  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const s = follicleScale(f, phaseOf(state.time.current));
    grp.scale.setScalar(Math.max(0.0001, s));
    grp.visible = s > 0.02;
  });
  const shellGeo = f.kind === 'luteum' ? geos.rough : f.kind === 'albicans' ? geos.scar : geos.smooth;
  const mat: MatKey = f.kind === 'luteum' ? 'luteum' : f.kind === 'albicans' ? 'albicans' : 'follicle';
  const cap = f.kind === 'luteum' ? 'luteum' : f.kind === 'albicans' ? 'albicans' : 'follicle';
  return (
    <group ref={g} position={[c[0] + f.at[0], c[1] + f.at[1], c[2] + f.at[2]]}>
      <mesh geometry={shellGeo} scale={f.r} userData={{ solid: cap, prio: 1 }}>
        <FMaterial kind={mat} tex={tex} />
      </mesh>
      {hollowKind && (
        <mesh geometry={geos.fluid} scale={f.r * 0.8} userData={{ solid: 'fluid', prio: 2, noPick: true }}>
          <FMaterial kind="fluid" tex={tex} />
        </mesh>
      )}
      {f.kind === 'luteum' && (
        <mesh geometry={geos.fluid} scale={f.r * 0.32} userData={{ solid: 'fat', prio: 2, noPick: true }}>
          <meshStandardMaterial color="#f7e6b5" roughness={0.5} />
        </mesh>
      )}
      {(f.kind === 'primary' || f.kind === 'secondary') && (
        <mesh geometry={geos.fluid} scale={f.r * 0.46} userData={{ solid: 'fat', prio: 2, noPick: true }}>
          <FMaterial kind="oocyte" tex={tex} />
        </mesh>
      )}
      {hollowKind && f.kind === 'graafian' && (
        <mesh geometry={geos.fluid} scale={f.r * 0.17} position={[0.18 * f.r, 0.1 * f.r, 0.45 * f.r]} userData={{ noPick: true }}>
          <FMaterial kind="oocyte" tex={tex} />
        </mesh>
      )}
    </group>
  );
}

/** Путь яйцеклетки после овуляции: поверхность яичника, воронка, труба, полость матки. */
function useOocyteRoute() {
  return useMemo(() => {
    const g = FOLLICLES.find((f) => f.id === 'a-graafian')!;
    const c = OVARY_CENTER(g.ovary);
    const tube = tubeAxis(CYCLE_SIDE);
    const pts: Vector3[] = [new Vector3(c[0] + g.at[0] + 0.1, c[1] + g.at[1] + 0.06, c[2] + g.at[2] + 0.27)];
    pts.push(new Vector3(c[0] - 0.9, c[1] + 0.9, c[2] + 0.75));
    for (let i = 0; i <= 18; i++) pts.push(tube.getPointAt(1 - i / 18));
    pts.push(new Vector3(-1.2, 3.8, 0.3), new Vector3(-0.5, 3.0, 0.32), new Vector3(-0.1, 1.9, 0.18), new Vector3(0, 0.5, 0.02));
    return new CatmullRomCurve3(pts, false, 'centripetal');
  }, []);
}

function Oocyte({ state, tex }: { state: ModelProps['state']; tex: Tx }) {
  const g = useRef<Group>(null);
  const route = useOocyteRoute();
  const geoRef = useRef<Mesh>(null);
  const p = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const phase = phaseOf(state.time.current);
    const gr = FOLLICLES.find((f) => f.id === 'a-graafian')!;
    const fs = follicleScale(gr, phase);
    let u = 0;
    let s = 1;
    if (phase < 0.49) {
      u = 0;
      s = 0.35 + 0.65 * smooth(0.05, 0.48, phase);
    } else if (phase < 0.5) {
      s = 1;
    } else if (phase < 0.7) {
      // яйцеклетка доходит до ампулы и, если не встретила сперматозоид, примерно через сутки распадается
      u = 0.45 * smooth(0.5, 0.62, phase);
      s = 1 - smooth(0.6, 0.68, phase);
    } else s = 0;
    route.getPointAt(Math.min(1, Math.max(0, u)), p);
    // пока яйцеклетка в фолликуле, она растёт вместе с ним и сидит у его стенки
    if (phase < 0.5) {
      const c = OVARY_CENTER(gr.ovary);
      p.set(c[0] + gr.at[0] + 0.1 * fs * gr.r / 0.6 + 0.04, c[1] + gr.at[1] + 0.06 * fs, c[2] + gr.at[2] + 0.27 * fs + 0.1);
    }
    grp.position.copy(p);
    grp.scale.setScalar(Math.max(0.0001, s));
    grp.visible = s > 0.03;
  });
  return (
    <group ref={g}>
      <mesh ref={geoRef} userData={{ noPick: false }}>
        <sphereGeometry args={[0.11, 20, 14]} />
        <FMaterial kind="oocyte" tex={tex} />
      </mesh>
      <mesh userData={{ noPick: true }}>
        <sphereGeometry args={[0.19, 20, 14]} />
        <meshPhysicalMaterial color="#fff2d0" transparent opacity={0.28} roughness={0.2} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CycleHud({ state }: { state: ModelProps['state'] }) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef('');
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    const el = box.current;
    if (!el) return;
    const ph = phaseOf(state.time.current);
    const text = `${t('female.hud.day')} ${dayOf(ph)} ${t('female.hud.of')}`;
    const name = t(`female.phase.${phaseName(ph)}` as 'female.phase.menstrual');
    const key = text + name;
    if (key === last.current) return;
    last.current = key;
    el.firstElementChild!.textContent = text;
    el.lastElementChild!.textContent = name;
  });
  return (
    <Html fullscreen calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={(el) => { box.current = el; if (el) invalidate(); }} className="pointer-events-none absolute bottom-[4.6rem] right-3 flex min-w-[10.5rem] flex-col rounded-2xl border border-line bg-plinth/90 px-3.5 py-2 shadow-[0_8px_24px_-14px_rgba(23,32,58,0.45)] backdrop-blur max-sm:hidden">
        <span className="text-[12px] text-ink-soft"> </span>
        <span className="text-[15px] font-semibold text-ink"> </span>
      </div>
    </Html>
  );
}

/* ---------- модель ---------- */

const DEFAULT_DIR: V3 = [0.22, 0.14, 0.97];

function computeMeta(G: ReturnType<typeof buildFemale>) {
  const label: PartMeta['label'] = {};
  const spread: PartMeta['spread'] = {};
  const focus: Record<string, Focus> = {};
  const centers: Record<string, V3[]> = {};
  for (const id of FEMALE_PART_IDS) {
    const a = anchorOf(G[id] ?? []) ?? dynamicAnchor(id);
    if (!a) continue;
    label[id] = a.at;
    const dist = Math.min(34, Math.max(9, a.size * 1.7 + 6));
    focus[id] = { at: a.center, dir: DEFAULT_DIR, dist };
    if (!SPREAD[id]) {
      const d: V3 = [(a.center[0] - PELVIS_CENTER.x) * SPREAD_RADIAL, (a.center[1] - PELVIS_CENTER.y) * SPREAD_RADIAL, (a.center[2] - PELVIS_CENTER.z) * SPREAD_RADIAL];
      spread[id] = [d[0], d[1], d[2] + 2.2];
    }
    (centers[GROUP_OF[id]] ??= []).push(a.center);
  }
  for (const [g, list] of Object.entries(centers)) {
    const mean = list.reduce<V3>((m, c) => [m[0] + c[0] / list.length, m[1] + c[1] / list.length, m[2] + c[2] / list.length], [0, 0, 0]);
    const span = Math.max(...list.map((c) => Math.hypot(c[0] - mean[0], c[1] - mean[1])));
    focus[g] = { at: mean, dir: DEFAULT_DIR, dist: Math.min(44, Math.max(15, span * 2.6 + 9)) };
  }
  // особые виды: верх матки и яичник целиком
  focus.ovary = { at: [-5.3, 2.2, -0.2], dir: [0.15, 0.1, 0.98], dist: 12 };
  focus['g-ovary'] = { at: [-5.3, 2.2, -0.2], dir: [0.15, 0.1, 0.98], dist: 15 };
  focus.oocyte = { at: [-5.3, 2.2, -0.2], dir: [0.15, 0.1, 0.98], dist: 11 };
  return { label, spread, focus };
}

export default function FemaleModel({ state, names = {} }: ModelProps) {
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const G = useMemo(() => buildFemale(), []);
  const geos = useMemo(() => makeFollicleGeos(), []);
  const tex = useMemo(() => makeTextures(), []);
  const meta = useMemo(() => computeMeta(G), [G]);
  useEffect(
    () => () => {
      for (const defs of Object.values(G)) for (const d of defs) { d.g.dispose(); d.proxy?.dispose(); }
      Object.values(geos).forEach((g) => g.dispose());
      (Object.values(tex) as Texture[]).forEach((x) => x.dispose());
    },
    [G, geos, tex],
  );

  const explodeTarget = state.explode ?? 0;
  const ctrl = useRef<FemaleControl>({ cut: false, kind: 'side', explode: 0, cutV: 0, isolate: true, selected: null, hidden: new Set(), labels: true, xray: false });
  const kind = state.cutKind ?? 'side';
  const spec = CUTS[kind];
  ctrl.current.cut = state.cutaway || explodeTarget > 0.02;
  ctrl.current.kind = kind;
  ctrl.current.cutV = spec.min + (spec.max - spec.min) * (state.cutAt ?? CUT_DEFAULT_T[kind]);
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;
  ctrl.current.xray = !!state.modes.xray;

  const morph = useRef(new Set<Mesh>());
  const lastW = useRef(-1);
  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    const phase = phaseOf(state.time.current);
    const th = endometriumThickness(phase);
    const w = (th - ENDO_MIN) / (ENDO_MAX - ENDO_MIN);
    if (Math.abs(w - lastW.current) > 0.002) {
      lastW.current = w;
      const bleed = Math.max(1 - smooth(0.04, 0.2, phase), smooth(0.88, 0.99, phase));
      for (const m of morph.current) {
        if (m.morphTargetInfluences) m.morphTargetInfluences[0] = w;
        const mat = m.material as MeshPhysicalMaterial;
        if (m.userData.endo && mat.color) mat.color.setRGB(1 - 0.18 * bleed, 1 - 0.62 * bleed, 1 - 0.55 * bleed);
      }
      invalidate();
    }
  });

  const follicleParts = useMemo(() => {
    const m: Record<string, FollicleDef[]> = {};
    for (const [id, k] of Object.entries(KIND_OF_PART)) m[id] = FOLLICLES.filter((f) => f.kind === k);
    return m;
  }, []);

  const groupIds = Object.keys(FEMALE_GROUPS);
  void groupIds;

  return (
    <FemaleContext.Provider value={ctrl}>
      <MetaContext.Provider value={meta}>
        <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} focus={meta.focus} />
        <CycleHud state={state} />
        <group>
          {FEMALE_PART_IDS.map((id) => (
            <FemalePart key={id} id={id}>
              {(G[id] ?? []).map((d, i) => (
                <mesh
                  key={i}
                  geometry={d.g}
                  userData={{ solid: d.cap, prio: d.prio, noPick: d.noPick, pickProxy: d.proxy, endo: id === 'endometrium' }}
                  ref={(m) => {
                    if (m && d.morph) {
                      m.updateMorphTargets();
                      morph.current.add(m);
                    }
                  }}
                  renderOrder={d.m === 'perimetrium' ? 3 : undefined}
                >
                  <FMaterial kind={d.m} tex={tex} />
                </mesh>
              ))}
              {follicleParts[id]?.map((f) => <FollicleBody key={f.id} f={f} geos={geos} tex={tex} state={state} />)}
              {id === 'oocyte' && <Oocyte state={state} tex={tex} />}
              <PartLabel id={id} names={names} />
            </FemalePart>
          ))}
          {state.adult && (
            <Suspense fallback={null}>
              <Vulva names={names} tex={tex} />
            </Suspense>
          )}
        </group>
      </MetaContext.Provider>
    </FemaleContext.Provider>
  );
}
