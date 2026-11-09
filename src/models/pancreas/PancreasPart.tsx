import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { cutPlane } from './anatomy';
import { GROUP_OF, INNER_LABELS, LABEL_AT, MAIN_LABELS, MICRO_MAIN_LABELS, SPREAD } from './parts';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface PancControl {
  cut: boolean;
  kind: CutKind;
  /** Положение среза 0..1. */
  cutT: number;
  /** Сглаженный разнос 0..1. */
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
  /** Секрет железы 0..1 (цикл «обед»). */
  secretion: number;
}

export const PancContext = createContext<MutableRefObject<PancControl> | null>(null);

const GHOST = 0.05;
const GLOW = new Color('#ffa77a');

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}
type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

const toPlane = (kind: CutKind, t: number, out: Plane): Plane => {
  const p = cutPlane(kind, t);
  return out.set(new Vector3(...p.n), p.c);
};

/**
 * Часть модели: группа с разносом, подсветкой, «призрачным» режимом, скрытием и плоскостью разреза.
 * Срез режет всё, что видно в макромодели: железу, протоки, сосуды и соседние органы — как на настоящем срезе.
 */
export function PancPart({ id, children, micro = false }: { id: string; children: ReactNode; micro?: boolean }) {
  const ref = useContext(PancContext)!;
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const base = useMemo(() => new Plane(), []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const mats = useRef<GlowMaterial[]>([]);

  const grp = GROUP_OF[id];
  const groupSelected = !!grp && selected === grp;
  const active = selected === id || hovered === id || groupSelected || (!!grp && hovered === grp);
  const hot = hovered === id || (!!grp && hovered === grp);

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
      // выбор мышью не должен попадать в срезанную половину, скрытые и призрачные части
      const original = o.raycast.bind(o);
      o.raycast = (raycaster, intersects) => {
        if (!interactive.current || !o.visible || (o.userData as { noPick?: boolean }).noPick) return;
        const start = intersects.length;
        original(raycaster, intersects);
        if (ref.current.cut && !micro) {
          for (let i = intersects.length - 1; i >= start; i--) {
            if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
          }
        }
      };
    });
    mats.current = [...set];
    invalidate();
  }, [invalidate, planes, ref, micro]);

  useEffect(() => {
    invalidate();
  });

  const lastKey = useRef('');
  const lastE = useRef(-1);

  useFrame((_, dt) => {
    const g = group.current;
    const c = ref.current;
    if (!g) return;

    const e = micro ? 0 : c.explode;
    if (Math.abs(e - lastE.current) > 0.0005 || lastE.current < 0) {
      lastE.current = e;
      const d = SPREAD[id] ?? [0, 0, 0];
      g.position.set(d[0] * e, d[1] * e, d[2] * e);
    }

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

    const cutOn = c.cut && !micro;

    // материалы и срезы трогаем только когда что-то реально изменилось
    const key = [
      cutOn ? c.kind : '-',
      cutOn ? Math.round(c.cutT * 600) : 0,
      c.isolate ? 1 : 0,
      active ? 1 : 0,
      hot ? 1 : 0,
      hiddenByUser ? 1 : 0,
      focus ? 1 : 0,
      Math.round(a * 250),
      Math.round(e * 60),
    ].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (cutOn) {
      g.updateWorldMatrix(true, false);
      planes[0].copy(toPlane(c.kind, c.cutT, base)).applyMatrix4(g.matrixWorld);
    }

    for (const m of mats.current) {
      const b = (m.userData as { base?: BaseProps }).base;
      if (!b) continue;
      const transparent = b.transparent || a < 0.995;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      const solidify = focus && c.isolate && b.transparent ? Math.min(0.9, b.opacity * 2.4 + 0.06) : b.opacity;
      m.opacity = solidify * a;
      m.depthWrite = b.depthWrite && a > 0.9;
      // у микро-частей свои плоскости (окно в ацинусе, срез островка) — их не трогаем
      if (!micro) {
        const had = m.clippingPlanes !== null;
        m.clippingPlanes = cutOn ? planes : null;
        if (had !== cutOn) m.needsUpdate = true;
      }
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
export function PartLabel({ id, names, hide, micro = false, at: atOverride }: { id: string; names: Record<string, string>; hide?: boolean; micro?: boolean; at?: [number, number, number] }) {
  const ref = useContext(PancContext)!;
  const { selected } = useSelection();
  const at = atOverride ?? LABEL_AT[id];
  const c = ref.current;
  if (!at || hide) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || (c.isolate && !focus)) return null;
  if (c.cut && !micro) {
    const p = cutPlane(c.kind, c.cutT);
    if (p.n[0] * at[0] + p.n[1] * at[1] + p.n[2] * at[2] + p.c < -0.2) return null;
  }
  const main = micro ? MICRO_MAIN_LABELS.has(id) : MAIN_LABELS.has(id);
  return <Label at={at} partId={id} text={names[id]} labels={c.labels && (main || selected === grp || selected === id)} inner={micro || INNER_LABELS.has(id)} />;
}
