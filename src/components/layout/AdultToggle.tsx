import { useAdult } from '../../lib/adult';
import { t } from '../../i18n';
import { AdultConfirmDialog } from './AdultConfirmDialog';

export function AdultToggle() {
  const { adult, requestEnable, disable } = useAdult();
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={adult}
        aria-label={t('adult.switch')}
        title={t('adult.switch')}
        onClick={adult ? disable : requestEnable}
        className="flex h-10 items-center gap-2 rounded-full px-3 text-[14px] font-semibold text-ink transition-colors hover:bg-wash"
      >
        <span aria-hidden>{t('adult.badge')}</span>
        <span
          aria-hidden
          className={`relative h-[18px] w-[30px] rounded-full transition-colors ${adult ? 'bg-ink' : 'bg-line'}`}
        >
          <span
            className={`absolute top-[2px] size-[14px] rounded-full bg-plinth shadow-sm transition-[left] ${adult ? 'left-[14px]' : 'left-[2px]'}`}
          />
        </span>
      </button>
      <AdultConfirmDialog />
    </>
  );
}
