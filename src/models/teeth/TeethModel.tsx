import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { CatmullRomCurve3, TubeGeometry, Vector3, type BufferGeometry, type Group } from 'three';
import type { ModelProps } from '../../three/types';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { t } from '../../i18n';
import { teethText } from '../../content/ru/teeth-model';
import { SHOWCASE, SPECS, type ToothKind } from './anatomy';
import { archLayout, OCCLUSAL_Y } from './arch';
import { CANAL, JAW_TOOTH } from './jaw';
import { GROUP_OF, LAYER_IDS, SHOWCASE_POSES, toDisplay, TYPES, type LayerId } from './parts';
import { loadMeshes, useMeshes, type GeoSet } from './useMeshes';

/* ------------------------------------------------------------------ */
/* Материалы                                                           */
/* ------------------------------------------------------------------ */

interface Mat {
  color: string;
  roughness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: string;
  vertexColors?: boolean;
  /** Слой, который заходит под соседний: рисуется чуть «глубже», чтобы не мерцать на стыке. */
  behind?: boolean;
  transparent?: boolean;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

const MATS: Record<string, Mat> = {
  enamel: { color: '#ffffff', vertexColors: true, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.25, sheenColor: '#dfe9ff' },
  dentin: { color: '#ecd09a', roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.35 },
  pulp: { color: '#c9435c', roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25, emissive: '#5a0d1c', emissiveIntensity: 0.25 },
  canal: { behind: true, color: '#b23a55', roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3, emissive: '#4a0a18', emissiveIntensity: 0.25 },
  cementum: { behind: true, color: '#e2cc9c', roughness: 0.66, clearcoat: 0.1, clearcoatRoughness: 0.5 },
  gingiva: { color: '#e48a8c', roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.22, sheen: 0.6, sheenColor: '#ffc4c0' },
  pdl: { color: '#c75f61', roughness: 0.55, clearcoat: 0.2 },
  bone: { color: '#efe2c8', roughness: 0.74, clearcoat: 0.12, clearcoatRoughness: 0.5 },
  spongy: { color: '#e2c9a2', roughness: 0.82 },
  nerve: { color: '#f1c94a', roughness: 0.4, clearcoat: 0.4 },
  artery: { color: '#d23a3a', roughness: 0.35, clearcoat: 0.5 },
  vein: { color: '#3f63b8', roughness: 0.35, clearcoat: 0.5 },
  archTooth: { color: '#ffffff', vertexColors: true, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.2, sheenColor: '#e5edff' },
};

/** Подсказки при наведении: подпись «название — что делает». */
const TIP_COLORS = { bg: 'rgba(250,247,240,0.96)', border: '#d9cebd', text: '#352e27', soft: '#6b5d4b' };

/* ------------------------------------------------------------------ */
/* Общая часть: меш с выбором, подсветкой, призрачным режимом          */
/* ------------------------------------------------------------------ */

type HoverAt = (id: string | null, point?: Vector3) => void;

function matches(partId: string, selected: string | null): boolean {
  return selected === partId || (!!selected && GROUP_OF[partId] === selected);
}

function Part({
  partId,
  geometry,
  mat,
  state,
  position,
  onHover,
}: {
  partId: string;
  geometry: BufferGeometry;
  mat: Mat;
  state: ModelProps['state'];
  position?: [number, number, number];
  onHover: HoverAt;
}) {
  const { select, hover, selected, hovered, isolate } = useSelection();
  if (state.hidden?.has(partId)) return null;
  const own = matches(partId, selected);
  if (isolate && selected && !own) return null;
  const active = own || matches(partId, hovered);
  const ghost = state.isolate === true && selected !== null && !own;
  return (
    <mesh
      geometry={geometry}
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select(selected === partId ? null : partId);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hover(partId);
        onHover(partId, e.point);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hover(null);
        onHover(null);
        document.body.style.cursor = '';
      }}
    >
      <meshPhysicalMaterial
        key={ghost ? 'ghost' : 'solid'}
        color={mat.color}
        vertexColors={mat.vertexColors === true}
        roughness={mat.roughness}
        clearcoat={mat.clearcoat ?? 0}
        clearcoatRoughness={mat.clearcoatRoughness ?? 0.3}
        sheen={mat.sheen ?? 0}
        sheenColor={mat.sheenColor ?? '#ffffff'}
        transparent={mat.transparent === true || ghost}
        opacity={ghost ? 0.08 : (mat.opacity ?? 1)}
        depthWrite={!ghost}
        polygonOffset={mat.behind === true}
        polygonOffsetFactor={mat.behind ? 1 : 0}
        polygonOffsetUnits={mat.behind ? 4 : 0}
        emissive={active ? '#ff9a6a' : (mat.emissive ?? '#000000')}
        emissiveIntensity={active ? 0.32 : (mat.emissiveIntensity ?? 0)}
      />
    </mesh>
  );
}

