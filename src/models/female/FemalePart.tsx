import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshStandardMaterial, Plane, Vector3, type Group, type Material } from 'three';
import type { CutKind } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { CUTS } from './anatomy';
import { sliceSolid } from './geometry';
import type { CapKey } from './build';
import { GROUP_OF, INNER_LABELS, MAIN_LABELS, SPREAD, SPREAD_RADIAL, XRAY_IDS } from './parts';

/** Состояние, которым управляет пользователь; части читают его каждый кадр, не перерисовывая React. */
export interface FemaleControl {
  cut: boolean;
  kind: CutKind;
  /** Положение плоскости среза в мировых координатах (см). */
  cutV: number;
  explode: number;
  isolate: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  labels: boolean;
  xray: boolean;
}

export const FemaleContext = createContext<MutableRefObject<FemaleControl> | null>(null);

/** Связь с геометрией: где подпись части и куда сдвигается при разносе (считается при построении модели). */
export interface PartMeta {
  label: Record<string, [number, number, number]>;
  spread: Record<string, [number, number, number]>;
}
export const MetaContext = createContext<PartMeta>({ label: {}, spread: {} });

const PLANES: Record<CutKind, Plane> = {
  side: new Plane(new Vector3(0, 0, -1), 0),
  fundus: new Plane(new Vector3(0, -1, 0), 0),
  coronal: new Plane(new Vector3(-1, 0, 0), 0),
};
const GHOST = 0.05;
const XRAY = 0.2;
const GLOW = new Color('#ffa77a');

export const CAP_COLORS: Record<CapKey, string> = {
  myo: '#b8554d', cervix: '#d49a8e', endo: '#e3828a', tube: '#d8918a', ovary: '#e8c3ac', vagina: '#d98b86', fornix: '#cf7c7c',
  follicle: '#f0cf8c', fluid: '#d6e3ea', luteum: '#e5b62f', albicans: '#f1ead8', artery: '#b8322c', vein: '#3f5493', nerve: '#e2bd45',
  node: '#9bb15a', bladder: '#d6a68e', urethra: '#d9a592', ureter: '#e0b199', rectum: '#c98273', bone: '#eadfc6', cartilage: '#cddfe4',
  cord: '#e6d7bd', skin: '#e8b69f', erectile: '#c9606a', gland: '#e7c26a', fat: '#f3deb0',
};

interface BaseProps {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}
type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };

function capMaterial(key: CapKey, prio: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: CAP_COLORS[key], roughness: 0.78, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 - prio, polygonOffsetUnits: -1 - prio });
  m.userData.noClip = true;
  return m;
}

/** Положение вершин с учётом морф-цели (эндометрий): сечение должно совпадать с тем, что видно на экране. */
function currentPositions(mesh: Mesh): ArrayLike<number> {
  const g = mesh.geometry;
  const base = g.getAttribute('position').array as Float32Array;
  const targets = g.morphAttributes.position;
  const w = mesh.morphTargetInfluences?.[0] ?? 0;
  if (!targets || !targets.length || w < 1e-4) return base;
  const to = targets[0].array as Float32Array;
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = base[i] + (to[i] - base[i]) * w;
  return out;
}

/**
 * Часть модели: группа с разносом, подсветкой, призрачным режимом, скрытием и плоскостью разреза.
 * Меши с userData.solid — замкнутые тела: на разрезе для них строится заглушка сечения (cap) нужного цвета.
 * Меши с userData.noPick не принимают клики (тонкие оболочки поверх стенки).
 */
