import { lazy, Suspense, useMemo, type ComponentType } from 'react';
import { useAdult } from '../lib/adult';

interface Props<P extends object> {
  /** Динамический импорт 18+-модуля. Вызывается только при включённом режиме 18+. */
  load: () => Promise<{ default: ComponentType<P> }>;
  props?: P;
}

/** Рендерит 18+-материал только при включённом режиме; иначе код и данные даже не загружаются. */
export function AdultOnly<P extends object>({ load, props }: Props<P>) {
  const { adult } = useAdult();
  if (!adult) return null;
  return <AdultLoaded load={load} props={props} />;
}

function AdultLoaded<P extends object>({ load, props }: Props<P>) {
  const Lazy = useMemo(() => lazy(load), []);
  return (
    <Suspense fallback={null}>
      <Lazy {...((props ?? {}) as P)} />
    </Suspense>
  );
}
