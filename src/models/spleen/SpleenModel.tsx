import { use, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Material } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { Flow } from '../../three/Flow';
import {
  BRANCHES,
  CELIAC_PTS,
  GASTROEPIPLOIC_PTS,
  IMV_PTS,
  PORTAL_PTS,
  SHORT_GASTRIC,
  SPLENIC_ARTERY_PTS,
  SPLENIC_VEIN_PTS,
  VEIN_BRANCHES,
  curveOf,
  squeeze,
  twigs,
  type V3,
} from './anatomy';
import { buildStatic, spleenParts, type MatKey, type MeshDef } from './build';
import { loadSpleenMesh } from './loader';
import { makeMaterial } from './materials';
import { CUT_VIEWS, FOCUS, INTERNAL_PARTS, MACRO_PART_IDS, MICRO_ONLY, MICRO_VIEW, OVERVIEW, SPREAD_VIEW, type Focus } from './parts';
import { SpleenContext, SpleenPart, PartLabel, type SpleenControl } from './SpleenPart';
import { buildTextures, type PancTextures } from '../pancreas/textures';
import MicroScene from './MicroScene';

/*
  Селезёнка в контексте: внутренностная поверхность и ворота смотрят на зрителя, желудок — вырезанный стеклянный «лоток»
  перед органом. Анимация: сердечный ритм гонит кровь по артериям; по циклу около 32 с «нагрузка» —
  капсула сокращается (орган чуть сжимается), кровь идёт быстрее, запас крови уходит в вены.
*/

