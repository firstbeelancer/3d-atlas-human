import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Footer } from '../src/components/layout/Footer';

describe('Footer', () => {
  it('shows the exact disclaimer with a contact link', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Сайт носит информационный характер\. Заметили ошибку\?/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Напишите нам' });
    expect(link).toHaveAttribute('href', '/o-proekte#svyaz');
  });
});
