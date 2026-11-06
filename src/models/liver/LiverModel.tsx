import { use, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Vector3, type Group } from 'three';
import type { ModelProps, StageState } from '../../three/types';
import { Tissue, usePart, type TissueKind } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import type { Entity, LiverGeometry } from './build';
import {
  EXPLODE,
  INNER_PARTS,
  LOBE_IDS,
  LOBULE_PARTS,
  GROUP_OF,
  SEGMENT_COLORS,
  SEGMENT_IDS,
  SEGMENT_PARTS,
  isolatedSet,
  type SegmentId,
  type Vec,
} from './anatomy';
import { loadLiverGeometry } from './loader';
import { LobuleScene } from './LobuleScene';

/** Части, подписанные при включённых подписях в обычном виде (остальные — только при наведении и выборе). */
const LABELED = new Set([
  'right-lobe',
  'left-lobe',
  'gallbladder',
  'falciform-ligament',
  'inferior-vena-cava',
  'portal-vein',
  'round-ligament',
  'common-bile-duct',
  'coronary-ligament',
]);

const OTHER_PARTS = [
  'gallbladder',
  'cystic-duct',
  'hepatic-ducts',
  'common-bile-duct',
  'portal-vein',
  'hepatic-artery',
  'hepatic-veins',
  'inferior-vena-cava',
  'falciform-ligament',
  'round-ligament',
  'venous-ligament',
  'coronary-ligament',
];

const MEMBRANE_OPACITY: Record<string, number> = { 'falciform-ligament': 0.82, 'coronary-ligament': 0.82 };

interface PieceProps {
  entity: Entity;
  /** Что выбирается кликом (у сегментов и долей — их id). */
  partId: string;
  /** Идентификаторы, при выборе или наведении на которые часть подсвечивается. */
  ids: string[];
  explode: MutableRefObject<number>;
  vec: Vec;
  color?: string;
  opacity?: number;
  children?: ReactNode;
}

function Piece({ entity, partId, ids, explode, vec, color, opacity, children }: PieceProps) {
  const { handlers } = usePart(partId);
  const { selected, hovered } = useSelection();
  const active = ids.some((i) => i === selected || i === hovered);
  const group = useRef<Group>(null);
  useFrame(() => group.current?.position.set(vec[0] * explode.current, vec[1] * explode.current, vec[2] * explode.current));
  const passive = entity.kind === 'shell' || entity.id === 'gallbladder-lumen';
  return (
    <group ref={group}>
      <mesh geometry={entity.geometry} dispose={null} {...(passive ? { raycast: () => null } : handlers)}>
        <Tissue
          kind={entity.kind as TissueKind}
          active={active && !passive}
          opacity={opacity ?? MEMBRANE_OPACITY[entity.id]}
          vertexColors={!!entity.geometry.attributes.color}
          color={color}
        />
      </mesh>
      {children}
    </group>
  );
}

function centreOf(e: Entity): Vector3 {
  const box = e.geometry.boundingBox ?? new Box3().setFromBufferAttribute(e.geometry.attributes.position as never);
  return box.getCenter(new Vector3());
}

