import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The organiser's two follow-up lists. What matters: contact details are shown
 * (they may phone), the reminder goes only to the chosen buyer, and the
 * outcome is said plainly, including "already reminded today".
 */

const api = vi.hoisted(() => ({
  waitlist: vi.fn(),
  failed: vi.fn(),
  remind: vi.fn(),
}));

vi.mock('@/lib/api/follow-ups', () => ({
  fetchEventWaitlist: () => api.waitlist(),
  fetchFailedPayments: () => api.failed(),
  sendPaymentReminders: (...args: unknown[]) => api.remind(...args),
}));

import { EventFollowUps } from './follow-ups';

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EventFollowUps eventId="evt-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.waitlist.mockResolvedValue({
    data: [
      {
        id: 'w1',
        name: 'Asha Rao',
        email: 'asha@example.com',
        phone: '+919876543210',
        quantity: 3,
        joined_at: '2026-10-20T10:00:00Z',
        notified_at: null,
      },
    ],
    meta: { count: 1, tickets_wanted: 3 },
  });
  api.failed.mockResolvedValue({
    data: [
      {
        booking_id: 'b1',
        name: 'Dev Patel',
        email: 'dev@example.com',
        phone: '',
        tickets: 2,
        amount_minor: 300000,
        status: 'expired',
        attempted_at: '2026-10-21T10:00:00Z',
      },
    ],
    meta: { count: 1 },
  });
  api.remind.mockReset();
});

describe('the waiting list', () => {
  it('shows who is waiting, how many tickets they want and how to reach them', async () => {
    mount();
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('3 tickets')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+919876543210/ })).toHaveAttribute(
      'href',
      'tel:+919876543210',
    );
    expect(screen.getByText(/3 tickets wanted/)).toBeInTheDocument();
  });
});

describe('unpaid checkouts', () => {
  it('reminds only the buyer whose button was pressed', async () => {
    api.remind.mockResolvedValue({ sent: 1, skipped: 0 });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: /send dev patel a reminder/i }),
    );
    await waitFor(() => expect(api.remind).toHaveBeenCalledWith('evt-1', ['b1']));
    expect(await screen.findByRole('status')).toHaveTextContent('Reminder emailed to 1 person.');
  });

  it('says so when everyone was already reminded today', async () => {
    api.remind.mockResolvedValue({ sent: 0, skipped: 1 });
    mount();
    await userEvent.click(
      await screen.findByRole('button', { name: /send dev patel a reminder/i }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/already reminded today/i);
  });
});
