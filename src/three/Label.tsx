import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { useIsActive, useSelection } from './selection';
import { labelSide } from './labelSide';

interface Props {
  at: [number, number, number];
  partId: string;
  text?: string;
  /** Включены ли подписи в сцене; активная часть подписана всегда. */
  labels: boolean;
  /** Подпись внутренней части (видна сквозь стенки) — не прячется при повороте. */
  inner?: boolean;
  /** Устаревшая подсказка стороны; сторона теперь считается по экрану. */
  side?: 'left' | 'right';
}

const world = new Vector3();
const toCam = new Vector3();
const toPoint = new Vector3();
const ndc = new Vector3();
const centerNdc = new Vector3();

/**
 * Подпись части органа: точка на модели, тонкая выноска и плашка с названием.
 * Плашка уходит в ту сторону экрана, где точка, и прячется, когда точка на обратной стороне модели.
 */
export function Label({ at, partId, text, labels, inner }: Props) {
  const { select, hover } = useSelection();
  const active = useIsActive(partId);
  const anchor = useRef<Group>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const invalidate = useThree((s) => s.invalidate);

  useFrame(({ camera, controls, size }) => {
    const g = anchor.current;
    const el = box.current;
    if (!g || !el) return;
    const target = (controls as unknown as { target?: Vector3 } | null)?.target ?? new Vector3();
    g.getWorldPosition(world);
    toCam.copy(camera.position).sub(target).normalize();
    toPoint.copy(world).sub(target);
    const facing = inner ? 1 : toPoint.dot(toCam) / Math.max(toPoint.length(), 1e-3);
    const visible = facing > -0.2;
    el.style.opacity = visible ? String(Math.min(1, (facing + 0.2) * 2.5)) : '0';
    el.style.visibility = visible ? 'visible' : 'hidden';
    ndc.copy(world).project(camera);
    centerNdc.copy(target).project(camera);
    const px = ((ndc.x + 1) / 2) * size.width;
    const labelWidth = (el.lastElementChild as HTMLElement | null)?.offsetWidth ?? 0;
    el.dataset.side = labelSide(px, labelWidth, size.width, ndc.x < centerNdc.x);
  });

  if (!text || (!labels && !active)) return null;
  return (
    <group ref={anchor} position={at}>
      <Html zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div
          ref={(el) => {
            box.current = el;
            // плашка монтируется позже кадра; на паузе (frameloop «по требованию») просим ещё один кадр,
            // чтобы сторона и видимость подписи посчитались сразу
            if (el) invalidate();
          }}
          className="atlas-label" data-side="right" data-active={active || undefined}>
          <span className="atlas-label__dot" />
          <span className="atlas-label__line" />
          <button
            type="button"
            className="atlas-label__text"
            onClick={(event) => {
              event.stopPropagation();
              select(partId);
            }}
            onPointerEnter={() => hover(partId)}
            onPointerLeave={() => hover(null)}
          >
            {text}
          </button>
        </div>
      </Html>
    </group>
  );
}