/** Одна всплывающая подсказка у точки, над которой курсор. */
function HoverTip({ at, partId, names }: { at: Vector3 | null; partId: string | null; names?: Record<string, string> }) {
  const { selected } = useSelection();
  if (!at || !partId || selected) return null;
  const tip = teethText.tips[partId];
  if (!tip) return null;
  return (
    <Html center position={at} zIndexRange={[45, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap', transform: 'translateY(-26px)' }}>
      <div
        style={{
          background: TIP_COLORS.bg,
          border: `1px solid ${TIP_COLORS.border}`,
          borderRadius: 12,
          padding: '5px 10px',
          fontSize: 12,
          color: TIP_COLORS.text,
          boxShadow: '0 6px 18px -10px rgba(23,32,58,0.45)',
        }}
      >
        <strong>{names?.[partId] ?? partId}</strong>
        <span style={{ color: TIP_COLORS.soft }}> — {tip}</span>
      </div>
    </Html>
  );
}

/** Подпись-заголовок под зубом (без выноски, чтобы четыре подписи не налезали друг на друга). */
function Caption({ at, text, partId }: { at: [number, number, number]; text?: string; partId: string }) {
  const { select, hover } = useSelection();
  if (!text) return null;
  return (
    <Html center position={at} zIndexRange={[30, 0]}>
      <button
        type="button"
        className="atlas-label__text"
        style={{ whiteSpace: 'nowrap' }}
        onClick={() => select(partId)}
        onPointerEnter={() => hover(partId)}
        onPointerLeave={() => hover(null)}
      >
        {text}
      </button>
    </Html>
  );
}

function Building() {
  return (
    <Html center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ fontSize: 13, color: TIP_COLORS.soft, whiteSpace: 'nowrap' }}>{t('stage.building')}</div>
    </Html>
  );
}

/** Короткое имя части для подписи: «Премоляр (малый коренной)» -> «Премоляр». */
const shortName = (s?: string) => s?.replace(/\s*\(.*\)\s*$/, '');

/* ------------------------------------------------------------------ */
/* Слои одного зуба                                                    */
/* ------------------------------------------------------------------ */

/** Разнос слоёв: эмаль вверх, цемент вниз, пульпа и каналы к зрителю. */
function explodeOffset(id: LayerId, e: number): [number, number, number] {
  switch (id) {
    case 'enamel':
      return [0, 0.75 * e, 0];
    case 'cementum':
      return [0, -0.6 * e, 0];
    case 'pulp':
    case 'canal':
      return [0, 0.1 * e, 1.3 * e];
    default:
      return [0, 0, 0];
  }
}

