import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Vector3, type Group, type Material, type Mesh } from 'three';
import { Flow } from '../../three/Flow';
import { ModelPending } from '../../three/StageLoading';
import { heartbeat } from '../../three/geometry';
import { useSelection } from '../../three/selection';
import type { ModelProps, StageState } from '../../three/types';
import { loadBodyPart } from '../body/loader';
import {
  BODY_FLOOR,
  BODY_PART_IDS,
  BODY_SCALE,
  BODY_SPREAD,
  CAMERA_DIR_OVERRIDE,
  ENDOCRINE_CAMERA,
  ENDOCRINE_TARGET,
  FEEDBACK_FLOWS,
  PART_GROUPS,
  PITUITARY_PART_IDS,
  PITUITARY_SPREAD,
  RECEPTOR_PART_IDS,
  RECEPTOR_SPREAD,
  SYSTEMIC_FLOWS,
  viewOf,
  type EndocrineView,
  type HormoneFlowPath,
} from './anatomy';
import { curveOf, peptideMoleculeGeo, steroidMoleculeGeo, tube, type PartMeshDef, type PartMeshMap } from './geoHelpers';
import { loadEndocrineBody } from './loader';
import { makeGlassSkinMaterial, makeMaterial, type MatKey } from './materials';
import { buildPituitaryDiorama, PORTAL_FLOW_PATHS, TRACT_FLOW_PATHS } from './pituitaryScene';
import {
  buildReceptorDiorama,
  CAPILLARY_BLOOD_PATH,
  PEPTIDE_APPROACH_PATH,
  SECOND_MESSENGER_PATH,
  STEROID_CROSS_PATH,
} from './receptorScene';
import { buildTextures, type EndocrineTextures } from './textures';
import { EndocrineContext, EndocrinePart, PartLabel, type EndocrineControl } from './EndocrinePart';

/*
  3D-сцена раздела «Гормоны» (Systema endocrinum):
  1. Общий вид тела (body): стеклянный силуэт и все основные эндокринные железы в анатомически точных местах,
     сосудистая магистраль и потоки гормонов в крови, три плоскости среза, разнос и режим «Просвечивание».
  2. «Обратная связь» (feedback): живые нейроэндокринные оси ГГН (стресс), ГГЩ (обмен) и поджелудочная—печень
     с прямыми командами сверху (золото) и тормозящей обратной связью (бирюза).
  3. «Гипоталамус и гипофиз» (pituitary-axis): макродиорама ×10 с нейросекреторными ядрами, зрительным
     перекрёстом, портальной системой, нервным трактом, адено- и нейрогипофизом, турецким седлом и эпифизом.
  4. «Клетка и рецептор» (receptor): микроскопическая диорама экзоцитоза, фенестрированного капилляра,
     принципа «ключ и замок» для пептидных гормонов и прохождения стероидных гормонов к ДНК ядра.
*/

const bodyShift = new Vector3(0, BODY_FLOOR, 0);

interface Controls {
  target: Vector3;
  update(): void;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

/** Плавный подлёт камеры к выбранной железе, группе или диораме; пользователь сразу перехватывает управление. */
function CameraRig({
  view,
  focus,
  selected,
}: {
  view: EndocrineView;
  focus: Box3 | undefined;
  selected: string | null;
}) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const invalidate = useThree((s) => s.invalidate);
  const { width, height } = useThree((s) => s.size);
  const moving = useRef(false);
  const initialized = useRef(false);

