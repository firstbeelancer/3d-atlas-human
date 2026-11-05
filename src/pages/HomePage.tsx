import { Link } from 'react-router';
import { SECTIONS } from '../content/sections';
import { SYSTEMS } from '../content/systems';
import { t } from '../i18n';
import { useDocumentMeta } from '../lib/meta';

export function HomePage() {
  useDocumentMeta(null, t('site.description'));
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6">
      <h1 className="m-0 text-[clamp(44px,7vw,88px)] font-bold leading-[0.95] tracking-[-0.045em]">{t('site.name')}</h1>
      <section id="razdely" className="mt-12">
        {SYSTEMS.map((sys) => (
          <div key={sys.id} className="mt-6">
            <h2 className="m-0 text-[22px]">{sys.title}</h2>
            <ul className="m-0 mt-2 list-none p-0">
              {SECTIONS.filter((s) => s.system === sys.id).map((s) => (
                <li key={s.slug}>
                  <Link to={`/razdel/${s.slug}`}>{s.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
