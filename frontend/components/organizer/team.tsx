'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus, UsersRound } from 'lucide-react';
import { errorMessage } from '@/lib/api/errors';
import type { CoHostPermissions } from '@/lib/api/event-access-admin';
import { addTeamMember, fetchTeam, removeTeamMember, updateTeamMember } from '@/lib/api/team';
import { useActiveOrganization } from '@/lib/organizer/active-organization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Panel, Skeleton } from '@/components/organizer/primitives';
import { PERMISSION_LABELS } from '@/components/organizer/wizard/cohost-panel';

/**
 * The whole-band team: people who help run EVERY event of the organisation,
 * including events created later. An event's own co-host list adds to this and
 * never takes away from it. Only the owner sees this page work; a team member
 * cannot change anyone's access, their own included.
 */
export function TeamManager() {
  const { organization, ready, hasNone, needsChoice } = useActiveOrganization();
  const client = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [failure, setFailure] = React.useState('');
  const orgId = organization?.id;
  const key = ['organizer', 'team', orgId];

  const list = useQuery({
    queryKey: key,
    queryFn: () => fetchTeam(orgId as string),
    enabled: Boolean(orgId),
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: () => addTeamMember(orgId as string, email.trim()),
    onSuccess: () => {
      setEmail('');
      setFailure('');
      void refresh();
    },
    onError: (error) => setFailure(errorMessage(error)),
  });
  const change = useMutation({
    mutationFn: (input: { id: string; permissions: Partial<CoHostPermissions> }) =>
      updateTeamMember(orgId as string, input.id, input.permissions),
    onSuccess: () => void refresh(),
    onError: (error) => setFailure(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeTeamMember(orgId as string, id),
    onSuccess: () => void refresh(),
    onError: (error) => setFailure(errorMessage(error)),
  });

  if (!ready) return <Skeleton className="h-64 w-full" />;
  if (hasNone || needsChoice || !organization) {
    return (
      <Panel title="Team">
        <p className="text-body-sm text-muted-foreground">
          {hasNone
            ? 'Create an organisation first. A team belongs to the organisation it helps run.'
            : 'Choose which organisation to manage from the menu at the top.'}
        </p>
      </Panel>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Panel
        title="Your team"
        subtitle={`People who can help run every ${organization.name} event, now and later.`}
      >
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(submit) => {
            submit.preventDefault();
            if (email.trim()) add.mutate();
          }}
        >
          <Input
            aria-label="Team member email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="their-account@example.com"
            className="max-w-80"
          />
          <Button type="submit" variant="outline" disabled={!email.trim() || add.isPending}>
            <UserPlus className="size-4" aria-hidden /> {add.isPending ? 'Adding…' : 'Add to team'}
          </Button>
        </form>
        <p className="mt-2 text-caption text-muted-foreground">
          They need a Curatix account. New members can see analytics, attendees and scan tickets,
          but not money, until you turn that on.
        </p>
        {failure ? (
          <p role="alert" className="mt-2 text-body-sm text-muted-foreground">
            {failure}
          </p>
        ) : null}
      </Panel>

      {list.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (list.data ?? []).length === 0 ? (
        <Panel>
          <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <UsersRound className="size-4" aria-hidden /> No one on your team yet. To give someone
            access to a single event instead, use the Co-hosts section when you create or edit it.
          </p>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {(list.data ?? []).map((member) => (
            <li
              key={member.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-card shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-semibold">
                    {member.name || member.email}
                  </span>
                  {member.name ? (
                    <span className="block truncate text-caption text-muted-foreground">
                      {member.email}
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${member.email} from the team`}
                  onClick={() => remove.mutate(member.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
              <ul className="flex flex-col gap-2">
                {PERMISSION_LABELS.map(([permission, label, hint]) => (
                  <li key={permission} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-body-sm">{label}</span>
                      <span className="block text-caption text-muted-foreground">{hint}</span>
                    </span>
                    <Switch
                      aria-label={`${label} for ${member.email}`}
                      checked={Boolean(member.permissions[permission])}
                      onCheckedChange={(on: boolean) =>
                        change.mutate({ id: member.id, permissions: { [permission]: on } })
                      }
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
