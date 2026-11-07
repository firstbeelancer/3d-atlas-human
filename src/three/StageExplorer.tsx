import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers, X } from 'lucide-react';
import { t, type MessageKey } from '../i18n';
import type { Part, PartGroup } from '../content/types';
import { useSelection } from './selection';
import type { CutKind } from './types';

export interface ExplorerProps {
  parts: Part[];
  groups?: PartGroup[];
  /** Подпись второго разреза, если у органа она своя (по умолчанию — «Дно глаза»). */
  fundusKey?: MessageKey;
  /** Три плоскости среза и ползунок положения: подписи и положения по умолчанию (0..1). */
  cuts?: { sideKey: MessageKey; coronalKey: MessageKey; defaults: Record<CutKind, number> };
}

interface PanelProps extends ExplorerProps {
  cutaway: boolean;
  cutKind: CutKind;
  onView: (cutaway: boolean, kind: CutKind) => void;
  explode: number;
  onExplode: (v: number) => void;
  isolate: boolean;
  onIsolate: (v: boolean) => void;
  hidden: ReadonlySet<string>;
  onHidden: (next: Set<string>) => void;
  cutAt: number;
  onCutAt: (v: number) => void;
}

function Segment({ children, pressed, onClick }: { children: ReactNode; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="flex-1 rounded-full px-2.5 py-1.5 text-[13px] font-medium leading-tight text-ink transition-colors hover:bg-wash aria-pressed:bg-ink aria-pressed:text-stone"
    >
      {children}
    </button>
  );
}

