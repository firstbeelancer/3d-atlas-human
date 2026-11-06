import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { CUT_Z, GROUP_OF, INNER_LABELS, LABEL_AT, MAIN_LABELS, SPREAD } from './parts';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface EyeControl {
  cut: boolean;
  kind: CutKind;
  /** Сглаженный разнос 0..1. */
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
}

export const EyeContext = createContext<MutableRefObject<EyeControl> | null>(null);

const SIDE_PLANE = new Plane(new Vector3(0, -1, 0), 0);
const FUNDUS_PLANE = new Plane(new Vector3(0, 0, -1), CUT_Z);
const GHOST = 0.05;
const GLOW = new Color('#ffa77a');

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

/**
 * Часть глаза: группа с разносом, подсветкой, «призрачным» режимом, скрытием и плоскостью разреза.
 * Меши с userData.cap = 'side' | 'fundus' — срезы: показываются только в своём режиме разреза и не обрезаются.
 */
export function EyePart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(EyeContext)!;
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const meshes = useRef<Mesh[]>([]);
  const mats = useRef<GlowMaterial[]>([]);
  const clipped = useRef<boolean | null>(null);

  const grp = GROUP_OF[id];
  const groupSelected = !!grp && selected === grp;
  const active = selected === id || hovered === id || groupSelected || (!!grp && hovered === grp);
  const hot = hovered === id || (!!grp && hovered === grp);

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
        (m.userData as { base?: BaseProps }).base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        if (m.emissive) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = 0;
        }
      }
      // выбор мышью не должен попадать в обрезанную половину и в скрытые или призрачные части
      const original = o.raycast.bind(o);
      o.raycast = (raycaster, intersects) => {
        if (!interactive.current || !o.visible) return;
        const start = intersects.length;
        original(raycaster, intersects);
        if (clipped.current) {
          for (let i = intersects.length - 1; i >= start; i--) {
            if (!(o.userData as { cap?: string }).cap && planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
          }
        }
      };
    });
    meshes.current = list;
    mats.current = [...set];
    invalidate();
  }, [invalidate, planes]);

  // любое изменение выбора и подсветки — повод перерисовать кадр, даже на паузе
  useEffect(() => {
    invalidate();
  });

  useFrame((_, dt) => {
    const g = group.current;
    const c = ref.current;
    if (!g) return;

    const sp = SPREAD[id];
    g.position.set(0, 0, (sp?.dz ?? 0) * c.explode);
    g.scale.setScalar(1 + (sp?.k ?? 0) * c.explode);

    const hiddenByUser = c.hidden.has(id);
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

    const plane = c.kind === 'side' ? SIDE_PLANE : FUNDUS_PLANE;
    g.updateWorldMatrix(true, false);
    planes[0].copy(plane).applyMatrix4(g.matrixWorld);
    clipped.current = c.cut;

    for (const m of meshes.current) {
      const cap = (m.userData as { cap?: CutKind }).cap;
      if (cap) m.visible = c.cut && cap === c.kind;
    }
    for (const m of mats.current) {
      const base = (m.userData as { base?: BaseProps }).base;
      if (!base) continue;
      const transparent = base.transparent || a < 0.995;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      // у выбранной прозрачной части (хрусталик, роговица) плотность выше, чтобы её было хорошо видно
      const solidify = focus && c.isolate && base.transparent ? Math.min(0.9, base.opacity * 2.4 + 0.06) : base.opacity;
      m.opacity = solidify * a;
      m.depthWrite = base.depthWrite && a > 0.9;
      if (!(m.userData as { noClip?: boolean }).noClip) m.clippingPlanes = c.cut ? planes : null;
      if (m.emissive) m.emissiveIntensity = active && a > 0.5 ? (hot ? 0.3 : 0.15) : 0;
    }
  });

  return (
    <group ref={group} {...handlers}>
      {children}
    </group>
  );
}

/** Подпись части: плашка с названием; прячется вместе с частью и в призрачном режиме. */
export function PartLabel({ id, names }: { id: string; names: Record<string, string> }) {
  const ref = useContext(EyeContext)!;
  const { selected } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || (c.isolate && !focus)) return null;
  // часть, срезанная разрезом, не подписываем
  if (c.cut && (c.kind === 'fundus' ? at[2] > CUT_Z : at[1] > 0.5)) return null;
  return <Label at={at} partId={id} text={names[id]} labels={c.labels && (MAIN_LABELS.has(id) || selected === grp)} inner={INNER_LABELS.has(id) || at[2] < 0} />;
}
