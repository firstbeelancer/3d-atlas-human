export interface StageState {
  paused: boolean;
  cutaway: boolean;
  labels: boolean;
  /** Время анимации в секундах; стоит на месте, пока paused. Модели читают time.current в useFrame. */
  time: { current: number };
}

export interface ModelProps {
  state: StageState;
}
