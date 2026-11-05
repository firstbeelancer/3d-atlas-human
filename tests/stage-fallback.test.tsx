import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../src/three/webgl', () => ({ hasWebGL: vi.fn(() => false) }));
// Canvas из r3f в jsdom не работает — заменяем заглушкой, которая отдаёт children-функции состояние.
vi.mock('../src/three/StageCanvas', () => ({
  StageCanvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
}));

import { Stage } from '../src/three/Stage';
import { hasWebGL } from '../src/three/webgl';
import { SelectionProvider } from '../src/three/selection';
import type { StageState } from '../src/three/types';

afterEach(() => vi.mocked(hasWebGL).mockReturnValue(false));

function renderStage(children = vi.fn((_state: StageState) => null)) {
  render(
    <SelectionProvider>
      <Stage label="Сердце" description="Модель сердца с четырьмя камерами.">
        {children}
      </Stage>
    </SelectionProvider>,
  );
  return children;
}

describe('Stage', () => {
  it('shows a text fallback and no canvas without WebGL', () => {
    renderStage();
    expect(screen.getByText('Модель сердца с четырьмя камерами.')).toBeInTheDocument();
    expect(screen.getByText(/Ваш браузер не показывает 3D/)).toBeInTheDocument();
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument();
  });

  it('starts paused when the user prefers reduced motion', () => {
    vi.mocked(hasWebGL).mockReturnValue(true);
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const children = renderStage();
    expect(children).toHaveBeenCalled();
    expect(children.mock.calls[0][0]).toMatchObject({ paused: true });
    spy.mockRestore();
  });

  it('starts animated by default', () => {
    vi.mocked(hasWebGL).mockReturnValue(true);
    const children = renderStage();
    expect(children.mock.calls[0][0]).toMatchObject({ paused: false, labels: true, cutaway: false });
  });
});
