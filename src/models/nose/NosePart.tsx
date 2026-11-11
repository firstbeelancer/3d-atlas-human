import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type BufferGeometry, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { CUTS, GROUP_OF, INNER_LABELS, LABEL_AT, MAIN_LABELS, NO_CLIP, SPREAD, XRAY_GHOST, cutPosition } from './anatomy';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface NoseControl {
  cut: boolean;
  kind: CutKind;
  /** Положение среза 0..1. */
  cutAt: number;
  /** Сглаженный разнос 0..1. */
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
  xray: boolean;
}

export const NoseContext = createContext<MutableRefObject<NoseControl> | null>(null);

const GHOST = 0.05;
const XRAY = 0.1;
const GLOW = new Color('#ffa77a');

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

interface MeshData {
  noPick?: boolean;
  pickProxy?: BufferGeometry;
}

const AXIS: Record<CutKind, Vector3> = {
  side: new Vector3(-1, 0, 0),
  fundus: new Vector3(0, -1, 0),
  coronal: new Vector3(0, 0, -1),
};

/** Плоскость среза в локальных мм: остаётся то, что по минусовую сторону оси. */
function localPlane(kind: CutKind, t: number, out: Plane): Plane {
  const pos = cutPosition(kind, t);
  return out.set(AXIS[kind], pos);
}

/**
 * Часть модели: группа с разносом, подсветкой, «призрачным» режимом, скрытием и плоскостью среза.
 * Лицо-ориентир срез не трогает.
 */
export function NosePart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(NoseContext)!;
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const local = useMemo(() => new Plane(), []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const mats = useRef<GlowMaterial[]>([]);

  const grp = GROUP_OF[id];
  const groupSelected = !!grp && selected === grp;
  const active = selected === id || hovered === id || groupSelected || (!!grp && hovered === grp);
  const hot = hovered === id || (!!grp && hovered === grp);
  const noClip = NO_CLIP.has(id);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const set = new Set<GlowMaterial>();
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as GlowMaterial;
      if (m && !set.has(m)) {
        set.add(m);
        (m.userData as { base?: BaseProps }).base = m.userData.base ?? { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        if (m.emissive && !m.userData.emissiveBase) m.userData.emissiveBase = m.emissive.clone();
        if (m.userData.emissiveIntensityBase === undefined) m.userData.emissiveIntensityBase = m.emissiveIntensity ?? 0;
      }
      const original = o.raycast.bind(o);
      const data = o.userData as MeshData;
      o.raycast = (raycaster, intersects) => {
        if (!interactive.current || !o.visible || data.noPick) return;
        const start = intersects.length;
        original(raycaster, intersects);
        if (ref.current.cut && !noClip) {
          for (let i = intersects.length - 1; i >= start; i--) {
            if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
          }
        }
      };
    });
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
      const d = SPREAD[id] ?? [0, 0, 0];
      g.position.set(d[0] * e, d[1] * e, d[2] * e);
    }

    const hiddenByUser = c.hidden.has(id);
    const focus = c.selected !== null && (c.selected === id || c.selected === grp);
    let target = 1;
    if (hiddenByUser) target = 0;
    else if (c.isolate && c.selected !== null && !focus) target = GHOST;
    else if (c.xray && XRAY_GHOST.has(id) && !focus) target = XRAY;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    g.visible = a > 0.012;
    interactive.current = !hiddenByUser && a > 0.5;

    const cutOn = c.cut && !noClip;

    const key = [
      cutOn ? c.kind : '-',
      cutOn ? Math.round(c.cutAt * 500) : 0,
      c.isolate ? 1 : 0,
      active ? 1 : 0,
      hot ? 1 : 0,
      hiddenByUser ? 1 : 0,
      focus ? 1 : 0,
      Math.round(a * 250),
      Math.round(c.explode * 60),
    ].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (cutOn) {
      g.updateWorldMatrix(true, false);
      // плоскость задана в мм родительской группы: переводим в мир через матрицу родителя
      planes[0].copy(localPlane(c.kind, c.cutAt, local)).applyMatrix4(g.parent ? g.parent.matrixWorld : g.matrixWorld);
    }

    for (const m of mats.current) {
      const base = (m.userData as { base?: BaseProps }).base;
      if (!base) continue;
      const transparent = base.transparent || a < 0.995;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      const solidify = focus && c.isolate && base.transparent ? Math.min(0.9, base.opacity * 2.2 + 0.08) : base.opacity;
      m.opacity = solidify * a;
      m.depthWrite = base.depthWrite && a > 0.9;
      m.clippingPlanes = cutOn ? planes : null;
      if (m.emissive) {
        const eb = (m.userData as { emissiveBase?: Color }).emissiveBase;
        const ib = (m.userData as { emissiveIntensityBase?: number }).emissiveIntensityBase ?? 0;
        if (active && a > 0.5) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = hot ? 0.3 : 0.15;
        } else {
          if (eb) m.emissive.copy(eb);
          m.emissiveIntensity = ib;
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

/** Подпись части: плашка с названием; прячется вместе с частью, в призрачном режиме и на срезанной стороне. */
export function PartLabel({ id, names, hide }: { id: string; names: Record<string, string>; hide?: boolean }) {
  const ref = useContext(NoseContext)!;
  const { selected } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at || hide) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || (c.isolate && !focus)) return null;
  if (c.cut && !NO_CLIP.has(id)) {
    const pos = cutPosition(c.kind, c.cutAt);
    const axis = CUTS[c.kind].axis === 'x' ? 0 : CUTS[c.kind].axis === 'y' ? 1 : 2;
    if (at[axis] > pos + 3) return null;
  }
  if (c.xray && XRAY_GHOST.has(id) && selected !== id && selected !== grp) return null;
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
