import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { safeGet, safeRemove, safeSet } from './storage';

const KEY = 'atlas.adult';

interface AdultState {
  adult: boolean;
  /** Открыт ли диалог подтверждения возраста. */
  asking: boolean;
  requestEnable: () => void;
  confirm: () => void;
  cancel: () => void;
  disable: () => void;
}

const AdultContext = createContext<AdultState | null>(null);

export function AdultProvider({ children }: { children: ReactNode }) {
  const [adult, setAdult] = useState(() => safeGet(KEY) === '1');
  const [asking, setAsking] = useState(false);

  const requestEnable = useCallback(() => setAsking(true), []);
  const confirm = useCallback(() => {
    safeSet(KEY, '1');
    setAdult(true);
    setAsking(false);
  }, []);
  const cancel = useCallback(() => setAsking(false), []);
  const disable = useCallback(() => {
    safeRemove(KEY);
    setAdult(false);
  }, []);

  const value = useMemo(
    () => ({ adult, asking, requestEnable, confirm, cancel, disable }),
    [adult, asking, requestEnable, confirm, cancel, disable],
  );
  return <AdultContext.Provider value={value}>{children}</AdultContext.Provider>;
}

export function useAdult() {
  const ctx = useContext(AdultContext);
  if (!ctx) throw new Error('useAdult outside AdultProvider');
  return ctx;
}