export function FemalePart({ id, children }: { id: string; children: ReactNode }) {
  const ref = useContext(FemaleContext)!;
  const meta = useContext(MetaContext);
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const planes = useMemo(() => [new Plane()], []);
  const alpha = useRef(1);
  const interactive = useRef(true);
  const meshes = useRef<Mesh[]>([]);
  const solids = useRef<Mesh[]>([]);
  const mats = useRef<GlowMaterial[]>([]);

  const grp = GROUP_OF[id];
  const groupSelected = !!grp && selected === grp;
  const active = selected === id || hovered === id || groupSelected || (!!grp && hovered === grp);
  const hot = hovered === id || (!!grp && hovered === grp);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const solidList: Mesh[] = [];
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      if (o.geometry.morphAttributes.position?.length) o.updateMorphTargets();
      const solid = (o.userData as { solid?: CapKey }).solid;
      if (solid && !(o.userData as { isCap?: boolean }).isCap) {
        const cap = new Mesh(new BufferGeometry(), capMaterial(solid, (o.userData as { prio?: number }).prio ?? 0));
        cap.userData = { isCap: true };
        cap.visible = false;
        cap.frustumCulled = false;
        cap.renderOrder = 1;
        o.add(cap);
        o.geometry.computeBoundingBox();
        solidList.push(o);
      }
    });
    const list: Mesh[] = [];
    const set = new Set<GlowMaterial>();
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      list.push(o);
      const m = o.material as GlowMaterial;
      if (m && !set.has(m)) {
        set.add(m);
        (m.userData as { base?: BaseProps }).base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        if (m.emissive) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = 0;
        }
      }
      const original = o.raycast.bind(o);
      const proxy = (o.userData as { pickProxy?: BufferGeometry }).pickProxy;
      o.raycast = (raycaster, intersects) => {
        if (!interactive.current || !o.visible || (o.userData as { noPick?: boolean }).noPick) return;
        const start = intersects.length;
        if (proxy) {
          const real = o.geometry;
          o.geometry = proxy;
          original(raycaster, intersects);
          o.geometry = real;
        } else original(raycaster, intersects);
        if (ref.current.cut) {
          const isCap = (o.userData as { isCap?: boolean }).isCap;
          for (let i = intersects.length - 1; i >= start; i--) {
            if (!isCap && planes[0].distanceToPoint(intersects[i].point) < -1e-4) intersects.splice(i, 1);
          }
        }
      };
    });
    meshes.current = list;
    solids.current = solidList;
    mats.current = [...set];
    invalidate();
    return () => {
      for (const s of solidList) {
        const cap = s.children.find((c) => (c.userData as { isCap?: boolean }).isCap) as Mesh | undefined;
        if (cap) {
          cap.geometry.dispose();
          (cap.material as Material).dispose();
          s.remove(cap);
        }
      }
    };
  }, [invalidate, planes, ref]);

  useEffect(() => {
    invalidate();
  });

  const lastKey = useRef('');
  const capKeys = useRef(new WeakMap<Mesh, string>());

  useFrame((_, dt) => {
    const g = group.current;
    const c = ref.current;
    if (!g) return;

    const sp = SPREAD[id]?.d ?? meta.spread[id] ?? [0, 0, 0];
    g.position.set(sp[0] * c.explode, sp[1] * c.explode, sp[2] * c.explode);

    const hiddenByUser = c.hidden.has(id);
    const focus = c.selected !== null && (c.selected === id || c.selected === grp);
    let target = hiddenByUser ? 0 : c.isolate && c.selected !== null && !focus ? GHOST : 1;
    if (!hiddenByUser && target === 1 && c.xray && XRAY_IDS.has(id) && !focus) target = XRAY;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    g.visible = a > 0.012;
    interactive.current = !hiddenByUser && a > 0.5;

    const key = [c.cut ? c.kind : '-', Math.round(c.cutV * 100), c.isolate ? 1 : 0, active ? 1 : 0, hot ? 1 : 0, hiddenByUser ? 1 : 0, focus ? 1 : 0, Math.round(a * 250), Math.round(c.explode * 40)].join('|');
    const changed = key !== lastKey.current;
    lastKey.current = key;

    if (changed) {
      const plane = PLANES[c.kind];
      plane.constant = c.cutV;
      if (c.cut) {
        g.updateWorldMatrix(true, false);
        planes[0].copy(plane).applyMatrix4(g.matrixWorld);
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
        if (!(m.userData as { noClip?: boolean }).noClip) m.clippingPlanes = c.cut ? planes : null;
        if (m.emissive) m.emissiveIntensity = active && a > 0.5 ? (hot ? 0.3 : 0.15) : 0;
      }
    }

    // заглушки сечений: пересчитываем, когда сдвинулась плоскость, часть или форма тела (рост фолликула, толщина эндометрия)
    for (const s of solids.current) {
      const cap = s.children.find((ch) => (ch.userData as { isCap?: boolean }).isCap) as Mesh | undefined;
      if (!cap) continue;
      if (!c.cut || !g.visible || !s.visible) {
        cap.visible = false;
        continue;
      }
      s.updateWorldMatrix(true, false);
      const e = s.matrixWorld.elements;
      const spec = CUTS[c.kind];
      const scale = Math.hypot(e[0], e[1], e[2]) || 1;
      const local = (c.cutV - e[12 + spec.axis]) / scale;
      const bb = s.geometry.boundingBox!;
      const lo = [bb.min.x, bb.min.y, bb.min.z][spec.axis], hi = [bb.max.x, bb.max.y, bb.max.z][spec.axis];
      if (local < lo || local > hi || scale < 0.01) {
        cap.visible = false;
        continue;
      }
      const w = s.morphTargetInfluences?.[0] ?? 0;
      const k = `${c.kind}|${Math.round(local * 800)}|${Math.round(w * 50)}`;
      (cap.material as MeshStandardMaterial).visible = true;
      if (capKeys.current.get(s) !== k) {
        capKeys.current.set(s, k);
        const res = sliceSolid(currentPositions(s), s.geometry.getIndex()!.array, spec.axis, local);
        cap.geometry.dispose();
        if (!res) {
          cap.geometry = new BufferGeometry();
          cap.visible = false;
          continue;
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new Float32BufferAttribute(res.position, 3));
        const normals = new Float32Array(res.position.length);
        for (let i = 0; i < normals.length; i += 3) normals[i + spec.axis] = 1;
        geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
        geo.setIndex(new BufferAttribute(res.index, 1));
        cap.geometry = geo;
        invalidate();
      }
      cap.visible = cap.geometry.getAttribute('position') !== undefined;
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
  const ref = useContext(FemaleContext)!;
  const meta = useContext(MetaContext);
  const { selected } = useSelection();
  const at = meta.label[id];
  const c = ref.current;
  if (!at) return null;
  const grp = GROUP_OF[id];
  const focus = selected === null || selected === id || selected === grp;
  if (c.hidden.has(id) || (c.isolate && !focus)) return null;
  const spec = CUTS[c.kind];
  if (c.cut && at[spec.axis] > c.cutV + 0.2) return null;
  const inner = INNER_LABELS.has(id);
  const defaultLabel = MAIN_LABELS.has(id) && (!inner || c.cut);
  return <Label at={at} partId={id} text={names[id]} labels={c.labels && (defaultLabel || selected === grp || selected === id)} inner={inner} />;
}

export { SPREAD_RADIAL };
