import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';

describe('browser Back navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('returns an active game to the Welcome screen', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<App />);

    fireEvent.click(
      screen.getByRole('switch', { name: 'Sound is on. Turn sound off.' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Begin challenge' }));
    await waitFor(() => expect(pushState).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Bible Sequence — go to start screen',
        }),
      ).toBeInTheDocument(),
    );

    act(() => window.dispatchEvent(new PopStateEvent('popstate')));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Welcome' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: 'Challenge' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('cleans up the game history entry when the in-app Home control is used', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    render(<App />);

    fireEvent.click(
      screen.getByRole('switch', { name: 'Sound is on. Turn sound off.' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Begin challenge' }));
    const home = await screen.findByRole('button', {
      name: 'Bible Sequence — go to start screen',
    });
    fireEvent.click(home);

    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('region', { name: 'Welcome' })).toBeInTheDocument();
  });
});
