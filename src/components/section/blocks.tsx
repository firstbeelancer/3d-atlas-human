import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Focus, MessageCircleHeart, Stethoscope, Undo2 } from 'lucide-react';
import type { Part, PartGroup, SectionMeta, Stat } from '../../content/types';
import { getSection } from '../../content/sections';
import { t } from '../../i18n';
import { useSelection } from '../../three/selection';
import { OrganIcon } from '../icons/organs';

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="m-0 text-[clamp(26px,3vw,32px)] font-bold leading-tight tracking-[-0.03em]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SectionHero({ section, systemTitle }: { section: SectionMeta; systemTitle: string }) {
  return (
    <header>
      <p className="m-0 text-[15px] font-semibold" style={{ color: 'var(--accent)' }}>
        {systemTitle}
      </p>
      <h1
        className={`m-0 mt-2 break-words font-extrabold leading-[0.92] tracking-[-0.05em] ${
          section.title.length > 16 ? 'text-[clamp(36px,5.6vw,76px)]' : 'text-[clamp(52px,8.4vw,112px)]'
        }`}
      >
        {section.title}
      </h1>
      <p className="m-0 mt-3 font-display text-[17px] font-medium text-ink-soft">{section.latin}</p>
      <p className="m-0 mt-6 max-w-[28ch] font-display text-[clamp(21px,2.3vw,26px)] font-medium leading-[1.3] tracking-[-0.015em]">
        {section.tagline}
      </p>
    </header>
  );
}

/** «Этикетка экспоната»: цифры органа в одной рамке, как подпись к экспонату в музее. */
export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <dl className="m-0 mt-8 grid grid-cols-2 border-t-2 border-ink">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`border-b border-line py-4 ${i % 2 === 0 ? 'pr-4' : 'border-l pl-4'}`}
        >
          <dd className="m-0 font-display text-[clamp(26px,3vw,34px)] font-bold leading-none tracking-[-0.03em]">{s.value}</dd>
          <dt className="mt-1.5 text-[15px] leading-snug text-ink-soft">{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function Paragraphs({ items }: { items: string[] }) {
  return (
    <div className="flex max-w-[64ch] flex-col gap-4">
      {items.map((p) => (
        <p key={p.slice(0, 24)} className="m-0">
          {p}
        </p>
      ))}
    </div>
  );
}

/** Кнопка «Рассмотреть отдельно»: на сцене остаётся только выбранная часть. */
function IsolateButton() {
  const { isolate, setIsolate } = useSelection();
  return (
    <button
      type="button"
      onClick={() => setIsolate(!isolate)}
      aria-pressed={isolate}
      className="mb-3 ml-[30px] mt-1 inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink bg-plinth px-4 py-2 text-[15px] font-medium text-ink transition-colors hover:bg-wash aria-pressed:bg-ink aria-pressed:text-stone"
    >
      {isolate ? <Undo2 size={16} aria-hidden /> : <Focus size={16} aria-hidden />}
      {isolate ? t('stage.isolateOff') : t('stage.isolate')}
    </button>
  );
}

export function PartsList({ parts, groups, canIsolate }: { parts: Part[]; groups?: PartGroup[]; canIsolate?: boolean }) {
  const { selected, hovered, select, hover } = useSelection();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));

  useEffect(() => {
    if (!selected) return;
    const el = refs.current.get(selected);
    if (!el || !window.matchMedia?.('(min-width: 1024px)').matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selected]);

  const setRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) refs.current.set(id, el);
  };

  return (
    <ul className="m-0 list-none border-t border-line p-0">
      {parts.map((p, i) => {
        const isSel = selected === p.id;
        const isHover = hovered === p.id;
        const g = p.group && groupName.has(p.group) && parts[i - 1]?.group !== p.group ? p.group : null;
        return (
          <li key={p.id} className="border-b border-line">
            {g && (
              <button
                type="button"
                ref={setRef(g)}
                aria-current={selected === g ? 'true' : undefined}
                onClick={() => select(selected === g ? null : g)}
                onMouseEnter={() => hover(g)}
                onMouseLeave={() => hover(null)}
                onFocus={() => hover(g)}
                onBlur={() => hover(null)}
                className="part-group mt-6 block w-full cursor-pointer px-3 pb-2 pt-1 text-left text-ink transition-colors"
                data-hover={hovered === g || undefined}
              >
                <span className="font-display text-[17px] font-bold tracking-[-0.01em]" style={{ color: 'var(--accent)' }}>
                  {groupName.get(g)}
                </span>
              </button>
            )}
            {g && canIsolate && selected === g && <IsolateButton />}
            <button
              type="button"
              ref={setRef(p.id)}
              aria-current={isSel ? 'true' : undefined}
              onClick={() => select(isSel ? null : p.id)}
              onMouseEnter={() => hover(p.id)}
              onMouseLeave={() => hover(null)}
              onFocus={() => hover(p.id)}
              onBlur={() => hover(null)}
              className="part-row block w-full cursor-pointer px-3 py-3.5 text-left text-ink transition-colors"
              data-hover={isHover || undefined}
            >
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="part-row__dot" aria-hidden />
                <span className="font-display text-[18px] font-semibold tracking-[-0.01em]">{p.name}</span>
                {p.latin && <span className="text-[14px] text-ink-soft">{p.latin}</span>}
              </span>
              <span className="mt-1 block pl-[18px] text-[16px] leading-[1.55] text-ink-soft">{p.text}</span>
            </button>
            {canIsolate && isSel && <IsolateButton />}
          </li>
        );
      })}
    </ul>
  );
}

