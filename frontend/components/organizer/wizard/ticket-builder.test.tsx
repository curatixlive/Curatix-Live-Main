import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { newTier, type DraftTier } from '@/lib/organizer/wizard/model';
import { TicketBuilder } from './ticket-builder';

vi.mock('@/lib/api/organizer-writes', () => ({ deleteTicketType: vi.fn() }));
import { deleteTicketType } from '@/lib/api/organizer-writes';

const mockDelete = vi.mocked(deleteTicketType);

const saved = (over: Partial<DraftTier> = {}): DraftTier => ({
  ...newTier(0),
  key: 'srv-1',
  serverId: 'srv-1',
  version: 1,
  name: 'General',
  price: '499',
  quantity: '100',
  ...over,
});

const mount = (tiers: DraftTier[], onChange = vi.fn()) => {
  render(
    <ToastProvider>
      <TicketBuilder tiers={tiers} onChange={onChange} issues={new Map()} />
    </ToastProvider>,
  );
  return onChange;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('deleting a saved ticket', () => {
  it('is offered when nothing is sold or held against it', () => {
    mount([saved()]);
    expect(screen.getByRole('button', { name: 'Delete General' })).toBeTruthy();
  });

  it('is NOT offered once something is sold or held — the control would only be refused', () => {
    mount([saved({ committed: 3 })]);
    expect(screen.queryByRole('button', { name: 'Delete General' })).toBeNull();
    expect(screen.getByText(/3 sold or on hold/i)).toBeTruthy();
  });

  it('removes the row only after the server agrees', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDelete.mockResolvedValue(undefined);
    const onChange = mount([saved()]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete General' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
    expect(mockDelete).toHaveBeenCalledWith('srv-1');
  });

  it('keeps the row when the server refuses', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDelete.mockRejectedValue(new Error('This ticket type already has sales'));
    const onChange = mount([saved()]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete General' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when the organiser cancels the confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChange = mount([saved()]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete General' }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
