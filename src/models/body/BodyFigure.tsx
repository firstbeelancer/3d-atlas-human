import { Suspense, use, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { CanvasTexture, MeshPhysicalMaterial, Object3D, SRGBColorSpace, type BufferGeometry, type Group, type InstancedMesh } from 'three';
import type { ModelProps } from '../../three/types';
import { heartbeat } from '../../three/geometry';
import { Label } from '../../three/Label';
import { useIsActive, useSelection } from '../../three/selection';
import { getSection } from '../../content/sections';
import { t } from '../../i18n';

/** Подписи, которые называют сам орган, а не раздел: селезёнка ведёт в обзорный раздел «Внутренние органы». */
const LABEL_TEXT: Record<string, () => string> = { 'vnutrennie-organy': () => t('home.spleen') };
import { JOINTS, VERTEBRAE, type VertebraSpot } from '../skeleton/anatomy';
import type { SkeletonGeometry } from '../skeleton/bones';
import type { V3 } from '../skeleton/sdf';
import { loadBodyPart } from './loader';
import { ModelPending } from '../../three/StageLoading';
import { LABEL_AT, MATERIALS, PARTS, PIVOTS, type PartSpec } from './meta';
import { ARM_ABDUCTION } from './skin';

/*
  Стеклянная фигура человека с настоящими органами внутри — витрина главной страницы.
  Кожа — гладкая оболочка из поля расстояний; под ней скелет (общий с разделом «Скелет»), мозг с извилинами,
  глаза, уши, лёгкие и бронхи, сердце с коронарными сосудами, печень, желудок, кишечник, почки,
  сосуды и нервы. Первое касание органа подписывает его, второе открывает раздел.
  Все тяжёлые сетки строятся в фоновых потоках (build.ts), поэтому страница не замирает.
*/

/** Модель строится в дециметрах (рост 17,5); на сцене фигура высотой 8 единиц, стопы на y = −4,3. */
const SCALE = 8 / 17.5;
const FOOT_Y = -4.3;

const HIGHLIGHT = { emissive: '#ffb38a', emissiveIntensity: 0.45 } as const;
const NO_RAY = () => null;

/** Общие обработчики: наведение, первое касание — подпись, второе — переход в раздел. */
function Interactive({ slug, children }: { slug: string; children: ReactNode }) {
  const { selected, select, hover } = useSelection();
  const navigate = useNavigate();
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (selected === slug) navigate(`/razdel/${slug}`);
        else select(slug);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hover(slug);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hover(null);
        document.body.style.cursor = '';
      }}
    >
      {children}
    </group>
  );
}

/** Материал органа; подсвечивается, когда раздел выбран или на него навели курсор. */
function Tissue({ slug, kind, geometry }: { slug: string; kind: string; geometry?: BufferGeometry }) {
  const active = useIsActive(slug);
  const m = MATERIALS[kind];
  return (
    <meshPhysicalMaterial
      {...m}
      vertexColors={!!geometry?.attributes.color}
      emissive={active ? HIGHLIGHT.emissive : '#000000'}
      emissiveIntensity={active ? HIGHLIGHT.emissiveIntensity : 0}
    />
  );
}

/* ---------------- Кожа ---------------- */

/** Стекло с «каёмкой»: края оболочки плотнее, середина прозрачнее — видны и силуэт, и органы внутри. */
function useGlass(): MeshPhysicalMaterial {
  const material = useMemo(() => {
    const m = new MeshPhysicalMaterial({
      color: '#b9c6dc',
      transparent: true,
      opacity: 0.16,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
      depthWrite: false,
    });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float rim = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.4);
         diffuseColor.a = clamp(diffuseColor.a + rim * 0.5, 0.0, 1.0);
         outgoingLight += vec3(0.5, 0.64, 0.9) * rim * 0.5;
         #include <opaque_fragment>`,
      );
    };
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

function Skin() {
  const { skin } = use(loadBodyPart('skin'));
  const glass = useGlass();
  return <mesh geometry={skin} material={glass} raycast={NO_RAY} renderOrder={10} />;
}

/* ---------------- Скелет ---------------- */

type Geo = SkeletonGeometry;
const neg = (p: V3): V3 => [-p[0], -p[1], -p[2]];

function Pivot({ at, rotation, children }: { at: V3; rotation?: V3; children: ReactNode }) {
  return (
    <group position={at}>
      <group rotation={rotation ?? [0, 0, 0]}>
        <group position={neg(at)}>{children}</group>
      </group>
    </group>
  );
}

function Bone({ geometry, kind = 'bone', ray = false, glass = false }: { geometry: BufferGeometry; kind?: string; ray?: boolean; glass?: boolean }) {
  const active = useIsActive('skelet');
  const m = MATERIALS[kind];
  return (
    <mesh geometry={geometry} raycast={ray ? undefined : NO_RAY} renderOrder={glass ? 5 : 0}>
      <meshPhysicalMaterial
        {...m}
        vertexColors={!!geometry.attributes.color}
        transparent={glass}
        opacity={glass ? 0.4 : 1}
        depthWrite={!glass}
        emissive={active ? HIGHLIGHT.emissive : '#000000'}
        emissiveIntensity={active ? HIGHLIGHT.emissiveIntensity : 0}
      />
    </mesh>
  );
}

