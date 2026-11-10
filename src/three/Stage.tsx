import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, AudioWaveform, Bone, Box as BoxIcon, Brain, FlaskConical, Focus, Layers, Smile, Maximize2, Microscope, Minimize2, Move3d, Pause, Play, Puzzle, RotateCcw, Scissors, Tags, Undo2, Waypoints } from 'lucide-react';
import { t, type MessageKey } from '../i18n';
import { hasWebGL } from './webgl';
import type { CutKind, StageState } from './types';
import { ExplorerPanel, PartCard, type ExplorerProps } from './StageExplorer';
import { StageBoundary } from './StageBoundary';
import { useSelection } from './selection';
import type { Box } from './cameraBounds';
import { ModelPending, ModelProgress, StageLoading, type PendingModel } from './StageLoading';

/** Дополнительные режимы модели (кнопки над основной панелью). */
export interface StageMode {
  id: string;
  icon: 'explode' | 'segments' | 'inside' | 'lobule' | 'layers' | 'gland' | 'jaw' | 'arch' | 'brain' | 'waves' | 'bone' | 'activity';
  /** Режимы одной группы взаимоисключающие: включение одного выключает остальные. */
  group?: string;
  clearsSelection?: boolean;
}

export interface StageLegendItem {
  label: MessageKey;
  color: string;
}

const MODE_ICONS = { explode: Move3d, segments: Puzzle, inside: Waypoints, lobule: Microscope, layers: Layers, gland: FlaskConical, jaw: BoxIcon, arch: Smile, brain: Brain, waves: AudioWaveform, bone: Bone, activity: Activity } as const;

// three.js и r3f — тяжёлые; грузим их отдельным куском, только когда на странице есть сцена
const StageCanvas = lazy(() => import('./StageCanvas').then((m) => ({ default: m.StageCanvas })));

interface Props {
  /** Короткое имя модели (для aria-label). */
  label: string;
  /** Текстовое описание модели: для скринридеров и для браузеров без WebGL. */
  description: string;
  hasCutaway?: boolean;
  initialCutaway?: boolean;
  camera?: { position: [number, number, number]; fov?: number };
  target?: [number, number, number];
  /** Высота пола (для мягкой тени). */
  floorY?: number;
  /** Пределы приближения камеры и свободное вращение. */
  orbit?: { minDistance?: number; maxDistance?: number; free?: boolean };
  /** Панель «Рассмотреть детали» (слои, разнос, режим «отдельно») и карточка выбранной части. */
  explorer?: ExplorerProps;
  /** Режимы модели помимо разреза: «Разобрать», «Сегменты» и т. п. */
  modes?: StageMode[];
  legend?: readonly StageLegendItem[];
  /** Названия частей — для плашки «Отдельно: …». */
  names?: Record<string, string>;
  bounds?: Box;
  minDistance?: number;
  /** Режим 18+: передаётся модели в состоянии, чтобы подгрузить 18+-части. */
  adult?: boolean;
  children: (state: StageState) => ReactNode;
  className?: string;
}

