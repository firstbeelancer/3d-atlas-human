import { useEffect, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAdult } from '../../lib/adult';
import { t } from '../../i18n';

export function AdultConfirmDialog() {
  const { asking, confirm, cancel } = useAdult();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!asking) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [asking, cancel]);

  if (!asking) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#17203a]/45 p-4 backdrop-blur-[2px]" onClick={cancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="adult-title"
        aria-describedby="adult-text"
        className="w-full max-w-[400px] rounded-[24px] border border-line bg-plinth p-7 text-ink shadow-[0_24px_60px_-20px_rgba(23,32,58,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <ShieldAlert aria-hidden size={28} strokeWidth={1.6} />
        <h2 id="adult-title" className="mb-1.5 mt-3 text-[24px] font-bold tracking-[-0.02em]">
          {t('adult.title')}
        </h2>
        <p id="adult-text" className="m-0 text-ink-soft">
          {t('adult.text')}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={confirm}
            className="h-11 flex-1 rounded-full bg-ink px-5 font-medium text-stone transition-opacity hover:opacity-90"
          >
            {t('adult.confirm')}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={cancel}
            className="h-11 flex-1 rounded-full border border-line px-5 font-medium text-ink transition-colors hover:bg-wash"
          >
            {t('adult.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
