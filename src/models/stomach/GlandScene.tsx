import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, Color, LatheGeometry, Object3D, Quaternion, Vector2, Vector3, type InstancedMesh } from 'three';
import type { ModelProps } from '../../three/types';
import { Tissue, usePart, type TissueKind } from '../../three/materials';
import { Label } from '../../three/Label';
import { Vessel } from '../../three/Vessel';
import { useSelection } from '../../three/selection';
import { isolatedSet, type Vec } from './anatomy';
import { rng } from '../liver/tubes';

/*
  Желудочная ямка и железа под микроскопом (сильно увеличено). Сверху — поверхность слизистой: клетки, выделяющие
  защитную слизь, сливаются в желудочную ямку. Ниже ямка переходит в трубчатую железу: в шейке — слизистые клетки
  и «ворота» для стволовых клеток, в теле — крупные обкладочные клетки (соляная кислота), на дне — главные клетки (пепсиноген).
  Среди них разбросаны эндокринные клетки. Вокруг железы — капилляры, внизу — мышечная пластинка слизистой.
  Передняя часть железы «вырезана», чтобы заглянуть в просвет.
*/

const TAU = Math.PI * 2;
const Y_TOP = 2.4;
const Y_BOTTOM = -2.15;
const GAP = 0.78;
const Y_AXIS = new Vector3(0, 1, 0);

/** Радиус просвета: воронка ямки сужается к перешейку, дальше — узкий просвет железы. */
/** Радиус просвета железы на высоте y; выше устья не уходит в NaN (дробная степень от отрицательного). */
export function rLumen(y: number): number {
  if (y > 1.45) {
    const t = Math.min(1, Math.max(0, (Y_TOP - y) / (Y_TOP - 1.45)));
    return 0.66 - 0.5 * Math.sin(t * Math.PI * 0.5) ** 0.8;
  }
  if (y > 1.25) return 0.16 - 0.04 * ((1.45 - y) / 0.2);
  return 0.12 + 0.01 * Math.sin(y * 3);
}

const wrap = (a: number) => a - Math.round(a / TAU) * TAU;
const front = (a: number) => Math.abs(wrap(a)) < GAP;

interface Item {
  p: Vec;
  dir: Vec;
  size: [number, number, number];
  shade: number;
}

interface Built {
  mucous: Item[];
  neck: Item[];
  parietal: Item[];
  chief: Item[];
  endocrine: Item[];
  anchors: Record<string, Vec>;
}

function build(): Built {
  const r = rng(2026);
  const out: Built = { mucous: [], neck: [], parietal: [], chief: [], endocrine: [], anchors: {} };
  const add = (list: Item[], y: number, a: number, off: number, size: [number, number, number]) => {
    const rad = rLumen(y) + off;
    const dir: Vec = [Math.sin(a), 0, Math.cos(a)];
    list.push({ p: [dir[0] * rad, y, dir[2] * rad], dir, size, shade: 0.88 + 0.22 * r() });
  };
  let ring = 0;
  for (let y = Y_TOP - 0.05; y > Y_BOTTOM; y -= 0.17) {
    ring++;
    const rMid = rLumen(y) + 0.14;
    const n = Math.max(7, Math.round((TAU * rMid) / 0.2));
    const shift = (ring % 2) * 0.5;
    for (let i = 0; i < n; i++) {
      const a = ((i + shift) / n) * TAU + (r() - 0.5) * 0.06;
      if (front(a)) continue;
      const yy = y + (r() - 0.5) * 0.04;
      if (yy > 1.42) {
        // поверхностные клетки: высокие столбики по стенке ямки
        add(out.mucous, yy, a, 0.1, [0.085, 0.15, 0.085]);
      } else if (yy > 0.6) {
        // шейка: слизистые клетки и редкие обкладочные
        if (r() < 0.2) add(out.parietal, yy, a, 0.16, [0.15, 0.15, 0.15]);
        else add(out.neck, yy, a, 0.09, [0.085, 0.13, 0.085]);
      } else if (yy > -1.0) {
        // тело: обкладочные клетки выступают наружу, между ними — главные
        if (r() < 0.36) add(out.parietal, yy, a, 0.17, [0.17, 0.15, 0.17]);
        else add(out.chief, yy, a, 0.09, [0.075, 0.12, 0.075]);
      } else {
        // дно: главные клетки, изредка обкладочные
        if (r() < 0.1) add(out.parietal, yy, a, 0.16, [0.15, 0.14, 0.15]);
        else add(out.chief, yy, a, 0.09, [0.085, 0.14, 0.085]);
      }
      if (yy < 1.2 && r() < 0.022) add(out.endocrine, yy, a, 0.075, [0.055, 0.1, 0.055]);
    }
  }
  const pick = (list: Item[], test: (i: Item) => boolean): Vec => (list.find(test) ?? list[0]).p;
  out.anchors = {
    'surface-cells': pick(out.mucous, (i) => i.p[0] < -0.3 && i.p[1] < 2.1 && i.p[1] > 1.8),
    'neck-cells': pick(out.neck, (i) => i.p[0] > 0 && i.p[1] < 1.1),
    'parietal-cells': pick(out.parietal, (i) => i.p[0] > 0.1 && i.p[1] < 0.3 && i.p[1] > -0.4),
    'chief-cells': pick(out.chief, (i) => i.p[0] < -0.05 && i.p[1] < -1.2),
    'endocrine-cells': pick(out.endocrine, (i) => i.p[0] > 0),
  };
  return out;
}

