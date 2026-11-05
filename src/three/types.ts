export interface StageState {
  paused: boolean;
  cutaway: boolean;
  labels: boolean;
  /** Время анимации в секундах; стоит на месте, пока paused. Модели читают time.current в useFrame. */
  time: { current: number };
}

export interface ModelProps {
  state: StageState;
  /** Названия частей органа (id части → название на языке сайта) для подписей на модели. */
  names?: Record<string, string>;
}
