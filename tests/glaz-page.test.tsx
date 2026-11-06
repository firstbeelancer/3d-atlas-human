import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../src/App';
import { ThemeProvider } from '../src/lib/theme';
import { AdultProvider } from '../src/lib/adult';

function renderEye() {
  render(
    <ThemeProvider>
      <AdultProvider>
        <MemoryRouter initialEntries={['/razdel/glaz']}>
          <AppRoutes />
        </MemoryRouter>
      </AdultProvider>
    </ThemeProvider>,
  );
}

describe('eye section page', () => {
  it('shows every content block in order and no coming-soon notice', async () => {
    renderEye();
    await screen.findByRole('heading', { level: 2, name: 'Что делает' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Что делает',
      'Из чего состоит',
      'Как рассказать ребёнку',
      'Интересные факты',
      'Чем болеет и как беречь',
      'Связанные разделы',
    ]);
    expect(screen.queryByText('Раздел готовится')).not.toBeInTheDocument();
  });

  it('lists the parts under group headings and marks the clicked part as current', async () => {
    renderEye();
    const lens = await screen.findByRole('button', { name: /^Хрусталик/ });
    expect(screen.getByRole('button', { name: 'Прозрачные среды' })).toBeInTheDocument();
    await userEvent.click(lens);
    expect(lens).toHaveAttribute('aria-current', 'true');
  });
});