function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function Stage({
  label,
  description,
  hasCutaway,
  initialCutaway = false,
  camera,
  target,
  floorY,
  orbit,
  explorer,
  bounds,
  minDistance,
  adult,
  modes = [],
  legend,
  names = {},
  children,
  className = '',
}: Props) {
  const { selected, select, isolate, setIsolate } = useSelection();
  const [activeModes, setActiveModes] = useState<Record<string, boolean>>({});
  const [webgl] = useState(hasWebGL);
  // 3D сломалась (ошибка модели, не загрузился кусок, потерян WebGL-контекст) — показываем текстовую заглушку
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [cutaway, setCutaway] = useState(initialCutaway);
  // на узких экранах подписи по умолчанию скрыты: касание части всё равно показывает её подпись
  const [labels, setLabels] = useState(() => window.innerWidth >= 640);
  const [show, setShow] = useState(false);
  const [explode, setExplode] = useState(0);
  // «призрачный» режим панели «Рассмотреть детали»: выбранная часть видна, остальные полупрозрачны
  const [ghost, setGhost] = useState(true);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [cutKind, setCutKind] = useState<CutKind>('side');
  // положение среза: то, что выбрал пользователь, иначе значение по умолчанию модели (оно приходит вместе с текстами раздела)
  const [cutPicked, setCutPicked] = useState<Partial<Record<CutKind, number>>>({});
  const cutT = { side: 0.5, fundus: 0.5, coronal: 0.5, ...explorer?.cuts?.defaults, ...cutPicked } as Record<CutKind, number>;
  const [resetKey, setResetKey] = useState(0);
  const time = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(() => new Map<symbol, PendingModel>());
  const report = useCallback((id: symbol, work: PendingModel | null) => {
    setPending((previous) => {
      const next = new Map(previous);
      if (work) next.set(id, work);
      else next.delete(id);
      return next;
    });
  }, []);
  const jobs = [...pending.values()];
  const building = jobs.filter((job) => job.phase === 'building');
  const phase = building.length ? 'building' : 'loading';
  const progress = building.length && building.every((job) => job.progress !== undefined)
    ? building.reduce((total, job) => total + job.progress!, 0) / building.length
    : undefined;

  useEffect(() => {
    if (adult === false && selected && !Object.hasOwn(names, selected)) select(null);
  }, [adult, names, select, selected]);

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

  const state: StageState = {
    paused,
    cutaway,
    labels,
    modes: activeModes,
    time,
    adult,
    ...(explorer ? { explode, isolate: ghost, hidden, cutKind, cutAt: cutT[cutKind] } : {}),
  };

  return (
    <div
      ref={box}
      data-show={show || undefined}
      className={`stage-plinth group @container overflow-hidden ${
        show ? 'stage-show fixed inset-0 z-[60] h-dvh w-screen' : `relative rounded-[28px] border border-line ${className}`
      }`}
    >
      <p className="sr-only">{description}</p>
      <ModelProgress.Provider value={report}>
        <StageBoundary onError={fail}>
          <Suspense fallback={<ModelPending phase="loading" />}>
            <StageCanvas
              key={resetKey}
              label={label}
              camera={camera}
              target={target}
              floorY={floorY}
              orbit={orbit}
              bounds={bounds}
              minDistance={minDistance}
              paused={paused}
              time={time}
              onContextLost={fail}
            >
              {children(state)}
            </StageCanvas>
          </Suspense>
        </StageBoundary>
      </ModelProgress.Provider>
      {jobs.length > 0 && <StageLoading key={phase} phase={phase} progress={progress} />}

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
            isolate={ghost}
            onIsolate={setGhost}
            hidden={hidden}
            onHidden={(next) => setHidden(next)}
            cutAt={cutT[cutKind]}
            onCutAt={(v) => setCutPicked((s) => ({ ...s, [cutKind]: v }))}
          />
          <PartCard {...explorer} />
        </>
      )}

      {!explorer && (
        <p className="pointer-events-none absolute left-5 top-4 m-0 max-w-[34ch] text-[13px] leading-snug text-ink-soft max-sm:hidden">
          {t('stage.hint')}
        </p>
      )}

      {isolate && selected && !explorer && (
        <div className="absolute left-1/2 top-4 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-plinth/95 py-1 pl-4 pr-1 shadow-[0_8px_24px_-12px_rgba(23,32,58,0.35)] backdrop-blur">
          <Focus size={16} aria-hidden className="shrink-0" />
          <span className="truncate text-[14px]">
            <span className="text-ink-soft">{t('stage.isolated')} </span>
            <strong className="font-semibold">{names[selected] ?? selected}</strong>
          </span>
          <button
            type="button"
            onClick={() => setIsolate(false)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 text-[14px] font-medium text-stone hover:opacity-90"
          >
            <Undo2 size={15} aria-hidden />
            {t('stage.isolateOff')}
          </button>
        </div>
      )}

      {modes.length > 0 && (
        <div
          role="toolbar"
          aria-label={t('stage.modes')}
          className={`absolute top-3 z-40 flex flex-col gap-1 ${explorer ? 'left-3 items-start @max-[29rem]:right-3 @max-[29rem]:top-[3.75rem] @max-[29rem]:flex-row @max-[29rem]:flex-wrap' : 'right-3 items-end'}`}
        >
          {modes.map((m) => {
            const Icon = MODE_ICONS[m.icon];
            const on = !!activeModes[m.id];
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  if (m.clearsSelection) select(null);
                  setActiveModes((v) => {
                    const next = { ...v, [m.id]: !v[m.id] };
                    if (next[m.id] && m.group)
                      for (const other of modes) if (other.group === m.group && other.id !== m.id) next[other.id] = false;
                    return next;
                  });
                }}
                className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-plinth/95 px-3 text-[13.5px] font-medium text-ink shadow-[0_6px_18px_-12px_rgba(23,32,58,0.4)] backdrop-blur transition-colors hover:bg-wash aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-stone @max-[29rem]:px-2 @max-[29rem]:text-[12.5px]"
              >
                <Icon size={16} aria-hidden />
                {t(`stage.mode.${m.id}` as never)}
              </button>
            );
          })}
        </div>
      )}

      {legend?.length ? (
        <ul className="pointer-events-none absolute bottom-[4.75rem] left-3 z-30 m-0 flex list-none flex-col gap-0.5 rounded-xl border border-line bg-plinth/95 px-2.5 py-1.5 text-[11px] leading-4 text-ink-soft">
          {legend.map(({ label, color }) => (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
              {t(label)}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        role="toolbar"
        aria-label={label}
        className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-line bg-plinth/95 p-1 shadow-[0_8px_24px_-12px_rgba(23,32,58,0.35)] backdrop-blur"
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
              setCutaway(initialCutaway);
              if (initialCutaway) setCutKind('side');
              setGhost(true);
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
      <span className="@max-[38rem]:sr-only">{label}</span>
    </button>
  );
}