function ToothLayers({ set, state, onHover }: { set: Record<string, BufferGeometry>; state: ModelProps['state']; onHover: HoverAt }) {
  const e = state.explode ?? 0;
  return (
    <>
      {LAYER_IDS.map((id) =>
        set[id] ? <Part key={id} partId={id} geometry={set[id]} mat={MATS[id]} state={state} onHover={onHover} position={explodeOffset(id, e)} /> : null,
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Витрина: четыре типа зубов                                          */
/* ------------------------------------------------------------------ */

const STEP_SHOWCASE = 0.0125;
const SPACING = 1.55;

function showcaseJob(kind: ToothKind) {
  const pose = SHOWCASE_POSES[kind];
  return { type: 'tooth' as const, spec: SHOWCASE[kind].id, step: STEP_SHOWCASE, yaw: pose.yaw, cutZ: pose.cutZ };
}

/** Где подписать ткани на разрезанном зубе (в координатах витрины). */
function tissueAnchors(kind: ToothKind): Record<LayerId, [number, number, number]> {
  const spec = SHOWCASE[kind];
  const pose = SHOWCASE_POSES[kind];
  const r = spec.roots[0];
  const at = (x: number, y: number, z: number) => {
    const p = toDisplay(pose.yaw, x, y, z);
    return [p[0], p[1], pose.cutZ] as [number, number, number];
  };
  const rootAt = (tt: number) => [r.sx + (r.ax - r.sx) * tt, -r.len * tt, r.sz + (r.az - r.sz) * tt];
  const [rx1, ry1, rz1] = rootAt(0.45);
  const [rx2, ry2, rz2] = rootAt(0.6);
  return {
    enamel: at(spec.md.max * 0.85, spec.h * 0.72, 0),
    dentin: at(spec.md.max * 0.5, spec.h * 0.35, 0),
    pulp: at(0, spec.chamberFloor + 0.18, 0),
    cementum: at(rx1 + r.rx * 0.9, ry1, rz1),
    canal: at(rx2, ry2, rz2),
  };
}

function ShowcaseTooth({
  kind,
  index,
  state,
  names,
  onHover,
}: {
  kind: ToothKind;
  index: number;
  state: ModelProps['state'];
  names?: Record<string, string>;
  onHover: HoverAt;
}) {
  const geo = useMeshes(showcaseJob(kind));
  const { selected, isolate } = useSelection();
  const spec = SHOWCASE[kind];
  const e = state.explode ?? 0;
  const x = (index - (TYPES.length - 1) / 2) * SPACING * (1 + 0.25 * e);
  const anchors = useMemo(() => tissueAnchors(kind), [kind]);
  // «рассмотреть отдельно» зуб: остальные зубы убираем
  if (isolate && selected && (TYPES as string[]).includes(selected) && selected !== kind) return null;
  if (state.hidden?.has(kind)) return null;
  const set = geo ? (state.cutaway ? geo.cut : geo.full) : null;
  const minRoot = Math.max(...spec.roots.map((r) => r.len));
  const highlighted = matches(kind, selected);
  return (
    <group position={[x, 0, 0]}>
      {set ? <ToothLayers set={set} state={state} onHover={onHover} /> : <Building />}
      {highlighted && set && <SelectionRing y={-minRoot - 0.2} />}
      {state.labels && <Caption at={[0, -minRoot - 0.32, 0]} text={shortName(names?.[kind])} partId={kind} />}
      {state.cutaway &&
        kind === 'molar' &&
        set &&
        LAYER_IDS.map((id) => <Label key={id} at={anchors[id]} partId={id} text={names?.[id]} labels={state.labels} inner />)}
    </group>
  );
}

/** Тонкое кольцо под выбранным типом зуба. */
function SelectionRing({ y }: { y: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.32, 0.36, 64]} />
      <meshBasicMaterial color="#ff9a6a" transparent opacity={0.8} />
    </mesh>
  );
}

function Showcase({ state, names, onHover }: { state: ModelProps['state']; names?: Record<string, string>; onHover: HoverAt }) {
  return (
    <group position={[0, 0.25, 0]}>
      {TYPES.map((kind, i) => (
        <ShowcaseTooth key={kind} kind={kind} index={i} state={state} names={names} onHover={onHover} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Зуб в челюсти                                                       */
/* ------------------------------------------------------------------ */

const STEP_JAW = 0.016;
const JAW_JOB = { type: 'jaw' as const, step: STEP_JAW };

function tube(points: [number, number, number][], r: number, seg = 96): TubeGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'catmullrom', 0.5);
  return new TubeGeometry(curve, seg, r, 14, false);
}

/** Нерв, артерия и вена в нижнечелюстном канале и их веточки к верхушкам корней и в пульпу. */
function useBundle() {
  return useMemo(() => {
    const spec = SPECS[JAW_TOOTH];
    const mk = (dy: number, dz: number, r: number, rb: number) => {
      const trunk = tube(
        [
          [-1.02, CANAL.y + dy, CANAL.z + dz],
          [0, CANAL.y + dy + 0.01, CANAL.z + dz],
          [1.02, CANAL.y + dy, CANAL.z + dz],
        ],
        r,
        64,
      );
      const branches = spec.roots.map((root) => {
        const ax = root.ax + (root.bend ?? 0);
        const apex = -root.len;
        const pts: [number, number, number][] = [
          [ax - 0.18, CANAL.y + dy, CANAL.z + dz],
          [ax - 0.04, CANAL.y + 0.2 + dy * 0.5, dz * 0.6],
          [ax, apex - 0.12, dz * 0.3],
          [ax, apex + 0.02, 0],
        ];
        // по каналу корня вверх к пульповой камере
        for (const tt of [0.75, 0.5, 0.25, 0.0]) {
          const cx = root.sx + (root.ax - root.sx) * tt + (root.bend ?? 0) * tt * tt * tt;
          const cz = root.sz + (root.az - root.sz) * tt;
          pts.push([cx + dz * 0.2, 0.12 - (0.12 + root.len) * tt, cz]);
        }
        pts.push([root.sx * 0.5, spec.chamberFloor + 0.18, 0]);
        return tube(pts, rb, 120);
      });
      return [trunk, ...branches];
    };
    return {
      nerve: mk(-0.01, 0.0, 0.055, 0.011),
      artery: mk(0.075, 0.045, 0.032, 0.008),
      vein: mk(0.06, -0.07, 0.04, 0.009),
    };
  }, []);
}

function JawView({ state, names, onHover }: { state: ModelProps['state']; names?: Record<string, string>; onHover: HoverAt }) {
  const geo = useMeshes(JAW_JOB);
  const bundle = useBundle();
  useEffect(
    () => () => {
      [...bundle.nerve, ...bundle.artery, ...bundle.vein].forEach((g) => g.dispose());
    },
    [bundle],
  );
  const set = geo ? (state.cutaway ? geo.cut : geo.full) : null;
  const S = 1.3;
  const L = (id: string, at: [number, number, number], inner = false) => (
    <Label key={id} at={at} partId={id} text={names?.[id]} labels={state.labels} inner={inner} />
  );
  return (
    <group scale={S} position={[0, 1.15, 0]}>
      {set ? (
        <>
          <ToothLayers set={set} state={state} onHover={onHover} />
          {set.gingiva && <Part partId="gingiva" geometry={set.gingiva} mat={MATS.gingiva} state={state} onHover={onHover} />}
          {set.pdl && <Part partId="pdl" geometry={set.pdl} mat={MATS.pdl} state={state} onHover={onHover} />}
          {set.bone && <Part partId="bone" geometry={set.bone} mat={MATS.bone} state={state} onHover={onHover} />}
          {set.spongy && state.cutaway && <Part partId="bone" geometry={set.spongy} mat={MATS.spongy} state={state} onHover={onHover} />}
          {bundle.nerve.map((g, i) => (
            <Part key={`n${i}`} partId="nerve" geometry={g} mat={MATS.nerve} state={state} onHover={onHover} />
          ))}
          {bundle.artery.map((g, i) => (
            <Part key={`a${i}`} partId="vessels" geometry={g} mat={MATS.artery} state={state} onHover={onHover} />
          ))}
          {bundle.vein.map((g, i) => (
            <Part key={`v${i}`} partId="vessels" geometry={g} mat={MATS.vein} state={state} onHover={onHover} />
          ))}
          {!state.cutaway && L('gingiva', [0.5, -0.05, 0.5])}
          {!state.cutaway && L('bone', [-0.7, -1.3, 0.58])}
          {state.cutaway && (
            <>
              {L('gingiva', [0.66, -0.04, 0], true)}
              {L('bone', [-0.72, -1.25, 0], true)}
              {L('pdl', [-0.335, -1.0, 0], true)}
              {L('nerve', [0.78, CANAL.y - 0.02, 0], true)}
              {L('vessels', [-0.78, CANAL.y + 0.075, 0.03], true)}
              {L('enamel', [0.3, 0.6, 0], true)}
              {L('dentin', [0.2, 0.3, 0], true)}
              {L('pulp', [0, 0.02, 0], true)}
              {L('cementum', [0.48, -0.55, 0], true)}
              {L('canal', [-0.24, -0.7, 0], true)}
            </>
          )}
        </>
      ) : (
        <Building />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Зубной ряд                                                          */
/* ------------------------------------------------------------------ */

const STEP_ARCH = 0.026;
const STEP_GUM = 0.04;
const LAYOUT = archLayout();
const ARCH_IDS = [...new Set(LAYOUT.map((p) => p.specId))];

function useArch(): { teeth: Record<string, BufferGeometry>; upper: BufferGeometry; lower: BufferGeometry } | null {
  const [res, setRes] = useState<{ teeth: Record<string, BufferGeometry>; upper: BufferGeometry; lower: BufferGeometry } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      ...ARCH_IDS.map((id) => loadMeshes({ type: 'archTooth', spec: id, step: STEP_ARCH })),
      loadMeshes({ type: 'gum', jaw: 'upper', step: STEP_GUM }),
      loadMeshes({ type: 'gum', jaw: 'lower', step: STEP_GUM }),
    ]).then((all: GeoSet[]) => {
      if (!alive) return;
      const teeth: Record<string, BufferGeometry> = {};
      ARCH_IDS.forEach((id, i) => (teeth[id] = all[i].full.outer));
      setRes({ teeth, upper: all[ARCH_IDS.length].full.gingiva, lower: all[ARCH_IDS.length + 1].full.gingiva });
    });
    return () => {
      alive = false;
    };
  }, []);
  return res;
}

function ArchView({ state, names, onHover }: { state: ModelProps['state']; names?: Record<string, string>; onHover: HoverAt }) {
  const arch = useArch();
  if (!arch) return <Building />;
  // подписи типов — на правой половине нижней челюсти
  const captionFor: Record<string, ToothKind> = { 'l-i1': 'incisor', 'l-c': 'canine', 'l-p1': 'premolar', 'l-m1': 'molar' };
  return (
    <group scale={0.92} position={[0, 0.2, 0.6]} rotation={[0.28, 0, 0]}>
      {LAYOUT.map((p) => {
        const spec = SPECS[p.specId];
        const flipY = p.jaw === 'upper' ? -1 : 1;
        const cap = p.side === 1 && p.jaw === 'lower' ? captionFor[p.specId] : undefined;
        return (
          <group key={`${p.specId}${p.side}`} position={p.pos} rotation={[0, p.yaw, 0]} scale={[p.side, flipY, 1]}>
            <Part partId={spec.kind} geometry={arch.teeth[p.specId]} mat={MATS.archTooth} state={state} onHover={onHover} />
            {cap && <Label at={[0, -spec.h - 0.55, 0.3]} partId={cap} text={shortName(names?.[cap])} labels={state.labels} />}
          </group>
        );
      })}
      <Part partId="gingiva" geometry={arch.lower} mat={MATS.gingiva} state={state} onHover={onHover} position={[0, OCCLUSAL_Y, 0]} />
      <group scale={[1, -1, 1]}>
        <Part partId="gingiva" geometry={arch.upper} mat={MATS.gingiva} state={state} onHover={onHover} />
      </group>
      <Label at={[-2.1, -1.0, 0.2]} partId="gingiva" text={names?.gingiva} labels={state.labels} />
    </group>
  );
}

/* ------------------------------------------------------------------ */

export default function TeethModel({ state, names }: ModelProps) {
  const view = state.modes.arch ? 'arch' : state.modes.jaw ? 'jaw' : 'types';
  const root = useRef<Group>(null);
  const [tip, setTip] = useState<{ id: string | null; at: Vector3 | null }>({ id: null, at: null });
  const invalidate = useThree((s) => s.invalidate);
  const onHover: HoverAt = (id, point) => {
    if (!id || !point || !root.current) setTip({ id: null, at: null });
    else setTip({ id, at: root.current.worldToLocal(point.clone()) });
    invalidate();
  };

  // остальные режимы строим заранее, в фоне, пока человек рассматривает витрину
  useEffect(() => {
    const id = setTimeout(() => {
      void loadMeshes(JAW_JOB);
    }, 2500);
    return () => clearTimeout(id);
  }, []);

  return (
    <group ref={root} rotation={[0.06, -0.12, 0]}>
      {view === 'types' && <Showcase state={state} names={names} onHover={onHover} />}
      {view === 'jaw' && <JawView state={state} names={names} onHover={onHover} />}
      {view === 'arch' && <ArchView state={state} names={names} onHover={onHover} />}
      <HoverTip at={tip.at} partId={tip.id} names={names} />
    </group>
  );
}
