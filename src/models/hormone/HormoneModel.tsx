import { Suspense, use, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Box3,
  BufferGeometry,
  Matrix4,
  SphereGeometry,
  Vector3,
  type Group,
  type MeshPhysicalMaterial,
} from 'three';
import { Flow } from '../../three/Flow';
import { Label } from '../../three/Label';
import { ModelPending } from '../../three/StageLoading';
import { usePart } from '../../three/materials';
import { useIsActive, useSelection } from '../../three/selection';
import type { ModelProps, StageState } from '../../three/types';
import { loadBodyPart } from '../body/loader';
import { BODY_FLOOR, BODY_SCALE, ENDOCRINE_CAMERA, ENDOCRINE_TARGET } from '../endocrine/anatomy';
import { curveOf, ellipGeo, safeMerge, strutGeo, tube, type V3 } from '../endocrine/geoHelpers';
import { makeGlassSkinMaterial } from '../endocrine/materials';
import { CPK_COLORS, CPK_RADII, getMoleculeSpec, type MoleculeSpec } from './chemistry';
import { HORMONE_PATHWAYS, ORGAN_NODES, type OrganNodeId } from './pathwayData';

/*
  3D-сцена страницы отдельного гормона (/razdel/gormony/:hormone):
  1. Режим «Молекула» (по умолчанию): химически достоверная 3D-структура — атомы CPK и одинарные/двойные
     ковалентные связи для аминов, йодтиронинов и стероидов, либо 3D-ленты альфа-спиралей, петли и
     золотистые дисульфидные мостики S—S для пептидных и белковых гормонов.
  2. Режим «Оболочка молекулы» (surface): полупрозрачная ван-дер-ваальсова поверхность «формы ключа».
  3. Режим «Путь в теле» (pathway): стеклянный силуэт человека с подсвеченным органом-источником,
     органами-мишенями, потоками доставки по крови и контуром торможения/выведения гормона.
*/

const BODY_PART_IDS = new Set(['body-source', 'body-targets', 'body-brake']);
const bodyShift = new Vector3(0, BODY_FLOOR, 0);

