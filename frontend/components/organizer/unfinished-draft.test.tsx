import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));

import { draftStorageKey } from '@/lib/organizer/wizard/model';
import { UnfinishedDraft } from './unfinished-draft';

beforeEach(() => window.localStorage.clear());

const put = (value: unknown) =>
  window.localStorage.setItem(draftStorageKey('u-1'), JSON.stringify(value));

describe('the way back to a half-finished event', () => {
  it('offers to continue a draft that was typed but never reached the server', async () => {
    put({ title: 'Eira Night', eventId: '' });
    render(<UnfinishedDraft />);
    expect(await screen.findByText('Eira Night')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      '/dashboard/events/new',
    );
  });

  it('says nothing for an empty draft', () => {
    put({ title: '', venue: '', eventId: '' });
    render(<UnfinishedDraft />);
    expect(screen.queryByRole('link', { name: 'Continue' })).toBeNull();
  });

  it('says nothing once the event exists on the server (it is a table row then)', () => {
    put({ title: 'Eira Night', eventId: 'evt-1' });
    render(<UnfinishedDraft />);
    expect(screen.queryByRole('link', { name: 'Continue' })).toBeNull();
  });
});
