import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { Button } from './Button';
import styles from './Button.module.css';

describe('Button', () => {
  it('renders a Link with button classes when `to` is provided (AC6)', () => {
    render(
      <MemoryRouter>
        <Button to="/profile" variant="ghost" size="sm">Your API Key</Button>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /your api key/i });
    expect(link).toHaveAttribute('href', '/profile');
    expect(link).toHaveClass(styles.btn, styles.btnGhost, styles.btnSm);
  });

  it('renders a button and preserves button behavior when `to` is omitted (AC7)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Log out</Button>);

    const button = screen.getByRole('button', { name: /log out/i });
    expect(button.tagName).toBe('BUTTON');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
