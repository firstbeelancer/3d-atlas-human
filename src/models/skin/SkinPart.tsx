import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Matrix4, Mesh, Plane, Vector3, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { ARRECTOR, GOOSE_ANGLE, PIVOT, cutPlane } from './anatomy';
import { GROUP_OF, INNER_LABELS, LABEL_AT, MAIN_LABELS, ROCKING, SPREAD, XRAY_SHELL } from './parts';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface SkinControl {
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
  /** Сокращение мышцы, поднимающей волос, 0..1 («мурашки»). */
  goose: number;
}

export const SkinContext = createContext<MutableRefObject<SkinControl> | null>(null);

const GHOST = 0.05;
const GLOW = new Color('#ffb28a');

const pivot = new Vector3(...PIVOT);

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}
type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

const rotM = new Matrix4();
const tmpA = new Matrix4();

/** Матрица «мурашек» для части: фолликул жёстко поворачивается, мышца растягивается между неподвижным и подвижным концом. */
function gooseMatrix(id: string, g: number, out: Matrix4): Matrix4 {
  out.identity();
  if (g < 0.001) return out;
  const th = GOOSE_ANGLE * g;
  if (id === 'arrector-pili') {
    const A = new Vector3(ARRECTOR.to[0], ARRECTOR.to[1], 0);
    const B = new Vector3(ARRECTOR.from[0], ARRECTOR.from[1], 0);
    const Bp = B.clone().sub(pivot).applyAxisAngle(new Vector3(0, 0, 1), th).add(pivot);
    const v0 = B.clone().sub(A);
    const v1 = Bp.clone().sub(A);
    const alpha = Math.atan2(v1.y, v1.x) - Math.atan2(v0.y, v0.x);
    const s = v1.length() / v0.length();
    tmpA.makeTranslation(A.x, A.y, 0);
    out.copy(tmpA);
    out.multiply(rotM.makeRotationZ(alpha));
    out.multiply(rotM.makeScale(s, s, 1 + 0.6 * (1 - s)));
    out.multiply(rotM.makeTranslation(-A.x, -A.y, 0));
    return out;
  }
  if (ROCKING.has(id)) {
    out.makeTranslation(pivot.x, pivot.y, 0);
    out.multiply(rotM.makeRotationZ(th));
    out.multiply(rotM.makeTranslation(-pivot.x, -pivot.y, 0));
  }
  return out;
}

/**
  Часть модели: группа с разносом, подсветкой, «призрачным» режимом, скрытием, плоскостью разреза и «мурашками».
  Срез режет всё, что видно в сцене: ткани, сосуды и железы — как на настоящем гистологическом срезе.
*/
export function SkinPart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(SkinContext)!;
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
        if (ref.current.cut) {
          for (let i = intersects.length - 1; i >= start; i--) {
            if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
          }
        }
      };
    });
    mats.current = [...set];
    lastKey.current = '';
    invalidate();
  }, [invalidate, planes, ref]);

  useEffect(() => {
    invalidate();
  });

  const lastKey = useRef('');
  const lastE = useRef(-1);
  const lastGoose = useRef(-1);

  useFrame((_, dt) => {
    const g = group.current;
    const c = ref.current;
    if (!g) return;

    const e = c.explode;
    const gs = Math.round(c.goose * 400) / 400;
    if (Math.abs(e - lastE.current) > 0.0005 || lastE.current < 0 || gs !== lastGoose.current) {
      lastE.current = e;
      lastGoose.current = gs;
      const dd = SPREAD[id] ?? [0, 0, 0];
      mat.makeTranslation(dd[0] * e, dd[1] * e, dd[2] * e).multiply(gooseMatrix(id, gs, new Matrix4()));
      g.matrix.copy(mat);
      g.matrixWorldNeedsUpdate = true;
    }

    const focus = c.selected !== null && (c.selected === id || c.selected === grp);
    const hiddenByUser = c.hidden.has(id) || (isolate && !focus);
    const xr = c.xray && XRAY_SHELL.has(id) && !focus ? 0.14 : 1;
    const target = hiddenByUser ? 0 : c.isolate && c.selected !== null && !focus ? GHOST : xr;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    g.visible = a > 0.012;
    interactive.current = !hiddenByUser && a > 0.5;

    const cutOn = c.cut;

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
      gs,
      c.xray ? 1 : 0,
    ].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (cutOn) {
      g.updateWorldMatrix(true, false);
      const p = cutPlane(c.kind, c.cutT);
      planes[0].copy(base.set(new Vector3(...p.n), p.c)).applyMatrix4(g.matrixWorld);
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
export function PartLabel({ id, names, hide }: { id: string; names: Record<string, string>; hide?: boolean }) {
  const ref = useContext(SkinContext)!;
  const { selected, isolate } = useSelection();
  const at = LABEL_AT[id];
  const c = ref.current;
  if (!at || hide) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || ((c.isolate || isolate) && !focus)) return null;
  if (c.cut) {
    const p = cutPlane(c.kind, c.cutT);
    if (p.n[0] * at[0] + p.n[1] * at[1] + p.n[2] * at[2] + p.c < -0.2) return null;
  }
  const main = MAIN_LABELS.has(id);
  return <Label at={at} partId={id} text={names[id]} labels={c.labels && (main || selected === grp || selected === id)} inner={INNER_LABELS.has(id)} />;
}
