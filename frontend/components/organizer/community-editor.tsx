'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { errorMessage } from '@/lib/api/errors';
import { fetchCommunity } from '@/lib/api/community';
import { updateOrganizationProfile } from '@/lib/api/organizations';
import { useActiveOrganization } from '@/lib/organizer/active-organization';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Panel, Skeleton } from '@/components/organizer/primitives';

const BIO_MAX = 2000;

/**
 * The organizer's public community page: what followers see, and the two things
 * only the organizer can supply — an "about" text and a banner. Followers,
 * ratings and events are not editable here because they are not the organizer's
 * to write: they are counted from follows, reviews and the events they run.
 */
export function CommunityEditor() {
  const { organization, ready, hasNone, needsChoice } = useActiveOrganization();
  const client = useQueryClient();
  const orgId = organization?.id;

  const page = useQuery({
    queryKey: ['organizer', 'community', orgId],
    queryFn: () => fetchCommunity(orgId!),
    enabled: Boolean(orgId),
    staleTime: 0,
  });

  const [bio, setBio] = React.useState<string | null>(null);
  const [cover, setCover] = React.useState<File | null>(null);
  const [saved, setSaved] = React.useState(false);
  const current = page.data?.organization;
  const shownBio = bio ?? current?.bio ?? '';

  const save = useMutation({
    mutationFn: () =>
      updateOrganizationProfile(orgId!, { bio: shownBio.trim(), cover: cover ?? undefined }),
    onSuccess: () => {
      setCover(null);
      setBio(null);
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['organizer', 'community', orgId] });
    },
  });

  if (!ready) return <Skeleton className="h-64 w-full" />;
  if (hasNone || needsChoice || !organization) {
    return (
      <Panel title="Community page">
        <p className="text-body-sm text-muted-foreground">
          Choose or create an organisation first — the community page belongs to one.
        </p>
      </Panel>
    );
  }

  const dirty = bio !== null || cover !== null;
  return (
    <div className="flex flex-col gap-block">
      <header className="flex flex-col gap-stack sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-h3 md:text-h2">Community page</h1>
          <p className="max-w-prose text-body text-muted-foreground">
            The public page people follow. It shows your events and the ratings attendees leave.
          </p>
        </div>
        <Button variant="outline" asChild className="shrink-0 gap-1.5">
          <Link href={`/organizers/${organization.id}`} target="_blank">
            View public page
            <ExternalLink className="size-4" aria-hidden />
          </Link>
        </Button>
      </header>

      <Panel title="At a glance" subtitle="Counted from real follows and verified reviews.">
        {page.isPending ? (
          <Skeleton className="h-10 w-64" />
        ) : page.isError ? (
          <p role="alert" className="text-danger-subtle-foreground text-body-sm">
            {errorMessage(page.error)}
          </p>
        ) : (
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-caption text-muted-foreground">Followers</dt>
              <dd className="text-h4 tabular-nums">{page.data.organization.follower_count}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Rating</dt>
              <dd className="text-h4 tabular-nums">
                {page.data.reviews.average === null
                  ? 'No reviews yet'
                  : `${page.data.reviews.average.toFixed(1)} (${page.data.reviews.count})`}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Upcoming events</dt>
              <dd className="text-h4 tabular-nums">{page.data.upcoming_events.length}</dd>
            </div>
          </dl>
        )}
      </Panel>

      <Panel title="About and banner">
        <form
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            if (dirty && !save.isPending) save.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="community-bio">About you</Label>
            <textarea
              id="community-bio"
              rows={6}
              maxLength={BIO_MAX}
              value={shownBio}
              onChange={(e) => {
                setSaved(false);
                setBio(e.target.value);
              }}
              placeholder="Who you are, what kind of nights you run, what people can expect."
              className="w-full rounded-lg border border-border bg-background p-3 text-body-sm"
            />
            <p className="text-caption text-muted-foreground">
              {shownBio.length}/{BIO_MAX}. Shown on your public page. Nothing is written for you.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="community-cover">Banner image</Label>
            <input
              id="community-cover"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setSaved(false);
                setCover(e.target.files?.[0] ?? null);
              }}
              className="text-body-sm"
            />
            <p className="text-caption text-muted-foreground">
              A wide image works best (around 1600 × 400). JPEG, PNG or WebP, up to 10 MB.
              {current?.cover_url && !cover ? ' A banner is set; choose a file to replace it.' : ''}
            </p>
          </div>
          {save.isError ? (
            <p role="alert" className="text-danger-subtle-foreground text-body-sm">
              {errorMessage(save.error)}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={save.isPending} disabled={!dirty}>
              Save changes
            </Button>
            {saved ? (
              <span role="status" className="text-body-sm text-muted-foreground">
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </Panel>
    </div>
  );
}
