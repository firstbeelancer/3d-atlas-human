import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, FrontSide, Mesh, Plane, Vector3, type Group, type Material, type Side } from 'three';
import type { CutKind } from '../../three/types';
import { Label } from '../../three/Label';
import { usePart } from '../../three/materials';
import { useSelection } from '../../three/selection';
import {
  BODY_LABEL_AT,
  BODY_MAIN_LABELS,
  BODY_SPREAD,
  CENTRAL_GROUP,
  NO_CLIP,
  PART_GROUPS,
  PITUITARY_LABEL_AT,
  PITUITARY_MAIN_LABELS,
  PITUITARY_SPREAD,
  RECEPTOR_LABEL_AT,
  RECEPTOR_MAIN_LABELS,
  RECEPTOR_SPREAD,
  XRAY_GHOST,
  cutPosition,
  cutsFor,
  type EndocrineView,
} from './anatomy';
import type { V3 } from './geoHelpers';

/** Состояние сцены, которое части читают каждый кадр без перерисовки React. */
export interface EndocrineControl {
  view: EndocrineView;
  cut: boolean;
  kind: CutKind;
  cutAt: number;
  explode: number;
  ghost: boolean;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
  xray: boolean;
}

export const EndocrineContext = createContext<MutableRefObject<EndocrineControl> | null>(null);

const GHOST_ALPHA = 0.07;
const XRAY_ALPHA = 0.16;
const GLOW = new Color('#ffae68');

interface BaseMat {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  side: Side;
}

type GlowMat = Material & { emissive?: Color; emissiveIntensity?: number };

const AXIS: Record<CutKind, Vector3> = {
  side: new Vector3(-1, 0, 0),
  fundus: new Vector3(0, -1, 0),
  coronal: new Vector3(0, 0, -1),
};

function spreadFor(view: EndocrineView, id: string): V3 {
  if (view === 'pituitary-axis') return PITUITARY_SPREAD[id] ?? [0, 0, 0];
  if (view === 'receptor') return RECEPTOR_SPREAD[id] ?? [0, 0, 0];
  return BODY_SPREAD[id] ?? [0, 0, 0];
}

/** Приглушает наружную оболочку, когда пользователь выбрал вложенную внутрь структуру. */
function smartContextAlpha(id: string, c: EndocrineControl): number | null {
  const sel = c.selected;
  if (c.view === 'body' || c.view === 'feedback') {
    if (id === 'body-landmarks' && sel && (PART_GROUPS[sel] === CENTRAL_GROUP || sel === CENTRAL_GROUP)) {
      return 0.08;
    }
    if ((id === 'thyroid-lobes' || id === 'thyroid-isthmus') && sel === 'parathyroid-glands') {
      return 0.22;
    }
    if (id === 'adrenal-cortex' && sel === 'adrenal-medulla') {
      return 0.18;
    }
    if (id === 'pancreas-parenchyma' && sel === 'islets-of-langerhans') {
      return 0.22;
    }
    if (c.view === 'feedback' && !sel && (id === 'body-landmarks' || id === 'ovaries' || id === 'testes' || id === 'thymus')) {
      return 0.32;
    }
  }
  if (c.view === 'pituitary-axis') {
    if (id === 'hypothalamus' && (sel === 'hypo-nuclei' || sel === 'hypo-tract')) return 0.20;
    if (id === 'hypothalamus' && !sel) return 0.54;
  }
  return null;
}

