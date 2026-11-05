import { useEffect, useMemo } from 'react';
import { TubeGeometry, type CatmullRomCurve3 } from 'three';
import { Tissue, type TissueKind } from './materials';

interface Props {
  path: CatmullRomCurve3;
  radius: number;
  kind: TissueKind;
  active?: boolean;
  opacity?: number;
  /** Сужение к концу (1 — без сужения). */
  endScale?: number;
  caps?: boolean;
  handlers?: object;
}

/** Сосуд — трубка вдоль кривой с закруглёнными концами. */
export function Vessel({ path, radius, kind, active, opacity, endScale = 1, caps = true, handlers }: Props) {
  const geometry = useMemo(() => {
    const segs = Math.max(24, Math.round(path.getLength() * 28));
    const g = new TubeGeometry(path, segs, radius, 28, false);
    if (endScale !== 1) {
      // плавно сужаем трубку к концу
      const pos = g.attributes.position;
      const ring = 29;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const c = path.getPointAt(t);
        const k = 1 + (endScale - 1) * t;
        for (let j = 0; j < ring; j++) {
          const idx = i * ring + j;
          pos.setXYZ(
            idx,
            c.x + (pos.getX(idx) - c.x) * k,
            c.y + (pos.getY(idx) - c.y) * k,
            c.z + (pos.getZ(idx) - c.z) * k,
          );
        }
      }
      g.computeVertexNormals();
    }
    return g;
  }, [path, radius, endScale]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const start = path.getPointAt(0);
  const end = path.getPointAt(1);

  return (
    <group {...handlers}>
      <mesh geometry={geometry}>
        <Tissue kind={kind} active={active} opacity={opacity} />
      </mesh>
      {caps && (
        <>
          <mesh position={start}>
            <sphereGeometry args={[radius, 24, 16]} />
            <Tissue kind={kind} active={active} opacity={opacity} />
          </mesh>
          <mesh position={end}>
            <sphereGeometry args={[radius * endScale, 24, 16]} />
            <Tissue kind={kind} active={active} opacity={opacity} />
          </mesh>
        </>
      )}
    </group>
  );
}
