import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { ModelProps } from '../../three/types';
import { Tissue, usePart } from '../../three/materials';
import { Label } from '../../three/Label';

/** Увеличенная альвеола: гроздь пузырьков, капилляр, поток O2 и CO2. */
export function AlveolusScene({ state, names = {} }: ModelProps) {
  const sac = useRef<Group>(null);
  const o2 = usePart('alveoli');
  const surf = usePart('surfactant');
  useFrame(({ clock }) => {
    if (!state.paused && sac.current) {
      const b = 0.5 - 0.5 * Math.cos(clock.elapsedTime * 1.4);
      sac.current.scale.setScalar(1 + b * 0.05);
    }
  });
  return (
    <group>
      <group ref={sac}>
        {[
          [0.95, 0.55, 0.35, 0.62],
          [-0.9, 0.4, -0.3, 0.58],
          [0.2, -0.95, 0.4, 0.6],
          [-0.3, -0.6, -0.85, 0.55],
        ].map((p, i) => (
          <mesh key={i} position={[p[0], p[1], p[2]]} {...(i === 0 ? o2.handlers : {})}>
            <sphereGeometry args={[p[3], 28, 20]} />
            <Tissue kind="inner" active={o2.active} color="#ffd9a0" />
          </mesh>
        ))}
        <mesh {...surf.handlers}>
          <icosahedronGeometry args={[1.05, 2]} />
          <Tissue kind="membrane" active={surf.active} opacity={0.35} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.9]} rotation={[0.4, 0.2, 0]}>
        <torusGeometry args={[1.15, 0.075, 10, 40]} />
        <Tissue kind="artery" active={false} />
      </mesh>
      <Label labels={state.labels} partId="alveoli" text={names['alveoli']} at={[1.1, 0.6, 0.4]} />
      <Label labels={state.labels} partId="surfactant" text={names['surfactant']} at={[-1.1, -0.5, 0.4]} />
    </group>
  );
}
