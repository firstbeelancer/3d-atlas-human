import { Mail, MessageSquareWarning } from 'lucide-react';
import { t } from '../i18n';
import { useDocumentMeta } from '../lib/meta';
import { aboutLicense, aboutParagraphs } from '../content/ru/about';

const REPO = 'https://github.com/firstbeelancer/3d-atlas-human';
/** Адрес для писем об ошибках — заполнит владелец проекта перед публикацией. */
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;

export function AboutPage() {
  useDocumentMeta(t('nav.about'), t('site.description'));
  return (
    <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="m-0 text-[clamp(44px,7vw,88px)] font-extrabold leading-[0.95] tracking-[-0.05em]">{t('nav.about')}</h1>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex max-w-[62ch] flex-col gap-4 text-[18px] leading-[1.6]">
          {aboutParagraphs.map((p) => (
            <p key={p.slice(0, 32)} className="m-0">
              {p}
            </p>
          ))}
          <p className="m-0 text-ink-soft">{aboutLicense}</p>
        </div>

        <section id="svyaz" className="scroll-mt-24 self-start rounded-[24px] border border-line bg-plinth p-6 sm:p-8">
          <MessageSquareWarning aria-hidden size={26} strokeWidth={1.6} />
          <h2 className="mb-0 mt-3 text-[28px] font-bold tracking-[-0.03em]">{t('about.contactTitle')}</h2>
          <p className="mt-2 text-ink-soft">{t('about.contactText')}</p>
          <div className="mt-5 flex flex-col gap-2.5">
            {CONTACT_EMAIL && (
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('about.mailSubject'))}`}
                className="flex items-center gap-2.5 rounded-full bg-ink px-5 py-3 font-medium text-stone no-underline hover:opacity-90"
              >
                <Mail aria-hidden size={18} />
                {CONTACT_EMAIL}
              </a>
            )}
            <a
              href={`${REPO}/issues`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line px-5 py-3 text-center font-medium text-ink no-underline hover:bg-wash"
            >
              {t('about.github')}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