const dummy = new Object3D();

function Vertebrae({ geometry, spots }: { geometry: BufferGeometry; spots: VertebraSpot[] }) {
  const ref = useRef<InstancedMesh>(null);
  const active = useIsActive('skelet');
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    spots.forEach((s, i) => {
      dummy.position.set(0, s.y, s.z);
      dummy.rotation.set(s.tilt, 0, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, spots.length]} raycast={NO_RAY}>
      <meshPhysicalMaterial
        {...MATERIALS.bone}
        vertexColors={!!geometry.attributes.color}
        emissive={active ? HIGHLIGHT.emissive : '#000000'}
        emissiveIntensity={active ? HIGHLIGHT.emissiveIntensity : 0}
      />
    </instancedMesh>
  );
}

function Discs({ geometry }: { geometry: BufferGeometry }) {
  const ref = useRef<InstancedMesh>(null);
  const items = useMemo(() => {
    const all = [
      ...VERTEBRAE.cervical.map((s) => ({ s, r: 0.13, h: 0.035 })),
      ...VERTEBRAE.thoracic.map((s) => ({ s, r: 0.135, h: 0.04 })),
      ...VERTEBRAE.lumbar.map((s) => ({ s, r: 0.2, h: 0.055 })),
    ];
    const out: { y: number; z: number; tilt: number; r: number; h: number }[] = [];
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i];
      const b = all[i + 1];
      out.push({ y: (a.s.y + b.s.y) / 2, z: (a.s.z + b.s.z) / 2, tilt: (a.s.tilt + b.s.tilt) / 2, r: b.r * b.s.scale, h: b.h });
    }
    const last = all[all.length - 1].s;
    out.push({ y: last.y - 0.19, z: last.z - 0.06, tilt: last.tilt - 0.3, r: 0.2, h: 0.05 });
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((d, i) => {
      dummy.position.set(0, d.y, d.z);
      dummy.rotation.set(d.tilt, 0, 0);
      dummy.scale.set(d.r, d.h / 0.32, d.r);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} raycast={NO_RAY}>
      <meshPhysicalMaterial {...MATERIALS.cartilage} />
    </instancedMesh>
  );
}

function Arm({ g }: { g: Geo }) {
  return (
    <Pivot at={JOINTS.sternoclavicular}>
      <Bone geometry={g.clavicle} ray />
      <Bone geometry={g.scapula} />
      <Pivot at={JOINTS.shoulder} rotation={[0, 0, ARM_ABDUCTION]}>
        <Bone geometry={g.humerus} ray />
        <Bone geometry={g.radius} ray />
        <Bone geometry={g.ulna} ray />
        <Bone geometry={g.hand} />
      </Pivot>
    </Pivot>
  );
}

function Leg({ g }: { g: Geo }) {
  return (
    <>
      <Bone geometry={g.hipBone} ray />
      <Bone geometry={g.femur} ray />
      <Bone geometry={g.patella} ray />
      <Bone geometry={g.tibia} ray />
      <Bone geometry={g.fibula} ray />
      <Bone geometry={g.foot} />
    </>
  );
}

function Skeleton() {
  const g = use(loadBodyPart('bones')) as unknown as Geo;
  return (
    <Interactive slug="skelet">
      <Bone geometry={g.skull} glass />
      <Bone geometry={g.mandible} glass />
      <Vertebrae geometry={g.cervical} spots={VERTEBRAE.cervical} />
      <Vertebrae geometry={g.thoracic} spots={VERTEBRAE.thoracic} />
      <Vertebrae geometry={g.lumbar} spots={VERTEBRAE.lumbar} />
      <Discs geometry={g.disc} />
      <Bone geometry={g.sacrum} />
      <Bone geometry={g.coccyx} />
      <Bone geometry={g.sternum} ray />
      {([1, -1] as const).map((s) => (
        <group key={s} scale={[s, 1, 1]}>
          <Bone geometry={g.ribs} ray />
          <Bone geometry={g.cartilage} kind="cartilage" ray />
          <Arm g={g} />
          <Leg g={g} />
        </group>
      ))}
    </Interactive>
  );
}

/* ---------------- Глаза ---------------- */

