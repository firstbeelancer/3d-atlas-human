import { Suspense, use, useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DoubleSide, BackSide, Matrix4, Vector3, type BufferGeometry, type Mesh } from 'three';
import { ModelPending } from '../../three/StageLoading';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { loadBrain, getProgress, subscribeProgress, type BrainData } from './loader';
import { VOL_RANGE } from './jobs';
import { BrainContext, BrainPart, PartLabel, type BrainControl } from './BrainPart';
import { buildPieces, chiasmGeometry, type Piece, type TubeKind } from './tubes';
import { BRAIN_GROUPS, CUTS, FOCUS, CUT_VIEWS, GROUP_OF, HEMI_SPREAD, OVERVIEW, SCALE, SPREAD, SPREAD_VIEW, SIDED, type Focus } from './anatomy';
import { LOBES, ZONE_BITS } from './field';

/*
  Мозг, правая сторона человека — справа по оси +x, лоб — +z, верх — +y. Размеры в миллиметрах, общий масштаб — SCALE.
  Кора, ствол, мозжечок и глубокие структуры построены из полей расстояний (field.ts) в фоновых потоках.
  Срез — настоящий разрез объёма: плоскость с шейдером, который читает 3D-текстуры тех же полей.
*/

const NATURAL = '#e2b7a9';
const LOBE_COLOR: Record<string, string> = { 'frontal-lobe': '#f0a458', 'parietal-lobe': '#62b0e6', 'temporal-lobe': '#74c995', 'occipital-lobe': '#c386df', insula: '#ef6a8a' };
const ZONE_COLOR: Record<string, string> = {
  'motor-cortex': '#e5484d', 'sensory-cortex': '#2f7de1', 'prefrontal-cortex': '#8b5cf6', 'broca-area': '#f59e0b', 'wernicke-area': '#10b981',
  'auditory-cortex': '#06b6d4', 'visual-cortex': '#ec4899', 'cingulate-gyrus': '#84cc16', 'central-sulcus': '#facc15', 'lateral-sulcus': '#fb923c', 'longitudinal-fissure': '#fca5a5',
};
const STRUCT_MAT: Record<string, { color: string; rough?: number; opacity?: number }> = {
  'corpus-callosum': { color: '#f5ecdc', rough: 0.5 },
  thalamus: { color: '#cf968c' },
  hypothalamus: { color: '#dca48f' },
  'caudate-nucleus': { color: '#cb7c6c' },
  putamen: { color: '#b9707f' },
  'globus-pallidus': { color: '#e0a3a3' },
  amygdala: { color: '#d96b5d' },
  hippocampus: { color: '#74a98a' },
  fornix: { color: '#f1e8d1' },
  'mammillary-bodies': { color: '#ebc47a' },
  'pineal-gland': { color: '#8ea6dc' },
  'pituitary-gland': { color: '#f2b640' },
  'lateral-ventricles': { color: '#6fb6ea', opacity: 0.72, rough: 0.12 },
  'third-ventricle': { color: '#6fb6ea', opacity: 0.8, rough: 0.12 },
  'fourth-ventricle': { color: '#6fb6ea', opacity: 0.8, rough: 0.12 },
};
const STEM_COLOR: Record<string, string> = { midbrain: '#e6d4b6', tectum: '#d8a98f', pons: '#eddcc1', medulla: '#ddcbaa', 'spinal-cord': '#f3e9d2' };
const TUBE_COLOR: Record<TubeKind, string> = { artery: '#cb392f', vein: '#3f62b4', nerve: '#e9c44c', dura: '#cdb9a2' };

function Loading() {
  const { done, total } = useSyncExternalStore(subscribeProgress, getProgress);
  return <ModelPending progress={total ? done / total : undefined} />;
}

