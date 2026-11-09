import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Mesh, Plane, Vector3, type BufferGeometry, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { AXIAL_S, GB_CENTER, SIDE_CUT, axialNormalUnit, gbAxis } from './anatomy';
import { GROUP_OF, INNER_LABELS, LABEL_AT, MAIN_LABELS, NO_CLIP, SPREAD } from './parts';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface GbControl {
  cut: boolean;
  kind: CutKind;
  /** Сглаженный разнос 0..1. */
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
  /** Сокращение пузыря 0..1 (после жирной еды). */
  squeeze: number;
}

export const GbContext = createContext<MutableRefObject<GbControl> | null>(null);

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
  pickProxy?: BufferGeometry;
}

const sideLen = Math.hypot(SIDE_CUT.nx, SIDE_CUT.ny, SIDE_CUT.nz);
const SIDE_PLANE = new Plane(new Vector3(SIDE_CUT.nx, SIDE_CUT.ny, SIDE_CUT.nz).divideScalar(sideLen), SIDE_CUT.c / sideLen);
const AXIAL_PLANE = (() => {
  const n = new Vector3(...axialNormalUnit());
  const p = new Vector3(...gbAxis(AXIAL_S));
  // оставляем то, что «позади» плоскости (со стороны дна), срезаем сторону камеры
  return new Plane(n.clone().negate(), n.dot(p));
})();

/**
 * Часть модели: группа с разносом, подсветкой, «призрачным» режимом, скрытием и плоскостью разреза.
 * Разрез действует только на части самого пузыря; протоки, сосуды и соседи остаются целыми.
 */
export function GbPart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(GbContext)!;
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const meshes = useRef<Mesh[]>([]);
  const mats = useRef<GlowMaterial[]>([]);

  const grp = GROUP_OF[id];
  const groupSelected = !!grp && selected === grp;
  const active = selected === id || hovered === id || groupSelected || (!!grp && hovered === grp);
  const hot = hovered === id || (!!grp && hovered === grp);
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
        if (m.userData.emissiveIntensityBase === undefined) m.userData.emissiveIntensityBase = m.emissiveIntensity ?? 0;
      }
      // выбор мышью не должен попадать в обрезанную половину, скрытые и призрачные части;
      // большие оболочки пересекаем лучом по лёгкой прокси-геометрии
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
      const sp = SPREAD[id];
      const d = sp?.d ?? [0, 0, 0];
      const k = (sp?.k ?? 0) * e;
      // масштаб вокруг центра пузыря: слои расходятся от него, как скорлупы
      g.scale.setScalar(1 + k);
      g.position.set(d[0] * e - GB_CENTER[0] * k, d[1] * e - GB_CENTER[1] * k, d[2] * e - GB_CENTER[2] * k);
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

    const cutOn = c.cut && !noClip;

    // материалы и срезы трогаем только когда что-то реально изменилось
    const key = [
      cutOn ? c.kind : '-',
      c.isolate ? 1 : 0,
      active ? 1 : 0,
      hot ? 1 : 0,
      hiddenByUser ? 1 : 0,
      focus ? 1 : 0,
      Math.round(a * 250),
      Math.round(c.explode * 60),
      cutOn ? Math.round(c.squeeze * 60) : 0,
    ].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (cutOn) {
      g.updateWorldMatrix(true, false);
      planes[0].copy(c.kind === 'side' ? SIDE_PLANE : AXIAL_PLANE).applyMatrix4(g.matrixWorld);
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

const planeVec = new Vector3();
const axialP = new Vector3(...gbAxis(AXIAL_S));
const axialN = new Vector3(...axialNormalUnit());

/** Подпись части: плашка с названием; прячется вместе с частью, в призрачном режиме и на срезанной стороне. */
export function PartLabel({ id, names, hide }: { id: string; names: Record<string, string>; hide?: boolean }) {
  const ref = useContext(GbContext)!;
  const { selected } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at || hide) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || (c.isolate && !focus)) return null;
  if (c.cut && !NO_CLIP.has(id)) {
    if (c.kind === 'side' && SIDE_CUT.ny * at[1] + SIDE_CUT.nz * at[2] < -SIDE_CUT.c - 0.45) return null;
    if (c.kind === 'fundus' && axialN.dot(planeVec.set(at[0], at[1], at[2]).sub(axialP)) > 0.4) return null;
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
