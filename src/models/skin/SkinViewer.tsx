import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Focus, Layers, Maximize2, Microscope, Minimize2, RotateCcw, Scissors, Tags, X } from 'lucide-react';
import {
  ANATOMY_CATEGORIES, ANATOMY_STRUCTURES, MICRO_TOURS, STRUCTURE_MAP, VIEW_MODES,
  type AnatomyStructureId, type CameraPresetId, type ViewModeId,
} from '../../content/ru/skin-atlas';
import { t } from '../../i18n';
import { useTheme } from '../../lib/theme';
import { useSelection } from '../../three/selection';
import { StageLoading } from '../../three/StageLoading';
import { SkinAtlasEngine, type PinScreenPosition } from './engine/SkinAtlasEngine';
import { BLOCK_HALF_D, BLOCK_HALF_W, type SliceBoundsState } from './engine/skinHeightfield';
import { skinPartFor, skinStructuresFor } from './selectionMap';

export interface SkinViewerProps {
  label: string;
  description: string;
  names?: Record<string, string>;
}

type Panel = 'structures' | 'slices' | 'tours' | 'info';

const panelButtons = [
  { id: 'structures', label: 'skin.structures', Icon: Layers },
  { id: 'slices', label: 'skin.slices', Icon: Scissors },
  { id: 'tours', label: 'skin.tours', Icon: Microscope },
] as const;

const axisControls = [
  { axis: 'x', label: 'skin.sliceX', min: -BLOCK_HALF_W, max: BLOCK_HALF_W },
  { axis: 'y', label: 'skin.sliceY', min: -6.6, max: 3.1 },
  { axis: 'z', label: 'skin.sliceZ', min: -BLOCK_HALF_D, max: BLOCK_HALF_D },
] as const;

const cameraViews = [
  ['iso', 'skin.cameraIso'],
  ['front', 'skin.cameraFront'],
  ['side', 'skin.cameraSide'],
  ['top', 'skin.cameraTop'],
  ['bottom', 'skin.cameraBottom'],
] as const;

const button = 'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[13px] font-medium text-ink hover:bg-wash aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-stone';
const iconButton = `${button} w-9 px-1`;

function IconButton({ label, onClick, pressed, children }: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return <button type="button" className={iconButton} title={label} aria-label={label} aria-pressed={pressed} onClick={onClick}>{children}</button>;
}

function Range({ label, value, min = 0, max = 1, onChange }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
      {label}
      <input
        type="range"
        className="w-full min-w-0 accent-[var(--accent)]"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </label>
  );
}