  const goal = useMemo(() => {
    const aspect = Math.max(0.35, width / Math.max(1, height));
    const fit = (span: Vector3, padding: number) =>
      (Math.max(span.y, span.x / aspect) * padding) / (2 * Math.tan((Math.PI * 16) / 180)) + span.z * 0.55;

    const target = new Vector3(...ENDOCRINE_TARGET);
    const eye = new Vector3(...ENDOCRINE_CAMERA);

    const frame = (box: Box3, padding: number, dir: Vector3, minDist = 0.72) => {
      box.getCenter(target);
      const span = box.getSize(new Vector3());
      const dist = Math.max(minDist, fit(span, padding));
      eye.copy(target).add(dir.clone().normalize().multiplyScalar(dist));
    };

    if (focus) {
      const override = selected ? CAMERA_DIR_OVERRIDE[selected] : undefined;
      const defaultDir =
        view === 'pituitary-axis'
          ? new Vector3(0.72, 0.24, 0.68)
          : view === 'receptor'
            ? new Vector3(0.08, 0.14, 1.0)
            : new Vector3(0.24, 0.14, 1.0);
      const dir = override ? new Vector3(...override) : defaultDir;
      const minD =
        selected === 'parathyroid-glands'
          ? 1.05
          : view === 'body' || view === 'feedback'
            ? 0.68
            : 2.6;
      const pad = selected === 'parathyroid-glands' ? 2.1 : 1.55;
      frame(focus.clone(), pad, dir, minD);
    } else if (view === 'pituitary-axis') {
      frame(
        new Box3(new Vector3(-1.7, -2.1, -3.1), new Vector3(1.7, 2.5, 1.9)),
        1.32,
        new Vector3(0.80, 0.24, 0.58),
        7.4,
      );
    } else if (view === 'receptor') {
      frame(
        new Box3(new Vector3(-4.5, -2.2, -1.4), new Vector3(4.9, 2.3, 1.2)),
        1.08,
        new Vector3(0.04, 0.10, 1.0),
        7.5,
      );
    } else if (width > 0 && width < 540) {
      eye.set(1.45, 1.65, 8.2);
      target.set(0, 1.32, 0.04);
    }
    return { target, eye };
  }, [focus, height, selected, view, width]);

  useEffect(() => {
    if (!controls) return;
    if (!initialized.current && !focus && view === 'body') {
      initialized.current = true;
      return;
    }
    initialized.current = true;
    moving.current = true;
    invalidate();
    const stop = () => {
      moving.current = false;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls, focus, goal, invalidate, view]);

  useFrame(({ camera }, dt) => {
    if (!controls || !moving.current) return;
    const step = 1 - Math.exp(-6.5 * Math.min(0.08, Math.max(dt, 1 / 120)));
    camera.position.lerp(goal.eye, step);
    controls.target.lerp(goal.target, step);
    controls.update();
    moving.current = camera.position.distanceTo(goal.eye) > 0.015 || controls.target.distanceTo(goal.target) > 0.008;
    if (moving.current) invalidate();
  });

  return null;
}

/** Стеклянный силуэт человека (та же высокодетализированная кожа, что на главной странице). */
function GlassSkin({ faint }: { faint: boolean }) {
  const { skin } = use(loadBodyPart('skin'));
  const mat = useMemo(makeGlassSkinMaterial, []);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    mat.opacity = faint ? 0.06 : 0.13;
  }, [faint, mat]);
  return <mesh geometry={skin} material={mat} raycast={() => null} renderOrder={10} />;
}

/** Меши одной части с собственными экземплярами материалов для независимой подсветки и прозрачности. */
function PartMeshes({ defs, tex }: { defs: PartMeshDef[]; tex: EndocrineTextures }) {
  const mats = useMemo(() => {
    const map = new Map<MatKey, Material>();
    for (const d of defs) if (!map.has(d.mat)) map.set(d.mat, makeMaterial(d.mat, tex));
    return map;
  }, [defs, tex]);
  useEffect(
    () => () => {
      mats.forEach((m) => m.dispose());
    },
    [mats],
  );
  return (
    <>
      {defs.map((d, i) => (
        <mesh key={i} geometry={d.geo} material={mats.get(d.mat)} userData={{ noPick: d.noPick }} />
      ))}
    </>
  );
}

