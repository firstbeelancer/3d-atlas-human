import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdultProvider, useAdult } from '../src/lib/adult';
import { AdultToggle } from '../src/components/layout/AdultToggle';
import { AdultOnly } from '../src/components/AdultOnly';
import { safeGet } from '../src/lib/storage';

afterEach(() => vi.restoreAllMocks());

function Probe() {
  const { adult } = useAdult();
  return <output data-testid="state">{adult ? 'on' : 'off'}</output>;
}

function setup() {
  return render(
    <AdultProvider>
      <AdultToggle />
      <Probe />
    </AdultProvider>,
  );
}

describe('adult mode', () => {
  it('is off by default', () => {
    setup();
    expect(screen.getByTestId('state')).toHaveTextContent('off');
    expect(screen.getByRole('switch', { name: 'Материалы 18+' })).toHaveAttribute('aria-checked', 'false');
  });

  it('asks for confirmation and stays off on cancel', async () => {
    setup();
    await userEvent.click(screen.getByRole('switch', { name: 'Материалы 18+' }));
    expect(screen.getByRole('button', { name: 'Мне есть 18 лет' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByTestId('state')).toHaveTextContent('off');
  });

  it('turns on after confirmation and remembers it', async () => {
    setup();
    await userEvent.click(screen.getByRole('switch', { name: 'Материалы 18+' }));
    await userEvent.click(screen.getByRole('button', { name: 'Мне есть 18 лет' }));
    expect(screen.getByTestId('state')).toHaveTextContent('on');
    expect(safeGet('atlas.adult')).toBe('1');
  });

  it('turns off again without a dialog', async () => {
    setup();
    await userEvent.click(screen.getByRole('switch', { name: 'Материалы 18+' }));
    await userEvent.click(screen.getByRole('button', { name: 'Мне есть 18 лет' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Материалы 18+' }));
    expect(screen.getByTestId('state')).toHaveTextContent('off');
    expect(screen.queryByRole('button', { name: 'Мне есть 18 лет' })).not.toBeInTheDocument();
    expect(safeGet('atlas.adult')).toBeNull();
  });

  it('restores the saved choice', () => {
    localStorage.setItem('atlas.adult', '1');
    setup();
    expect(screen.getByTestId('state')).toHaveTextContent('on');
  });

  it('works when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setup();
    await userEvent.click(screen.getByRole('switch', { name: 'Материалы 18+' }));
    await userEvent.click(screen.getByRole('button', { name: 'Мне есть 18 лет' }));
    expect(screen.getByTestId('state')).toHaveTextContent('on');
  });
});

describe('AdultOnly', () => {
  it('does not load adult content while the mode is off', () => {
    const load = vi.fn(() => Promise.resolve({ default: () => <p>secret</p> }));
    render(
      <AdultProvider>
        <AdultOnly load={load} />
      </AdultProvider>,
    );
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('loads and renders adult content when the mode is on', async () => {
    localStorage.setItem('atlas.adult', '1');
    const load = vi.fn(() => Promise.resolve({ default: () => <p>secret</p> }));
    render(
      <AdultProvider>
        <AdultOnly load={load} />
      </AdultProvider>,
    );
    await waitFor(() => expect(screen.getByText('secret')).toBeInTheDocument());
    expect(load).toHaveBeenCalledTimes(1);
  });
});
