import type { ThreeEvent } from '@react-three/fiber';
import { DoubleSide } from 'three';
import { useIsActive, useSelection } from './selection';

/**
 * Анатомические «ткани» — цвета по традиции атласов, чтобы ребёнок привыкал к настоящим картинкам:
 * артерии красные, вены синие, нервы жёлтые, кость цвета слоновой кости.
 * Общий вид — матовый муляж с лёгким глянцем.
 */
export const TISSUE = {
  myocardium: { color: '#b4453b' },
  atrium: { color: '#a9443d' },
  artery: { color: '#c3362e' },
  vein: { color: '#3c5fae' },
  coronary: { color: '#d0463a' },
  muscle: { color: '#c0503f' },
  bone: { color: '#eadfc6', roughness: 0.68, clearcoat: 0.15 },
  nerve: { color: '#e2bd45' },
  fat: { color: '#e8c97a', roughness: 0.7 },
  valve: { color: '#f1ddd2', roughness: 0.6 },
  inner: { color: '#d9776b', roughness: 0.65 },
  membrane: { color: '#efb7a8', transparent: true, opacity: 0.32, depthWrite: false },
  cartilage: { color: '#cddfe4', roughness: 0.34, clearcoat: 0.6 },
  marrow: { color: '#a8352e', roughness: 0.62 },
  periosteum: { color: '#d98a74', transparent: true, opacity: 0.62, depthWrite: false },
  liver: { color: '#b45c48', roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.26, sheen: 0.7, sheenColor: '#ffb7a0' },
  shell: { color: '#c0674f', roughness: 0.35, transparent: true, opacity: 0.2, depthWrite: false },
  gallbladder: { color: '#548f4c', roughness: 0.3, clearcoat: 0.75, clearcoatRoughness: 0.2 },
  bile: { color: '#c4b238', roughness: 0.3, transparent: true, opacity: 0.88 },
  portal: { color: '#4b4fae' },
  duct: { color: '#4fb05c', roughness: 0.4 },
  ligament: { color: '#ecdfc6', roughness: 0.62, side: DoubleSide, clearcoat: 0.1 },
  hepatocyte: { color: '#dba392', roughness: 0.55 },
  sinusoid: { color: '#d63f3f', transparent: true, opacity: 0.5, depthWrite: false },
  kupffer: { color: '#7d2d3a', roughness: 0.5 },
  canaliculus: { color: '#58bd6c', roughness: 0.4 },
  glass: { color: '#cfe3ee', transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide },
} as const;

export type TissueKind = keyof typeof TISSUE;

const BASE = {
  roughness: 0.5,
  metalness: 0,
  clearcoat: 0.35,
  clearcoatRoughness: 0.45,
  sheen: 0.5,
  sheenRoughness: 0.5,
  sheenColor: '#ffd9cc',
};

export function Tissue({
  kind,
  active = false,
  opacity,
  vertexColors = false,
  color,
}: {
  kind: TissueKind;
  active?: boolean;
  opacity?: number;
  /** Умножать цвет ткани на цвет вершин (запечённое затенение углублений). */
  vertexColors?: boolean;
  /** Свой цвет вместо цвета ткани (раскраска сегментов). */
  color?: string;
}) {
  const t = TISSUE[kind];
  const extra = opacity !== undefined ? { transparent: true, opacity, depthWrite: opacity > 0.9 } : {};
  const transparent = opacity !== undefined || 'transparent' in t;
  return (
    <meshPhysicalMaterial
      // смена прозрачности требует пересборки шейдера — пересоздаём материал
      key={`${transparent ? 'transparent' : 'opaque'}-${vertexColors ? 'vc' : 'plain'}`}
      vertexColors={vertexColors}
      {...BASE}
      {...t}
      {...(color ? { color } : {})}
      {...extra}
      emissive={active ? '#ff9a6a' : '#000000'}
      emissiveIntensity={active ? 0.32 : 0}
    />
  );
}

/** Обработчики наведения и клика для части органа + флаг активности для подсветки. */
export function usePart(partId: string) {
  const { select, hover } = useSelection();
  const active = useIsActive(partId);
  return {
    active,
    handlers: {
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
    },
  };
}
