import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../src/App';
import { ThemeProvider } from '../src/lib/theme';
import { AdultProvider } from '../src/lib/adult';

afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
  render(
    <ThemeProvider>
      <AdultProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AdultProvider>
    </ThemeProvider>,
  );
}

describe('scroll on navigation', () => {
  it('opens a new page at the top', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderAt('/razdel/pechen');
    scrollTo.mockClear();
    await userEvent.click(screen.getAllByRole('link', { name: 'О проекте' })[0]);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('scrolls to the anchor of a hash link', async () => {
    const into = vi.fn();
    Element.prototype.scrollIntoView = into;
    renderAt('/razdel/pechen');
    await userEvent.click(screen.getByRole('link', { name: 'Напишите нам' }));
    await screen.findByRole('heading', { name: 'Заметили ошибку?' });
    expect(into).toHaveBeenCalled();
    expect(into.mock.contexts.some((el) => (el as Element).id === 'svyaz')).toBe(true);
  });
});
