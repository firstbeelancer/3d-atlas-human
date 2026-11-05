import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../src/App';
import { ThemeProvider } from '../src/lib/theme';
import { AdultProvider } from '../src/lib/adult';

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <AdultProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AdultProvider>
    </ThemeProvider>,
  );
}

describe('routes', () => {
  it('renders a section page by slug', async () => {
    renderAt('/razdel/pechen');
    expect(await screen.findByRole('heading', { level: 1, name: 'Печень' })).toBeInTheDocument();
  });

  it('shows a coming-soon state for sections that are not ready', async () => {
    renderAt('/razdel/pechen');
    expect(await screen.findByText('Раздел готовится')).toBeInTheDocument();
  });

  it('shows the not-found page for an unknown slug', async () => {
    renderAt('/razdel/xxx');
    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument();
  });

  it('shows the not-found page for an unknown path', async () => {
    renderAt('/kakaya-to/stranica');
    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument();
  });
});
