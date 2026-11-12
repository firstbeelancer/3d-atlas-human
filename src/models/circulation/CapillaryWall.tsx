import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, LatheGeometry, Object3D, SphereGeometry, Vector2, type InstancedMesh } from 'three';
import { Label } from '../../three/Label';
import { Tissue, usePart } from '../../three/materials';
import type { StageState } from '../../three/types';
import { merge, tube, type V3 } from '../body/geo';

const START = -2.8;
const END = 2.8;
const INNER = 0.51;
const OUTER = 0.58;
const START_ANGLE = Math.PI * 0.84;
const END_ANGLE = Math.PI * 2.08;
const CENTERS = [-1.96, -0.39, 1.17, 2.22];
const axisY = (x: number) => 0.13 * Math.sin(x * 0.84);
const axisZ = (x: number) => -0.10 * Math.cos(x * 0.89);
const onWall = (x: number, a: number, r: number): V3 => [x, axisY(x) + Math.cos(a) * r, axisZ(x) + Math.sin(a) * r];

function partialTube(inner: number, outer: number) {
  const lengthSteps = 80;
  const angleSteps = 44;
  const stride = angleSteps + 1;
  const layer = (lengthSteps + 1) * stride;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const radius of [outer, inner]) {
    for (let x = 0; x <= lengthSteps; x++) {
      for (let a = 0; a <= angleSteps; a++) {
        const u = x / lengthSteps;
        const t = a / angleSteps;
        positions.push(...onWall(START + (END - START) * u, START_ANGLE + (END_ANGLE - START_ANGLE) * t, radius));
      }
    }
  }
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, b, d, c);
  for (let x = 0; x < lengthSteps; x++) {
    for (let a = 0; a < angleSteps; a++) {
      const i = x * stride + a;
      quad(i, i + 1, i + stride, i + stride + 1);
      quad(i + layer, i + stride + layer, i + 1 + layer, i + stride + 1 + layer);
    }
    for (const a of [0, angleSteps]) {
      const i = x * stride + a;
      quad(i, i + stride, i + layer, i + stride + layer);
    }
  }
  for (const x of [0, lengthSteps]) {
    for (let a = 0; a < angleSteps; a++) {
      const i = x * stride + a;
      quad(i, i + layer, i + 1, i + 1 + layer);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ellipsoid(at: V3, dimensions: V3) {
  return new SphereGeometry(1, 16, 12).scale(...dimensions).translate(...at);
}

function buildWall() {
  const endothelium = partialTube(INNER, OUTER);
  const basalLamina = partialTube(OUTER + 0.002, OUTER + 0.025);
  const nuclei = merge(CENTERS.flatMap((x, i) => [
    ellipsoid(onWall(x, 3.3 + 0.3 * Math.sin(i), INNER + 0.012), [0.16, 0.046, 0.095]),
    ellipsoid(onWall(x + 0.17, 4.64 + 0.13 * Math.cos(i), INNER + 0.011), [0.14, 0.081, 0.042]),
  ]));
  const seams = merge([-2.21, -1.05, 0.49, 1.82].map((x, i) => {
    const edge = Array.from({ length: 12 }, (_, j) => {
      const angle = START_ANGLE + (END_ANGLE - START_ANGLE) * j / 11;
      return onWall(x + 0.12 * Math.sin(angle * 2.2 + i), angle, INNER - 0.001);
    });
    return tube(edge, 0.006, { radial: 6, segments: 32 });
  }));
  const pericytes = merge([-1.3, 0.86].flatMap((x, i) => {
    const a = 3.22 + i * 0.18;
    const r = OUTER + 0.046;
    const soma = onWall(x, a, r);
    return [
      ellipsoid(soma, [0.19, 0.105, 0.054]),
      tube([onWall(x - 0.68, a - 0.5, r), onWall(x - 0.29, a - 0.24, r), soma,
        onWall(x + 0.32, a + 0.45, r), onWall(x + 0.58, a + 0.79, r)], 0.028, { radial: 9 }),
      tube([soma, onWall(x + 0.15, a + 0.68, r), onWall(x + 0.16, a + 1.40, r)], (t) => 0.033 - 0.020 * t, { radial: 9 }),
    ];
  }));
  // Thick outer rim with a depression on both faces of the cell.
  const redCell = new LatheGeometry([
    [0, -0.028], [0.13, -0.029], [0.22, -0.046], [0.29, -0.080], [0.35, -0.084],
    [0.39, -0.052], [0.41, 0], [0.39, 0.052], [0.35, 0.084], [0.29, 0.080],
    [0.22, 0.046], [0.13, 0.029], [0, 0.028],
  ].map(([r, y]) => new Vector2(r, y)), 48);
  return { endothelium, basalLamina, nuclei, seams, pericytes, redCell };
}

export const WALL_ANCHORS: Record<string, V3> = {
  'capillary-wall': onWall(-1.72, END_ANGLE, OUTER),
  pericytes: onWall(0.86, 3.40, OUTER + 0.046),
  erythrocytes: [0, 0.05, 0.25],
};

export function CapillaryWall({ state, names, visible, dimmed, labels }: {
  state: StageState;
  names: Record<string, string>;
  visible: (id: string) => boolean;
  dimmed: (id: string) => boolean;
  labels: boolean;
}) {
  const wall = usePart('capillary-wall');
  const peri = usePart('pericytes');
  const cells = usePart('erythrocytes');
  const model = useMemo(buildWall, []);
  const dummy = useMemo(() => new Object3D(), []);
  const redCells = useRef<InstancedMesh>(null);
  const ghostWall = dimmed('capillary-wall');
  const ghostCells = dimmed('erythrocytes');
  useEffect(() => () => Object.values(model).forEach((g) => g.dispose()), [model]);
  useFrame(() => {
    const instance = redCells.current;
    if (!instance) return;
    const time = state.time.current;
    for (let i = 0; i < instance.count; i++) {
      const progress = (i / instance.count + time * 0.16 + 0.048) % 1;
      const x = START + 0.18 + progress * (END - START - 0.36);
      const fade = Math.min(1, 0.06 + progress * 15, 0.06 + (1 - progress) * 15);
      dummy.position.set(x, axisY(x) + 0.055 * Math.sin(i * 4 + time * 2), axisZ(x) + 0.045 * Math.cos(i * 2 + time));
      dummy.rotation.set(0.83 + 0.18 * Math.cos(i * 3 + time), 0.32 * Math.cos(i * 2 + time), 0.89 + 0.24 * Math.sin(i * 1.8 + time * 1.8));
      dummy.scale.set(fade * 0.96, fade * 1.05, fade * 0.88);
      dummy.updateMatrix();
      instance.setMatrixAt(i, dummy.matrix);
    }
    instance.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      {visible('capillary-wall') && (
        <group {...wall.handlers}>
          <mesh geometry={model.endothelium}>
            <meshPhysicalMaterial color={wall.active ? '#ffc2a6' : '#bf797a'} roughness={0.45} clearcoat={0.24} side={DoubleSide}
              opacity={ghostWall ? 0.15 : 1} transparent={ghostWall} depthWrite={!ghostWall} />
          </mesh>
          <mesh geometry={model.basalLamina}>
            <meshPhysicalMaterial color="#e5ba9b" roughness={0.59} side={DoubleSide}
              opacity={ghostWall ? 0.15 : 1} transparent={ghostWall} depthWrite={!ghostWall} />
          </mesh>
          <mesh geometry={model.nuclei}><Tissue kind="inner" color="#815264" active={wall.active} opacity={ghostWall ? 0.15 : undefined} /></mesh>
          <mesh geometry={model.seams} raycast={() => null}><Tissue kind="inner" color="#9d5b61" opacity={ghostWall ? 0.15 : undefined} /></mesh>
        </group>
      )}
      {visible('pericytes') && <mesh geometry={model.pericytes} {...peri.handlers}><Tissue kind="muscle" color="#b96b8d" active={peri.active} opacity={dimmed('pericytes') ? 0.15 : undefined} /></mesh>}
      {visible('erythrocytes') && (
        <instancedMesh ref={redCells} args={[model.redCell, undefined, 8]} frustumCulled={false} {...cells.handlers}>
          <meshPhysicalMaterial color={cells.active ? '#f1564f' : '#b0232d'} roughness={0.38} clearcoat={0.28}
            opacity={ghostCells ? 0.15 : 1} transparent={ghostCells} depthWrite={!ghostCells} />
        </instancedMesh>
      )}
      {Object.entries(WALL_ANCHORS).filter(([id]) => visible(id)).map(([id, at]) =>
        <Label key={id} at={at} partId={id} text={names[id]} labels={labels && id !== 'pericytes'} inner />,
      )}
    </>
  );
}
