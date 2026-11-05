import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SelectionProvider, useSelection } from '../src/three/selection';

const wrapper = ({ children }: { children: ReactNode }) => <SelectionProvider>{children}</SelectionProvider>;

describe('useSelection', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    expect(result.current.selected).toBeNull();
    expect(result.current.hovered).toBeNull();
  });

  it('selects and clears a part', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => result.current.select('aorta'));
    expect(result.current.selected).toBe('aorta');
    act(() => result.current.select(null));
    expect(result.current.selected).toBeNull();
  });

  it('tracks hover separately from selection', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => result.current.select('aorta'));
    act(() => result.current.hover('septum'));
    expect(result.current.selected).toBe('aorta');
    expect(result.current.hovered).toBe('septum');
  });
});
