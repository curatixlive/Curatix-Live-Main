'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import {
  fetchAgentAccess,
  grantAgentAccess,
  revokeAgentAccess,
  setAgentAccessEnabled,
  type AgentAccess,
} from '@/lib/api/agents';
import { API_BASE_URL } from '@/lib/api/config';
import { errorMessage } from '@/lib/api/errors';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/organizer/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

/**
 * AI ASSISTANT ACCESS — who may drive Curatix from Claude, ChatGPT or Cursor.
 *
 * Off for everybody until an operator grants it, per person. A grant produces a
 * connection address shown ONCE: only a digest is stored, so it cannot be
 * recovered — issuing again replaces it, which is also how a leaked one is
 * rotated. What the assistant can do is small and fixed: it acts as that
 * person, creates DRAFT events and ticket tiers, and cannot publish, refund or
 * pay out.
 */

const KEY = ['admin', 'agent-access'] as const;

export function AgentAccessAdmin() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = React.useState('');
  const [issued, setIssued] = React.useState<AgentAccess | null>(null);
  const list = useQuery({ queryKey: KEY, queryFn: fetchAgentAccess });
  const rows = list.data?.data ?? [];

  const refresh = () => void client.invalidateQueries({ queryKey: KEY });
  const fail = (error: unknown) => toast({ title: errorMessage(error), variant: 'destructive' });

  const grant = useMutation({
    mutationFn: (value: string) => grantAgentAccess(value),
    onSuccess: (row) => {
      setIssued(row);
      setEmail('');
      refresh();
    },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => setAgentAccessEnabled(v.id, v.enabled),
    onSuccess: refresh,
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeAgentAccess(id),
    onSuccess: () => {
      toast({ title: 'Access revoked', variant: 'success' });
      refresh();
    },
    onError: fail,
  });

  const address = issued?.path ? `${API_BASE_URL}${issued.path}` : '';
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', variant: 'success' });
    } catch {
      toast({ title: 'Could not copy — select the text and copy it', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-foreground">AI assistant access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Let a person create draft events from Claude, ChatGPT or Cursor. It is off for everybody
          until you grant it here. The assistant acts as that person and can only make drafts — they
          review and publish on this site.
        </p>
      </header>

      <Panel className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) grant.mutate(email.trim());
          }}
        >
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="agent-email" className="text-sm font-medium text-foreground">
              Account email
            </label>
            <Input
              id="agent-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="organiser@example.com"
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={grant.isPending || !email.trim()}>
            <KeyRound className="mr-2 size-4" aria-hidden />
            Grant access
          </Button>
        </form>
      </Panel>

      {issued?.token && (
        <div role="status">
          <Panel className="space-y-3 border-primary p-4">
            <p className="text-sm font-medium text-foreground">
              Connection address for {issued.user.email} — shown once
            </p>
            <p className="text-sm text-muted-foreground">
              Copy it now; it cannot be shown again. Anyone holding it can act as this person, so
              send it privately. Add it as a connector in the assistant (Claude: Settings →
              Connectors → Add custom connector; ChatGPT: Settings → Connectors → Add).
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
                {address}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy(address)}>
                <Copy className="mr-1 size-4" aria-hidden />
                Copy
              </Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIssued(null)}>
              I have copied it
            </Button>
          </Panel>
        </div>
      )}

      {list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody has access yet" body="Grant access to a person above." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Panel className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-medium text-foreground">
                    {row.user.full_name || row.user.email}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {row.user.email} · key …{row.token_hint} ·{' '}
                    {row.last_used_at
                      ? `last used ${new Date(row.last_used_at).toLocaleString()}`
                      : 'never used'}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={row.enabled}
                    disabled={toggle.isPending}
                    aria-label={`Allow ${row.user.email} to use the AI assistant`}
                    onCheckedChange={(enabled) => toggle.mutate({ id: row.id, enabled })}
                  />
                  <span className="w-14 text-muted-foreground">{row.enabled ? 'On' : 'Off'}</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Revoke access for ${row.user.email}`}
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(row.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
