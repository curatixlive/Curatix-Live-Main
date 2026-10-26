'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, UserPlus } from 'lucide-react';
import {
  fetchFollowState,
  followOrganization,
  unfollowOrganization,
  type FollowState,
} from '@/lib/api/community';
import { errorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthSheet } from '@/components/auth/auth-sheet';
import { Button } from '@/components/ui/button';

/**
 * Follow / unfollow an organizer.
 *
 * Drawn for everybody; pressing it signed out opens the sign-in sheet and the
 * follow completes on the far side (the waiting list's pattern — the button is
 * not hidden from people still deciding whether to make an account). The
 * follower count comes back from the server on every write, so the number is
 * never a local guess that drifts.
 */
export function FollowButton({
  organizationId,
  initialCount,
  returnTo,
  onCount,
  showCount = true,
}: {
  organizationId: string;
  initialCount: number;
  returnTo: string;
  onCount?: (count: number) => void;
  showCount?: boolean;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [authOpen, setAuthOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pending = React.useRef(false);
  const key = ['follow', organizationId];

  const state = useQuery({
    queryKey: key,
    queryFn: () => fetchFollowState(organizationId),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const write = useMutation({
    mutationFn: (next: boolean) =>
      next ? followOrganization(organizationId) : unfollowOrganization(organizationId),
    onSuccess: (result: FollowState) => {
      client.setQueryData(key, result);
      onCount?.(result.follower_count);
      setError(null);
    },
    onError: (thrown) => setError(errorMessage(thrown)),
  });

  const following = Boolean(state.data?.is_following);
  const count = state.data?.follower_count ?? initialCount;

  const press = () => {
    setError(null);
    if (!user) {
      pending.current = true;
      setAuthOpen(true);
      return;
    }
    if (!write.isPending) write.mutate(!following);
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={following ? 'outline' : 'primary'}
        onClick={press}
        loading={write.isPending}
        aria-pressed={following}
        className="gap-1.5"
      >
        {following ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <UserPlus className="size-4" aria-hidden />
        )}
        {following ? 'Following' : 'Follow'}
      </Button>
      {showCount ? (
        <p className="text-caption text-muted-foreground">
          {count.toLocaleString('en-IN')} {count === 1 ? 'follower' : 'followers'}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger-subtle-foreground text-caption">
          {error}
        </p>
      ) : null}
      <AuthSheet
        open={authOpen}
        onOpenChange={(next) => {
          setAuthOpen(next);
          if (!next) pending.current = false;
        }}
        onAuthenticated={() => {
          setAuthOpen(false);
          if (pending.current) {
            pending.current = false;
            write.mutate(true);
          }
        }}
        next={returnTo}
        heading="Sign in to follow"
        subheading="Follow organisers to hear about their new events first."
      />
    </div>
  );
}
