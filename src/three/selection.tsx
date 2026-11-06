import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Selection {
  selected: string | null;
  hovered: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  /** Режим «Рассмотреть отдельно»: на сцене остаётся только выбранная часть. */
  isolate: boolean;
  setIsolate: (on: boolean) => void;
}

const SelectionContext = createContext<Selection | null>(null);

/** Общее выделение части органа: связывает 3D-модель, подписи и список «Из чего состоит». */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isolate, setIsolate] = useState(false);
  const select = useCallback((id: string | null) => {
    setSelected(id);
    if (id === null) setIsolate(false);
  }, []);
  const [hovered, hover] = useState<string | null>(null);
  const value = useMemo(() => ({ selected, hovered, select, hover, isolate: isolate && selected !== null, setIsolate }), [selected, hovered, select, isolate]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): Selection {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection outside SelectionProvider');
  return ctx;
}

/** Активна ли часть (выделена или под курсором). */
export function useIsActive(partId: string): boolean {
  const { selected, hovered } = useSelection();
  return selected === partId || hovered === partId;
}
