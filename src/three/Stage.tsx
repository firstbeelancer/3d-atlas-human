import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Scissors, Tags } from 'lucide-react';
import { t } from '../i18n';
import { hasWebGL } from './webgl';
import type { CutKind, StageState } from './types';
import { ExplorerPanel, PartCard, type ExplorerProps } from './StageExplorer';
import { StageBoundary } from './StageBoundary';

// three.js и r3f — тяжёлые; грузим их отдельным куском, только когда на странице есть сцена
const StageCanvas = lazy(() => import('./StageCanvas').then((m) => ({ default: m.StageCanvas })));

interface Props {
  /** Короткое имя модели (для aria-label). */
  label: string;
  /** Текстовое описание модели: для скринридеров и для браузеров без WebGL. */
  description: string;
  hasCutaway?: boolean;
  camera?: { position: [number, number, number]; fov?: number };
  target?: [number, number, number];
  /** Высота пола (для мягкой тени). */
  floorY?: number;
  /** Пределы приближения камеры и свободное вращение. */
  orbit?: { minDistance?: number; maxDistance?: number; free?: boolean };
  /** Панель «Рассмотреть детали» (слои, разнос, режим «отдельно») и карточка выбранной части. */
  explorer?: ExplorerProps;
  children: (state: StageState) => ReactNode;
  className?: string;
}

function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function Stage({ label, description, hasCutaway, camera, target, floorY, orbit, explorer, children, className = '' }: Props) {
  const [webgl] = useState(hasWebGL);
  // 3D сломалась (ошибка модели, не загрузился кусок, потерян WebGL-контекст) — показываем текстовую заглушку
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [cutaway, setCutaway] = useState(false);
  // на узких экранах подписи по умолчанию скрыты: касание части всё равно показывает её подпись
  const [labels, setLabels] = useState(() => window.innerWidth >= 640);
  const [show, setShow] = useState(false);
  const [explode, setExplode] = useState(0);
  const [isolate, setIsolate] = useState(true);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [cutKind, setCutKind] = useState<CutKind>('side');
  const [resetKey, setResetKey] = useState(0);
  const time = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const toggleShow = useCallback(() => {
    const el = box.current;
    if (!show) {
      setShow(true);
      el?.requestFullscreen?.().catch(() => {
        /* без Fullscreen API остаёмся в полноэкранном слое */
      });
    } else {
      setShow(false);
      if (document.fullscreenElement) void document.exitFullscreen?.();
    }
  }, [show]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setShow(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShow(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show]);

  if (!webgl || failed) {
    return (
      <div className={`stage-plinth relative grid place-items-center rounded-[28px] border border-line p-8 ${className}`}>
        <div className="max-w-[40ch] text-center">
          <p className="m-0 font-display text-[20px] font-semibold">{description}</p>
          <p className="mb-0 mt-3 text-ink-soft">{failed ? t('stage.failed') : t('stage.noWebgl')}</p>
        </div>
      </div>
    );
  }

  const state: StageState = explorer ? { paused, cutaway, labels, time, explode, isolate, hidden, cutKind } : { paused, cutaway, labels, time };

  return (
    <div
      ref={box}
      data-show={show || undefined}
      className={`stage-plinth group overflow-hidden ${
        show ? 'stage-show fixed inset-0 z-[60] h-dvh w-screen' : `relative rounded-[28px] border border-line ${className}`
      }`}
    >
      <p className="sr-only">{description}</p>
      <StageBoundary onError={fail}>
        <Suspense fallback={null}>
          <StageCanvas
            key={resetKey}
            label={label}
            camera={camera}
            target={target}
            floorY={floorY}
            orbit={orbit}
            paused={paused}
            time={time}
            onContextLost={fail}
          >
            {children(state)}
          </StageCanvas>
        </Suspense>
      </StageBoundary>

      {explorer && (
        <>
          <ExplorerPanel
            {...explorer}
            cutaway={cutaway}
            cutKind={cutKind}
            onView={(on, kind) => {
              setCutaway(on);
              setCutKind(kind);
            }}
            explode={explode}
            onExplode={setExplode}
            isolate={isolate}
            onIsolate={setIsolate}
            hidden={hidden}
            onHidden={(next) => setHidden(next)}
          />
          <PartCard {...explorer} />
        </>
      )}

      <p className="pointer-events-none absolute left-5 top-4 m-0 max-w-[34ch] text-[13px] leading-snug text-ink-soft max-sm:hidden">
        {t('stage.hint')}
      </p>

      <div
        role="toolbar"
        aria-label={label}
        className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-line bg-plinth/95 p-1 shadow-[0_8px_24px_-12px_rgba(23,32,58,0.35)] backdrop-blur"
      >
        <ToolButton onClick={() => setPaused((v) => !v)} pressed={paused} label={paused ? t('stage.play') : t('stage.pause')}>
          {paused ? <Play size={17} aria-hidden /> : <Pause size={17} aria-hidden />}
        </ToolButton>
        {hasCutaway && (
          <ToolButton onClick={() => setCutaway((v) => !v)} pressed={cutaway} label={t('stage.cutaway')}>
            <Scissors size={17} aria-hidden />
          </ToolButton>
        )}
        <ToolButton onClick={() => setLabels((v) => !v)} pressed={labels} label={t('stage.labels')}>
          <Tags size={17} aria-hidden />
        </ToolButton>
        <ToolButton
          onClick={() => {
            setResetKey((k) => k + 1);
            if (explorer) {
              setExplode(0);
              setHidden(new Set());
              setCutaway(false);
              setIsolate(true);
            }
          }}
          label={t('stage.reset')}
        >
          <RotateCcw size={17} aria-hidden />
        </ToolButton>
        <ToolButton onClick={toggleShow} pressed={show} label={show ? t('stage.exitShow') : t('stage.show')} strong>
          {show ? <Minimize2 size={17} aria-hidden /> : <Maximize2 size={17} aria-hidden />}
        </ToolButton>
      </div>
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  label,
  pressed,
  strong,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  pressed?: boolean;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={label}
      className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-medium transition-colors ${
        strong ? 'bg-ink text-stone hover:opacity-90' : 'text-ink hover:bg-wash aria-pressed:bg-wash'
      }`}
    >
      {children}
      <span className="max-md:sr-only">{label}</span>
    </button>
  );
}