/** Потоки гормонов в кровотоке тела (в режиме «Обратная связь» рисует и светящиеся траектории осей). */
function BodyHormoneStreams({
  flows,
  state,
  hidden,
  showRibbons,
}: {
  flows: readonly HormoneFlowPath[];
  state: StageState;
  hidden: ReadonlySet<string>;
  showRibbons: boolean;
}) {
  const curves = useMemo(() => flows.map((f) => ({ f, curve: curveOf(f.points) })), [flows]);
  const ribbons = useMemo(() => {
    if (!showRibbons) return [];
    return flows.map((f) => ({
      id: f.id,
      source: f.source,
      color: f.color,
      geo: tube(f.points, 0.022, { radial: 8, segments: 44, caps: false }),
    }));
  }, [flows, showRibbons]);
  useEffect(() => () => ribbons.forEach((r) => r.geo.dispose()), [ribbons]);

  const pulse = (t: number) => 0.85 + 0.35 * Math.sin(t * 2.4);
  return (
    <>
      {ribbons.map((r) =>
        hidden.has(r.source) ? null : (
          <mesh key={`rib-${r.id}`} geometry={r.geo} raycast={() => null} renderOrder={6}>
            <meshStandardMaterial
              color={r.color}
              emissive={r.color}
              emissiveIntensity={0.65}
              transparent
              opacity={0.34}
              depthWrite={false}
              roughness={0.3}
            />
          </mesh>
        ),
      )}
      {curves.map(({ f, curve }) =>
        hidden.has(f.source) ? null : (
          <Flow
            key={f.id}
            path={curve}
            count={f.count}
            speed={f.speed}
            color={f.color}
            size={f.size}
            state={state}
            pulse={pulse}
          />
        ),
      )}
    </>
  );
}

/** Сборка всех желёз на фигуре человека (из фонового потока). */
function BodyScene({
  body,
  tex,
  state,
  names,
  view,
  hideLabels,
}: {
  body: PartMeshMap;
  tex: EndocrineTextures;
  state: StageState;
  names: Record<string, string>;
  view: EndocrineView;
  hideLabels: boolean;
}) {
  const { selected, isolate } = useSelection();
  const heartRef = useRef<Group>(null);
  const pulseRef = useRef<Group>(null);
  const hidden = state.hidden ?? new Set<string>();

  useFrame(() => {
    const t = state.time.current;
    if (heartRef.current) {
      const b = heartbeat(t).v;
      heartRef.current.scale.setScalar(1 - 0.032 * b);
    }
    if (pulseRef.current && view === 'feedback') {
      const wave = 1 + 0.028 * Math.sin(t * 2.8);
      pulseRef.current.scale.setScalar(wave);
    } else if (pulseRef.current) {
      pulseRef.current.scale.setScalar(1);
    }
  });

  const activeFlows = view === 'feedback' ? FEEDBACK_FLOWS : SYSTEMIC_FLOWS;

  return (
    <group scale={BODY_SCALE} position={[0, BODY_FLOOR, 0]}>
      {!isolate && (
        <Suspense fallback={<ModelPending />}>
          <GlassSkin faint={!!state.modes.xray || view === 'feedback' || !!selected} />
        </Suspense>
      )}
      {BODY_PART_IDS.map((id) => {
        const defs = body[id];
        if (!defs) return null;
        const inner = (
          <EndocrinePart id={id}>
            <PartMeshes defs={defs} tex={tex} />
            <PartLabel id={id} names={names} hide={hideLabels} />
          </EndocrinePart>
        );
        if (id === 'heart-endocrine') {
          return (
            <group key={id} position={[0.25, 12.68, 0.32]}>
              <group ref={heartRef}>
                <group position={[-0.25, -12.68, -0.32]}>{inner}</group>
              </group>
            </group>
          );
        }
        if (id === 'adenohypophysis') {
          return (
            <group key={id} position={[0, 15.96, 0.14]}>
              <group ref={pulseRef}>
                <group position={[0, -15.96, -0.14]}>{inner}</group>
              </group>
            </group>
          );
        }
        return <group key={id}>{inner}</group>;
      })}
      {!isolate && (state.explode ?? 0) < 0.05 && (
        <BodyHormoneStreams flows={activeFlows} state={state} hidden={hidden} showRibbons={view === 'feedback'} />
      )}
    </group>
  );
}