interface Rig {
  position: Vector3;
  target: Vector3;
  update(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части или к виду на срез; пользователь может перехватить управление. */
function CameraRig({ ctrl, selected, explode, micro }: { ctrl: RefObject<SpleenControl>; selected: string | null; explode: number; micro: boolean }) {
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
    else if (micro) f = MICRO_VIEW;
    else if (spread) f = SPREAD_VIEW;
    else if (cut) f = CUT_VIEWS[kind];
    else f = OVERVIEW;
    goal.current = { at: new Vector3(...f.at), offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist) };
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

/** Меши одной части. Материалы у каждой части свои — подсветка и призрачный режим не задевают соседей. */
function PartMeshes({ defs, tex }: { defs: MeshDef[]; tex: PancTextures }) {
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

const toCurve = (pts: V3[]) => curveOf(pts);
const heart = (t: number) => (1 + 0.5 * Math.sin(t * 7)) * (1 + 0.7 * squeeze(t));
const venous = (t: number) => 0.7 + 1.8 * squeeze(t);

const c = {
  celiac: toCurve(CELIAC_PTS),
  splenicA: toCurve(SPLENIC_ARTERY_PTS),
  splenicV: toCurve(SPLENIC_VEIN_PTS),
  portal: toCurve(PORTAL_PTS),
  imv: toCurve(IMV_PTS),
  branches: BRANCHES.map((b) => toCurve(b.trunk)),
  twigA: twigs('artery').map(toCurve),
  hilarV: [...twigs('vein'), ...VEIN_BRANCHES].map((t) => toCurve([...t].reverse())),
  short: SHORT_GASTRIC.map(toCurve),
  gep: toCurve(GASTROEPIPLOIC_PTS),
};

/** Потоки крови: частицы по сосудам; на «нагрузке» бегут быстрее. */
function Streams({ id, state }: { id: string; state: ModelProps['state'] }) {
  const red = '#ff6b5a';
  const blue = '#8c94ea';
  switch (id) {
    case 'celiac-trunk':
      return <Flow path={c.celiac} count={7} speed={0.08} color={red} size={0.16} state={state} pulse={heart} />;
    case 'splenic-artery':
      return <Flow path={c.splenicA} count={22} speed={0.06} color={red} size={0.14} state={state} pulse={heart} />;
    case 'sa-sup':
    case 'sa-mid':
    case 'sa-inf': {
      const k = id === 'sa-sup' ? 0 : id === 'sa-mid' ? 1 : 2;
      return <Flow path={c.branches[k]} count={6} speed={0.08} color={red} size={0.11} state={state} pulse={heart} />;
    }
    case 'hilar-arteries':
      return (
        <>
          {c.twigA.map((p, i) => (
            <Flow key={i} path={p} count={3} speed={0.1} color={red} size={0.08} state={state} pulse={heart} />
          ))}
        </>
      );
    case 'hilar-veins':
      return (
        <>
          {c.hilarV.map((p, i) => (
            <Flow key={i} path={p} count={3} speed={0.08} color={blue} size={0.1} state={state} pulse={venous} />
          ))}
        </>
      );
    case 'short-gastric':
      return (
        <>
          {c.short.map((p, i) => (
            <Flow key={i} path={p} count={3} speed={0.06} color={red} size={0.06} state={state} pulse={heart} />
          ))}
        </>
      );
    case 'gastroepiploic-artery':
      return <Flow path={c.gep} count={8} speed={0.05} color={red} size={0.08} state={state} pulse={heart} />;
    case 'splenic-vein':
      return <Flow path={c.splenicV} count={16} speed={0.05} color={blue} size={0.2} state={state} pulse={venous} />;
    case 'portal-vein':
      return <Flow path={c.portal} count={8} speed={0.06} color={blue} size={0.24} state={state} pulse={venous} />;
    case 'imv':
      return <Flow path={c.imv} count={9} speed={0.05} color={blue} size={0.12} state={state} />;
    default:
      return null;
  }
}

export default function SpleenModel({ state, names = {} }: ModelProps) {
  const data = use(loadSpleenMesh());
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const base = useMemo(buildStatic, []);
  const tex = useMemo(buildTextures, []);
  const sp = useMemo(() => spleenParts(data), [data]);

  useEffect(
    () => () => {
      for (const defs of Object.values(base)) for (const d of defs) d.g.dispose();
      Object.values(tex).forEach((t) => t.dispose());
    },
    [base, tex],
  );
  useEffect(
    () => () => {
      for (const defs of Object.values(sp)) for (const d of defs) d.g.dispose();
    },
    [sp],
  );

  const micro = selected === null ? !!state.modes.pulp : MICRO_ONLY.has(selected);
  const xray = !!state.modes.xray;
  const segMode = !!state.modes.segments;
  const explodeTarget = state.explode ?? 0;
  const ctrl = useRef<SpleenControl>({ cut: false, kind: 'side', cutT: 0.5, explode: 0, isolate: true, selected: null, hidden: new Set(), labels: true, squeeze: 0, xray: false });
  ctrl.current.cut = state.cutaway;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.cutT = state.cutAt ?? 0.5;
  ctrl.current.isolate = state.isolate ?? true;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;
  ctrl.current.xray = xray;

  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
    const s = squeeze(state.time.current);
    if (Math.abs(s - c.squeeze) > 0.002) {
      c.squeeze = s;
      invalidate();
    }
  });

  const selInternal = selected !== null && (INTERNAL_PARTS.has(selected) || selected === 'g-internal');
  const visible = (id: string): boolean => {
    if (id === 'red-pulp') return selInternal;
    if (INTERNAL_PARTS.has(id)) return xray || selInternal;
    if (id === 'segments') return segMode || selected === 'segments';
    if (id === 'intersegmental') return segMode || selected === 'intersegmental' || selected === 'segments';
    return true;
  };

  const hideLabels = explodeTarget > 0.02;
  return (
    <SpleenContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} micro={micro} />
      {micro ? (
        <MicroScene state={state} names={names} />
      ) : (
        <group>
          {MACRO_PART_IDS.map((id) => {
            const defs = sp[id] ?? base[id];
            if (!defs || !visible(id)) return null;
            return (
              <SpleenPart key={id} id={id}>
                <PartMeshes defs={defs} tex={tex} />
                <Streams id={id} state={state} />
                <PartLabel id={id} names={names} hide={hideLabels} />
              </SpleenPart>
            );
          })}
        </group>
      )}
    </SpleenContext.Provider>
  );
}
