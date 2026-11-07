/** Вид разреза у моделей, у которых их несколько: боковой (по оси взгляда) и «дно» (поперёк оси). */
export type CutKind = 'side' | 'fundus' | 'coronal';

export interface StageState {
  paused: boolean;
  cutaway: boolean;
  labels: boolean;
  /** Включённые режимы модели (id из реестра: «Разобрать», «Сегменты» и т. п.). */
  modes: Record<string, boolean>;
  /** Время анимации в секундах; стоит на месте, пока paused. Модели читают time.current в useFrame. */
  time: { current: number };
  /** Разнос на части, 0..1 (только у моделей, которые это умеют). */
  explode?: number;
  /** Выбранная часть показывается отдельно, остальные становятся призрачными. */
  isolate?: boolean;
  /** Части, скрытые пользователем в списке слоёв. */
  hidden?: ReadonlySet<string>;
  cutKind?: CutKind;
  /** Положение среза 0..1 (у моделей с ползунком среза). */
  cutAt?: number;
}

export interface ModelProps {
  state: StageState;
  /** Названия частей органа (id части → название на языке сайта) для подписей на модели. */
  names?: Record<string, string>;
}
