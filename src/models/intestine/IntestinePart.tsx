import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type BufferGeometry, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import {
  CUT_Y,
  CUT_Y_OF,
  CUT_Z,
  CUT_Z_OF,
  GLOW_ALSO,
  GROUP_OF,
  INNER_LABELS,
  LABEL_AT,
  MAIN_LABELS,
  NO_CLIP,
  PART_SPREAD,
  SEG_SPREAD,
  type SegmentId,
} from './parts';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface IntestineControl {
  cut: boolean;
  kind: CutKind;
  /** Сглаженный разнос 0..1. */
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
}

export const IntestineContext = createContext<MutableRefObject<IntestineControl> | null>(null);

const GHOST = 0.05;
const GLOW = new Color('#ffa77a');

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

interface MeshData {
  seg?: SegmentId;
  inner?: boolean;
  noPick?: boolean;
  hideOnExplode?: boolean;
  pickProxy?: BufferGeometry;
}

/**
 * Часть кишечника: группа с разносом, подсветкой, «призрачным» режимом, скрытием и плоскостью разреза.
 * Меши с userData.seg едут вместе со своим отделом при разносе.
 * Меши с userData.inner (слои стенки, содержимое) показываются только на разрезе, при разносе и когда выбрана часть.
 * Меши с userData.noPick не принимают клики (тонкие оболочки поверх стенки).
 */
export function IntestinePart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(IntestineContext)!;
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const sidePlane = useMemo(() => new Plane(new Vector3(0, 0, -1), CUT_Z_OF[id] ?? CUT_Z), [id]);
  const axialPlane = useMemo(() => new Plane(new Vector3(0, -1, 0), CUT_Y_OF[id] ?? CUT_Y), [id]);
  const planes = useMemo(() => [new Plane()], []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const meshes = useRef<Mesh[]>([]);
  const mats = useRef<GlowMaterial[]>([]);

  const grp = GROUP_OF[id];
  const also = (key: string | null) => !!key && !!GLOW_ALSO[key]?.includes(id);
  const groupSelected = !!grp && selected === grp;
  const active = selected === id || hovered === id || groupSelected || (!!grp && hovered === grp) || also(selected) || also(hovered);
  const hot = hovered === id || (!!grp && hovered === grp) || also(hovered);
  const noClip = NO_CLIP.has(id);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const list: Mesh[] = [];
    const set = new Set<GlowMaterial>();
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      list.push(o);
      const m = o.material as GlowMaterial;
      if (m && !set.has(m)) {
        set.add(m);
        (m.userData as { base?: BaseProps }).base = m.userData.base ?? { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        if (m.emissive && !m.userData.emissiveBase) m.userData.emissiveBase = m.emissive.clone();
      }
      // выбор мышью не должен попадать в обрезанную половину, скрытые и призрачные части;
      // большие оболочки пересекаем лучом по лёгкой прокси-геометрии — полная сетка на каждое движение мыши это главный лаг
      const original = o.raycast.bind(o);
      const data = o.userData as MeshData;
      o.raycast = (raycaster, intersects) => {
        if (!interactive.current || !o.visible || data.noPick) return;
        const start = intersects.length;
        if (data.pickProxy) {
          const real = o.geometry;
          o.geometry = data.pickProxy;
          original(raycaster, intersects);
          o.geometry = real;
        } else {
          original(raycaster, intersects);
        }
        if (ref.current.cut && !noClip) {
          for (let i = intersects.length - 1; i >= start; i--) {
            if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
          }
        }
      };
    });
    meshes.current = list;
    mats.current = [...set];
    invalidate();
  }, [invalidate, planes, ref, noClip]);

  useEffect(() => {
    invalidate();
  });

  const lastKey = useRef('');
  const lastE = useRef(-1);

  useFrame((_, dt) => {
    const g = group.current;
    const c = ref.current;
    if (!g) return;

    const e = c.explode;
    if (Math.abs(e - lastE.current) > 0.0005 || lastE.current < 0) {
      lastE.current = e;
      const d = PART_SPREAD[id];
      if (d) g.position.set(d[0] * e, d[1] * e, d[2] * e);
      for (const m of meshes.current) {
        const seg = (m.userData as MeshData).seg;
        const s = seg ? SEG_SPREAD[seg] : undefined;
        if (s) m.position.set(s[0] * e, s[1] * e, s[2] * e);
      }
    }

    const hiddenByUser = c.hidden.has(id);
    const focus = c.selected !== null && (c.selected === id || c.selected === grp || also(c.selected));
    const target = hiddenByUser ? 0 : c.isolate && c.selected !== null && !focus ? GHOST : 1;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    g.visible = a > 0.012;
    interactive.current = !hiddenByUser && a > 0.5;

    const cutOn = c.cut && c.explode <= 0.02;
    const innerOn = cutOn || c.explode > 0.02 || c.hidden.size > 0 || (c.selected !== null && c.isolate);

    // материалы и срезы трогаем только когда что-то реально изменилось
    const key = [
      cutOn ? c.kind : '-',
      innerOn ? 1 : 0,
      c.isolate ? 1 : 0,
      active ? 1 : 0,
      hot ? 1 : 0,
      hiddenByUser ? 1 : 0,
      focus ? 1 : 0,
      Math.round(a * 250),
      c.explode > 0.02 ? 1 : 0,
    ].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (cutOn) {
      g.updateWorldMatrix(true, false);
      planes[0].copy(c.kind === 'side' ? sidePlane : axialPlane).applyMatrix4(g.matrixWorld);
    }

    for (const m of meshes.current) {
      const data = m.userData as MeshData;
      if (data.inner) m.visible = innerOn;
      if (data.hideOnExplode) m.visible = m.visible && c.explode <= 0.02;
    }
    for (const m of mats.current) {
      const base = (m.userData as { base?: BaseProps }).base;
      if (!base) continue;
      const transparent = base.transparent || a < 0.995;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      const solidify = focus && c.isolate && base.transparent ? Math.min(0.9, base.opacity * 2.4 + 0.06) : base.opacity;
      m.opacity = solidify * a;
      m.depthWrite = base.depthWrite && a > 0.9;
      m.clippingPlanes = cutOn && !noClip ? planes : null;
      if (m.emissive) {
        const eb = (m.userData as { emissiveBase?: Color }).emissiveBase;
        if (active && a > 0.5) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = hot ? 0.3 : 0.15;
        } else {
          if (eb) m.emissive.copy(eb);
          m.emissiveIntensity = eb && eb.getHex() !== 0 ? 0.08 : 0;
        }
      }
    }
  });

  return (
    <group ref={group} {...handlers}>
      {children}
    </group>
  );
}

/** Подпись части: плашка с названием; прячется вместе с частью и в призрачном режиме. */
export function PartLabel({ id, names, hide }: { id: string; names: Record<string, string>; hide?: boolean }) {
  const ref = useContext(IntestineContext)!;
  const { selected } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at || hide) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || (c.isolate && !focus)) return null;
  if (c.cut && !NO_CLIP.has(id) && c.explode <= 0.02) {
    if (c.kind === 'side' && at[2] > (CUT_Z_OF[id] ?? CUT_Z) + 0.45) return null;
    if (c.kind === 'fundus' && at[1] > (CUT_Y_OF[id] ?? CUT_Y) + 0.45) return null;
  }
  return (
    <Label
      at={at}
      partId={id}
      text={names[id]}
      labels={c.labels && (MAIN_LABELS.has(id) || selected === grp || selected === id)}
      inner={INNER_LABELS.has(id)}
    />
  );
}
