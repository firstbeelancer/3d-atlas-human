import { useEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { useSelection } from './selection';
import { frameloopFor } from './frameloop';
import { clampTarget, defaultBounds, type Box } from './cameraBounds';

/** Только в режиме разработки: доступ к камере из консоли для осмотра моделей. */
function DevHandle() {
  const state = useThree();
  useEffect(() => {
    (window as unknown as { __atlas?: unknown }).__atlas = state;
  }, [state]);
  return null;
}

/** Держит центр камеры внутри модели после каждого сдвига или зума к курсору. */
function KeepInBounds({ bounds }: { bounds: Box }) {
  const controls = useThree((s) => s.controls) as unknown as
    | { target: import('three').Vector3; object: import('three').Camera; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }
    | null;
  useEffect(() => {
    if (!controls) return;
    const onChange = () => clampTarget(controls.target, controls.object.position, bounds.min, bounds.max);
    controls.addEventListener('change', onChange);
    return () => controls.removeEventListener('change', onChange);
  }, [controls, bounds]);
  return null;
}

interface Props {
  label: string;
  camera?: { position: [number, number, number]; fov?: number };
  target?: [number, number, number];
  floorY?: number;
  /** Пределы приближения и свободное вращение (для мелких моделей, которые рассматривают вблизи). */
  orbit?: { minDistance?: number; maxDistance?: number; free?: boolean };
  /** Куда можно сдвигать центр камеры (по умолчанию — куб вокруг target). */
  bounds?: Box;
  /** Насколько близко можно подлететь к модели. */
  minDistance?: number;
  /** WebGL-контекст потерян (нехватка памяти на телефоне и т.п.). */
  onContextLost?: () => void;
  paused: boolean;
  time: MutableRefObject<number>;
  children: ReactNode;
}

/** Двигает общее время анимации, пока сцена не на паузе. */
function Clock({ paused, time }: { paused: boolean; time: MutableRefObject<number> }) {
  useFrame((_, dt) => {
    if (!paused) time.current += Math.min(dt, 0.1);
  });
  return null;
}

/** Студийный свет: мягкие софтбоксы, сгенерированные в коде (без HDR-файлов). */
function Studio() {
  return (
    <>
      <hemisphereLight args={['#fff8ef', '#c9bfb2', 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} color="#fff4e8" />
      <directionalLight position={[-4, 2, -3]} intensity={0.9} color="#e3ebff" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 3]} scale={[8, 3, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.2} position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} color="#fff1e6" />
        <Lightformer form="rect" intensity={0.8} position={[5, 0, -2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} color="#e8eeff" />
        <Lightformer form="circle" intensity={0.6} position={[0, -4, 2]} scale={4} color="#ffffff" />
      </Environment>
    </>
  );
}

export function StageCanvas({
  label,
  camera,
  target = [0, 0, 0],
  floorY = -2.2,
  orbit,
  bounds,
  minDistance = 4.5,
  onContextLost,
  paused,
  time,
  children,
}: Props) {
  const [box] = useState(() => bounds ?? defaultBounds(target));
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [interacted, setInteracted] = useState(false);
  const { select } = useSelection();
  // на телефоне отодвигаем камеру, чтобы модель целиком помещалась в узкий кадр
  const [cameraPosition] = useState<[number, number, number]>(() => {
    const p = camera?.position ?? [0, 0.6, 9];
    const k = window.innerWidth < 640 ? 1.18 : 1;
    return [p[0] * k, p[1] * k, p[2] * k];
  });

  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={host} className="absolute inset-0" onPointerDown={() => setInteracted(true)}>
      <Canvas
        aria-label={label}
        frameloop={frameloopFor(visible, paused)}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: cameraPosition, fov: camera?.fov ?? 32 }}
        onPointerMissed={() => select(null)}
        onCreated={({ gl }) => {
          // локальные плоскости разреза у моделей, которые умеют «резаться»
          gl.localClippingEnabled = true;
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            onContextLost?.();
          });
        }}
      >
        <Clock paused={paused} time={time} />
        <Studio />
        {children}
        <ContactShadows resolution={256} position={[0, floorY, 0]} opacity={0.32} scale={9} blur={2.6} far={4.5} color="#3a2e24" />
        <OrbitControls
          makeDefault
          regress
          target={target}
          enablePan
          screenSpacePanning
          zoomToCursor
          enableDamping
          minDistance={orbit?.minDistance ?? minDistance}
          maxDistance={orbit?.maxDistance ?? Math.max(16, Math.hypot(...cameraPosition) * 1.35)}
          minPolarAngle={orbit?.free ? 0.05 : 0.35}
          maxPolarAngle={orbit?.free ? Math.PI - 0.05 : Math.PI - 0.5}
          autoRotate={!interacted && !paused}
          autoRotateSpeed={0.55}
        />
        <KeepInBounds bounds={box} />
        {import.meta.env.DEV && <DevHandle />}
        <AdaptiveDpr pixelated />
      </Canvas>
    </div>
  );
}