function Organ({ geo, state, names }: { geo: LiverGeometry; state: StageState; names: Record<string, string> }) {
  const { selected, isolate } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const segMode = !!state.modes.segments || (selected !== null && SEGMENT_PARTS.has(selected));
  const ghost = !!state.modes.inside || (selected !== null && INNER_PARTS.has(selected));
  const explodeOn = !!state.modes.explode;
  const set = useMemo(() => (isolate && selected ? isolatedSet(selected) : null), [isolate, selected]);
  const show = (id: string) => !set || set.has(id);

  const byId = useMemo(() => new Map(geo.entities.map((e) => [e.id, e])), [geo]);
  const vectors = useMemo(() => {
    const out = new Map<string, Vec>();
    for (const e of geo.entities) {
      if (e.kind === 'liver') {
        const c = centreOf(e);
        out.set(e.id, [(c.x + 0.3) * 0.8, c.y * 0.8, (c.z + 0.1) * 0.8]);
      } else out.set(e.id, EXPLODE[e.id] ?? [0, 0, 0]);
    }
    out.set('gallbladder-lumen', EXPLODE.gallbladder);
    return out;
  }, [geo]);

  // подгонка кадра под рассматриваемую часть
  const fit = useMemo(() => {
    const box = new Box3();
    if (set) {
      for (const e of geo.entities) if (set.has(e.id) && e.geometry.boundingBox) box.union(e.geometry.boundingBox);
    }
    if (!set || box.isEmpty()) return { s: explodeOn ? 0.72 : 1.1, c: new Vector3(0, 0, 0) };
    const radius = Math.max(box.getSize(new Vector3()).length() / 2, 0.45);
    return { s: Math.min(6, 4.7 / radius), c: box.getCenter(new Vector3()) };
  }, [geo, set, explodeOn]);

  const ex = useRef(0);
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const turn = useRef(0);
  const TAU = Math.PI * 2;

  useFrame((_, dt) => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    const exTarget = explodeOn && !set ? 1 : 0;
    ex.current += (exTarget - ex.current) * k;
    const s = o.scale.x + (fit.s - o.scale.x) * k;
    o.scale.setScalar(s);
    i.position.x += (-fit.c.x - i.position.x) * k;
    i.position.y += (-fit.c.y - i.position.y) * k;
    i.position.z += (-fit.c.z - i.position.z) * k;
    if (set) {
      if (!state.paused) turn.current += Math.min(dt, 0.1) * 0.5;
    } else {
      turn.current -= Math.round(turn.current / TAU) * TAU;
      turn.current *= 1 - k;
    }
    o.rotation.y = turn.current;
    const settling =
      Math.abs(exTarget - ex.current) > 0.002 ||
      Math.abs(fit.s - s) > 0.002 ||
      Math.abs(fit.c.x + i.position.x) + Math.abs(fit.c.y + i.position.y) + Math.abs(fit.c.z + i.position.z) > 0.004 ||
      (!set && Math.abs(turn.current) > 0.002);
    if (settling) invalidate();
  });

  const label = (id: string, on: boolean) => {
    const at = geo.anchors[id];
    return at ? <Label labels={on} partId={id} text={names[id]} at={at} /> : null;
  };

  const parenchyma: readonly string[] = ghost && !explodeOn ? [] : segMode ? SEGMENT_IDS : LOBE_IDS;
  const opacity = ghost ? 0.2 : undefined;

  return (
    <group ref={outer} scale={fit.s}>
      <group ref={inner}>
        {ghost && !explodeOn && !set && byId.get('shell') && (
          <Piece entity={byId.get('shell')!} partId="shell" ids={[]} explode={ex} vec={[0, 0, 0]} />
        )}
        {parenchyma.map((id) => {
          const e = byId.get(id);
          if (!e || !show(id)) return null;
          const isSeg = segMode;
          return (
            <Piece
              key={id}
              entity={e}
              partId={id}
              ids={isSeg ? [id, 'g-segments'] : [id, 'g-lobes']}
              explode={ex}
              vec={vectors.get(id)!}
              opacity={opacity}
              color={isSeg ? SEGMENT_COLORS[id as SegmentId] : undefined}
            >
              {label(id, state.labels)}
            </Piece>
          );
        })}
        {OTHER_PARTS.map((id) => {
          const e = byId.get(id);
          if (!e || !show(id)) return null;
          const group = GROUP_OF[id];
          return (
            <Piece key={id} entity={e} partId={id} ids={[id, group]} explode={ex} vec={vectors.get(id)!} opacity={id === 'gallbladder' && ghost ? 0.4 : undefined}>
              {label(id, state.labels && (LABELED.has(id) || (ghost && (id === 'hepatic-veins' || id === 'hepatic-artery'))))}
            </Piece>
          );
        })}
        {ghost && show('gallbladder') && byId.get('gallbladder-lumen') && (
          <Piece entity={byId.get('gallbladder-lumen')!} partId="gallbladder" ids={[]} explode={ex} vec={vectors.get('gallbladder-lumen')!} />
        )}
      </group>
    </group>
  );
}

export default function LiverModel({ state, names = {} }: ModelProps) {
  const geo = use(loadLiverGeometry());
  const { selected } = useSelection();
  const lobule = !!state.modes.lobule || (selected !== null && LOBULE_PARTS.has(selected));
  return lobule ? <LobuleScene state={state} names={names} /> : <Organ geo={geo} state={state} names={names} />;
}