function eyeTexture(): CanvasTexture {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f2eee6';
  x.fillRect(0, 0, W, H);
  // сосуды склеры
  x.strokeStyle = 'rgba(190,70,70,0.22)';
  x.lineWidth = 1.2;
  for (let i = 0; i < 60; i++) {
    let px = Math.random() * W;
    let py = Math.random() * H;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += (Math.random() - 0.5) * 40;
      py += (Math.random() - 0.5) * 30;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  const cx = W * 0.25;
  const cy = H * 0.5;
  const R = 66;
  const iris = x.createRadialGradient(cx, cy, 10, cx, cy, R);
  iris.addColorStop(0, '#5d3b1d');
  iris.addColorStop(0.55, '#8a5a2b');
  iris.addColorStop(0.9, '#4a3a2a');
  iris.addColorStop(1, '#241a12');
  x.fillStyle = iris;
  x.beginPath();
  x.arc(cx, cy, R, 0, Math.PI * 2);
  x.fill();
  // радужка: лучевые волокна
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const r0 = 26 + Math.random() * 8;
    x.strokeStyle = `rgba(${Math.random() > 0.5 ? '230,190,120' : '60,36,16'},${0.12 + Math.random() * 0.22})`;
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    x.lineTo(cx + Math.cos(a + 0.05) * (R - 4), cy + Math.sin(a + 0.05) * (R - 4));
    x.stroke();
  }
  x.fillStyle = '#050505';
  x.beginPath();
  x.arc(cx, cy, 25, 0, Math.PI * 2);
  x.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function Eye({ side }: { side: 1 | -1 }) {
  const map = useMemo(eyeTexture, []);
  useEffect(() => () => map.dispose(), [map]);
  const active = useIsActive('glaz');
  return (
    <group position={[0.3 * side, 16.33, 0.76]} rotation={[0, 0.1 * side, 0]}>
      <mesh>
        <sphereGeometry args={[0.118, 40, 28]} />
        <meshPhysicalMaterial map={map} roughness={0.28} clearcoat={1} clearcoatRoughness={0.1} emissive={active ? HIGHLIGHT.emissive : '#000000'} emissiveIntensity={active ? 0.35 : 0} />
      </mesh>
      <mesh position={[0, 0, 0.066]}>
        <sphereGeometry args={[0.06, 28, 18]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.22} roughness={0} clearcoat={1} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Eyes() {
  return (
    <Interactive slug="glaz">
      <Eye side={1} />
      <Eye side={-1} />
    </Interactive>
  );
}

/* ---------------- Органы ---------------- */

function Part({ spec, geometry, state }: { spec: PartSpec; geometry: BufferGeometry; state: ModelProps['state'] }) {
  const group = useRef<Group>(null);
  const pivot = PIVOTS[spec.key];
  useFrame(() => {
    const g = group.current;
    if (!g || !spec.anim) return;
    const time = state.time.current;
    if (spec.anim === 'breathe') {
      const b = 0.5 + 0.5 * Math.sin(time * 1.4);
      g.scale.set(1 + 0.035 * b, 1 + 0.05 * b, 1 + 0.04 * b);
    } else {
      g.scale.setScalar(1 - 0.07 * heartbeat(time).v);
    }
  });
  const mesh = (
    <group ref={group} position={pivot}>
      <mesh geometry={geometry}>
        <Tissue slug={spec.slug} kind={spec.mat} geometry={geometry} />
      </mesh>
    </group>
  );
  return (
    <Interactive slug={spec.slug}>
      {spec.mirror ? (
        <>
          {mesh}
          <group scale={[-1, 1, 1]}>{mesh}</group>
        </>
      ) : (
        mesh
      )}
    </Interactive>
  );
}

function OrganSet({ name, state }: { name: 'thorax' | 'abdomen' | 'vessels'; state: ModelProps['state'] }) {
  const geoms = use(loadBodyPart(name));
  return (
    <>
      {PARTS.filter((p) => p.set === name && geoms[p.key]).map((p) => (
        <Part key={p.key} spec={p} geometry={geoms[p.key]} state={state} />
      ))}
    </>
  );
}

function Labels({ labels }: { labels: boolean }) {
  return (
    <>
      {Object.entries(LABEL_AT).map(([slug, at]) => (
        <Label key={slug} labels={labels} partId={slug} text={LABEL_TEXT[slug]?.() ?? getSection(slug)?.title ?? slug} at={at} inner />
      ))}
    </>
  );
}

export default function BodyFigure({ state }: ModelProps) {
  const group = useRef<Group>(null);
  useFrame(() => {
    // фигура едва заметно «дышит»
    const g = group.current;
    if (g) g.position.y = -0.35 + 0.02 * Math.sin(state.time.current * 1.4);
  });

  return (
    <group ref={group} position={[0, -0.35, 0]}>
      <group position={[0, FOOT_Y, 0]} scale={SCALE}>
        <Suspense fallback={<ModelPending />}>
          <Skin />
        </Suspense>
        <Suspense fallback={<ModelPending />}>
          <Skeleton />
        </Suspense>
        <Suspense fallback={<ModelPending />}>
          <OrganSet name="thorax" state={state} />
        </Suspense>
        <Suspense fallback={<ModelPending />}>
          <OrganSet name="abdomen" state={state} />
        </Suspense>
        <Suspense fallback={<ModelPending />}>
          <OrganSet name="vessels" state={state} />
        </Suspense>
        <Eyes />
        <Labels labels={false} />
      </group>
    </group>
  );
}

