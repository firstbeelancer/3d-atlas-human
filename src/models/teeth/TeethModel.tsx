import { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { DoubleSide, type BufferGeometry } from 'three';
import type { ModelProps } from '../../three/types';
import { Label } from '../../three/Label';
import { useIsActive, useSelection } from '../../three/selection';
import { teethText } from '../../content/ru/teeth-model';
import { crownSurface, rootSurface, TYPES, DIMENSIONS, type ToothKind } from './geometry';
import { LAYER_IDS, TEETH_PART_IDS, type LayerId } from './parts';

interface Mat {
  color: string;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transparent?: boolean;
  opacity?: number;
}

const MATERIALS: Record<LayerId, Mat> = {
  enamel: { color: '#fbf3dc', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 },
  dentin: { color: '#e9c98f', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.3 },
  pulp: { color: '#c8506a', roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3, transparent: true, opacity: 0.94 },
  cementum: { color: '#d6b985', roughness: 0.62, clearcoat: 0.1, clearcoatRoughness: 0.4 },
  canal: { color: '#a83a4e', roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 },
};

/** Сдвиг слоёв поперёк разреза, чтобы на срезе читались границы тканей. */
const CUT_STEP: Record<LayerId, number> = { enamel: 0, dentin: 0.05, pulp: 0.105, cementum: 0, canal: 0.105 };
/** На сколько разъезжаются слои при «Разобрать на части». */
const EXPLODE_STEP: Record<LayerId, number> = { enamel: 0, dentin: 0.3, pulp: 0.6, cementum: 0, canal: 0.3 };

const SPACING = 1.8;
const isLayer = (id: string): id is LayerId => (LAYER_IDS as readonly string[]).includes(id);

/** Точка привязки подписи/пlashки слоя на конкретном зубе. */
function layerAnchor(kind: ToothKind, id: LayerId): [number, number, number] {
  const s = DIMENSIONS[kind];
  const root = s.roots[s.roots.length - 1];
  switch (id) {
    case 'enamel':
      return [s.w * 0.62, s.crownH * 0.86, 0.06];
    case 'dentin':
      return [s.w * 0.34, s.crownH * 0.66, 0.06];
    case 'pulp':
      return [0, s.crownH * 0.42, 0.06];
    case 'cementum':
      return [root.dx, -root.len * 0.42, root.dz + 0.06];
    case 'canal':
      return [root.dx, -root.len * 0.78, root.dz + 0.06];
  }
}

/** Меш одного слоя: наведение показывает подсказку, клик выбирает часть. */
function PartMesh({
  partId,
  geometry,
  z,
  state,
}: {
  partId: string;
  geometry: BufferGeometry;
  z: number;
  state: ModelProps['state'];
}) {
  const { select, hover, selected } = useSelection();
  const active = useIsActive(partId);
  if (state.hidden?.has(partId)) return null;
  const ghost = state.isolate === true && selected !== null && selected !== partId;
  const m = isLayer(partId) ? MATERIALS[partId] : MATERIALS.dentin;
  return (
    <mesh
      geometry={geometry}
      position={[0, 0, z]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select(selected === partId ? null : partId);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hover(partId);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hover(null);
        document.body.style.cursor = '';
      }}
    >
      <meshPhysicalMaterial
        key={ghost ? 'ghost' : 'solid'}
        color={m.color}
        side={DoubleSide}
        roughness={m.roughness}
        clearcoat={m.clearcoat}
        clearcoatRoughness={m.clearcoatRoughness}
        transparent={m.transparent === true || ghost}
        opacity={ghost ? 0.07 : (m.opacity ?? 1)}
        depthWrite={!ghost}
        emissive={active ? '#ff9a6a' : '#000000'}
        emissiveIntensity={active ? 0.35 : 0}
      />
    </mesh>
  );
}

