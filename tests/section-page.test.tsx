import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../src/App';
import { ThemeProvider } from '../src/lib/theme';
import { AdultProvider } from '../src/lib/adult';

function renderHeart() {
  render(
    <ThemeProvider>
      <AdultProvider>
        <MemoryRouter initialEntries={['/razdel/serdce']}>
          <AppRoutes />
        </MemoryRouter>
      </AdultProvider>
    </ThemeProvider>,
  );
}

describe('heart section page', () => {
  it('shows every content block in order', async () => {
    renderHeart();
    await screen.findByRole('heading', { level: 2, name: 'Что делает' });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Что делает',
      'Из чего состоит',
      'Как рассказать ребёнку',
      'Интересные факты',
      'Чем болеет и как беречь',
      'Связанные разделы',
    ]);
  });

  it('marks a part as current when it is clicked in the list', async () => {
    renderHeart();
    const aorta = await screen.findByRole('button', { name: /^Аорта/ });
    expect(aorta).not.toHaveAttribute('aria-current');
    await userEvent.click(aorta);
    expect(aorta).toHaveAttribute('aria-current', 'true');
    await userEvent.click(aorta);
    expect(aorta).not.toHaveAttribute('aria-current');
  });

  it('does not show the coming-soon notice for a ready section', async () => {
    renderHeart();
    await screen.findByRole('heading', { level: 2, name: 'Что делает' });
    expect(screen.queryByText('Раздел готовится')).not.toBeInTheDocument();
  });
});