const VERT = /* glsl */ `
uniform mat4 uOrient;
varying vec3 vMm;
void main() {
  vMm = (uOrient * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uC;
uniform sampler3D uB;
uniform vec3 cMin; uniform vec3 cSize;
uniform vec3 bMin; uniform vec3 bSize;
uniform float uR;
varying vec3 vMm;

float dec(float v) { return (2.0 * v - 1.0) * uR; }
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float inside(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }

void main() {
  vec3 uc = (vMm - cMin) / cSize;
  vec3 ub = (vMm - bMin) / bSize;
  bool inC = all(greaterThanEqual(uc, vec3(0.0))) && all(lessThanEqual(uc, vec3(1.0)));
  bool inB = all(greaterThanEqual(ub, vec3(0.0))) && all(lessThanEqual(ub, vec3(1.0)));
  vec4 C = inC ? texture(uC, uc) : vec4(1.0);
  vec4 B = inB ? texture(uB, ub) : vec4(1.0);
  float dCer = dec(C.r);
  float dVent = min(dec(C.g), dec(B.b));
  float dNuc = dec(C.b);
  float dTr = dec(C.a);
  float dCb = dec(B.r);
  float dSt = dec(B.g);
  float aa = 0.5;
  float dAll = min(min(dCer, dCb), dSt);
  if (dAll > aa) discard;

  float n1 = vnoise(vMm * 1.7);
  float n2 = vnoise(vMm * 0.35);
  vec3 white = vec3(0.945, 0.915, 0.835);
  vec3 gray = vec3(0.70, 0.575, 0.54);
  vec3 col = white * (0.97 + 0.05 * n1);

  // кора больших полушарий: серая лента переменной толщины
  float th = 2.5 + 1.0 * n2;
  float wCer = inside(dCer, aa);
  col = mix(col, mix(gray * (0.95 + 0.08 * n1), col, smoothstep(th - 0.5, th + 0.5, -dCer)), wCer);
  // мозжечок: тонкая кора и «древо жизни»
  float wCb = inside(dCb, aa * 0.8);
  vec3 cbCol = mix(vec3(0.74, 0.60, 0.56), vec3(0.955, 0.925, 0.86), smoothstep(1.1, 1.9, -dCb));
  col = mix(col, cbCol, wCb);
  // ствол мозга
  float wSt = inside(dSt, aa);
  col = mix(col, vec3(0.90, 0.83, 0.72) * (0.96 + 0.06 * n1), wSt);
  // проводящие пути: мозолистое тело и свод
  float wTr = inside(dTr, aa * 0.7);
  col = mix(col, vec3(1.0, 0.985, 0.94), wTr);
  col *= 1.0 - 0.28 * exp(-abs(dTr) / 0.45);
  // ядра
  float wN = inside(dNuc, aa * 0.7);
  col = mix(col, vec3(0.72, 0.585, 0.55) * (0.95 + 0.1 * n1), wN);
  col *= 1.0 - 0.3 * exp(-abs(dNuc) / 0.45);
  // желудочки
  float wV = inside(dVent, aa * 0.7);
  col = mix(col, vec3(0.60, 0.80, 0.93), wV);
  col *= 1.0 - 0.32 * exp(-abs(dVent) / 0.4);
  // тёмный ободок по внешнему краю
  col *= 1.0 - 0.34 * smoothstep(1.4, 0.0, -dAll);
  gl_FragColor = vec4(col, 1.0);
}`;

/** Настоящий разрез: плоскость с шейдером, читающим объёмные текстуры. */
function Slice({ ctrl, data }: { ctrl: RefObject<BrainControl>; data: BrainData }) {
  const mesh = useRef<Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const orient = useMemo(() => new Matrix4(), []);
  const uniforms = useMemo(() => {
    const { c, b } = data.volInfo;
    const size = (v: typeof c) => new Vector3(v.dims[0] * v.h, v.dims[1] * v.h, v.dims[2] * v.h);
    return {
      uC: { value: data.volC },
      uB: { value: data.volB },
      cMin: { value: new Vector3(...c.min) },
      cSize: { value: size(c) },
      bMin: { value: new Vector3(...b.min) },
      bSize: { value: size(b) },
      uR: { value: VOL_RANGE },
      uOrient: { value: orient },
    };
  }, [data, orient]);
  useEffect(() => {
    invalidate();
  });
  useFrame(() => {
    const m = mesh.current;
    const c = ctrl.current!;
    if (!m) return;
    const on = c.cut && c.explode < 0.03;
    m.visible = on;
    if (!on) return;
    const axis = CUTS[c.kind as 'side' | 'fundus' | 'coronal'].axis;
    if (axis === 'x') orient.makeBasis(new Vector3(0, 0, -1), new Vector3(0, 1, 0), new Vector3(1, 0, 0));
    else if (axis === 'y') orient.makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, 1, 0));
    else orient.identity();
    orient.setPosition(axis === 'x' ? c.cutMm : 0, axis === 'y' ? c.cutMm : 0, axis === 'z' ? c.cutMm : 0);
    m.matrix.copy(orient);
    m.matrixWorldNeedsUpdate = true;
  });
  return (
    <mesh ref={mesh} matrixAutoUpdate={false} frustumCulled={false} visible={false} renderOrder={2}>
      <planeGeometry args={[210, 210]} />
      <shaderMaterial uniforms={uniforms} vertexShader={VERT} fragmentShader={FRAG} side={DoubleSide} />
    </mesh>
  );
}