export function EndocrinePart({
  id,
  children,
  noPick = false,
}: {
  id: string;
  children: ReactNode;
  noPick?: boolean;
}) {
  const ref = useContext(EndocrineContext)!;
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const local = useMemo(() => new Plane(), []);
  const alpha = useRef(1);
  const interactive = useRef(!noPick);
  const mats = useRef<GlowMat[]>([]);

  const grp = PART_GROUPS[id];
  const active = selected === id || hovered === id || (!!grp && (selected === grp || hovered === grp));
  const hot = hovered === id || (!!grp && hovered === grp);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const seen = new Set<GlowMat>();
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as GlowMat;
      if (m && !seen.has(m)) {
        seen.add(m);
        (m.userData as { base?: BaseMat }).base = m.userData.base ?? {
          opacity: m.opacity,
          transparent: m.transparent,
          depthWrite: m.depthWrite,
          side: m.side,
        };
        if (m.emissive && !m.userData.emissiveBase) m.userData.emissiveBase = m.emissive.clone();
        if (m.userData.emissiveIntensityBase === undefined) m.userData.emissiveIntensityBase = m.emissiveIntensity ?? 0;
      }
      if (!o.userData.__endoRayPatched) {
        const original = o.raycast.bind(o);
        o.userData.__endoRayPatched = true;
        o.raycast = (raycaster, intersects) => {
          if (!interactive.current || !o.visible || o.userData.noPick) return;
          const start = intersects.length;
          original(raycaster, intersects);
          const c = ref.current;
          const clip = c.cut && !NO_CLIP.has(id);
          if (clip) {
            for (let i = intersects.length - 1; i >= start; i--) {
              if (planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
            }
          }
        };
      }
    });
    mats.current = [...seen];
    invalidate();
  }, [id, invalidate, planes, ref]);

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
      const d = spreadFor(c.view, id);
      g.position.set(d[0] * e, d[1] * e, d[2] * e);
    }

    const hiddenByUser = c.hidden.has(id) || (!!grp && c.hidden.has(grp));
    const focus = c.selected !== null && (c.selected === id || c.selected === grp);
    const isolatedOut = c.isolate && c.selected !== null && !focus;

    let target = 1;
    if (hiddenByUser || isolatedOut) target = 0;
    else if (c.ghost && c.selected !== null && !focus) {
      const smart = smartContextAlpha(id, c);
      target = smart !== null ? Math.min(smart, GHOST_ALPHA * 2.5) : GHOST_ALPHA;
    } else if (c.xray && XRAY_GHOST.has(id) && !focus) {
      target = XRAY_ALPHA;
    } else {
      const smart = smartContextAlpha(id, c);
      if (smart !== null && !focus) target = smart;
    }

    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else {
      alpha.current = target;
    }
    const a = alpha.current;
    g.visible = a > 0.012;
    interactive.current = !noPick && !hiddenByUser && !isolatedOut && a > 0.25;

    const clipOn = c.cut && !NO_CLIP.has(id);
    const key = [
      c.view,
      clipOn ? c.kind : '-',
      clipOn ? Math.round(c.cutAt * 500) : 0,
      c.ghost ? 1 : 0,
      c.xray ? 1 : 0,
      active ? 1 : 0,
      hot ? 1 : 0,
      focus ? 1 : 0,
      Math.round(a * 250),
      Math.round(c.explode * 60),
    ].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (clipOn) {
      g.updateWorldMatrix(true, false);
      const pos = cutPosition(c.view, c.kind, c.cutAt);
      local.set(AXIS[c.kind], pos);
      planes[0].copy(local).applyMatrix4(g.parent ? g.parent.matrixWorld : g.matrixWorld);
    }

    for (const m of mats.current) {
      const base = (m.userData as { base?: BaseMat }).base;
      if (!base) continue;
      const transparent = base.transparent || a < 0.995;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      const solidify = focus && base.transparent ? Math.min(0.88, base.opacity * 2.1 + 0.14) : base.opacity;
      m.opacity = solidify * a;
      m.depthWrite = base.depthWrite && a > 0.9;
      // для полупрозрачных замкнутых органов без среза рисуем только переднюю сторону — без артефактов наложения
      const desiredSide =
        clipOn || c.view === 'receptor' || base.transparent ? base.side : a < 0.995 ? FrontSide : base.side;
      if (m.side !== desiredSide) {
        m.side = desiredSide;
        m.needsUpdate = true;
      }
      m.clippingPlanes = clipOn ? planes : null;
      if (m.emissive) {
        const eb = m.userData.emissiveBase as Color | undefined;
        const ib = (m.userData.emissiveIntensityBase as number | undefined) ?? 0;
        if (active && a > 0.3) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = hot ? 0.34 : 0.20;
        } else {
          if (eb) m.emissive.copy(eb);
          m.emissiveIntensity = ib;
        }
      }
    }
  });

  return (
    <group ref={group} {...(noPick ? {} : handlers)}>
      {children}
    </group>
  );
}

/** Выносная подпись части: адаптируется под активную сцену, прячется при скрытии и на срезанной стороне. */
export function PartLabel({ id, names, hide }: { id: string; names: Record<string, string>; hide?: boolean }) {
  const ref = useContext(EndocrineContext)!;
  const { selected, isolate } = useSelection();
  const c = ref.current;
  if (hide) return null;

  const atMap =
    c.view === 'pituitary-axis'
      ? PITUITARY_LABEL_AT
      : c.view === 'receptor'
        ? RECEPTOR_LABEL_AT
        : BODY_LABEL_AT;
  const mainSet =
    c.view === 'pituitary-axis'
      ? PITUITARY_MAIN_LABELS
      : c.view === 'receptor'
        ? RECEPTOR_MAIN_LABELS
        : BODY_MAIN_LABELS;

  const at = atMap[id];
  if (!at) return null;

  const grp = PART_GROUPS[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || (grp && c.hidden.has(grp))) return null;
  if ((c.ghost || isolate) && !focus) return null;

  if (c.cut && !NO_CLIP.has(id)) {
    const pos = cutPosition(c.view, c.kind, c.cutAt);
    const axis = cutsFor(c.view)[c.kind].axis === 'x' ? 0 : cutsFor(c.view)[c.kind].axis === 'y' ? 1 : 2;
    if (at[axis] > pos + 0.15) return null;
  }

  return (
    <Label
      at={at}
      partId={id}
      text={names[id]}
      labels={c.labels && (mainSet.has(id) || selected === id || selected === grp)}
      inner
    />
  );
}
