import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type BufferGeometry, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { CUTS, GROUP_OF, GROUP_SPREAD, INNER_LABELS, LABEL_AT, MAIN_LABELS, NO_CLIP, PART_SPREAD, SOLID_ON_CUT } from './anatomy';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface EarControl {
  cut: boolean;
  kind: CutKind;
  /** Положение плоскости среза вдоль её оси, мм. */
  cutV: number;
  /** Сглаженный разнос 0..1. */
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  /** Части, скрытые режимом («Только лабиринт»). */
  modeHidden: ReadonlySet<string>;
  labels: boolean;
}

export const EarContext = createContext<MutableRefObject<EarControl> | null>(null);

const GHOST = 0.05;
const GLOW = new Color('#ffa77a');

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}
type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };
interface MeshData {
  noPick?: boolean;
}

/** Плоскость среза в системе модели: оставляем точки с n·p + const ≥ 0. */
export function cutPlane(kind: CutKind, v: number, into = new Plane()): Plane {
  const c = CUTS[kind];
  const n = new Vector3(c.ax[0] * c.sign, c.ax[1] * c.sign, c.ax[2] * c.sign);
  return into.set(n, -c.sign * v);
}

/**
 * Часть модели: группа с разносом, подсветкой, «призрачным» режимом, скрытием и плоскостью разреза.
 * Кость на разрезе становится плотной, изнанка слоёв красится цветом среза.
 */
export function EarPart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(EarContext)!;
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
  const solid = SOLID_ON_CUT.has(id);
  const spread = useMemo(() => {
    const g = GROUP_SPREAD[grp] ?? [0, 0, 0];
    const p = PART_SPREAD[id] ?? [0, 0, 0];
    return [g[0] + p[0], g[1] + p[1], g[2] + p[2]] as const;
  }, [grp, id]);

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
      // выбор мышью не должен попадать в обрезанную половину, скрытые и призрачные части
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
      g.position.set(spread[0] * e, spread[1] * e, spread[2] * e);
    }

    const hiddenByUser = c.hidden.has(id) || c.modeHidden.has(id);
    const focus = c.selected !== null && (c.selected === id || c.selected === grp);
    const target = hiddenByUser ? 0 : c.isolate && c.selected !== null && !focus ? GHOST : 1;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    g.visible = a > 0.012;
    interactive.current = !hiddenByUser && a > 0.5;

    const cutOn = c.cut && !noClip;
    const key = [cutOn ? c.kind : '-', cutOn ? Math.round(c.cutV * 20) : 0, c.isolate ? 1 : 0, active ? 1 : 0, hot ? 1 : 0, hiddenByUser ? 1 : 0, focus ? 1 : 0, Math.round(a * 250), Math.round(e * 60)].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (cutOn) {
      g.updateWorldMatrix(true, false);
      planes[0].copy(cutPlane(c.kind, c.cutV, local)).applyMatrix4(g.matrixWorld);
    }

    for (const m of mats.current) {
      const base = (m.userData as { base?: BaseProps }).base;
      if (!base) continue;
      const dense = cutOn && solid;
      const baseOpacity = dense ? 1 : base.opacity;
      const baseTransparent = dense ? false : base.transparent;
      const transparent = baseTransparent || a < 0.995;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      const solidify = focus && c.isolate && baseTransparent ? Math.min(0.9, baseOpacity * 2.4 + 0.06) : baseOpacity;
      m.opacity = solidify * a;
      m.depthWrite = dense || (base.depthWrite && a > 0.9);
      m.clippingPlanes = cutOn ? planes : null;
      if (m.emissive) {
        const eb = (m.userData as { emissiveBase?: Color }).emissiveBase;
        const ib = (m.userData as { emissiveIntensityBase?: number }).emissiveIntensityBase ?? 0;
        if (active && a > 0.5) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = hot ? 0.32 : 0.16;
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
  const ref = useContext(EarContext)!;
  const { selected } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at || hide) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || c.modeHidden.has(id) || (c.isolate && !focus)) return null;
  if (c.cut && !NO_CLIP.has(id)) {
    const k = CUTS[c.kind];
    const side = k.sign * (k.ax[0] * at[0] + k.ax[1] * at[1] + k.ax[2] * at[2] - c.cutV);
    if (side < -0.6) return null;
  }
  return <Label at={at} partId={id} text={names[id]} labels={c.labels && (MAIN_LABELS.has(id) || selected === grp || selected === id)} inner={INNER_LABELS.has(id)} />;
}

export function disposeGeos(list: BufferGeometry[]): void {
  list.forEach((g) => g.dispose());
}
