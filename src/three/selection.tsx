import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface Selection {
  selected: string | null;
  hovered: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
}

const SelectionContext = createContext<Selection | null>(null);

/** Общее выделение части органа: связывает 3D-модель, подписи и список «Из чего состоит». */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, select] = useState<string | null>(null);
  const [hovered, hover] = useState<string | null>(null);
  const value = useMemo(() => ({ selected, hovered, select, hover }), [selected, hovered]);
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
