import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Matrix4, Mesh, Plane, Vector3, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { cutPlane, type SceneId } from './anatomy';
import { GROUP_OF, INNER_LABELS, LABEL_AT, MAIN_LABELS, SPREAD, XRAY_SHELL } from './parts';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface TongueControl {
  scene: SceneId;
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
  xray: boolean;
}

export const TongueContext = createContext<MutableRefObject<TongueControl> | null>(null);

const GHOST = 0.05;
const GLOW = new Color('#ffb28a');

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}
type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

/** Плоскость среза сцены: в микросцене срез по средней плоскости включён всегда. */
export function activeCut(c: TongueControl): { n: [number, number, number]; c: number } | null {
  if (c.cut) return cutPlane(c.scene, c.kind, c.cutT);
  if (c.scene === 'bud') return cutPlane('bud', 'side', 0.5);
  return null;
}

/**
 * Часть модели: группа с разносом, подсветкой, «призрачным» режимом, скрытием и плоскостью разреза.
 * Срез режет всё, что видно в сцене: слизистую, мышцы, сосуды и нервы — как на настоящем срезе.
 */
export function TonguePart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(TongueContext)!;
  const { selected, hovered, isolate } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const base = useMemo(() => new Plane(), []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const mats = useRef<GlowMaterial[]>([]);
  const mat = useMemo(() => new Matrix4(), []);

  const grp = GROUP_OF[id];
  const groupSelected = !!grp && selected === grp;
  const active = selected === id || hovered === id || groupSelected || (!!grp && hovered === grp);
  const hot = hovered === id || (!!grp && hovered === grp);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.matrixAutoUpdate = false;
    const set = new Set<GlowMaterial>();
    const restore: (() => void)[] = [];
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
      const original = o.raycast;
      restore.push(() => { o.raycast = original; });
      o.raycast = (raycaster, intersects) => {
        if (!interactive.current || !o.visible || (o.userData as { noPick?: boolean }).noPick) return;
        const start = intersects.length;
        original.call(o, raycaster, intersects);
        if (activeCut(ref.current)) {
          for (let i = intersects.length - 1; i >= start; i--) {
            if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
          }
        }
      };
    });
    mats.current = [...set];
    lastKey.current = '';
    invalidate();
    return () => restore.forEach((reset) => reset());
  }, [invalidate, planes, ref]);

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
      const dd = SPREAD[id] ?? [0, 0, 0];
      mat.makeTranslation(dd[0] * e, dd[1] * e, dd[2] * e);
      g.matrix.copy(mat);
      g.matrixWorldNeedsUpdate = true;
    }

    const focus = c.selected !== null && (c.selected === id || c.selected === grp);
    const hiddenByUser = c.hidden.has(id) || (isolate && !focus);
    const xr = c.xray && XRAY_SHELL.has(id) && !focus ? 0.12 : 1;
    const target = hiddenByUser ? 0 : c.isolate && c.selected !== null && !focus ? GHOST : xr;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    g.visible = a > 0.012;
    interactive.current = !hiddenByUser && a > 0.5;

    const plane = activeCut(c);
    const cutOn = plane !== null;

    // материалы и срезы трогаем только когда что-то реально изменилось
    const key = [
      cutOn ? `${plane.n.join(',')}` : '-',
      cutOn ? Math.round(plane.c * 300) : 0,
      c.scene,
      c.isolate ? 1 : 0,
      active ? 1 : 0,
      hot ? 1 : 0,
      hiddenByUser ? 1 : 0,
      focus ? 1 : 0,
      Math.round(a * 250),
      Math.round(e * 60),
      c.xray ? 1 : 0,
    ].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (plane) {
      g.updateWorldMatrix(true, false);
      planes[0].copy(base.set(new Vector3(...plane.n), plane.c)).applyMatrix4(g.matrixWorld);
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
      const had = m.clippingPlanes !== null;
      m.clippingPlanes = cutOn ? planes : null;
      if (had !== cutOn) m.needsUpdate = true;
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
export function PartLabel({ id, names, hide, overview }: { id: string; names: Record<string, string>; hide?: boolean; overview: boolean }) {
  const ref = useContext(TongueContext)!;
  const { selected, isolate } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at || hide) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || ((c.isolate || isolate) && !focus)) return null;
  const p = activeCut(c);
  if (p) {
    if (p.n[0] * at[0] + p.n[1] * at[1] + p.n[2] * at[2] + p.c < -0.2) return null;
  }
  const main = MAIN_LABELS.has(id);
  return <Label at={at} partId={id} text={names[id]} labels={c.labels && (selected === id || (selected === null && overview && main))} inner={INNER_LABELS.has(id)} />;
}
