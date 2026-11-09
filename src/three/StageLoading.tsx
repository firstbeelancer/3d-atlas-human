import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { Box } from 'lucide-react';
import { t } from '../i18n';

type Phase = 'loading' | 'building';
export interface PendingModel { phase: Phase; progress?: number }

export const ModelProgress = createContext<(id: symbol, pending: PendingModel | null) => void>(() => {});

/** Registers work from either the DOM or the R3F tree. Only the Stage renders the overlay. */
export function ModelPending({ phase = 'building', progress }: { phase?: Phase; progress?: number }) {
  const report = useContext(ModelProgress);
  const [id] = useState(() => Symbol());
  useLayoutEffect(() => () => report(id, null), [id, report]);
  useLayoutEffect(() => report(id, { phase, progress }), [id, phase, progress, report]);
  return null;
}

export function StageLoading({ phase, progress }: PendingModel) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (progress !== undefined) return;
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - start), 100);
    return () => window.clearInterval(timer);
  }, [progress]);

  const percent = progress === undefined
    ? Math.min(96, Math.round(4 + 93 * (1 - Math.exp(-elapsed / 3100))))
    : Math.min(99, Math.max(0, Math.round(progress * 100)));
  const title = t(phase === 'loading' ? 'stage.loading' : 'stage.building');

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-plinth/95 text-ink backdrop-blur-sm">
      <div className="flex w-[min(16rem,85%)] flex-col items-center gap-2 text-center">
        <Box size={32} strokeWidth={1.4} aria-hidden className="mb-2 text-[var(--accent,var(--color-ink))] motion-safe:animate-pulse" />
        <p role="status" className="m-0 font-display text-lg font-semibold">{title}</p>
        <div role="progressbar" aria-label={title} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="font-mono text-sm tabular-nums text-ink-soft">
          {progress === undefined ? '≈ ' : ''}{percent}%
        </div>
        <div aria-hidden className="mt-2 h-1 w-full overflow-hidden rounded-full bg-wash">
          <div className="h-full rounded-full bg-[var(--accent,var(--color-ink))] motion-safe:transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