interface Rig {
  update(): void;
  target: Vector3;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/** Плавно ведёт камеру к выбранной части или к виду на разрез; пользователь может перехватить управление в любой момент. */
function CameraRig({ ctrl, selected, explode }: { ctrl: RefObject<BrainControl>; selected: string | null; explode: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Rig | null;
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ at: Vector3; offset: Vector3 } | null>(null);
  const first = useRef(true);
  const cut = ctrl.current!.cut;
  const kind = ctrl.current!.kind;
  const spread = explode > 0.02;

  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      goal.current = null;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let f: Focus;
    let at: [number, number, number];
    if (selected && FOCUS[selected]) {
      f = FOCUS[selected];
      at = [...f.at];
      if (explode > 0) {
        const v = SIDED.has(selected) ? [Math.sign(at[0] || 1) * HEMI_SPREAD, 6, 0] : (SPREAD[selected] ?? [0, 0, 0]);
        at = [at[0] + v[0] * explode, at[1] + v[1] * explode, at[2] + v[2] * explode];
      }
    } else {
      f = spread ? SPREAD_VIEW : cut ? CUT_VIEWS[kind] : OVERVIEW;
      at = [...f.at];
    }
    goal.current = { at: new Vector3(...at).multiplyScalar(SCALE), offset: new Vector3(...f.dir).normalize().multiplyScalar(f.dist) };
    invalidate();
    // explode намеренно не в списке: разнос двигает камеру только при включении и выключении
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cut, kind, spread, invalidate]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-dt * 4.2);
    const offset = camera.position.clone().sub(controls.target);
    controls.target.lerp(g.at, k);
    offset.lerp(g.offset, k);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    invalidate();
    if (controls.target.distanceTo(g.at) < 0.004 && offset.distanceTo(g.offset) < 0.01) goal.current = null;
  });
  return null;
}

/** Целая поверхность с подложкой «белого вещества», которую видно при разнесении. */
function Cortex({ geo, color }: { geo: BufferGeometry; color: string }) {
  return (
    <>
      <mesh geometry={geo}>
        <meshPhysicalMaterial vertexColors color={color} roughness={0.42} clearcoat={0.55} clearcoatRoughness={0.34} sheen={0.55} sheenColor="#ffd9cc" sheenRoughness={0.5} />
      </mesh>
      <mesh geometry={geo} userData={EXPLODE_ONLY} visible={false}>
        <meshStandardMaterial color="#efe3cc" roughness={0.7} side={BackSide} />
      </mesh>
    </>
  );
}

const OVERLAY_DATA = { keepEmissive: true };
const OVERLAY_KEY = () => 'brain-overlay';
const LIFT = (shader: { vertexShader: string }) => {
  // приподнимаем накладку над корой на полмиллиметра, чтобы она не сливалась с поверхностью
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * 0.5;');
};
const EXPLODE_ONLY = { explodeOnly: true };

function Overlay({ geo, color }: { geo: BufferGeometry; color: string }) {
  return (
    <mesh geometry={geo} renderOrder={3}>
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.28}
        roughness={0.4}
        transparent
        opacity={0.88}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-3}
        polygonOffsetUnits={-3}
        userData={OVERLAY_DATA}
        toneMapped={false}
        onBeforeCompile={LIFT}
        customProgramCacheKey={OVERLAY_KEY}
      />
    </mesh>
  );
}

function Solid({ geo, color, rough = 0.45, opacity, side }: { geo: BufferGeometry; color: string; rough?: number; opacity?: number; side?: typeof DoubleSide }) {
  return (
    <mesh geometry={geo}>
      <meshPhysicalMaterial
        color={color}
        roughness={rough}
        clearcoat={0.45}
        clearcoatRoughness={0.4}
        sheen={0.4}
        sheenColor="#ffd9cc"
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
        depthWrite={opacity === undefined}
        side={side}
      />
    </mesh>
  );
}

