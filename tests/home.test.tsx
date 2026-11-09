import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HomePage } from '../src/pages/HomePage';
import { SYSTEMS } from '../src/content/systems';
import { SECTIONS } from '../src/content/sections';
import { ThemeProvider } from '../src/lib/theme';

function renderHome() {
  render(
    <ThemeProvider>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('home page', () => {
  it('lists all systems in order', () => {
    renderHome();
    const index = screen.getByRole('region', { name: 'Разделы атласа' });
    const titles = within(index).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(SYSTEMS.map((s) => s.title));
  });

  it('links to all sections', () => {
    renderHome();
    const index = screen.getByRole('region', { name: 'Разделы атласа' });
    const links = within(index).getAllByRole('link');
    expect(links).toHaveLength(SECTIONS.length);
    expect(links.map((a) => a.getAttribute('href'))).toContain('/razdel/serdce');
    expect(links.map((a) => a.getAttribute('href'))).toContain('/razdel/selezenka');
  });

  it('marks sections that are not ready yet', () => {
    renderHome();
    const index = screen.getByRole('region', { name: 'Разделы атласа' });
    const heart = within(index).getByRole('link', { name: /Сердце/ });
    const unready = within(index).getByRole('link', { name: /Внутренние органы/ });
    expect(within(heart).queryByText('Скоро')).not.toBeInTheDocument();
    expect(within(unready).getByText('Скоро')).toBeInTheDocument();
  });

  it('has a search field', () => {
    renderHome();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
});