interface Controls {
  target: Vector3;
  update(): void;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

function viewMode(modes: StageState['modes'], selected: string | null): 'molecule' | 'pathway' {
  if (selected && BODY_PART_IDS.has(selected)) return 'pathway';
  if (selected && selected.startsWith('mol-')) return 'molecule';
  return modes.pathway ? 'pathway' : 'molecule';
}

/** Плавный подлёт камеры между 3D-молекулой и силуэтом тела «Путь в теле». */
function CameraRig({ view, molSpan }: { view: 'molecule' | 'pathway'; molSpan: Vector3 }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const { width, height } = useThree((s) => s.size);
  const moving = useRef(false);
  const snapped = useRef(false);

  const goal = useMemo(() => {
    const aspect = Math.max(0.45, width / Math.max(1, height));
    if (view === 'pathway') {
      const target = new Vector3(...ENDOCRINE_TARGET);
      const eye = new Vector3(...ENDOCRINE_CAMERA);
      if (width > 0 && width < 540) {
        eye.set(1.45, 1.65, 8.2);
      } else if (aspect < 1.05) {
        eye.sub(target).multiplyScalar(1.05 / Math.max(0.76, aspect)).add(target);
      }
      return { target, eye };
    }
    const fitW = (molSpan.x + 1.8) / aspect;
    const fitH = molSpan.y + 1.8;
    const dist = (Math.max(fitW, fitH) * 1.24) / (2 * Math.tan((Math.PI * 16) / 180)) + molSpan.z * 0.6;
    const target = new Vector3(0, 0, 0);
    const eye = new Vector3(0.18, 0.18, 1).normalize().multiplyScalar(Math.max(10.5, dist));
    return { target, eye };
  }, [height, molSpan, view, width]);

  useEffect(() => {
    if (!controls) return;
    if (!snapped.current && view === 'molecule') {
      // при первом открытии сразу ставим камеру на точное расстояние под размер конкретной молекулы
      snapped.current = true;
      camera.position.copy(goal.eye);
      controls.target.copy(goal.target);
      controls.update();
      invalidate();
      return;
    }
    moving.current = true;
    invalidate();
    const stop = () => {
      moving.current = false;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [camera, controls, goal, invalidate, view]);

  useFrame(({ camera: cam }, dt) => {
    if (!controls || !moving.current) return;
    const step = 1 - Math.exp(-6.5 * Math.min(0.08, Math.max(dt, 1 / 120)));
    cam.position.lerp(goal.eye, step);
    controls.target.lerp(goal.target, step);
    controls.update();
    moving.current = cam.position.distanceTo(goal.eye) > 0.015 || controls.target.distanceTo(goal.target) > 0.008;
    if (moving.current) invalidate();
  });

  return null;
}

/** Строит парный цилиндр для двойной связи (order === 2) или одиночный для одинарной. */
function bondCylinder(a: V3, b: V3, order: 1 | 2): BufferGeometry[] {
  if (order === 1) return [strutGeo(a, b, 0.088, 0.088, 10)];
  const dir = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const up = Math.abs(dir.y) < 0.85 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  const perp = new Vector3().crossVectors(dir, up).normalize().multiplyScalar(0.082);
  const p1a: V3 = [a[0] + perp.x, a[1] + perp.y, a[2] + perp.z];
  const p1b: V3 = [b[0] + perp.x, b[1] + perp.y, b[2] + perp.z];
  const p2a: V3 = [a[0] - perp.x, a[1] - perp.y, a[2] - perp.z];
  const p2b: V3 = [b[0] - perp.x, b[1] - perp.y, b[2] - perp.z];
  return [strutGeo(p1a, p1b, 0.062, 0.062, 8), strutGeo(p2a, p2b, 0.062, 0.062, 8)];
}

interface BuiltMolMesh {
  partId: string;
  color: string;
  geo: BufferGeometry;
  metallic?: boolean;
  emissive?: string;
}

/** Сборка 3D-геометрии молекулы (атомной или пептидной) + ван-дер-ваальсова оболочка. */
function buildMoleculeMeshes(spec: MoleculeSpec, accent: string): {
  meshes: BuiltMolMesh[];
  surface: BufferGeometry;
  radius: number;
} {
  const meshes: BuiltMolMesh[] = [];
  const surfParts: BufferGeometry[] = [];
  const box = new Box3();

  if (spec.kind === 'atomic') {
    // группируем атомы по (partId, element) для минимума draw calls и чистой подсветки частей
    const atomBuckets = new Map<string, { partId: string; el: keyof typeof CPK_COLORS; geos: BufferGeometry[] }>();
    for (const atom of spec.atoms) {
      const r = CPK_RADII[atom.el];
      const g = new SphereGeometry(r, 24, 16);
      g.translate(atom.pos[0], atom.pos[1], atom.pos[2]);
      const k = `${atom.partId}::${atom.el}`;
      const bucket = atomBuckets.get(k) ?? { partId: atom.partId, el: atom.el, geos: [] };
      bucket.geos.push(g);
      atomBuckets.set(k, bucket);

      // ван-дер-ваальсова сфера для режима «Оболочка молекулы»
      const sv = new SphereGeometry(r * 2.45, 16, 12);
      sv.translate(atom.pos[0], atom.pos[1], atom.pos[2]);
      surfParts.push(sv);
      box.expandByPoint(new Vector3(...atom.pos));
    }
    for (const b of atomBuckets.values()) {
      meshes.push({
        partId: b.partId,
        color: CPK_COLORS[b.el],
        geo: safeMerge(b.geos),
        emissive: b.el === 'I' ? '#4a1878' : b.el === 'O' ? '#521010' : b.el === 'N' ? '#102866' : undefined,
      });
    }

    // группируем ковалентные связи по partId
    const bondBuckets = new Map<string, BufferGeometry[]>();
    for (const bond of spec.bonds) {
      const a = spec.atoms[bond.a];
      const b = spec.atoms[bond.b];
      if (!a || !b) continue;
      const list = bondBuckets.get(bond.partId) ?? [];
      list.push(...bondCylinder(a.pos, b.pos, bond.order));
      bondBuckets.set(bond.partId, list);
    }
    for (const [partId, geos] of bondBuckets) {
      meshes.push({ partId, color: '#bcc6d6', geo: safeMerge(geos), metallic: true });
    }
  } else {
    // пептидные/белковые ленты, дисульфидные мостики и маркеры активных остатков
    for (const r of spec.ribbons) {
      const segs = Math.max(24, r.points.length * 4);
      const rad = typeof r.radius === 'number' ? r.radius : () => r.radius;
      const geo = tube(r.points, rad, { segments: segs, radial: r.kind === 'helix' ? 14 : 10 });
      meshes.push({
        partId: r.partId,
        color: r.color,
        geo,
        emissive: r.kind === 'disulfide' ? '#8c6408' : r.kind === 'motif' ? '#6e4608' : undefined,
      });
      // полупрозрачная оболочка вокруг ленты
      const envR = typeof r.radius === 'number' ? r.radius * 2.6 : Math.max(r.radius[0], r.radius[1]) * 2.6;
      surfParts.push(tube(r.points, envR, { segments: Math.max(16, r.points.length * 2), radial: 10 }));
      for (const p of r.points) box.expandByPoint(new Vector3(...p));
    }
    for (const mk of spec.markers) {
      const g = new SphereGeometry(mk.radius, 22, 16);
      g.translate(mk.pos[0], mk.pos[1], mk.pos[2]);
      meshes.push({
        partId: mk.partId,
        color: mk.color,
        geo: g,
        emissive: accent,
      });
      const sv = new SphereGeometry(mk.radius * 2.3, 14, 10);
      sv.translate(mk.pos[0], mk.pos[1], mk.pos[2]);
      surfParts.push(sv);
      box.expandByPoint(new Vector3(...mk.pos));
    }
  }

  const size = box.getSize(new Vector3());
  const radius = Math.max(2.4, Math.hypot(size.x, size.y, size.z) * 0.5);
  return { meshes, surface: safeMerge(surfParts), radius };
}

function MolChunk({ item }: { item: BuiltMolMesh }) {
  const { active, handlers } = usePart(item.partId);
  const { selected } = useSelection();
  const dimmed = !!selected && selected !== item.partId && !BODY_PART_IDS.has(selected);
  return (
    <mesh geometry={item.geo} {...handlers}>
      <meshPhysicalMaterial
        color={item.color}
        roughness={item.metallic ? 0.34 : 0.24}
        metalness={item.metallic ? 0.28 : 0.04}
        clearcoat={item.metallic ? 0.5 : 0.88}
        clearcoatRoughness={0.14}
        sheen={0.35}
        sheenColor="#ffffff"
        transparent={dimmed}
        opacity={dimmed ? 0.24 : 1}
        depthWrite={!dimmed}
        emissive={active ? '#ffa858' : item.emissive ?? '#000000'}
        emissiveIntensity={active ? 0.42 : item.emissive ? 0.16 : 0}
      />
    </mesh>
  );
}

/** 3D-молекула с плавным «дыханием», кликабельными доменами и опциональной поверхностью Ван-дер-Ваальса. */
function MoleculeScene({
  spec,
  accent,
  state,
  names,
}: {
  spec: MoleculeSpec;
  accent: string;
  state: StageState;
  names: Record<string, string>;
}) {
  const built = useMemo(() => buildMoleculeMeshes(spec, accent), [spec, accent]);
  useEffect(
    () => () => {
      built.meshes.forEach((m) => m.geo.dispose());
      built.surface.dispose();
    },
    [built],
  );

  const root = useRef<Group>(null);
  const { selected } = useSelection();
  useFrame(() => {
    if (!root.current) return;
    const t = state.time.current;
    root.current.position.y = 0.08 * Math.sin(t * 1.15);
    root.current.rotation.z = 0.03 * Math.sin(t * 0.65);
  });

  const showSurface = !!state.modes.surface;

  return (
    <group ref={root}>
      {built.meshes.map((item, i) => (
        <MolChunk key={`${item.partId}-${i}`} item={item} />
      ))}
      {showSurface && (
        <mesh geometry={built.surface} raycast={() => null} renderOrder={8}>
          <meshPhysicalMaterial
            color={accent}
            transparent
            opacity={0.22}
            roughness={0.14}
            clearcoat={1}
            clearcoatRoughness={0.08}
            depthWrite={false}
          />
        </mesh>
      )}
      {Object.entries(spec.labelAt).map(([id, at]) => (
        <Label
          key={id}
          at={at}
          partId={id}
          text={names[id]}
          labels={state.labels && (!selected || selected === id)}
          inner
        />
      ))}
    </group>
  );
}

/* ---------------- Режим «Путь в теле» ---------------- */

function GlassSkin() {
  const { skin } = use(loadBodyPart('skin'));
  const mat = useMemo(makeGlassSkinMaterial, []);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh geometry={skin} material={mat} raycast={() => null} renderOrder={10} />;
}

function buildOrganCluster(ids: OrganNodeId[]): BufferGeometry {
  const geos: BufferGeometry[] = [];
  const mat = new Matrix4();
  for (const id of ids) {
    const n = ORGAN_NODES[id];
    geos.push(ellipGeo(n.pos, n.r, [0, 0, 0], 18, 12));
    if (n.mirror) {
      const m = ellipGeo([-n.pos[0], n.pos[1], n.pos[2]], n.r, [0, 0, 0], 18, 12);
      m.applyMatrix4(mat.identity());
      geos.push(m);
    }
  }
  return safeMerge(geos);
}

function PathwayNode({
  partId,
  geo,
  color,
  emissive,
  pulse,
  state,
}: {
  partId: string;
  geo: BufferGeometry;
  color: string;
  emissive: string;
  pulse?: boolean;
  state: StageState;
}) {
  const { handlers } = usePart(partId);
  const active = useIsActive(partId);
  const { selected } = useSelection();
  const dimmed = !!selected && BODY_PART_IDS.has(selected) && selected !== partId;
  const matRef = useRef<MeshPhysicalMaterial>(null);
  useFrame(() => {
    if (!matRef.current) return;
    const glow = pulse ? 0.16 * (0.5 + 0.5 * Math.sin(state.time.current * 3.2)) : 0;
    matRef.current.emissiveIntensity = (active ? 0.68 : 0.32) + glow;
  });
  return (
    <mesh geometry={geo} {...handlers}>
      <meshPhysicalMaterial
        ref={matRef}
        color={color}
        emissive={active ? '#ffb868' : emissive}
        emissiveIntensity={active ? 0.68 : 0.32}
        roughness={0.34}
        clearcoat={0.62}
        transparent={dimmed}
        opacity={dimmed ? 0.22 : 0.92}
        depthWrite={!dimmed}
      />
    </mesh>
  );
}

function PathwayScene({
  slug,
  accent,
  state,
  names,
}: {
  slug: string;
  accent: string;
  state: StageState;
  names: Record<string, string>;
}) {
  const data = HORMONE_PATHWAYS[slug];
  const { selected } = useSelection();

  const geos = useMemo(() => {
    const sourceGeo = buildOrganCluster(data.sources);
    const targetGeo = buildOrganCluster(data.targets);
    const brakeGeo = buildOrganCluster(data.brakes);
    const deliveryRibbons = data.deliveryPaths.map((pts) => tube(pts, 0.030, { radial: 8, segments: 36, caps: false }));
    const brakeRibbons = data.brakePaths.map((pts) => tube(pts, 0.024, { radial: 8, segments: 36, caps: false }));
    const deliveryCurves = data.deliveryPaths.map((pts) => curveOf(pts));
    const brakeCurves = data.brakePaths.map((pts) => curveOf(pts));
    return { sourceGeo, targetGeo, brakeGeo, deliveryRibbons, brakeRibbons, deliveryCurves, brakeCurves };
  }, [data]);

  useEffect(
    () => () => {
      geos.sourceGeo.dispose();
      geos.targetGeo.dispose();
      geos.brakeGeo.dispose();
      geos.deliveryRibbons.forEach((g) => g.dispose());
      geos.brakeRibbons.forEach((g) => g.dispose());
    },
    [geos],
  );

  return (
    <group scale={BODY_SCALE} position={[0, BODY_FLOOR, 0]}>
      <Suspense fallback={<ModelPending />}>
        <GlassSkin />
      </Suspense>
      <PathwayNode partId="body-source" geo={geos.sourceGeo} color="#f5b832" emissive="#c27a0a" pulse state={state} />
      <PathwayNode partId="body-targets" geo={geos.targetGeo} color={accent} emissive={accent} state={state} />
      <PathwayNode partId="body-brake" geo={geos.brakeGeo} color="#2dc4b6" emissive="#127c72" state={state} />

      {geos.deliveryRibbons.map((g, i) => (
        <mesh key={`del-${i}`} geometry={g} raycast={() => null} renderOrder={6}>
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.65} transparent opacity={0.36} depthWrite={false} />
        </mesh>
      ))}
      {geos.brakeRibbons.map((g, i) => (
        <mesh key={`brk-${i}`} geometry={g} raycast={() => null} renderOrder={6}>
          <meshStandardMaterial color="#2be0d2" emissive="#2be0d2" emissiveIntensity={0.65} transparent opacity={0.34} depthWrite={false} />
        </mesh>
      ))}
      {geos.deliveryCurves.map((c, i) => (
        <Flow key={`df-${i}`} path={c} count={7} speed={0.22} size={0.056} color="#ffcf48" state={state} />
      ))}
      {geos.brakeCurves.map((c, i) => (
        <Flow key={`bf-${i}`} path={c} count={6} speed={0.18} size={0.048} color="#34e8da" state={state} />
      ))}

      {(['body-source', 'body-targets', 'body-brake'] as const).map((id) => (
        <Label
          key={id}
          at={data.labelAt[id]}
          partId={id}
          text={names[id]}
          labels={state.labels && (!selected || selected === id)}
          inner
        />
      ))}
    </group>
  );
}

export interface HormoneModelProps extends ModelProps {
  slug: string;
  accent: string;
}

export default function HormoneModel({ slug, accent, state, names = {} }: HormoneModelProps) {
  const { selected } = useSelection();
  const view = viewMode(state.modes, selected);
  const spec = useMemo(() => getMoleculeSpec(slug), [slug]);
  const molSpan = useMemo(() => {
    const b = new Box3();
    for (const a of spec.atoms) b.expandByPoint(new Vector3(...a.pos));
    for (const r of spec.ribbons) for (const p of r.points) b.expandByPoint(new Vector3(...p));
    for (const m of spec.markers) b.expandByPoint(new Vector3(...m.pos));
    return b.getSize(new Vector3());
  }, [spec]);

  return (
    <>
      <CameraRig view={view} molSpan={molSpan} />
      {view === 'pathway' ? (
        <PathwayScene slug={slug} accent={accent} state={state} names={names} />
      ) : (
        <MoleculeScene spec={spec} accent={accent} state={state} names={names} />
      )}
    </>
  );
}

export { bodyShift };
