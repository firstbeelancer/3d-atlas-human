import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('../src/three/webgl', () => ({ hasWebGL: () => true }));

let lose: (() => void) | undefined;
vi.mock('../src/three/StageCanvas', () => ({
  StageCanvas: ({ children, onContextLost }: { children: React.ReactNode; onContextLost?: () => void }) => {
    lose = onContextLost;
    return <div data-testid="canvas">{children}</div>;
  },
}));

import { Stage } from '../src/three/Stage';
import { SelectionProvider } from '../src/three/selection';

function Boom(): never {
  throw new Error('model failed');
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('Stage robustness', () => {
  it('shows the text fallback instead of crashing when the model throws', async () => {
    render(
      <SelectionProvider>
        <p>Текст раздела</p>
        <Stage label="Сердце" description="Описание модели сердца.">
          {() => <Boom />}
        </Stage>
      </SelectionProvider>,
    );
    expect(await screen.findByText(/3D-модель не загрузилась/)).toBeInTheDocument();
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument();
    expect(screen.getByText('Текст раздела')).toBeInTheDocument();
  });

  it('switches to the fallback when the WebGL context is lost', async () => {
    render(
      <SelectionProvider>
        <Stage label="Сердце" description="Описание модели сердца.">
          {() => null}
        </Stage>
      </SelectionProvider>,
    );
    await screen.findByTestId('canvas');
    expect(lose).toBeTypeOf('function');
    act(() => lose!());
    expect(screen.getByText(/3D-модель не загрузилась/)).toBeInTheDocument();
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument();
  });
});