function Brain({ state, names = {} }: ModelProps) {
  const data = use(loadBrain());
  const { selected } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const pieces = useMemo<Piece[]>(() => buildPieces(), []);
  const chiasm = useMemo(() => chiasmGeometry(), []);
  useEffect(
    () => () => {
      pieces.forEach((p) => p.geo.dispose());
      chiasm.dispose();
    },
    [pieces, chiasm],
  );

  const explodeTarget = state.explode ?? 0;
  const cutKind = state.cutKind ?? 'side';
  const ctrl = useRef<BrainControl>({ cut: false, kind: 'side', cutMm: CUTS.side.def, explode: 0, isolate: true, selected: null, hidden: new Set(), labels: true, modes: {} });
  const c = ctrl.current;
  c.cut = state.cutaway;
  c.kind = cutKind;
  const spec = CUTS[cutKind as 'side' | 'fundus' | 'coronal'];
  c.cutMm = spec.min + (spec.max - spec.min) * (state.cutAt ?? 0.5);
  c.isolate = state.isolate ?? true;
  c.selected = selected;
  c.hidden = state.hidden ?? new Set();
  c.labels = state.labels;
  c.modes = state.modes;

  useFrame((_, dt) => {
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else c.explode = explodeTarget;
  });

  const lobesMode = !!state.modes.lobes;
  const sideOf = (id: string): -1 | 1 => (id === 'broca-area' || id === 'wernicke-area' ? -1 : 1);

  return (
    <BrainContext.Provider value={ctrl}>
      <CameraRig ctrl={ctrl} selected={selected} explode={explodeTarget} />
      <group scale={SCALE}>
        {/* ---- Кора: доли ---- */}
        {LOBES.map((id) =>
          (data.lobes[id] ?? []).map(({ side, geo }) => (
            <BrainPart key={`${id}${side}`} id={id} side={side}>
              <Cortex geo={geo} color={lobesMode ? LOBE_COLOR[id] : NATURAL} />
              {side === 1 && <PartLabel id={id} names={names} />}
            </BrainPart>
          )),
        )}
        {/* ---- Зоны, борозды: накладки на кору ---- */}
        {ZONE_BITS.map((id) =>
          (data.zones[id] ?? []).map(({ side, geo }) => (
            <BrainPart key={`${id}${side}`} id={id} side={side} overlay>
              <Overlay geo={geo} color={ZONE_COLOR[id]} />
              {side === sideOf(id) && <PartLabel id={id} names={names} side={side} />}
            </BrainPart>
          )),
        )}

        {/* ---- Глубокие структуры и желудочки ---- */}
        {[...BRAIN_GROUPS['g-deep'], ...BRAIN_GROUPS['g-ventricles']].map((id) => {
          const geo = data.structs[id];
          const m = STRUCT_MAT[id];
          if (!geo || !m) return null;
          return (
            <BrainPart key={id} id={id}>
              <Solid geo={geo} color={m.color} rough={m.rough ?? 0.42} opacity={m.opacity} />
              <PartLabel id={id} names={names} />
            </BrainPart>
          );
        })}

        {/* ---- Мозжечок и ствол ---- */}
        <BrainPart id="cerebellum">
          <mesh geometry={data.cerebellum}>
            <meshPhysicalMaterial vertexColors color="#dcaa9c" roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.45} sheen={0.5} sheenColor="#ffd9cc" />
          </mesh>
          <PartLabel id="cerebellum" names={names} />
        </BrainPart>
        <BrainPart id="cerebellar-vermis" overlay>
          <Overlay geo={data.vermis} color="#a78bfa" />
          <PartLabel id="cerebellar-vermis" names={names} />
        </BrainPart>
        {Object.entries(data.stem).map(([id, geo]) => (
          <BrainPart key={id} id={id}>
            <Solid geo={geo} color={STEM_COLOR[id]} rough={0.5} />
            <PartLabel id={id} names={names} />
          </BrainPart>
        ))}

        {/* ---- Нервы, сосуды, листки оболочек ---- */}
        <BrainPart id="optic-nerves">
          <mesh geometry={chiasm}>
            <meshPhysicalMaterial color={TUBE_COLOR.nerve} roughness={0.4} clearcoat={0.5} />
          </mesh>
        </BrainPart>
        {pieces.map((p, i) => (
          <BrainPart key={`${p.id}-${i}`} id={p.id} side={p.side}>
            <mesh geometry={p.geo}>
              {p.kind === 'dura' ? (
                <meshStandardMaterial color={TUBE_COLOR.dura} roughness={0.7} transparent opacity={0.55} side={DoubleSide} depthWrite={false} />
              ) : (
                <meshPhysicalMaterial color={TUBE_COLOR[p.kind]} roughness={0.32} clearcoat={0.7} clearcoatRoughness={0.25} />
              )}
            </mesh>
            {i === pieces.findIndex((x) => x.id === p.id) && <PartLabel id={p.id} names={names} />}
          </BrainPart>
        ))}

        {/* ---- Мягкие и твёрдая оболочки ---- */}
        <BrainPart id="arachnoid">
          <mesh geometry={data.shells.arachnoid} renderOrder={5}>
            <meshPhysicalMaterial color="#dfe9f4" roughness={0.15} clearcoat={1} transparent opacity={0.2} depthWrite={false} />
          </mesh>
          <PartLabel id="arachnoid" names={names} />
        </BrainPart>
        <BrainPart id="dura-mater">
          <mesh geometry={data.shells.dura} renderOrder={6}>
            <meshPhysicalMaterial color="#c4a98f" roughness={0.45} clearcoat={0.6} transparent opacity={0.16} depthWrite={false} />
          </mesh>
          <PartLabel id="dura-mater" names={names} />
        </BrainPart>

        <Slice ctrl={ctrl} data={data} />
      </group>
    </BrainContext.Provider>
  );
}

export default function BrainModel(props: ModelProps) {
  return (
    <Suspense fallback={<Loading />}>
      <Brain {...props} />
    </Suspense>
  );
}

// чтобы реестр групп не считался неиспользуемым при tree-shaking
export const BRAIN_GROUP_OF = GROUP_OF;