/** Заполняет экземпляры при каждом появлении сетки на сцене. */
function useInstances(items: Item[]) {
  return useCallback(
    (mesh: InstancedMesh | null) => {
      if (!mesh) return;
      const o = new Object3D();
      const c = new Color();
      const q = new Quaternion();
      const d = new Vector3();
      items.forEach((it, i) => {
        d.set(...it.dir);
        q.setFromUnitVectors(Y_AXIS, d);
        o.position.set(...it.p);
        o.quaternion.copy(q);
        o.scale.set(...it.size);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, c.setScalar(it.shade));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
    [items],
  );
}

function Part({ id, children }: { id: string; children: ReactNode }) {
  const { handlers } = usePart(id);
  return <group {...handlers}>{children}</group>;
}

function Cells({ id, items, kind, active }: { id: string; items: Item[]; kind: TissueKind; active: boolean }) {
  const ref = useInstances(items);
  const { handlers } = usePart(id);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} {...handlers} frustumCulled={false}>
      <sphereGeometry args={[1, 14, 10]} />
      <Tissue kind={kind} active={active} />
    </instancedMesh>
  );
}

/** Частицы соляной кислоты поднимаются по просвету железы к поверхности. */
function Acid({ time }: { time: { current: number } }) {
  const total = 46;
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const seed = useMemo(() => {
    const r = rng(11);
    return Array.from({ length: total }, () => ({ f: r(), a: r() * TAU, k: 0.6 + 0.8 * r() }));
  }, []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < total; i++) {
      const { f, a, k } = seed[i];
      const t = (f + time.current * 0.07 * k) % 1;
      const y = -0.8 + t * (Y_TOP - -0.8 + 0.3);
      const rad = Math.max(0.02, rLumen(y) * 0.55) * (0.6 + 0.4 * Math.sin(a * 3 + time.current));
      dummy.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
      dummy.scale.setScalar(0.028 * (0.6 + 0.4 * Math.min(1, t * 8, (1 - t) * 8)));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, total]} raycast={() => null} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial color="#d8ff7a" emissive="#b5f03c" emissiveIntensity={0.9} roughness={0.4} />
    </instancedMesh>
  );
}

/** Мышечная пластинка слизистой: слой гладкомышечных клеток под железами. */
function MuscleLayer({ active }: { active: boolean }) {
  const items = useMemo<Item[]>(() => {
    const r = rng(33);
    return Array.from({ length: 150 }, () => ({
      p: [(r() - 0.5) * 3.1, -2.38 + (r() - 0.5) * 0.16, (r() - 0.5) * 2.1] as Vec,
      dir: [1, 0, 0] as Vec,
      size: [0.07, 0.34 + 0.2 * r(), 0.07] as [number, number, number],
      shade: 0.85 + 0.25 * r(),
    }));
  }, []);
  const ref = useInstances(items);
  const { handlers } = usePart('muscularis-mucosae');
  return (
    <group {...handlers}>
      <mesh position={[0, -2.38, 0]}>
        <boxGeometry args={[3.2, 0.2, 2.2]} />
        <Tissue kind="muscle" active={active} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, items.length]} position={[0, 0.0, 0]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <Tissue kind="muscle" active={active} />
      </instancedMesh>
    </group>
  );
}