/** Всплывающая подсказка при наведении на часть (не при выборе — тогда открывается карточка). */
function HoverTip({
  partId,
  at,
  names,
}: {
  partId: string;
  at: [number, number, number];
  names?: Record<string, string>;
}) {
  const { hovered, selected } = useSelection();
  if (hovered !== partId || selected) return null;
  const tip = teethText.tips[partId];
  if (!tip) return null;
  return (
    <Html center position={at} zIndexRange={[45, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      <div
        style={{
          background: 'rgba(250,247,240,0.96)',
          border: '1px solid #d9cebd',
          borderRadius: 12,
          padding: '5px 10px',
          fontSize: 12,
          color: '#352e27',
          boxShadow: '0 6px 18px -10px rgba(23,32,58,0.45)',
        }}
      >
        <strong>{names?.[partId] ?? partId}</strong>
        <span style={{ color: '#6b5d4b' }}> — {tip}</span>
      </div>
    </Html>
  );
}

function Tooth({
  kind,
  index,
  state,
  names,
}: {
  kind: ToothKind;
  index: number;
  state: ModelProps['state'];
  names?: Record<string, string>;
}) {
  const { selected, isolate } = useSelection();
  const cut = state.cutaway;
  const geoms = useMemo(() => {
    const s = DIMENSIONS[kind];
    const crownH = s.crownH;
    return {
      enamel: crownSurface(kind, { cut }),
      dentin: crownSurface(kind, {
        s: 0.9, topScale: 0.97, topDrop: crownH * 0.055, floor: 0.01,
        cut, sectors: 96, ringsTop: 56, ringsSide: 30,
      }),
      pulp: crownSurface(kind, {
        s: 0.55, topScale: 0.85, topDrop: crownH * 0.12, floor: 0.06,
        cut, sectors: 64, ringsTop: 40, ringsSide: 22,
      }),
      cementum: s.roots.map((_, i) => rootSurface(kind, i, { cut, top: 0.1 })),
      rootDentin: s.roots.map((_, i) => rootSurface(kind, i, { rScale: 0.86, cut, sectors: 64, rings: 44 })),
      canal: s.roots.map((_, i) => rootSurface(kind, i, { rScale: 0.3, top: 0.12, cut, sectors: 40, rings: 36 })),
    };
  }, [kind, cut]);
  useEffect(
    () => () => {
      geoms.enamel.dispose();
      geoms.dentin.dispose();
      geoms.pulp.dispose();
      [...geoms.cementum, ...geoms.rootDentin, ...geoms.canal].forEach((g) => g.dispose());
    },
    [geoms],
  );

  // режим «рассмотреть отдельно»: либо один зуб целиком, либо один слой у всех зубов
  if (isolate && selected && !isLayer(selected) && selected !== kind) return null;
  const showLayer = (id: LayerId) => !(isolate && selected && isLayer(selected) && selected !== id);

  const e = state.explode ?? 0;
  const x = (index - (TYPES.length - 1) / 2) * SPACING * (1 + 0.22 * e);
  const zOf = (id: LayerId) => (cut ? CUT_STEP[id] : 0) + e * EXPLODE_STEP[id];
  const crownH = DIMENSIONS[kind].crownH;

  return (
    <group position={[x, 0.15, 0]}>
      {showLayer('enamel') && <PartMesh partId="enamel" geometry={geoms.enamel} z={zOf('enamel')} state={state} />}
      {showLayer('dentin') && (
        <>
          <PartMesh partId="dentin" geometry={geoms.dentin} z={zOf('dentin')} state={state} />
          {geoms.rootDentin.map((g, i) => (
            <PartMesh key={i} partId="dentin" geometry={g} z={zOf('dentin')} state={state} />
          ))}
        </>
      )}
      {showLayer('pulp') && <PartMesh partId="pulp" geometry={geoms.pulp} z={zOf('pulp')} state={state} />}
      {showLayer('cementum') &&
        geoms.cementum.map((g, i) => <PartMesh key={i} partId="cementum" geometry={g} z={zOf('cementum')} state={state} />)}
      {showLayer('canal') &&
        geoms.canal.map((g, i) => <PartMesh key={i} partId="canal" geometry={g} z={zOf('canal')} state={state} />)}

      <Label at={[0, crownH + 0.42, 0]} partId={kind} text={names?.[kind]} labels={state.labels} />
      {cut &&
        kind === 'molar' &&
        LAYER_IDS.map((id) => (
          <Label key={id} at={layerAnchor(kind, id)} partId={id} text={names?.[id]} labels={state.labels} inner />
        ))}
      {TEETH_PART_IDS.map((id) => (
        <HoverTip
          key={id}
          partId={id}
          at={id === kind ? [0, crownH + 0.24, 0] : layerAnchor(kind, id as LayerId)}
          names={names}
        />
      ))}
    </group>
  );
}

export default function TeethModel({ state, names }: ModelProps) {
  return (
    <group rotation={[0.07, -0.1, 0]}>
      {TYPES.map((kind, i) => (
        <Tooth key={kind} kind={kind} index={i} state={state} names={names} />
      ))}
      {state.cutaway && (
        <Html center position={[0, -2.05, 0]} zIndexRange={[35, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
              fontSize: 11,
              color: '#574938',
              background: 'rgba(250,247,240,0.95)',
              padding: '7px 12px',
              borderRadius: 12,
              border: '1px solid #d9cebd',
            }}
          >
            {LAYER_IDS.map((id) => (
              <span key={id} style={{ whiteSpace: 'nowrap' }}>
                <i
                  style={{
                    display: 'inline-block',
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: MATERIALS[id].color,
                    marginRight: 5,
                    border: '1px solid rgba(0,0,0,0.15)',
                  }}
                />
                {names?.[id] ?? id}
              </span>
            ))}
          </div>
        </Html>
      )}
    </group>
  );
}
