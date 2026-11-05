import { ShieldAlert } from 'lucide-react';
import { t } from '../../i18n';

/**
 * Блок 18+ разделов о размножении. Загружается только при включённом режиме 18+.
 * Подробные модели и тексты 18+ появятся в плане репродуктивных разделов.
 */
export default function AdultSectionNote() {
  return (
    <div data-adult="ADULT_CONTENT_MARKER" className="mt-10 flex items-start gap-3 rounded-[20px] border border-line bg-plinth p-5">
      <ShieldAlert aria-hidden size={22} className="mt-0.5 shrink-0" />
      <p className="m-0 text-ink-soft">{t('adult.sectionNote')}</p>
    </div>
  );
}
