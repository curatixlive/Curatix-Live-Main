'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Film, Plus, X } from 'lucide-react';
import {
  addHighlight,
  fetchAdminHighlights,
  fetchHighlightCandidates,
  removeHighlight,
  reorderHighlights,
} from '@/lib/api/cms';
import { errorMessage } from '@/lib/api/errors';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/organizer/primitives';
import { Button } from '@/components/ui/button';
import { RemoteImage } from '@/components/ui/remote-image';
import { useToast } from '@/components/ui/toast';
import { formatEventDate } from '@/lib/discovery/format';
import { videoThumbnail } from '@/lib/events/video-thumbnail';

/**
 * PAST-EVENT VIDEOS — which highlight videos the homepage shows.
 *
 * Organisers attach videos to their own events; only an operator decides which
 * of them reach the front page. The candidate list is the server's: videos of
 * events that have ALREADY HAPPENED, still visible, not yet featured. An event
 * that has not taken place (or was cancelled) is not offered — a highlight reel
 * must never become an advert for something upcoming — and the server refuses
 * it again if somebody sends the id anyway.
 */

const LIVE_KEY = ['admin', 'highlights'] as const;
const CANDIDATES_KEY = ['admin', 'highlight-candidates'] as const;

export function HighlightsAdmin() {
  const client = useQueryClient();
  const { toast } = useToast();
  const live = useQuery({ queryKey: LIVE_KEY, queryFn: fetchAdminHighlights });
  const candidates = useQuery({ queryKey: CANDIDATES_KEY, queryFn: fetchHighlightCandidates });
  const rows = live.data?.data ?? [];

  const refresh = () => {
    void client.invalidateQueries({ queryKey: LIVE_KEY });
    void client.invalidateQueries({ queryKey: CANDIDATES_KEY });
  };
  const fail = (error: unknown) => toast({ title: errorMessage(error), variant: 'destructive' });

  const add = useMutation({
    mutationFn: (mediaId: string) => addHighlight(mediaId, rows.length),
    onSuccess: () => {
      toast({ title: 'Added to the homepage', variant: 'success' });
      refresh();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeHighlight(id),
    onSuccess: () => {
      toast({ title: 'Removed from the homepage', variant: 'success' });
      refresh();
    },
    onError: fail,
  });
  const reorder = useMutation({
    mutationFn: (order: { id: string; position: number }[]) => reorderHighlights(order),
    onSuccess: refresh,
    onError: fail,
  });

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    reorder.mutate(next.map((row, position) => ({ id: row.id, position })));
  };

  return (
    <div className="flex flex-col gap-block">
      <Panel title="On the homepage" subtitle="The “Relive the highlights” reel, in this order.">
        {live.isPending ? (
          <Skeleton className="h-20" />
        ) : live.isError ? (
          <ErrorState message="Could not load the reel." onRetry={() => void live.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing featured yet"
            body="Pick a video below. Until then visitors see an invitation to host an event."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
              >
                <Still embedUrl={row.embed_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label">{row.event_title}</p>
                  <p className="text-caption text-muted-foreground">
                    {formatEventDate(row.event_starts_at)}
                    {row.caption ? ` · ${row.caption}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move up"
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move down"
                  disabled={index === rows.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={remove.isPending && remove.variables === row.id}
                  onClick={() => remove.mutate(row.id)}
                >
                  <X className="size-4" aria-hidden />
                  Remove
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel
        title="Available to add"
        subtitle="Videos organisers attached to events that have already happened."
      >
        {candidates.isPending ? (
          <Skeleton className="h-20" />
        ) : candidates.isError ? (
          <ErrorState
            message="Could not load the available videos."
            onRetry={() => void candidates.refetch()}
          />
        ) : (candidates.data?.data ?? []).length === 0 ? (
          <EmptyState
            title="No videos to add"
            body="When an organiser adds a video to an event that has finished, it shows up here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {(candidates.data?.data ?? []).map((row) => (
              <li
                key={row.media_id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
              >
                <Still embedUrl={row.embed_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label">{row.event_title}</p>
                  <p className="text-caption text-muted-foreground">
                    {formatEventDate(row.event_starts_at)}
                    {row.caption ? ` · ${row.caption}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  loading={add.isPending && add.variables === row.media_id}
                  onClick={() => add.mutate(row.media_id)}
                >
                  <Plus className="size-4" aria-hidden />
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Still({ embedUrl }: { embedUrl: string }) {
  return (
    <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
      <RemoteImage
        src={videoThumbnail(embedUrl)}
        alt=""
        className="size-full object-cover"
        fallback={
          <span className="flex size-full items-center justify-center">
            <Film className="size-5 text-muted-foreground" aria-hidden />
          </span>
        }
      />
    </div>
  );
}
