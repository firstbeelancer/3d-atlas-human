import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, type CatmullRomCurve3, type InstancedMesh } from 'three';
import type { StageState } from './types';

interface Props {
  path: CatmullRomCurve3;
  count: number;
  /** Доля пути в секунду. */
  speed: number;
  color: string;
  size?: number;
  state: StageState;
  /** Множитель скорости во времени (например, толчки при сокращении сердца). */
  pulse?: (time: number) => number;
}

/** Частицы крови, бегущие по кривой. */
export function Flow({ path, count, speed, color, size = 0.06, state, pulse }: Props) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const offsets = useMemo(() => Array.from({ length: count }, (_, i) => i / count + Math.random() * 0.02), [count]);
  const progress = useRef(0);
  const last = useRef(0);
  const col = useMemo(() => new Color(color), [color]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = state.time.current;
    const dt = Math.max(0, now - last.current);
    last.current = now;
    progress.current += dt * speed * (pulse ? pulse(now) : 1);
    for (let i = 0; i < count; i++) {
      const t = (offsets[i] + progress.current) % 1;
      dummy.position.copy(path.getPointAt(t));
      const fade = Math.min(1, t * 8, (1 - t) * 8);
      dummy.scale.setScalar(size * (0.4 + 0.6 * fade));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} raycast={() => null}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.45} roughness={0.4} />
    </instancedMesh>
  );
}
