import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three';
import type { ModelProps } from '../../three/types';
import { usePart } from '../../three/materials';
import { Label } from '../../three/Label';
import { useSelection } from '../../three/selection';
import { mulberry32 } from './anatomy';
import { merge, tubeGeo } from './geometry';
import { MICRO_LABEL_AT, MICRO_MAIN_LABELS, MICRO_OFFSET } from './parts';
import type { IntestineTextures } from './textures';

/*
  Срез стенки тонкой кишки «под микроскопом» (сильно увеличен). Слева — кусочек стенки со всеми слоями:
  брюшина, продольная и круговая мышца с нервным сплетением между ними, подслизистая основа с сосудами и
  нервным сплетением, мышечная пластинка слизистой, собственная пластинка с криптами и эпителий с ворсинками.
  Слизистая поднята круговой складкой: в её основе — выступ подслизистой. Слева — лимфоидная бляшка.
  Справа — одна ворсинка, увеличенная ещё сильнее: эпителий с бокаловидными клетками, внутри — сеть капилляров и
  центральный лимфатический сосуд (млечный синус). Передняя часть ворсинки вырезана, чтобы заглянуть внутрь.
*/

const XL = -5.4;
const XR = 1.8;
const D = 3.4;
const HERO_X = 4.8;
const HERO_BASE = 0.55;
const HERO_TOP = 4.78;

/** Профиль круговой складки: подъём слизистой над ровным уровнем. */
const plica = (x: number): number => 0.75 * Math.exp(-Math.pow((x + 1.8) / 1.35, 2));
const MM_Y = -0.5;
const LP_BOTTOM = -0.44;
const surfaceY = (x: number): number => 0.49 + plica(x);

function scaleUV(g: BufferGeometry, su: number, sv: number): BufferGeometry {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return g;
}