/** Макродиорама ×10 «Гипоталамус, гипофиз и эпифиз» с живым потоком релизинг-гормонов и аксоплазматическим транспортом. */
function PituitaryDioramaScene({
  parts,
  tex,
  state,
  names,
  hideLabels,
}: {
  parts: PartMeshMap;
  tex: EndocrineTextures;
  state: StageState;
  names: Record<string, string>;
  hideLabels: boolean;
}) {
  const { isolate } = useSelection();
  const portalCurves = useMemo(() => PORTAL_FLOW_PATHS.map((pts) => curveOf(pts)), []);
  const tractCurves = useMemo(() => TRACT_FLOW_PATHS.map((pts) => curveOf(pts)), []);
  const hidden = state.hidden ?? new Set<string>();
  const showFlows = !isolate && (state.explode ?? 0) < 0.05;

  return (
    <group>
      {PITUITARY_PART_IDS.map((id) => {
        const defs = parts[id];
        if (!defs) return null;
        return (
          <EndocrinePart key={id} id={id}>
            <PartMeshes defs={defs} tex={tex} />
            <PartLabel id={id} names={names} hide={hideLabels} />
          </EndocrinePart>
        );
      })}
      {showFlows && !hidden.has('portal-system') &&
        portalCurves.map((curve, i) => (
          <Flow
            key={`p-${i}`}
            path={curve}
            count={6}
            speed={0.28}
            size={0.055}
            color="#ffcf48"
            state={state}
          />
        ))}
      {showFlows && !hidden.has('hypo-tract') &&
        tractCurves.map((curve, i) => (
          <Flow
            key={`t-${i}`}
            path={curve}
            count={6}
            speed={0.22}
            size={0.050}
            color="#6ee7f0"
            state={state}
          />
        ))}
    </group>
  );
}

