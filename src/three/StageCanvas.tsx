import { useEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdaptiveDpr, ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { useSelection } from './selection';

interface Props {
  label: string;
  camera?: { position: [number, number, number]; fov?: number };
  target?: [number, number, number];
  floorY?: number;
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

export function StageCanvas({ label, camera, target = [0, 0, 0], floorY = -2.2, paused, time, children }: Props) {
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
        frameloop={visible ? 'always' : 'never'}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: cameraPosition, fov: camera?.fov ?? 32 }}
        onPointerMissed={() => select(null)}
      >
        <Clock paused={paused} time={time} />
        <Studio />
        {children}
        <ContactShadows position={[0, floorY, 0]} opacity={0.32} scale={9} blur={2.6} far={4.5} color="#3a2e24" />
        <OrbitControls
          makeDefault
          target={target}
          enablePan={false}
          enableDamping
          minDistance={4.5}
          maxDistance={Math.max(16, Math.hypot(...cameraPosition) * 1.35)}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI - 0.5}
          autoRotate={!interacted && !paused}
          autoRotateSpeed={0.55}
        />
        <AdaptiveDpr pixelated />
      </Canvas>
    </div>
  );
}
