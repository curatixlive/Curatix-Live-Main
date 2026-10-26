import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordStep } from './forgot-password-step';

const mocks = vi.hoisted(() => ({
  fetchResetChannels: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => mocks);

const open = (onDone = vi.fn()) =>
  render(<ForgotPasswordStep initialEmail="a@b.co" onDone={onDone} onBack={vi.fn()} />);

describe('ForgotPasswordStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchResetChannels.mockResolvedValue(['email']);
    mocks.requestPasswordReset.mockResolvedValue(undefined);
    mocks.confirmPasswordReset.mockResolvedValue(undefined);
  });

  it('offers only email when no text provider is configured', async () => {
    open();
    await waitFor(() => expect(mocks.fetchResetChannels).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /text message/i })).toBeNull();
  });

  it('offers text message too when the server says it can send one', async () => {
    mocks.fetchResetChannels.mockResolvedValue(['email', 'sms']);
    open();
    expect(await screen.findByRole('button', { name: /text message/i })).toBeTruthy();
  });

  it('asks for a code, then sets the new password and hands back', async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    open(onDone);

    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith('a@b.co', 'email');
    // The wording never confirms that an account exists.
    expect(await screen.findByText(/if there is an account/i)).toBeTruthy();

    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'Brand-New-Pass-84215');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(mocks.confirmPasswordReset).toHaveBeenCalledWith(
      'a@b.co',
      '123456',
      'Brand-New-Pass-84215',
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('a@b.co'));
  });

  it('refuses a short code or password before calling the server', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '12');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mocks.confirmPasswordReset).not.toHaveBeenCalled();
  });
});