/** Живая анимация стыковки пептидного ключа, прохождения стероидного кольца сквозь мембрану и каскада cAMP. */
function ReceptorMotion({ state }: { state: StageState }) {
  const pepCurve = useMemo(() => curveOf(PEPTIDE_APPROACH_PATH), []);
  const msgCurve = useMemo(() => curveOf(SECOND_MESSENGER_PATH), []);
  const sterCurve = useMemo(() => curveOf(STEROID_CROSS_PATH), []);
  const bloodCurve = useMemo(() => curveOf(CAPILLARY_BLOOD_PATH), []);

  const pepGeo = useMemo(() => peptideMoleculeGeo([0, 0, 0], 0.30), []);
  const sterGeo = useMemo(() => steroidMoleculeGeo([0, 0, 0], 0.18), []);
  useEffect(() => () => {
    pepGeo.dispose();
    sterGeo.dispose();
  }, [pepGeo, sterGeo]);

  const pepMesh = useRef<Mesh>(null);
  const sterMesh = useRef<Mesh>(null);
  const glowMesh = useRef<Mesh>(null);

  useFrame(() => {
    const t = state.time.current;
    // цикл 5.5 с: пептид подлетает, задерживается в замке рецептора, запускает вспышку внутри клетки
    const pPhase = (t * 0.20) % 1;
    const dockU = pPhase < 0.65 ? pPhase / 0.65 : 1.0;
    if (pepMesh.current) {
      pepMesh.current.position.copy(pepCurve.getPointAt(dockU));
      pepMesh.current.rotation.y = t * 0.7;
    }
    if (glowMesh.current) {
      const active = pPhase >= 0.60 ? Math.sin(((pPhase - 0.60) / 0.40) * Math.PI) : 0;
      glowMesh.current.visible = active > 0.02;
      glowMesh.current.scale.setScalar(0.18 + 0.24 * active);
    }
    // стероидный гормон плавно скользит прямо через двойной липидный слой к ядру
    const sPhase = (t * 0.16 + 0.35) % 1;
    if (sterMesh.current) {
      sterMesh.current.position.copy(sterCurve.getPointAt(sPhase));
      sterMesh.current.rotation.z = t * 0.6;
      sterMesh.current.rotation.x = 0.25 + 0.2 * Math.sin(t);
    }
  });

  return (
    <>
      <mesh ref={pepMesh} geometry={pepGeo} raycast={() => null}>
        <meshPhysicalMaterial
          color="#35e0d8"
          emissive="#0f8d88"
          emissiveIntensity={0.55}
          roughness={0.22}
          clearcoat={0.85}
        />
      </mesh>
      <mesh ref={glowMesh} position={[1.96, 0.65, 0.14]} raycast={() => null}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshBasicMaterial color="#60f0ff" transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <mesh ref={sterMesh} geometry={sterGeo} raycast={() => null}>
        <meshPhysicalMaterial
          color="#ffc538"
          emissive="#ba7608"
          emissiveIntensity={0.55}
          roughness={0.2}
          clearcoat={0.9}
        />
      </mesh>
      {/* каскад вторичных посредников (cAMP) от мембранного рецептора внутрь к ядру */}
      <Flow path={msgCurve} count={6} speed={0.42} size={0.068} color="#5ce8ff" state={state} />
      {/* ток плазмы и гормонов по фенестрированному капилляру */}
      <Flow path={bloodCurve} count={10} speed={0.22} size={0.052} color="#ff9282" state={state} />
    </>
  );
}

/** Микроскопическая диорама «Клетка и рецептор». */
function ReceptorDioramaScene({
  parts,
  tex,
  state,
  names,
  hideLabels,
}: {
  parts: PartMeshMap;
  tex: EndocrineTextures;
  state: StageState;
  names: Record<string, string>;
  hideLabels: boolean;
}) {
  const { isolate } = useSelection();
  const showMotion = !isolate && (state.explode ?? 0) < 0.05;
  return (
    <group>
      {RECEPTOR_PART_IDS.map((id) => {
        const defs = parts[id];
        if (!defs) return null;
        return (
          <EndocrinePart key={id} id={id}>
            <PartMeshes defs={defs} tex={tex} />
            <PartLabel id={id} names={names} hide={hideLabels} />
          </EndocrinePart>
        );
      })}
      {showMotion && <ReceptorMotion state={state} />}
    </group>
  );
}