export function KidSay({ lines }: { lines: string[] }) {
  return (
    <div className="kid-say rounded-[24px] p-6 sm:p-8">
      <MessageCircleHeart aria-hidden size={26} strokeWidth={1.6} style={{ color: 'var(--accent)' }} />
      <div className="mt-3 flex flex-col gap-3">
        {lines.map((l) => (
          <p key={l.slice(0, 24)} className="m-0 max-w-[36ch] font-display text-[clamp(21px,2.4vw,27px)] font-semibold leading-[1.32] tracking-[-0.02em]">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

export function FactList({ facts }: { facts: string[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {facts.map((f) => (
        <li key={f.slice(0, 24)} className="max-w-[60ch] border-t border-line py-4 text-[18px] leading-[1.5] first:border-t-0 first:pt-0">
          {f}
        </li>
      ))}
    </ul>
  );
}

export function CareList({ items }: { items: string[] }) {
  return (
    <>
      <ul className="m-0 max-w-[64ch] list-disc space-y-2.5 pl-5 marker:text-[var(--accent)]">
        {items.map((c) => (
          <li key={c.slice(0, 24)}>{c}</li>
        ))}
      </ul>
      <p className="mt-5 flex items-start gap-2 text-[15px] text-ink-soft">
        <Stethoscope aria-hidden size={18} className="mt-[3px] shrink-0" />
        {t('section.careNote')}
      </p>
    </>
  );
}

export function RelatedSections({ slugs }: { slugs: string[] }) {
  const items = slugs.map(getSection).filter((s): s is SectionMeta => !!s);
  return (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
      {items.map((s) => (
        <li key={s.slug}>
          <Link
            to={`/razdel/${s.slug}`}
            className="flex h-full items-start gap-3 rounded-[18px] border border-line bg-plinth p-4 text-ink no-underline transition-colors hover:border-ink"
          >
            <OrganIcon name={s.icon} size={30} className="shrink-0" />
            <span>
              <span className="block font-display text-[18px] font-semibold tracking-[-0.01em]">{s.title}</span>
              <span className="mt-0.5 block text-[15px] leading-snug text-ink-soft">{s.tagline}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
