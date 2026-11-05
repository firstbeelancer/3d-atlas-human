import { useEffect } from 'react';
import { t } from '../i18n';

/** Заголовок вкладки и описание страницы (на клиенте; при сборке их дублирует prerender-meta). */
export function useDocumentMeta(title: string | null, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${t('site.name')}` : t('site.name');
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}
