import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { CUT_Y, CUT_Z } from './geometry';
import { GROUP_OF, INNER_LABELS, LABEL_AT, MAIN_LABELS, SPREAD } from './parts';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface BladderControl {
  cut: boolean;
  kind: CutKind;
  /** Сглаженный разнос 0..1. */
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
  /** Текущий уровень мочи по y (для объёма мочи и её поверхности). */
  fillY: number;
  /** Доля наполнения 0..1 (струйки из устьев мочеточников сильнее при наполнении). */
  fill: number;
}

export const BladderContext = createContext<MutableRefObject<BladderControl> | null>(null);

const SIDE_PLANE = new Plane(new Vector3(0, 0, -1), CUT_Z);
const FUNDUS_PLANE = new Plane(new Vector3(0, -1, 0), CUT_Y);
const GHOST = 0.05;
const GLOW = new Color('#ffa77a');

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

/**
 * Часть пузыря: группа с разносом, подсветкой, «призрачным» режимом, скрытием и плоскостью разреза.
 * Меши с userData.cap = 'side' | 'fundus' — срезы стенки: показываются только в своём режиме разреза и не обрезаются.
 * Меши с userData.noPick не принимают клики (тонкие оболочки поверх стенки).
 */
export function BladderPart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(BladderContext)!;
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const fillPlane = useMemo(() => new Plane(new Vector3(0, -1, 0), 0), []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const meshes = useRef<Mesh[]>([]);
  const mats = useRef<GlowMaterial[]>([]);
  const fillMats = useRef<Set<GlowMaterial>>(new Set());

  const grp = GROUP_OF[id];
  const groupSelected = !!grp && selected === grp;
  const active = selected === id || hovered === id || groupSelected || (!!grp && hovered === grp);
  const hot = hovered === id || (!!grp && hovered === grp);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const list: Mesh[] = [];
    const set = new Set<GlowMaterial>();
    const fillSet = new Set<GlowMaterial>();
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      list.push(o);
      const m = o.material as GlowMaterial;
      if (m && (o.userData as { fillClip?: boolean }).fillClip) fillSet.add(m);
      if (m && !set.has(m)) {
        set.add(m);
        // The cap lies on the cut plane itself. Clipping it causes speckling at the rim.
        if (o.userData.cap) m.userData.noClip = true;
        (m.userData as { base?: BaseProps }).base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        if (m.emissive) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = 0;
        }
      }
      // выбор мышью не должен попадать в обрезанную половину, в скрытые, призрачные и служебные части;
      // большие оболочки пересекаем лучом по лёгкой прокси-геометрии — полная сетка на каждое движение мыши это главный лаг
      const original = o.raycast.bind(o);
      const proxy = (o.userData as { pickProxy?: import('three').BufferGeometry }).pickProxy;
      o.raycast = (raycaster, intersects) => {
        if (!interactive.current || !o.visible || (o.userData as { noPick?: boolean }).noPick) return;
        const start = intersects.length;
        if (proxy) {
          const real = o.geometry;
          o.geometry = proxy;
          original(raycaster, intersects);
          o.geometry = real;
        } else {
          original(raycaster, intersects);
        }
        if (ref.current.cut) {
          for (let i = intersects.length - 1; i >= start; i--) {
            if (!(o.userData as { cap?: string }).cap && planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
          }
        }
      };
    });
    meshes.current = list;
    mats.current = [...set];
    fillMats.current = fillSet;
    invalidate();
  }, [invalidate, planes]);

  useEffect(() => {
    invalidate();
  });

  const lastKey = useRef('');

  useFrame((_, dt) => {
    const g = group.current;
    const c = ref.current;
    if (!g) return;

    const sp = SPREAD[id];
    const d = sp?.d ?? [0, 0, 0];
    g.position.set(d[0] * c.explode, d[1] * c.explode, d[2] * c.explode);
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

    // материалы и срезы трогаем только когда что-то реально изменилось:
    // раньше каждый кадр переписывал свойства ~90 материалов и считал мировые матрицы всех частей
    const key = [
      c.cut ? c.kind : '-',
      c.isolate ? 1 : 0,
      active ? 1 : 0,
      hot ? 1 : 0,
      hiddenByUser ? 1 : 0,
      focus ? 1 : 0,
      Math.round(a * 250),
      Math.round(c.explode * 40),
      fillMats.current.size ? Math.round(c.fillY * 400) : 0,
    ].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    const plane = c.kind === 'side' ? SIDE_PLANE : FUNDUS_PLANE;
    if (c.cut) {
      g.updateWorldMatrix(true, false);
      planes[0].copy(plane).applyMatrix4(g.matrixWorld);
    }

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
      const solidify = focus && c.isolate && base.transparent ? Math.min(0.9, base.opacity * 2.4 + 0.06) : base.opacity;
      m.opacity = solidify * a;
      m.depthWrite = base.depthWrite && a > 0.9;
      if (!(m.userData as { noClip?: boolean }).noClip) {
        // объём мочи дополнительно обрезан сверху плоскостью уровня наполнения
        if (fillMats.current.has(m)) {
          fillPlane.constant = c.fillY;
          m.clippingPlanes = c.cut ? [planes[0], fillPlane] : [fillPlane];
        } else {
          m.clippingPlanes = c.cut ? planes : null;
        }
      }
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
  const ref = useContext(BladderContext)!;
  const { selected } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || (c.isolate && !focus)) return null;
  if (c.cut && (c.kind === 'fundus' ? at[1] > CUT_Y + 0.4 : at[2] > CUT_Z + 0.4)) return null;
  const inner = INNER_LABELS.has(id);
  const defaultLabel = MAIN_LABELS.has(id) && (!inner || c.cut);
  return <Label at={at} partId={id} text={names[id]} labels={c.labels && (defaultLabel || selected === grp || selected === id)} inner={inner} />;
}
