import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type Group, type Material } from 'three';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import type { CutKind } from '../../three/types';
import {
  CORTEX_IDS,
  CUTS,
  GROUP_OF,
  HEMI_SPREAD,
  INNER,
  LABEL_AT,
  MAIN_LABELS,
  MENINGES,
  OVERLAYS,
  OVERLAY_HOST,
  SIDED,
  SPREAD,
} from './anatomy';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface BrainControl {
  cut: boolean;
  kind: CutKind;
  /** Положение среза, мм по оси среза. */
  cutMm: number;
  /** Сглаженный разнос 0..1. */
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
  modes: Record<string, boolean>;
}

export const BrainContext = createContext<MutableRefObject<BrainControl> | null>(null);

const GHOST = 0.05;
const GLOW = new Color('#ffa77a');

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}
type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };
/** Исходные параметры материалов: не в userData, чтобы react-three-fiber не затирал их при перерисовке. */
const BASES = new WeakMap<Material, BaseProps>();

/** Плоскость разреза в координатах модели (мм): оставляем часть, где координата по оси не больше cutMm. */
export function cutPlane(kind: CutKind, mm: number, out: Plane): Plane {
  const axis = CUTS[kind as 'side' | 'fundus' | 'coronal']?.axis ?? 'x';
  const n = new Vector3(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
  return out.set(n, mm);
}

/**
 * Часть мозга: группа с разносом, подсветкой, призрачным режимом, скрытием и плоскостью разреза.
 * Меши с userData.explodeOnly видны только при разнесении (подложка «белого вещества» под корой).
 * Накладки (mode = overlay) — участки поверхности коры: видны при выборе или в режиме «Функциональные зоны».
 */
export function BrainPart({ id, side = 0, overlay = false, children }: { id: string; side?: -1 | 0 | 1; overlay?: boolean; children: ReactNode }) {
  const ref = useContext(BrainContext)!;
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const alpha = useRef(overlay ? 0 : 1);
  const interactive = useRef(true);
  const meshes = useRef<Mesh[]>([]);
  const mats = useRef<GlowMaterial[]>([]);
  const clipped = useRef(false);
  const grp = GROUP_OF[id];
  const active = selected === id || hovered === id || selected === grp || hovered === grp;
  const hot = hovered === id || hovered === grp;
  const activeRef = useRef(false);
  activeRef.current = active;

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const list: Mesh[] = [];
    const set = new Set<GlowMaterial>();
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      list.push(o);
      const m = o.material as GlowMaterial;
      if (!set.has(m)) {
        set.add(m);
        BASES.set(m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite });
        if (m.emissive && !(m.userData as { keepEmissive?: boolean }).keepEmissive) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = 0;
        }
      }
      // выбор мышью не должен попадать в срезанную половину, скрытые, призрачные и подложечные меши
      const original = o.raycast.bind(o);
      o.raycast = (raycaster, intersects) => {
        if (!interactive.current || !o.visible || (o.userData as { explodeOnly?: boolean }).explodeOnly) return;
        const start = intersects.length;
        original(raycaster, intersects);
        if (clipped.current) {
          for (let i = intersects.length - 1; i >= start; i--) if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
        }
      };
    });
    meshes.current = list;
    mats.current = [...set];
    invalidate();
  }, [invalidate, planes]);

  useEffect(() => {
    invalidate();
  });

  useFrame((_, dt) => {
    const g = group.current;
    const c = ref.current;
    if (!g) return;

    const vec = SIDED.has(id) ? [side * HEMI_SPREAD, 6, 0] : (SPREAD[id] ?? [0, 0, 0]);
    g.position.set(vec[0] * c.explode, vec[1] * c.explode, vec[2] * c.explode);

    const hiddenByUser = c.hidden.has(id);
    const sel = c.selected;
    const focus = sel !== null && (sel === id || sel === grp || !!OVERLAY_HOST[sel]?.includes(id));
    let target = 1;
    if (hiddenByUser) target = 0;
    else if (overlay) target = activeRef.current ? 1 : c.modes.zones && id !== 'cerebellar-vermis' ? 0.7 : 0;
    else if (MENINGES.has(id) && !(c.modes.meninges || focus)) target = 0;
    else if (c.explode > 0.05 && (id === 'arachnoid' || id === 'dura-mater')) target = 0;
    else if (c.isolate && sel !== null && !focus) target = GHOST;
    else if (c.modes.deep && CORTEX_IDS.has(id) && !focus) target = 0.1;

    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    g.visible = a > 0.012;
    interactive.current = !hiddenByUser && a > (overlay ? 0.3 : 0.5);

    // разрез: при разнесении не применяется
    const cutOn = c.cut && c.explode < 0.03;
    cutPlane(c.kind, c.cutMm, planes[0]);
    g.updateWorldMatrix(true, false);
    planes[0].applyMatrix4(g.matrixWorld);
    clipped.current = cutOn;

    for (const m of meshes.current) if ((m.userData as { explodeOnly?: boolean }).explodeOnly) m.visible = c.explode > 0.03;
    for (const m of mats.current) {
      const base = BASES.get(m);
      if (!base) continue;
      const transparent = base.transparent || a < 0.995;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      const solidify = focus && c.isolate && base.transparent && !overlay ? Math.min(0.9, base.opacity * 2.4 + 0.06) : base.opacity;
      m.opacity = solidify * a;
      m.depthWrite = base.depthWrite && a > 0.9;
      m.clippingPlanes = cutOn ? planes : null;
      if (m.emissive && !(m.userData as { keepEmissive?: boolean }).keepEmissive) m.emissiveIntensity = activeRef.current && a > 0.5 ? (hot ? 0.3 : 0.16) : 0;
    }
  });

  return (
    <group ref={group} {...handlers}>
      {children}
    </group>
  );
}

/** Подпись части: плашка с названием; прячется вместе с частью, в призрачном режиме и за срезом. */
export function PartLabel({ id, names, side = 1 }: { id: string; names: Record<string, string>; side?: -1 | 1 }) {
  const ref = useContext(BrainContext)!;
  const { selected } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp || !!OVERLAY_HOST[selected]?.includes(id);
  if (c.hidden.has(id) || (c.isolate && !focus)) return null;
  if (MENINGES.has(id) && !(c.modes.meninges || selected === id || selected === grp)) return null;
  if (c.cut && c.explode < 0.03) {
    const axis = CUTS[c.kind as 'side' | 'fundus' | 'coronal']?.axis ?? 'x';
    const v = axis === 'x' ? at[0] * side : axis === 'y' ? at[1] : at[2];
    if (v > c.cutMm) return null;
  }
  const pos: [number, number, number] = [at[0] * side, at[1], at[2]];
  const main = MAIN_LABELS.has(id) || selected === grp;
  return <Label at={pos} partId={id} text={names[id]} labels={c.labels && main && !(OVERLAYS.has(id) && !c.modes.zones && selected !== grp)} inner={INNER.has(id) || id === 'cerebellar-vermis'} />;
}