/** Загружает сетки тела асинхронно, чтобы камера могла вычислять фокус без блокировки Suspense. */
function useEndocrineBodySet(): PartMeshMap | null {
  const [set, setSet] = useState<PartMeshMap | null>(null);
  useEffect(() => {
    let alive = true;
    loadEndocrineBody().then(
      (s) => alive && setSet(s),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return set;
}

function disposeMeshMap(map: PartMeshMap | null) {
  if (!map) return;
  for (const defs of Object.values(map)) {
    for (const d of defs) d.geo.dispose();
  }
}

export default function EndocrineModel({ state, names = {} }: ModelProps) {
  const { selected, isolate } = useSelection();
  const invalidate = useThree((s) => s.invalidate);
  const view = viewOf(state.modes, selected);
  const tex = useMemo(buildTextures, []);
  const body = useEndocrineBodySet();

  // макро- и микродиорамы собираются лениво только при первом входе в соответствующий режим
  const pituitary = useMemo(() => (view === 'pituitary-axis' ? buildPituitaryDiorama() : null), [view]);
  const receptor = useMemo(() => (view === 'receptor' ? buildReceptorDiorama() : null), [view]);

  useEffect(() => {
    for (const defs of Object.values(pituitary ?? {})) for (const d of defs) d.geo.computeBoundingBox();
    return () => disposeMeshMap(pituitary);
  }, [pituitary]);

  useEffect(() => {
    for (const defs of Object.values(receptor ?? {})) for (const d of defs) d.geo.computeBoundingBox();
    return () => disposeMeshMap(receptor);
  }, [receptor]);

  useEffect(
    () => () => {
      Object.values(tex).forEach((t) => t?.dispose());
    },
    [tex],
  );

  const explodeTarget = state.explode ?? 0;
  const ctrl = useRef<EndocrineControl>({
    view: 'body',
    cut: false,
    kind: 'side',
    cutAt: 0.5,
    explode: 0,
    ghost: true,
    isolate: false,
    selected: null,
    hidden: new Set(),
    labels: true,
    xray: false,
  });

  ctrl.current.view = view;
  ctrl.current.cut = state.cutaway;
  ctrl.current.kind = state.cutKind ?? 'side';
  ctrl.current.cutAt = state.cutAt ?? 0.5;
  ctrl.current.ghost = state.isolate ?? true;
  ctrl.current.isolate = isolate;
  ctrl.current.selected = selected;
  ctrl.current.hidden = state.hidden ?? new Set();
  ctrl.current.labels = state.labels;
  ctrl.current.xray = !!state.modes.xray;

  useFrame((_, dt) => {
    const c = ctrl.current;
    const diff = explodeTarget - c.explode;
    if (Math.abs(diff) > 0.001) {
      c.explode += diff * Math.min(1, dt * 8);
      invalidate();
    } else {
      c.explode = explodeTarget;
    }
  });

  const focus = useMemo(() => {
    if (!selected) return undefined;
    const activeMap = view === 'pituitary-axis' ? pituitary : view === 'receptor' ? receptor : body;
    if (!activeMap) return undefined;
    const spreadMap =
      view === 'pituitary-axis' ? PITUITARY_SPREAD : view === 'receptor' ? RECEPTOR_SPREAD : BODY_SPREAD;
    const box = new Box3();
    for (const [id, defs] of Object.entries(activeMap)) {
      if (id !== selected && PART_GROUPS[id] !== selected) continue;
      const d = spreadMap[id] ?? [0, 0, 0];
      const shift = new Vector3(d[0] * explodeTarget, d[1] * explodeTarget, d[2] * explodeTarget);
      for (const def of defs) {
        if (!def.geo.boundingBox) def.geo.computeBoundingBox();
        if (def.geo.boundingBox) box.union(def.geo.boundingBox.clone().translate(shift));
      }
    }
    if (box.isEmpty()) return undefined;
    if (view === 'body' || view === 'feedback') {
      box.min.multiplyScalar(BODY_SCALE).add(bodyShift);
      box.max.multiplyScalar(BODY_SCALE).add(bodyShift);
    }
    return box;
  }, [body, explodeTarget, pituitary, receptor, selected, view]);

  const hideLabels = explodeTarget > 0.04;

  return (
    <EndocrineContext.Provider value={ctrl}>
      {(view === 'body' || view === 'feedback') && !body && <ModelPending phase="building" />}
      <CameraRig view={view} focus={focus} selected={selected} />
      {view === 'pituitary-axis' && pituitary ? (
        <PituitaryDioramaScene parts={pituitary} tex={tex} state={state} names={names} hideLabels={hideLabels} />
      ) : view === 'receptor' && receptor ? (
        <ReceptorDioramaScene parts={receptor} tex={tex} state={state} names={names} hideLabels={hideLabels} />
      ) : body ? (
        <BodyScene body={body} tex={tex} state={state} names={names} view={view} hideLabels={hideLabels} />
      ) : null}
    </EndocrineContext.Provider>
  );
}