/** Тело между двумя профилями по x, вытянутое на всю глубину среза. */
function slab(lower: (x: number) => number, upper: (x: number) => number, x0 = XL, x1 = XR, n = 48): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(x0, lower(x0));
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    shape.lineTo(x, lower(x));
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n;
    shape.lineTo(x, upper(x));
  }
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.translate(0, 0, -D / 2);
  return g;
}

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): BufferGeometry {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Стержневая модель ворсинки (единичная высота): тонкий палец с закруглённой вершиной. */
function villusGeometry(): BufferGeometry {
  const pts = [
    [0.1, 0],
    [0.09, 0.25],
    [0.083, 0.55],
    [0.075, 0.8],
    [0.056, 0.93],
    [0.026, 0.99],
    [0.0, 1],
  ].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(pts, 9);
}

/** Полутруба, прижатая к плоскости среза: крипта, лежащая на передней грани. */
function halfTube(x: number, y0: number, y1: number, r: number, z: number): BufferGeometry {
  const g = new CylinderGeometry(r, r, y1 - y0, 10, 1, false);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}

function ball(c: [number, number, number], r: [number, number, number], seg: [number, number] = [14, 10]): BufferGeometry {
  const g = new SphereGeometry(1, seg[0], seg[1]);
  g.applyMatrix4(new Matrix4().compose(new Vector3(...c), new Quaternion(), new Vector3(...r)));
  return g;
}

interface Built {
  serosa: BufferGeometry;
  longitudinal: BufferGeometry;
  circular: BufferGeometry;
  submucosa: BufferGeometry;
  plicaCore: BufferGeometry;
  mm: BufferGeometry;
  lamina: BufferGeometry;
  epithelium: BufferGeometry;
  pedestal: BufferGeometry;
  pedestalCap: BufferGeometry;
  crypts: BufferGeometry;
  cryptLumens: BufferGeometry;
  heroCrypts: BufferGeometry;
  heroCryptLumens: BufferGeometry;
  villus: BufferGeometry;
  heroSkin: BufferGeometry;
  heroCore: BufferGeometry;
  peyerDome: BufferGeometry;
  follicles: BufferGeometry;
  follicleCenters: BufferGeometry;
  myenteric: BufferGeometry;
  myentericGanglia: BufferGeometry;
  submucosalPlexus: BufferGeometry;
  submucosalGanglia: BufferGeometry;
  arterioles: BufferGeometry;
  venules: BufferGeometry;
  lacteal: BufferGeometry;
  capArteries: BufferGeometry;
  capVeins: BufferGeometry;
  capLoops: BufferGeometry;
  villiMatrices: Matrix4[];
  gobletMatrices: Matrix4[];
}

const heroR = (y: number): number => {
  const pts: [number, number][] = [
    [HERO_BASE, 0.8],
    [0.9, 0.7],
    [1.6, 0.63],
    [2.6, 0.59],
    [3.4, 0.57],
    [4.0, 0.51],
    [4.45, 0.38],
    [4.68, 0.17],
    [HERO_TOP, 0.0],
  ];
  if (y <= pts[0][0]) return pts[0][1];
  for (let k = 0; k < pts.length - 1; k++) {
    if (y <= pts[k + 1][0]) {
      const t = (y - pts[k][0]) / (pts[k + 1][0] - pts[k][0]);
      const s = t * t * (3 - 2 * t);
      return pts[k][1] + (pts[k + 1][1] - pts[k][1]) * s;
    }
  }
  return 0;
};

function build(): Built {
  const rand = mulberry32(555);
  const z0 = -D / 2;
  const zf = D / 2;

  const serosa = scaleUV(box(XL, XR, -2.7, -2.55, z0, zf), 3, 1);
  const longitudinal = scaleUV(box(XL, XR, -2.55, -2.2, z0, zf), 4, 1);
  const circular = scaleUV(box(XL, XR, -2.2, -1.5, z0, zf), 3, 1.4);
  const submucosa = scaleUV(box(XL, XR, -1.5, MM_Y, z0, zf), 3, 2);
  const plicaCore = scaleUV(slab(() => MM_Y, (x) => MM_Y + plica(x) + 0.0), 0.5, 0.5);
  const mm = scaleUV(slab((x) => MM_Y + plica(x), (x) => MM_Y + plica(x) + 0.07), 0.6, 0.6);
  const lamina = scaleUV(slab((x) => LP_BOTTOM + plica(x), (x) => surfaceY(x)), 0.5, 0.7);
  const epithelium = scaleUV(slab((x) => surfaceY(x), (x) => surfaceY(x) + 0.035), 3, 1);

  // основание ворсинки: ступенька слизистой
  const pedestal = scaleUV(box(3.1, 6.5, -0.9, HERO_BASE, -1.35, 1.35), 0.4, 0.5);
  const pedestalCap = scaleUV(box(3.1, 6.5, HERO_BASE, HERO_BASE + 0.04, -1.35, 1.35), 2, 2);

  // крипты на передней грани
  const crypts: BufferGeometry[] = [];
  const cryptLumens: BufferGeometry[] = [];
  for (let x = XL + 0.55; x < XR - 0.2; x += 0.5 + rand() * 0.12) {
    if (x > -5.2 && x < -3.55) continue;
    const base = LP_BOTTOM + plica(x) + 0.12;
    const top = surfaceY(x);
    crypts.push(halfTube(x, base, top, 0.082, zf - 0.02));
    cryptLumens.push(halfTube(x, base + 0.03, top + 0.02, 0.033, zf + 0.045));
  }
  const heroCrypts: BufferGeometry[] = [];
  const heroCryptLumens: BufferGeometry[] = [];
  for (const x of [3.55, 4.05, 5.55, 6.05]) {
    heroCrypts.push(halfTube(x, -0.62, HERO_BASE, 0.1, 1.33));
    heroCryptLumens.push(halfTube(x, -0.58, HERO_BASE + 0.03, 0.04, 1.4));
  }

  // ворсинки на куске стенки
  const villus = villusGeometry();
  const villiMatrices: Matrix4[] = [];
  const up = new Vector3(0, 1, 0);
  for (let x = XL + 0.25; x < XR - 0.15; x += 0.3) {
    if (x > -5.25 && x < -3.55) continue;
    for (let z = -1.5; z <= 1.55; z += 0.3) {
      const jx = x + (rand() - 0.5) * 0.12;
      const jz = z + (rand() - 0.5) * 0.12;
      const e = 0.01;
      const slope = (plica(jx + e) - plica(jx - e)) / (2 * e);
      const n = new Vector3(-slope, 1, 0).normalize();
      const q = new Quaternion().setFromUnitVectors(up, n);
      const h = 0.5 + rand() * 0.24;
      villiMatrices.push(new Matrix4().compose(new Vector3(jx, surfaceY(jx) + 0.02, jz), q, new Vector3(1, h, 1)));
    }
  }

  // большая ворсинка: оболочка-эпителий и сердцевина, вырез спереди
  const profile = (r: (y: number) => number, k: number): Vector2[] => {
    const out: Vector2[] = [];
    for (let i = 0; i <= 44; i++) {
      const y = HERO_BASE + ((HERO_TOP - HERO_BASE) * i) / 44;
      out.push(new Vector2(Math.max(0.0005, r(y) * k), y));
    }
    return out;
  };
  const heroSkin = new LatheGeometry(profile(heroR, 1), 56, 0.62, Math.PI * 2 - 1.24);
  heroSkin.translate(HERO_X, 0, 0);
  const heroCore = new LatheGeometry(profile(heroR, 0.86), 56, 1.0, Math.PI * 2 - 2.0);
  heroCore.translate(HERO_X, 0, 0);

  // млечный синус по центру, капилляры — слева (артериола) и справа (венула) с петлями
  const lacteal = merge([
    tubeGeo([[HERO_X, -0.45, 0], [HERO_X + 0.02, 0.9, 0], [HERO_X, 2.5, 0], [HERO_X, 4.1, 0]], 0.17, 0.15, 14, 0.2),
    ball([HERO_X, 4.13, 0], [0.15, 0.17, 0.15], [14, 10]),
  ]);
  const aPath: [number, number, number][] = [[HERO_X - 0.34, -0.5, 0.12], [HERO_X - 0.36, 1.5, 0.12], [HERO_X - 0.32, 3.2, 0.1], [HERO_X - 0.2, 4.0, 0.05]];
  const vPath: [number, number, number][] = [[HERO_X + 0.2, 4.0, 0.05], [HERO_X + 0.32, 3.2, 0.1], [HERO_X + 0.36, 1.5, 0.12], [HERO_X + 0.34, -0.5, 0.12]];
  const capArteries = tubeGeo(aPath, 0.052, 0.04, 8, 0.2);
  const capVeins = merge([tubeGeo(vPath, 0.04, 0.058, 8, 0.2), tubeGeo([[HERO_X - 0.2, 4.0, 0.05], [HERO_X, 4.24, 0], [HERO_X + 0.2, 4.0, 0.05]], 0.034, 0.034, 6, 0.1)]);
  const loops: BufferGeometry[] = [];
  for (let k = 0; k < 11; k++) {
    const h = 0.8 + k * 0.3;
    const side = k % 2 === 0 ? 1 : -1;
    const rr = 0.43 + 0.04 * Math.sin(k);
    loops.push(
      tubeGeo(
        [
          [HERO_X - 0.34, h, 0.12],
          [HERO_X - 0.28, h + 0.08, side * rr * 0.9],
          [HERO_X, h + 0.16, side * rr],
          [HERO_X + 0.28, h + 0.08, side * rr * 0.9],
          [HERO_X + 0.34, h, 0.12],
        ],
        0.018,
        0.018,
        5,
        0.12,
      ),
    );
  }
  const capLoops = merge(loops);

  // бокаловидные клетки на поверхности ворсинки
  const gobletMatrices: Matrix4[] = [];
  for (let k = 0; k < 34; k++) {
    const y = 1.0 + rand() * 3.3;
    let phi = rand() * Math.PI * 2;
    // вырез спереди не заполняем
    if (Math.abs(((phi + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.8) phi = (phi + 1.7) % (Math.PI * 2);
    const r = heroR(y) - 0.015;
    const q = new Quaternion().setFromAxisAngle(up, phi);
    gobletMatrices.push(new Matrix4().compose(new Vector3(HERO_X + r * Math.sin(phi), y, r * Math.cos(phi)), q, new Vector3(0.075, 0.075, 0.14)));
  }

  // лимфоидная бляшка: купол без ворсинок и фолликулы на срезе
  const peyerDome = ball([-4.4, 0.16, 0], [0.82, 0.5, 1.35], [24, 14]);
  const fol: BufferGeometry[] = [];
  const folC: BufferGeometry[] = [];
  const fPos: [number, number, number, number][] = [
    [-4.85, -0.05, 0.28, zf - 0.07],
    [-4.35, 0.12, 0.3, zf - 0.07],
    [-3.95, -0.12, 0.25, zf - 0.07],
    [-4.7, 0.28, 0.2, zf - 0.07],
    [-4.12, 0.3, 0.2, zf - 0.07],
    [-4.45, -0.78, 0.3, zf - 0.07],
    [-3.95, -0.8, 0.22, zf - 0.07],
  ];
  for (const [x, y, r, z] of fPos) {
    fol.push(ball([x, y, z], [r, r, r], [16, 12]));
    folC.push(ball([x, y, z + 0.03], [r * 0.55, r * 0.55, r * 0.55], [12, 9]));
  }

  // нервные сплетения: узлы-ганглии и соединяющие тяжи на плоскости среза
  const plexus = (y: number, x0: number, x1: number, step: number, gR: number, tubeR: number, seed: number) => {
    const r = mulberry32(seed);
    const nodes: [number, number, number][] = [];
    for (let x = x0; x < x1; x += step) nodes.push([x + (r() - 0.5) * 0.25, y + (r() - 0.5) * 0.14, zf + 0.012]);
    const tubes: BufferGeometry[] = [];
    const balls: BufferGeometry[] = [];
    nodes.forEach((n, i) => {
      balls.push(ball(n, [gR * (0.8 + r() * 0.5), gR * 0.7, gR * 0.8], [10, 8]));
      if (i > 0) tubes.push(tubeGeo([nodes[i - 1], [(nodes[i - 1][0] + n[0]) / 2, y + (r() - 0.5) * 0.22, zf + 0.012], n], tubeR, tubeR, 5, 0.12));
      if (i > 1 && r() > 0.4) tubes.push(tubeGeo([nodes[i - 2], [nodes[i - 1][0], y + (r() > 0.5 ? 0.17 : -0.17), zf + 0.012], n], tubeR * 0.8, tubeR * 0.8, 5, 0.12));
    });
    return { tubes: merge(tubes), balls: merge(balls) };
  };
  const my = plexus(-2.2, XL + 0.35, XR - 0.2, 0.65, 0.085, 0.022, 71);
  const sp = plexus(-1.0, XL + 0.4, XR - 0.2, 0.55, 0.06, 0.017, 72);

  // сосуды подслизистой: артериола и венула вдоль среза с ветвями вверх, к ворсинкам
  const arter: BufferGeometry[] = [tubeGeo([[XL + 0.1, -1.18, zf - 0.04], [-2.2, -1.2, zf - 0.04], [0.1, -1.16, zf - 0.04], [XR - 0.05, -1.2, zf - 0.04]], 0.07, 0.07, 8, 0.2)];
  const venul: BufferGeometry[] = [tubeGeo([[XL + 0.1, -1.36, zf - 0.04], [-2.4, -1.38, zf - 0.04], [-0.2, -1.34, zf - 0.04], [XR - 0.05, -1.38, zf - 0.04]], 0.08, 0.08, 8, 0.2)];
  for (const x of [-2.3, -1.2, 0.0, 0.9]) {
    arter.push(tubeGeo([[x, -1.18, zf - 0.04], [x + 0.06, -0.55, zf - 0.04], [x + 0.05, 0.15 + plica(x), zf - 0.04]], 0.033, 0.026, 6, 0.15));
    venul.push(tubeGeo([[x + 0.14, -1.36, zf - 0.04], [x + 0.2, -0.55, zf - 0.04], [x + 0.17, 0.12 + plica(x), zf - 0.04]], 0.04, 0.03, 6, 0.15));
  }

  return {
    serosa,
    longitudinal,
    circular,
    submucosa,
    plicaCore,
    mm,
    lamina,
    epithelium,
    pedestal,
    pedestalCap,
    crypts: merge(crypts),
    cryptLumens: merge(cryptLumens),
    heroCrypts: merge(heroCrypts),
    heroCryptLumens: merge(heroCryptLumens),
    villus,
    heroSkin,
    heroCore,
    peyerDome,
    follicles: merge(fol),
    follicleCenters: merge(folC),
    myenteric: my.tubes,
    myentericGanglia: my.balls,
    submucosalPlexus: sp.tubes,
    submucosalGanglia: sp.balls,
    arterioles: merge(arter),
    venules: merge(venul),
    lacteal,
    capArteries,
    capVeins,
    capLoops,
    villiMatrices,
    gobletMatrices,
  };
}

type GlowMaterial = Material & { emissive?: Color; emissiveIntensity?: number };
const GLOW = new Color('#ffa77a');
const GHOST = 0.1;

/** Часть среза: подсветка, призрачный режим и скрытие. */
function MicroPart({ id, state, names, children }: { id: string; state: ModelProps['state']; names: Record<string, string>; children: ReactNode }) {
  const { selected, hovered } = useSelection();
  const { handlers } = usePart(id);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<import('three').Group>(null);
  const mats = useRef<GlowMaterial[]>([]);
  const alpha = useRef(1);
  const lastKey = useRef('');
  const active = selected === id || hovered === id;
  const hot = hovered === id;
  const isolate = state.isolate ?? true;
  const hidden = state.hidden?.has(id) ?? false;

  useEffect(() => {
    const set = new Set<GlowMaterial>();
    group.current?.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as GlowMaterial;
      if (m && !set.has(m)) {
        set.add(m);
        (m.userData as { base?: { opacity: number; transparent: boolean; depthWrite: boolean } }).base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
      }
    });
    mats.current = [...set];
    invalidate();
  }, [invalidate]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const focus = selected === id;
    const target = hidden ? 0 : isolate && selected !== null && !focus ? GHOST : 1;
    const diff = target - alpha.current;
    if (Math.abs(diff) > 0.002) {
      alpha.current += diff * Math.min(1, dt * 9);
      invalidate();
    } else alpha.current = target;
    const a = alpha.current;
    g.visible = a > 0.012;
    const key = [Math.round(a * 250), active ? 1 : 0, hot ? 1 : 0, focus ? 1 : 0].join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;
    for (const m of mats.current) {
      const base = (m.userData as { base?: { opacity: number; transparent: boolean; depthWrite: boolean } }).base;
      if (!base) continue;
      const transparent = base.transparent || a < 0.995;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = base.opacity * a;
      m.depthWrite = base.depthWrite && a > 0.9;
      if (m.emissive) {
        if (active && a > 0.5) {
          m.emissive.copy(GLOW);
          m.emissiveIntensity = hot ? 0.3 : 0.16;
        } else m.emissiveIntensity = 0;
      }
    }
  });

  const at = MICRO_LABEL_AT[id];
  const show = !hidden && (!isolate || selected === null || selected === id);
  return (
    <group ref={group} {...handlers}>
      {children}
      {at && show && <Label at={at} partId={id} text={names[id]} labels={state.labels && (MICRO_MAIN_LABELS.has(id) || selected === id)} inner />}
    </group>
  );
}

function Instances({ geometry, matrices, children }: { geometry: BufferGeometry; matrices: Matrix4[]; children: ReactNode }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, matrices.length]} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
}

