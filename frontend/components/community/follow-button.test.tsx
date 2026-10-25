import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as CommunityApi from '@/lib/api/community';
import type * as AuthProvider from '@/lib/auth/auth-provider';
import { FollowButton } from './follow-button';

const fetchFollowState = vi.hoisted(() => vi.fn());
const followOrganization = vi.hoisted(() => vi.fn());
const unfollowOrganization = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof CommunityApi>()),
  fetchFollowState,
  followOrganization,
  unfollowOrganization,
}));

const useAuth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/auth-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthProvider>()),
  useAuth,
}));

vi.mock('@/components/auth/auth-sheet', () => ({
  AuthSheet: ({ open, onAuthenticated }: { open: boolean; onAuthenticated: () => void }) =>
    open ? (
      <div>
        <span>sign-in sheet</span>
        <button type="button" onClick={() => onAuthenticated()}>
          pretend to sign in
        </button>
      </div>
    ) : null,
}));

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FollowButton organizationId="o-1" initialCount={12} returnTo="/organizers/o-1" />
    </QueryClientProvider>,
  );
}

const state = (is_following: boolean, follower_count: number) => ({
  organization_id: 'o-1',
  is_following,
  notify: true,
  follower_count,
});

beforeEach(() => {
  [fetchFollowState, followOrganization, unfollowOrganization, useAuth].forEach((m) =>
    m.mockReset(),
  );
  fetchFollowState.mockResolvedValue(state(false, 12));
  followOrganization.mockResolvedValue(state(true, 13));
  unfollowOrganization.mockResolvedValue(state(false, 12));
});

describe('FollowButton', () => {
  it('is drawn for an anonymous visitor, and pressing it asks them to sign in', async () => {
    useAuth.mockReturnValue({ user: null, status: 'anonymous' });
    mount();
    expect(screen.getByText('12 followers')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /follow/i }));
    expect(screen.getByText('sign-in sheet')).toBeInTheDocument();
    expect(followOrganization).not.toHaveBeenCalled();
    expect(fetchFollowState).not.toHaveBeenCalled();
  });

  it('completes the follow on the far side of the sign-in', async () => {
    useAuth.mockReturnValue({ user: null, status: 'anonymous' });
    mount();
    await userEvent.click(screen.getByRole('button', { name: /follow/i }));
    await userEvent.click(screen.getByText('pretend to sign in'));
    await waitFor(() => expect(followOrganization).toHaveBeenCalledWith('o-1'));
  });

  it('follows, then unfollows, showing the count the SERVER returned', async () => {
    useAuth.mockReturnValue({ user: { id: 'u-1' }, status: 'authenticated' });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Follow' }));
    expect(await screen.findByRole('button', { name: 'Following' })).toBeInTheDocument();
    expect(screen.getByText('13 followers')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Following' }));
    expect(await screen.findByText('12 followers')).toBeInTheDocument();
  });

  it('says so when the write fails instead of pretending it worked', async () => {
    useAuth.mockReturnValue({ user: { id: 'u-1' }, status: 'authenticated' });
    followOrganization.mockRejectedValue(new Error('network down'));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Follow' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
  });
});
