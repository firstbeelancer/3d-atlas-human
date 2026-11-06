/** Сколько места занимают точка и выноска рядом с плашкой подписи, px. */
const LEADER = 44;
const MARGIN = 4;

/**
 * С какой стороны от точки поставить плашку подписи.
 * По умолчанию — к ближнему краю экрана (preferLeft), но если там плашка вылезет за подиум,
 * а с другой стороны помещается, — переворачиваем.
 */
export function labelSide(px: number, labelWidth: number, stageWidth: number, preferLeft: boolean): 'left' | 'right' {
  const need = labelWidth + LEADER + MARGIN;
  const fitsLeft = px - need >= 0;
  const fitsRight = px + need <= stageWidth;
  if (preferLeft) return fitsLeft || !fitsRight ? 'left' : 'right';
  return fitsRight || !fitsLeft ? 'right' : 'left';
}
