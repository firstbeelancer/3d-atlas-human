import { Html } from '@react-three/drei';
import { useIsActive, useSelection } from './selection';

interface Props {
  at: [number, number, number];
  partId: string;
  text: string;
  /** С какой стороны от точки стоит плашка. */
  side?: 'left' | 'right';
  /** Включены ли подписи в сцене; активная часть подписана всегда. */
  labels: boolean;
}

/** Подпись части органа: точка на модели, тонкая выноска и плашка с названием. */
export function Label({ at, partId, text, side = at[0] < 0 ? 'left' : 'right', labels }: Props) {
  const { select, hover } = useSelection();
  const active = useIsActive(partId);
  if (!labels && !active) return null;
  return (
    <Html position={at} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div className="atlas-label" data-side={side} data-active={active || undefined}>
        <span className="atlas-label__dot" />
        <span className="atlas-label__line" />
        <button
          type="button"
          className="atlas-label__text"
          onClick={() => select(partId)}
          onPointerEnter={() => hover(partId)}
          onPointerLeave={() => hover(null)}
        >
          {text}
        </button>
      </div>
    </Html>
  );
}