/** Панель «Рассмотреть детали»: вид (целый, разрез, дно), разнос на части, режим «отдельно» и список слоёв с глазками. */
export function ExplorerPanel(p: PanelProps) {
  const { selected, select, hover } = useSelection();
  const [open, setOpen] = useState(false);
  const groupName = new Map((p.groups ?? []).map((g) => [g.id, g.name]));
  const view = !p.cutaway ? 'whole' : p.cutKind;

  const toggle = (ids: string[], show: boolean) => {
    const next = new Set(p.hidden);
    ids.forEach((id) => (show ? next.delete(id) : next.add(id)));
    p.onHidden(next);
  };

  const rows: ReactNode[] = [];
  p.parts.forEach((part, i) => {
    const g = part.group && groupName.has(part.group) && p.parts[i - 1]?.group !== part.group ? part.group : null;
    if (g) {
      const ids = p.parts.filter((x) => x.group === g).map((x) => x.id);
      const allShown = ids.every((id) => !p.hidden.has(id));
      rows.push(
        <li key={`g-${g}`} className="mt-2 flex items-center justify-between gap-2 px-1 pt-1 first:mt-0">
          <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-soft">{groupName.get(g)}</span>
          <button
            type="button"
            onClick={() => toggle(ids, !allShown)}
            aria-label={groupName.get(g)}
            aria-pressed={allShown}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:bg-wash hover:text-ink"
          >
            {allShown ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
          </button>
        </li>,
      );
    }
    const shown = !p.hidden.has(part.id);
    rows.push(
      <li key={part.id} className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => toggle([part.id], !shown)}
          aria-label={part.name}
          aria-pressed={shown}
          className="grid h-7 w-7 flex-none place-items-center rounded-full text-ink-soft hover:bg-wash hover:text-ink"
        >
          {shown ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => select(selected === part.id ? null : part.id)}
          onMouseEnter={() => hover(part.id)}
          onMouseLeave={() => hover(null)}
          aria-current={selected === part.id ? 'true' : undefined}
          className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left text-[13px] transition-colors hover:bg-wash ${
            selected === part.id ? 'bg-wash font-semibold text-ink' : shown ? 'text-ink' : 'text-ink-soft line-through'
          }`}
        >
          {part.name}
        </button>
      </li>,
    );
  });

  return (
    <div className="absolute right-3 top-3 z-40 flex max-h-[calc(100%-5.5rem)] w-[min(264px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[20px] border border-line bg-plinth/95 shadow-[0_10px_30px_-14px_rgba(23,32,58,0.4)] backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 px-3.5 py-2.5 text-left text-[14px] font-semibold text-ink"
      >
        <Layers size={16} aria-hidden />
        <span className="flex-1">{t('explorer.title')}</span>
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {open && (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pb-3">
          <div role="group" aria-label={t('explorer.view')} className={p.cuts ? 'grid grid-cols-2 gap-0.5 rounded-[18px] border border-line p-0.5' : 'flex gap-0.5 rounded-full border border-line p-0.5'}>
            <Segment pressed={view === 'whole'} onClick={() => p.onView(false, p.cutKind)}>
              {t('explorer.whole')}
            </Segment>
            <Segment pressed={view === 'side'} onClick={() => p.onView(true, 'side')}>
              {t(p.cuts?.sideKey ?? 'explorer.cutSide')}
            </Segment>
            <Segment pressed={view === 'fundus'} onClick={() => p.onView(true, 'fundus')}>
              {t(p.fundusKey ?? 'explorer.fundus')}
            </Segment>
            {p.cuts && (
              <Segment pressed={view === 'coronal'} onClick={() => p.onView(true, 'coronal')}>
                {t(p.cuts.coronalKey)}
              </Segment>
            )}
          </div>

          {p.cuts && p.cutaway && (
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
              <span className="flex items-center justify-between">
                {t('explorer.cutPos')}
                <span className="tabular-nums text-ink-soft">{Math.round(p.cutAt * 100)}%</span>
              </span>
              <input type="range" min={0} max={1} step={0.002} value={p.cutAt} onChange={(e) => p.onCutAt(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
            <span className="flex items-center justify-between">
              {t('explorer.explode')}
              <span className="tabular-nums text-ink-soft">{Math.round(p.explode * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={p.explode}
              onChange={(e) => p.onExplode(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink">
            <input
              type="checkbox"
              checked={p.isolate}
              onChange={(e) => p.onIsolate(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {t('explorer.isolate')}
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold text-ink">{t('explorer.layers')}</span>
              <button
                type="button"
                onClick={() => p.onHidden(new Set())}
                disabled={p.hidden.size === 0}
                className="rounded-full px-2 py-0.5 text-[12px] font-medium text-ink-soft hover:bg-wash hover:text-ink disabled:opacity-40"
              >
                {t('explorer.showAll')}
              </button>
            </div>
            <ul className="m-0 list-none p-0">{rows}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

/** Карточка выбранной части поверх сцены: название, латынь и пояснение. */
export function PartCard({ parts, groups }: ExplorerProps) {
  const { selected, select } = useSelection();
  if (!selected) return null;
  const part = parts.find((x) => x.id === selected);
  const group = groups?.find((g) => g.id === selected);
  const name = part?.name ?? group?.name;
  if (!name) return null;
  return (
    <aside className="absolute bottom-[4.5rem] left-3 z-40 max-w-[min(360px,calc(100%-1.5rem))] rounded-[20px] border border-line bg-plinth/95 p-4 pr-11 shadow-[0_10px_30px_-14px_rgba(23,32,58,0.4)] backdrop-blur max-sm:right-3">
      <button
        type="button"
        onClick={() => select(null)}
        aria-label={t('explorer.close')}
        className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-wash hover:text-ink"
      >
        <X size={16} aria-hidden />
      </button>
      <h3 className="m-0 font-display text-[18px] font-bold leading-tight tracking-[-0.01em]" style={{ color: 'var(--accent)' }}>
        {name}
      </h3>
      {part?.latin && <p className="m-0 mt-0.5 text-[13px] italic text-ink-soft">{part.latin}</p>}
      {part && <p className="m-0 mt-2 text-[14px] leading-snug text-ink max-sm:line-clamp-4">{part.text}</p>}
    </aside>
  );
}