export function GlandScene({ state, names }: ModelProps & { names: Record<string, string> }) {
  const { selected, isolate, hovered } = useSelection();
  const set = isolate && selected ? isolatedSet(selected) : null;
  const show = (id: string) => !set || set.has(id);
  const on = (id: string) => [selected, hovered].some((s) => s === id || s === 'g-gland');
  const only = (id: string) => selected === id || hovered === id;
  const built = useMemo(build, []);

  const pit = useMemo(() => {
    const pts: Vector2[] = [];
    for (let y = Y_BOTTOM + 0.2; y <= Y_TOP; y += 0.05) pts.push(new Vector2(rLumen(y) + 0.02, y));
    return new LatheGeometry(pts, 48, GAP, TAU - 2 * GAP);
  }, []);
  const lumenGel = useMemo(() => {
    const pts: Vector2[] = [];
    for (let y = 0.6; y <= Y_TOP + 0.05; y += 0.05) pts.push(new Vector2(0, y), new Vector2(Math.max(0.02, rLumen(y) * 0.5), y));
    return new LatheGeometry(
      Array.from({ length: 40 }, (_, i) => {
        const y = 0.6 + (i / 39) * (Y_TOP + 0.05 - 0.6);
        return new Vector2(Math.max(0.025, rLumen(y) * 0.5), y);
      }),
      18,
    );
  }, []);

  const caps = useMemo(() => {
    const mk = (a: number, h0: number, wob: number): CatmullRomCurve3 => {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const y = -2.1 + (i / 12) * 4.2;
        const an = a + 0.18 * Math.sin(i * 0.9 + wob);
        pts.push(new Vector3(Math.sin(an) * (0.78 + 0.05 * Math.sin(i + wob)), y, Math.cos(an) * (0.78 + 0.05 * Math.sin(i + wob))));
      }
      void h0;
      return new CatmullRomCurve3(pts);
    };
    const loop = (y: number): CatmullRomCurve3 =>
      new CatmullRomCurve3(
        Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * TAU;
          const rr = rLumen(y) + 0.5 + 0.04 * Math.sin(i * 2);
          return new Vector3(Math.sin(a) * rr, y + 0.05 * Math.sin(i * 3), Math.cos(a) * rr);
        }),
        true,
      );
    return {
      down: [mk(1.9, 0, 0), mk(3.9, 0, 1.5)],
      up: [mk(2.9, 0, 3), mk(5.2, 0, 4.4)],
      loops: [loop(2.05), loop(1.7)],
    };
  }, []);

  const lbl = (id: string, at: Vec | undefined, labelsOn: boolean) =>
    at ? <Label key={id} labels={labelsOn} partId={id} text={names[id]} at={at} /> : null;

  const A = built.anchors;
  const L = state.labels;
  return (
    <group position={[-0.4, 0.5, 0]} scale={1.28}>
      <mesh position={[0, 0.05, 0]} raycast={() => null}>
        <boxGeometry args={[3.2, 4.9, 2.2]} />
        <Tissue kind="slab" />
      </mesh>
      {show('muscularis-mucosae') && <MuscleLayer active={on('muscularis-mucosae')} />}
      {show('gastric-pit') && (
        <Part id="gastric-pit">
          <mesh geometry={pit}>
            <Tissue kind="pitWall" active={on('gastric-pit')} />
          </mesh>
          <mesh geometry={lumenGel} raycast={() => null}>
            <Tissue kind="gel" />
          </mesh>
        </Part>
      )}
      {show('surface-cells') && <Cells id="surface-cells" items={built.mucous} kind="cellMucous" active={on('surface-cells')} />}
      {show('neck-cells') && <Cells id="neck-cells" items={built.neck} kind="cellMucous" active={on('neck-cells')} />}
      {show('parietal-cells') && <Cells id="parietal-cells" items={built.parietal} kind="cellParietal" active={on('parietal-cells')} />}
      {show('chief-cells') && <Cells id="chief-cells" items={built.chief} kind="cellChief" active={on('chief-cells')} />}
      {show('endocrine-cells') && <Cells id="endocrine-cells" items={built.endocrine} kind="cellEndocrine" active={on('endocrine-cells')} />}
      {show('capillaries') && (
        <Part id="capillaries">
          {caps.down.map((p, i) => (
            <Vessel key={`d${i}`} path={p} radius={0.034} kind="artery" active={on('capillaries')} />
          ))}
          {caps.up.map((p, i) => (
            <Vessel key={`u${i}`} path={p} radius={0.034} kind="vein" active={on('capillaries')} />
          ))}
          {caps.loops.map((p, i) => (
            <Vessel key={`l${i}`} path={p} radius={0.026} kind="artery" active={on('capillaries')} caps={false} />
          ))}
        </Part>
      )}
      {(show('gastric-gland') || show('parietal-cells')) && <Acid time={state.time} />}

      {lbl('gastric-pit', [0.55, 2.0, 0.35], L && show('gastric-pit'))}
      {show('surface-cells') && lbl('surface-cells', A['surface-cells'], L)}
      {show('neck-cells') && lbl('neck-cells', A['neck-cells'], L)}
      {show('parietal-cells') && lbl('parietal-cells', A['parietal-cells'], L)}
      {show('chief-cells') && lbl('chief-cells', A['chief-cells'], L)}
      {show('endocrine-cells') && lbl('endocrine-cells', A['endocrine-cells'], only('endocrine-cells') || L)}
      {show('capillaries') && lbl('capillaries', [0.8, -0.3, 0.1], L)}
      {show('muscularis-mucosae') && lbl('muscularis-mucosae', [1.4, -2.4, 0.9], L)}
    </group>
  );
}
