import { use, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Box3, Vector3, type BufferAttribute, type BufferGeometry, type Group } from 'three';
import type { ModelProps, StageState } from '../../three/types';
import { Tissue, type TissueKind } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import type { Entity, EntityKind, StomachGeometry } from './build';
import { CUT_PARTS, EXPLODE, GLAND_PARTS, GROUPS, LAYER_IDS, LAYER_PARTS, WALL_PARTS, ZONES, isolatedSet, type Vec } from './anatomy';
import { loadStomachGeometry } from './loader';
import { GlandScene } from './GlandScene';
import { WallMaterial, type WallKind } from './WallMaterial';
import { sAt } from './shape';

/** Центр модели: сюда смотрит камера. */
const TARGET = new Vector3(-0.5, 0.7, 0);

/** Подписи в обычном виде (остальное — при наведении и выборе). */
const LABELED = ['fundus', 'body', 'cardia', 'antrum', 'pylorus', 'duodenum', 'esophagus', 'lesser-curvature', 'greater-curvature', 'left-gastric-artery', 'gastroepiploic-arteries', 'vagus-nerves', 'lesser-omentum', 'greater-omentum'];
const INSIDE_LABELED = ['rugae', 'gastric-canal', 'pyloric-sphincter', 'mucosa'];

/** Отдел по месту попадания на стенку: s — длина дуги, v — угол обхода. */
const REGIONS = ['fundus', 'body', 'antrum', 'pyloric-canal', 'pylorus', 'duodenum'] as const;
function regionAt(s: number, v: number): string {
  const c = ZONES.cardia.zone;
  const dv = Math.abs(((v - (c.v ?? 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (s >= sAt(c.k0) && s < sAt(c.k1) && dv < c.dv) return 'cardia';
  for (const id of REGIONS) {
    const z = ZONES[id].zone;
    if (s >= sAt(z.k0) && s < sAt(z.k1)) return id;
  }
  return 'duodenum';
}

const TISSUE_OF: Partial<Record<EntityKind, TissueKind>> = {
  esophagus: 'esophagus',
  cut: 'cut',
  omentum: 'omentum',
  'lesser-omentum': 'lesserOmentum',
  artery: 'artery',
  vein: 'vein',
  nerve: 'nerve',
};

interface PieceProps {
  entity: Entity;
  partId: string;
  ids: string[];
  explode: MutableRefObject<number>;
  vec: Vec;
  children?: ReactNode;
}

/** Невидимая лёгкая сетка: принимает наведение и клики вместо тяжёлой видимой стенки. */
function Pick({ geometry, handlers }: { geometry: BufferGeometry; handlers: object }) {
  return (
    <mesh geometry={geometry} dispose={null} {...handlers}>
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  );
}

/** Часть, не связанная с отделами стенки: пищевод, сосуды, нервы, сальники. */
function Piece({ entity, partId, ids, explode, vec, children }: PieceProps) {
  const { select, hover, selected, hovered } = useSelection();
  const active = ids.some((i) => i === selected || i === hovered);
  const group = useRef<Group>(null);
  useFrame(() => group.current?.position.set(vec[0] * explode.current, vec[1] * explode.current, vec[2] * explode.current));
  const passive = entity.kind === 'cut';
  const kind = TISSUE_OF[entity.kind] ?? 'cut';
  const handlers = passive
    ? { raycast: () => null }
    : {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          select(partId);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          hover(partId);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          hover(null);
          document.body.style.cursor = '';
        },
      };
  return (
    <group ref={group}>
      <mesh geometry={entity.geometry} dispose={null} {...handlers}>
        <Tissue kind={kind} active={active && !passive} vertexColors={!!entity.geometry.attributes.color && (kind === 'esophagus' || kind === 'cut')} />
      </mesh>
      {children}
    </group>
  );
}

function Organ({ geo, state, names }: { geo: StomachGeometry; state: StageState; names: Record<string, string> }) {
  const { selected, hovered, isolate, select, hover } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const sel = selected ?? '';
  const layered = !!state.modes.layers || LAYER_PARTS.has(sel);
  const cut = !layered && (state.cutaway || CUT_PARTS.has(sel));
  const explodeOn = !!state.modes.explode;
  const set = useMemo(() => (isolate && selected ? isolatedSet(selected) : null), [isolate, selected]);
  const show = (id: string) => !set || set.has(id);
  const wallVisible = !set || [...set].some((id) => WALL_PARTS.has(id));

  const byId = useMemo(() => new Map(geo.entities.map((e) => [e.id, e])), [geo]);

  const fit = useMemo(() => {
    const box = new Box3();
    if (set) {
      const ids = [...set];
      for (const id of ids) {
        const e = byId.get(id);
        if (e?.geometry.boundingBox) box.union(e.geometry.boundingBox);
      }
      if (ids.some((id) => WALL_PARTS.has(id))) box.union(byId.get('wall-closed')!.geometry.boundingBox!);
    }
    if (!set || box.isEmpty()) return { s: explodeOn ? 0.78 : 1.0, c: TARGET.clone() };
    const radius = Math.max(box.getSize(new Vector3()).length() / 2, 0.8);
    return { s: Math.min(3.4, 5.6 / radius), c: box.getCenter(new Vector3()) };
  }, [byId, set, explodeOn]);

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

  const act = (...ids: string[]) => ids.some((i) => i === selected || i === hovered);
  const zone = [hovered, selected].find((id) => id && ZONES[id]) ?? null;
  const regionActive = act('g-regions', 'g-landmarks');

  /* клик и наведение на стенку: выбирается отдел (или слой — в режиме препаровки) по месту попадания */
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>, layerId?: string): string => {
    if (layerId) return layerId;
    const sv = e.object && (e.object as unknown as { geometry: { attributes: { aSV?: BufferAttribute } } }).geometry.attributes.aSV;
    if (!sv || !e.face) return 'body';
    return regionAt(sv.getX(e.face.a), sv.getY(e.face.a));
  };
  const wallHandlers = (layerId?: string) => ({
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      select(pick(e, layerId));
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      hover(pick(e, layerId));
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      hover(null);
      document.body.style.cursor = '';
    },
  });

  const label = (id: string, on: boolean, inside = false, key?: string) => {
    const at = geo.anchors[key ?? id];
    return at ? <Label key={id} labels={on} partId={id} text={names[id]} at={at} inner={inside} /> : null;
  };

  const layerKinds: WallKind[] = ['serosa', 'muscle-longitudinal', 'muscle-circular', 'muscle-oblique', 'submucosa'];
  const ent = (id: string) => byId.get(id)!;
  const vessels = ['left-gastric-artery', 'right-gastric-artery', 'gastroepiploic-arteries', 'short-gastric-arteries', 'gastric-veins'];
  const others = ['vagus-nerves', ...vessels, 'lesser-omentum', 'greater-omentum'];
  const mucosaActive = act('mucosa', 'rugae', 'g-inside', 'g-wall');
  const ghost = !!(set && !wallVisible);

  return (
    <group position={TARGET} ref={outer} scale={fit.s}>
      <group ref={inner} position={[-TARGET.x, -TARGET.y, -TARGET.z]}>
        {wallVisible && (
          <>
            {layered ? (
              <>
                {layerKinds.map((k, i) => (
                  <group key={k}>
                    <mesh geometry={ent(`layer-${i}`).geometry} dispose={null} raycast={() => null}>
                      <WallMaterial kind={k} active={act(LAYER_IDS[i], 'g-wall')} />
                    </mesh>
                    <Pick geometry={ent(`pick-layer-${i}`).geometry} handlers={wallHandlers(LAYER_IDS[i])} />
                  </group>
                ))}
                <mesh geometry={ent('layer-mucosa').geometry} dispose={null} raycast={() => null}>
                  <WallMaterial kind="mucosa" active={act('mucosa', 'g-wall')} />
                </mesh>
                <Pick geometry={ent('pick-mucosa').geometry} handlers={wallHandlers('mucosa')} />
                <mesh geometry={ent('cut-layers').geometry} dispose={null} raycast={() => null}>
                  <Tissue kind="cut" vertexColors />
                </mesh>
              </>
            ) : cut ? (
              <>
                <mesh geometry={ent('wall-cut').geometry} dispose={null} raycast={() => null}>
                  <WallMaterial kind="serosa" zone={zone} active={regionActive} />
                </mesh>
                <Pick geometry={ent('pick-cut').geometry} handlers={wallHandlers()} />
                <mesh geometry={ent('lumen-cut').geometry} dispose={null} raycast={() => null}>
                  <WallMaterial kind="mucosa" zone={zone} active={mucosaActive || regionActive} />
                </mesh>
                <mesh geometry={ent('cut-window').geometry} dispose={null} raycast={() => null}>
                  <Tissue kind="cut" vertexColors />
                </mesh>
              </>
            ) : (
              <>
                <mesh geometry={ent('wall-closed').geometry} dispose={null} raycast={() => null}>
                  <WallMaterial kind="serosa" zone={zone} active={regionActive} opacity={ghost ? 0.2 : undefined} />
                </mesh>
                <Pick geometry={ent('pick-closed').geometry} handlers={wallHandlers()} />
              </>
            )}
            {layered
              ? [...LAYER_IDS].map((id) => label(id, state.labels, false, `layer:${id}`))
              : cut
                ? INSIDE_LABELED.map((id) => label(id, state.labels, true))
                : null}
            {!layered && ['fundus', 'body', 'cardia', 'antrum', 'pylorus', 'duodenum', 'lesser-curvature', 'greater-curvature'].map((id) => label(id, state.labels))}
            {(['pyloric-canal', 'angular-notch', 'cardiac-notch'] as const).map((id) => label(id, false))}
          </>
        )}

        {show('esophagus') && (
          <Piece entity={ent('esophagus')} partId="esophagus" ids={['esophagus', 'g-neighbors']} explode={ex} vec={EXPLODE.esophagus}>
            <mesh geometry={ent('esophagus-lumen').geometry} dispose={null} raycast={() => null}>
              <Tissue kind="esophagus" vertexColors />
            </mesh>
            <mesh geometry={ent('esophagus-cut').geometry} dispose={null} raycast={() => null}>
              <Tissue kind="cut" vertexColors />
            </mesh>
            {label('esophagus', state.labels)}
          </Piece>
        )}

        {others.map((id) => {
          const e = byId.get(id);
          if (!e || !show(id)) return null;
          const group = (Object.entries(GROUPS).find(([, ids]) => (ids as readonly string[]).includes(id)) ?? ['', []])[0];
          const showLabel = state.labels && LABELED.includes(id);
          return (
            <Piece key={id} entity={e} partId={id} ids={[id, group]} explode={ex} vec={EXPLODE[id] ?? [0, 0, 0]}>
              {label(id, showLabel)}
            </Piece>
          );
        })}
      </group>
    </group>
  );
}

export default function StomachModel({ state, names = {} }: ModelProps) {
  const geo = use(loadStomachGeometry());
  const { selected } = useSelection();
  const gland = !!state.modes.gland || (selected !== null && GLAND_PARTS.has(selected));
  return gland ? <GlandScene state={state} names={names} /> : <Organ geo={geo} state={state} names={names} />;
}