export default function SkinViewer({ label, description, names }: SkinViewerProps) {
  const { theme } = useTheme();
  const { selected, select, isolate, setIsolate } = useSelection();
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const engine = useRef<SkinAtlasEngine | null>(null);
  const cameraSelection = useRef<string | null | undefined>(undefined);
  const lastSelection = useRef<string | null>(null);
  const [status, setStatus] = useState<'building' | 'ready' | 'failed'>('building');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [mode, setMode] = useState<ViewModeId>('overview');
  const [layers, setLayers] = useState<ReturnType<SkinAtlasEngine['getLayerStatesSnapshot']>>();
  const [slice, setSlice] = useState<SliceBoundsState>();
  const [explode, setExplode] = useState(0);
  const [peel, setPeel] = useState(0);
  const [guides, setGuides] = useState(false);
  const [labels, setLabels] = useState(false);
  const [pins, setPins] = useState<PinScreenPosition[]>([]);
  const [hover, setHover] = useState<AnatomyStructureId | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [tourId, setTourId] = useState<string>();

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const timer = window.setTimeout(() => {
      let viewer: SkinAtlasEngine | undefined;
      try {
        viewer = new SkinAtlasEngine(container, {
          onSelectStructure: (id) => {
            const part = id ? skinPartFor(id) : null;
            cameraSelection.current = part;
            select(part);
          },
          onHoverStructure: setHover,
          onPinsUpdate: setPins,
        });
        engine.current = viewer;
        viewer.setShowSliceGuides(false);
        setLayers(viewer.getLayerStatesSnapshot());
        setSlice(viewer.getSliceState());
        setStatus('ready');
      } catch (error) {
        console.error('Skin model could not start', error);
        setStatus('failed');
      }
    }, 40);
    const contextLost = (event: Event) => {
      event.preventDefault();
      setStatus('failed');
    };
    container.addEventListener('webglcontextlost', contextLost, true);
    return () => {
      window.clearTimeout(timer);
      container.removeEventListener('webglcontextlost', contextLost, true);
      engine.current?.dispose();
      engine.current = null;
    };
  }, [select]);

  useEffect(() => {
    if (status === 'ready') engine.current?.setTheme(theme === 'dark');
    if (status === 'failed') {
      engine.current?.dispose();
      engine.current = null;
    }
  }, [status, theme]);

  useEffect(() => {
    const viewer = engine.current;
    if (status !== 'ready' || !viewer) return;
    const ids = skinStructuresFor(selected);
    viewer.setSelection(ids, isolate);
    setLayers(viewer.getLayerStatesSnapshot());
    if (selected !== lastSelection.current) {
      if (cameraSelection.current !== selected) viewer.focusOnGroup(ids);
      cameraSelection.current = undefined;
      lastSelection.current = selected;
    }
  }, [status, selected, isolate]);

  useEffect(() => {
    if (!fullscreen) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  const pickedIds = skinStructuresFor(selected);
  const picked = pickedIds.length === 1 ? STRUCTURE_MAP[pickedIds[0]] : undefined;
  const pickedName = picked?.name || (selected && names?.[selected]);

  const switchMode = (value: ViewModeId, reset = false) => {
    const viewer = engine.current;
    if (!viewer) return;
    setMode(value);
    setTourId(undefined);
    setIsolate(false);
    select(null);
    setPeel(0);
    setExplode(value === 'layers' ? 0.68 : 0);
    setSlice(reset ? viewer.resetAll() : viewer.applyViewMode(value));
    setLayers(viewer.getLayerStatesSnapshot());
    setPanel(value === 'cross_section' ? 'slices' : value === 'microanatomy' ? 'tours' : value === 'layers' ? 'structures' : null);
  };

  const updateSlice = (changes: Partial<SliceBoundsState>) => {
    const viewer = engine.current;
    if (!viewer) return;
    viewer.setSliceState(changes);
    setSlice(viewer.getSliceState());
  };

  const pickPart = (id: AnatomyStructureId) => {
    select(skinPartFor(id));
    setPanel('info');
  };

  const toggleFullscreen = () => {
    if (fullscreen) {
      setFullscreen(false);
      if (document.fullscreenElement === frame.current) void document.exitFullscreen?.();
    } else {
      setFullscreen(true);
      void frame.current?.requestFullscreen?.().catch(() => {});
    }
  };

  return (
    <div
      ref={frame}
      className={`flex flex-col overflow-hidden border border-line bg-plinth text-ink ${fullscreen ? 'fixed inset-0 z-[60] h-dvh' : 'rounded-plinth lg:h-full'}`}
    >
      <div
        className={`relative min-h-0 ${fullscreen ? 'flex-1' : 'h-[clamp(310px,53svh,460px)] lg:h-auto lg:flex-1'}`}
        role="region"
        aria-label={label}
      >
        <div ref={host} className="absolute inset-0 touch-none [&>canvas]:block" />
        {status === 'building' && <StageLoading phase="building" />}
        {status === 'failed' && (
          <div role="status" className="absolute inset-0 grid place-content-center gap-3 p-5 text-center">
            <p className="m-0 font-display font-semibold">{description}</p>
            <p className="m-0 text-sm text-ink-soft">{t('stage.failed')}</p>
          </div>
        )}
        {status === 'ready' && (
          <>
            <p className="sr-only">{description}</p>
            {labels && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {pins.filter((pin) => pin.visible).map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    className="pointer-events-auto absolute left-0 top-0 flex max-w-32 items-center gap-1 rounded-full border border-line bg-plinth px-2 py-1 text-[11px] leading-tight shadow-sm aria-pressed:border-ink"
                    style={{ transform: `translate(${pin.x}px, ${pin.y}px) translate(-50%, -100%)` }}
                    aria-pressed={pickedIds.includes(pin.id)}
                    onClick={() => pickPart(pin.id)}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: pin.color }} aria-hidden />
                    <span className="truncate">{pin.name}</span>
                  </button>
                ))}
              </div>
            )}
            {(pickedName || hover) && (
              <button
                type="button"
                onClick={() => {
                  if (!pickedName && hover) pickPart(hover);
                  else setPanel(panel === 'info' ? null : 'info');
                }}
                className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-line bg-plinth px-3 py-1 text-xs font-medium shadow-sm"
                aria-pressed={panel === 'info'}
              >
                {pickedName || (hover && STRUCTURE_MAP[hover].name)}
              </button>
            )}
          </>
        )}
      </div>

      {status === 'ready' && (
        <>
          <div className="grid gap-2 border-t border-line px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1" role="group" aria-label={t('skin.modes')}>
                {VIEW_MODES.map(({ id, label: title, shortLabel }) => (
                  <button key={id} type="button" title={title} className={button} aria-pressed={mode === id} onClick={() => switchMode(id)}>{shortLabel}</button>
                ))}
              </div>
              <IconButton label={fullscreen ? t('skin.exitFullscreen') : t('skin.fullscreen')} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </IconButton>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {panelButtons.map(({ id, label: key, Icon }) => (
                <IconButton key={id} label={t(key)} pressed={panel === id} onClick={() => setPanel(panel === id ? null : id)}>
                  <Icon size={16} aria-hidden />
                </IconButton>
              ))}
              <IconButton label={t('skin.labels')} pressed={labels} onClick={() => {
                engine.current?.setShowPins(!labels);
                setLabels(!labels);
              }}>
                <Tags size={16} aria-hidden />
              </IconButton>
              <IconButton label={t('skin.reset')} onClick={() => {
                switchMode('overview', true);
                engine.current?.setShowPins(false);
                engine.current?.setShowSliceGuides(false);
                setLabels(false);
                setGuides(false);
              }}>
                <RotateCcw size={16} aria-hidden />
              </IconButton>
              <select
                className="min-h-9 min-w-0 rounded-lg border border-line bg-plinth px-2 text-[13px]"
                aria-label={t('skin.camera')}
                value=""
                onChange={(event) => engine.current?.setCameraPreset(event.currentTarget.value as CameraPresetId)}
              >
                <option value="" disabled>{t('skin.camera')}</option>
                {cameraViews.map(([id, key]) => <option key={id} value={id}>{t(key)}</option>)}
              </select>
            </div>
          </div>

          {panel && (
            <div className="max-h-[230px] shrink-0 overflow-y-auto overscroll-contain border-t border-line px-3 py-2.5 text-sm">
              {panel === 'structures' && layers && (
                <>
                  <div className="mb-2 grid grid-cols-2 gap-4">
                    <Range label={t('skin.explode')} value={explode} onChange={(value) => {
                      setExplode(value);
                      engine.current?.setExplodedAmount(value);
                    }} />
                    <Range label={t('skin.peel')} value={peel} onChange={(value) => {
                      setPeel(value);
                      engine.current?.setPeelAmount(value);
                    }} />
                  </div>
                  {ANATOMY_CATEGORIES.map((category) => (
                    <details key={category.id} className="border-t border-line py-1.5">
                      <summary className="cursor-pointer font-medium">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                        {category.name}
                      </summary>
                      {ANATOMY_STRUCTURES.filter(({ categoryId }) => categoryId === category.id).map((info) => {
                        const state = layers[info.id];
                        const visibilityLabel = `${state.visible ? t('skin.hide') : t('skin.show')} ${info.name}`;
                        return (
                          <div key={info.id} className="my-1 flex items-center gap-2 pl-2">
                            <IconButton label={visibilityLabel} pressed={state.visible} onClick={() => {
                              const viewer = engine.current;
                              viewer?.setStructureVisible(info.id, !state.visible);
                              if (viewer) setLayers(viewer.getLayerStatesSnapshot());
                            }}>
                              {state.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                            </IconButton>
                            <button type="button" onClick={() => pickPart(info.id)} className="min-w-0 flex-1 text-left hover:underline">
                              {info.name}
                            </button>
                          </div>
                        );
                      })}
                    </details>
                  ))}
                </>
              )}
              {panel === 'slices' && slice && (
                <>
                  {axisControls.map(({ axis, label: key, min, max }) => {
                    const enabled = slice[`${axis}Enabled`];
                    return (
                      <div key={axis} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 border-b border-line py-1.5">
                        <label className="flex items-center gap-2 font-medium">
                          <input type="checkbox" checked={enabled} onChange={(event) => updateSlice({ [`${axis}Enabled`]: event.currentTarget.checked })} />
                          {t(key)}
                        </label>
                        {enabled && (
                          <>
                            <Range label={`${t('skin.slicePosition')} ${axis.toUpperCase()}`} min={min} max={max} value={slice[`${axis}Pos`]} onChange={(value) => updateSlice({ [`${axis}Pos`]: value })} />
                            <label className="col-span-2 flex items-center gap-2 text-xs text-ink-soft">
                              <input type="checkbox" checked={slice[`${axis}Invert`]} onChange={(event) => updateSlice({ [`${axis}Invert`]: event.currentTarget.checked })} />
                              {t('skin.invertSlice')}
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                    <input type="checkbox" checked={guides} onChange={(event) => {
                      setGuides(event.currentTarget.checked);
                      engine.current?.setShowSliceGuides(event.currentTarget.checked);
                    }} />
                    {t('skin.sliceGuides')}
                  </label>
                </>
              )}
              {panel === 'tours' && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {MICRO_TOURS.map((tour) => (
                    <button
                      key={tour.id}
                      type="button"
                      className="min-w-0 rounded-lg border border-line px-3 py-2 text-left hover:bg-wash aria-pressed:border-ink"
                      aria-pressed={tour.id === tourId}
                      onClick={() => {
                        const viewer = engine.current;
                        if (!viewer) return;
                        setMode('microanatomy');
                        setTourId(tour.id);
                        setIsolate(false);
                        setPeel(0);
                        setExplode(tour.exploded ?? 0);
                        setSlice(viewer.applyMicroTour(tour));
                        setLayers(viewer.getLayerStatesSnapshot());
                      }}
                    >
                      <strong className="block font-medium">{tour.title}</strong>
                      <span className="text-xs text-ink-soft">{tour.subtitle}</span>
                    </button>
                  ))}
                </div>
              )}
              {panel === 'info' && (
                pickedName ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="m-0 text-base font-semibold">{pickedName}</h2>
                        {picked && <p className="m-0 text-xs italic text-ink-soft">{picked.latinName}</p>}
                      </div>
                      <IconButton label={t('skin.close')} onClick={() => setPanel(null)}><X size={16} /></IconButton>
                    </div>
                    {picked && <p className="my-2 text-sm leading-snug">{picked.summary}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={button} onClick={() => engine.current?.focusOnGroup(pickedIds)}>
                        <Focus size={16} aria-hidden />{t('skin.focus')}
                      </button>
                      <button type="button" className={button} aria-pressed={isolate} onClick={() => setIsolate(!isolate)}>
                        {isolate ? t('stage.isolateOff') : t('stage.isolate')}
                      </button>
                    </div>
                    {picked && layers && (
                      <div className="mt-2">
                        <Range label={t('skin.opacity')} value={layers[picked.id].opacity} onChange={(value) => {
                          const viewer = engine.current;
                          viewer?.setStructureOpacity(picked.id, value);
                          if (viewer) setLayers(viewer.getLayerStatesSnapshot());
                        }} />
                      </div>
                    )}
                  </>
                ) : <p className="m-0 text-ink-soft">{t('skin.pickPart')}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