export default function WallScene({ state, names, tex }: { state: ModelProps['state']; names: Record<string, string>; tex: IntestineTextures }) {
  const G = useMemo(build, []);
  useEffect(
    () => () => {
      for (const v of Object.values(G)) if (!Array.isArray(v)) (v as BufferGeometry).dispose();
    },
    [G],
  );
  const gobletGeo = useMemo(() => new SphereGeometry(1, 10, 8), []);
  const P = { state, names };
  const heroLine: [number, number, number][][] = [
    [[0.9, 1.0, 1.4], [HERO_X - 0.95, HERO_BASE + 0.1, 1.45]],
    [[0.9, 1.0, -1.4], [HERO_X - 0.95, HERO_BASE + 3.9, -1.4]],
  ];

  return (
    <group position={MICRO_OFFSET}>
      <MicroPart id="serosa" {...P}>
        <mesh geometry={G.serosa}>
          <meshPhysicalMaterial map={tex.serosa} color="#f6eadc" roughness={0.25} clearcoat={0.9} clearcoatRoughness={0.15} />
        </mesh>
      </MicroPart>

      <MicroPart id="muscularis" {...P}>
        <mesh geometry={G.longitudinal}>
          <meshStandardMaterial map={tex.sectionLong} roughness={0.55} />
        </mesh>
        <mesh geometry={G.circular}>
          <meshStandardMaterial map={tex.sectionCirc} roughness={0.55} />
        </mesh>
      </MicroPart>

      <MicroPart id="myenteric-plexus" {...P}>
        <mesh geometry={G.myenteric}>
          <meshStandardMaterial color="#f0cc4d" roughness={0.45} emissive="#4a3a00" emissiveIntensity={0.1} />
        </mesh>
        <mesh geometry={G.myentericGanglia}>
          <meshStandardMaterial color="#f5d96b" roughness={0.4} emissive="#5a4600" emissiveIntensity={0.12} />
        </mesh>
      </MicroPart>

      <MicroPart id="submucosa" {...P}>
        <mesh geometry={G.submucosa}>
          <meshStandardMaterial map={tex.submucosa} roughness={0.7} />
        </mesh>
        <mesh geometry={G.arterioles}>
          <meshStandardMaterial color="#c3362e" roughness={0.4} />
        </mesh>
        <mesh geometry={G.venules}>
          <meshStandardMaterial color="#46589e" roughness={0.4} />
        </mesh>
      </MicroPart>

      <MicroPart id="submucosal-plexus" {...P}>
        <mesh geometry={G.submucosalPlexus}>
          <meshStandardMaterial color="#f0cc4d" roughness={0.45} emissive="#4a3a00" emissiveIntensity={0.1} />
        </mesh>
        <mesh geometry={G.submucosalGanglia}>
          <meshStandardMaterial color="#f5d96b" roughness={0.4} emissive="#5a4600" emissiveIntensity={0.12} />
        </mesh>
      </MicroPart>

      <MicroPart id="peyers-patches" {...P}>
        <mesh geometry={G.peyerDome}>
          <meshPhysicalMaterial color="#f1dcc0" roughness={0.4} clearcoat={0.6} clearcoatRoughness={0.3} />
        </mesh>
        <mesh geometry={G.follicles}>
          <meshPhysicalMaterial color="#f0d99a" roughness={0.4} clearcoat={0.5} />
        </mesh>
        <mesh geometry={G.follicleCenters}>
          <meshStandardMaterial color="#d4a468" roughness={0.5} />
        </mesh>
      </MicroPart>

      <MicroPart id="muscularis-mucosae" {...P}>
        <mesh geometry={G.mm}>
          <meshStandardMaterial map={tex.muscle} color="#e3a58f" roughness={0.55} />
        </mesh>
      </MicroPart>

      <MicroPart id="plicae" {...P}>
        <mesh geometry={G.plicaCore}>
          <meshStandardMaterial map={tex.submucosa} roughness={0.7} />
        </mesh>
      </MicroPart>

      <MicroPart id="mucosa" {...P}>
        <mesh geometry={G.lamina}>
          <meshStandardMaterial map={tex.lamina} roughness={0.6} />
        </mesh>
        <mesh geometry={G.epithelium}>
          <meshPhysicalMaterial map={tex.epithelium} color="#f0b8a6" roughness={0.3} clearcoat={0.7} clearcoatRoughness={0.2} />
        </mesh>
        <mesh geometry={G.pedestal}>
          <meshStandardMaterial map={tex.lamina} roughness={0.6} />
        </mesh>
        <mesh geometry={G.pedestalCap}>
          <meshPhysicalMaterial map={tex.epithelium} color="#f0b8a6" roughness={0.3} clearcoat={0.7} />
        </mesh>
      </MicroPart>

      <MicroPart id="crypts" {...P}>
        <mesh geometry={G.crypts}>
          <meshPhysicalMaterial color="#c97a78" roughness={0.4} clearcoat={0.5} />
        </mesh>
        <mesh geometry={G.cryptLumens}>
          <meshStandardMaterial color="#4a1c20" roughness={0.7} />
        </mesh>
        <mesh geometry={G.heroCrypts}>
          <meshPhysicalMaterial color="#c97a78" roughness={0.4} clearcoat={0.5} />
        </mesh>
        <mesh geometry={G.heroCryptLumens}>
          <meshStandardMaterial color="#4a1c20" roughness={0.7} />
        </mesh>
      </MicroPart>

      <MicroPart id="villi" {...P}>
        <Instances geometry={G.villus} matrices={G.villiMatrices}>
          <meshPhysicalMaterial map={tex.epithelium} color="#f3b3a1" roughness={0.3} clearcoat={0.7} clearcoatRoughness={0.2} sheen={0.5} sheenColor={new Color('#ffd0c0')} />
        </Instances>
        <mesh geometry={G.heroSkin}>
          <meshPhysicalMaterial map={tex.epithelium} color="#f6c2b1" roughness={0.32} clearcoat={0.7} clearcoatRoughness={0.2} side={DoubleSide} />
        </mesh>
        <mesh geometry={G.heroCore}>
          <meshStandardMaterial map={tex.lamina} color="#f3cdbd" roughness={0.6} side={DoubleSide} transparent opacity={0.92} />
        </mesh>
      </MicroPart>

      <MicroPart id="goblet-cells" {...P}>
        <Instances geometry={gobletGeo} matrices={G.gobletMatrices}>
          <meshPhysicalMaterial color="#cfe4f3" roughness={0.2} clearcoat={0.9} clearcoatRoughness={0.1} emissive="#4c6a86" emissiveIntensity={0.12} />
        </Instances>
      </MicroPart>

      <MicroPart id="lacteal" {...P}>
        <mesh geometry={G.lacteal}>
          <meshPhysicalMaterial color="#e2e892" roughness={0.25} clearcoat={0.7} transparent opacity={0.85} />
        </mesh>
      </MicroPart>

      <MicroPart id="capillaries" {...P}>
        <mesh geometry={G.capArteries}>
          <meshStandardMaterial color="#c3362e" roughness={0.4} />
        </mesh>
        <mesh geometry={G.capVeins}>
          <meshStandardMaterial color="#46589e" roughness={0.4} />
        </mesh>
        <mesh geometry={G.capLoops}>
          <meshStandardMaterial color="#b4404f" roughness={0.45} />
        </mesh>
      </MicroPart>

      {/* «увеличительные» линии от обычной ворсинки к большой */}
      {heroLine.map((pts, i) => (
        <Line key={i} points={pts} color="#8c8a99" lineWidth={1} dashed dashSize={0.18} gapSize={0.14} transparent opacity={0.6} />
      ))}
    </group>
  );
}
