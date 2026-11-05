import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { search } from '../lib/search';
import { loadSectionContent } from '../content/loadSection';
import { SECTIONS } from '../content/sections';
import type { Part } from '../content/types';
import { t } from '../i18n';

/** Части органов подгружаем для поиска только когда человек начал печатать. */
function useAllParts(enabled: boolean) {
  const [parts, setParts] = useState<Record<string, Part[]>>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all(SECTIONS.filter((s) => s.ready).map(async (s) => [s.slug, (await loadSectionContent(s.slug))?.parts ?? []] as const)).then(
      (entries) => alive && setParts(Object.fromEntries(entries)),
    );
    return () => {
      alive = false;
    };
  }, [enabled]);
  return parts;
}

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const parts = useAllParts(query.length > 0);
  const results = useMemo(() => search(query, parts).slice(0, 8), [query, parts]);
  const navigate = useNavigate();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setActive(0), [query]);

  return (
    <div className="relative w-full max-w-[520px]">
      <label className="flex h-14 items-center gap-3 rounded-full border border-line bg-plinth px-5 shadow-[0_10px_30px_-22px_rgba(23,32,58,0.5)] focus-within:border-ink">
        <Search aria-hidden size={20} className="shrink-0 text-ink-soft" />
        <span className="sr-only">{t('search.open')}</span>
        <input
          ref={input}
          type="search"
          role="searchbox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1));
            if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
            if (e.key === 'Enter' && results[active]) navigate(`/razdel/${results[active].slug}`);
            if (e.key === 'Escape') setQuery('');
          }}
          placeholder={t('search.placeholder')}
          aria-controls={listId}
          aria-expanded={query.length > 0}
          autoComplete="off"
          className="h-full w-full bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-soft"
        />
      </label>
      {query.trim() && (
        <div
          id={listId}
          className="absolute left-0 right-0 top-[64px] z-30 overflow-hidden rounded-[20px] border border-line bg-plinth shadow-[0_24px_50px_-24px_rgba(23,32,58,0.45)]"
        >
          {results.length === 0 ? (
            <p className="m-0 p-5 text-ink-soft">{t('search.empty')}</p>
          ) : (
            <ul className="m-0 list-none p-1.5">
              {results.map((r, i) => (
                <li key={r.slug}>
                  <Link
                    to={`/razdel/${r.slug}`}
                    className={`flex items-baseline gap-2 rounded-[14px] px-4 py-3 text-ink no-underline ${i === active ? 'bg-wash' : ''}`}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span className="font-display font-semibold">{r.title}</span>
                    {r.match !== r.title && <span className="text-[15px] text-ink-soft">{r.match}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
