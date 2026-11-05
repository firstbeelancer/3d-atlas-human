import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const load = vi.fn();
vi.mock('../src/content/loadSection', () => ({
  loadSectionContent: (slug: string) => load(slug),
  hasSectionContent: () => true,
}));

import { AppRoutes } from '../src/App';
import { ThemeProvider } from '../src/lib/theme';
import { AdultProvider } from '../src/lib/adult';
import serdce from '../src/content/ru/serdce';

describe('section content loading', () => {
  it('shows a retry message when the content chunk fails, and recovers on retry', async () => {
    load.mockRejectedValueOnce(new Error('chunk 404')).mockResolvedValueOnce(serdce);
    render(
      <ThemeProvider>
        <AdultProvider>
          <MemoryRouter initialEntries={['/razdel/serdce']}>
            <AppRoutes />
          </MemoryRouter>
        </AdultProvider>
      </ThemeProvider>,
    );
    const retry = await screen.findByRole('button', { name: 'Попробовать ещё раз' });
    expect(screen.getByText(/Не удалось загрузить раздел/)).toBeInTheDocument();
    await userEvent.click(retry);
    expect(await screen.findByRole('heading', { level: 2, name: 'Что делает' })).toBeInTheDocument();
  });
});
