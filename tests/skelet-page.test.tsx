import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../src/App';
import { ThemeProvider } from '../src/lib/theme';
import { AdultProvider } from '../src/lib/adult';
import { HomePage } from '../src/pages/HomePage';

function renderSkeleton() {
  render(
    <ThemeProvider>
      <AdultProvider>
        <MemoryRouter initialEntries={['/razdel/skelet']}>
          <AppRoutes />
        </MemoryRouter>
      </AdultProvider>
    </ThemeProvider>,
  );
}

describe('skeleton section page', () => {
  it('shows the full section instead of the coming-soon notice', async () => {
    renderSkeleton();
    await screen.findByRole('heading', { level: 2, name: 'Что делает' });
    expect(screen.queryByText('Раздел готовится')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Скелет' })).toBeInTheDocument();
  });

  it('groups the parts and selects a whole group from its heading', async () => {
    renderSkeleton();
    const spine = await screen.findByRole('button', { name: 'Позвоночник' });
    const femur = screen.getByRole('button', { name: /^Бедренная кость/ });
    await userEvent.click(spine);
    expect(spine).toHaveAttribute('aria-current', 'true');
    await userEvent.click(femur);
    expect(femur).toHaveAttribute('aria-current', 'true');
    expect(spine).not.toHaveAttribute('aria-current');
  });

  it('is no longer marked as coming soon on the home page', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </ThemeProvider>,
    );
    const index = screen.getByRole('region', { name: 'Разделы атласа' });
    const link = within(index).getByRole('link', { name: /Скелет/ });
    expect(within(link).queryByText('Скоро')).not.toBeInTheDocument();
  });
});
