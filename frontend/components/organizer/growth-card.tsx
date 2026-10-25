'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchCommunity } from '@/lib/api/community';
import { fetchPartnerPromotions } from '@/lib/api/partner-promotions';
import { formatMoney } from '@/lib/discovery/format';
import { useActiveOrganization } from '@/lib/organizer/active-organization';
import { Panel } from './primitives';

/**
 * Followers, rating and partner-link results at a glance.
 *
 * Every number is read from the same endpoints the Community page and the
 * Promotions page use, so the dashboard can never disagree with them. Partner
 * totals appear only once a partner link exists, and a rating only once somebody
 * has reviewed — a section nothing backs is absent, not a row of zeros.
 */
export function GrowthCard() {
  const { organization } = useActiveOrganization();
  const orgId = organization?.id;

  const community = useQuery({
    queryKey: ['organizer', 'community', orgId],
    queryFn: () => fetchCommunity(orgId!),
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });
  const partners = useQuery({
    queryKey: ['organizer', 'partner-promotions', orgId],
    queryFn: () => fetchPartnerPromotions(orgId!),
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });

  if (!orgId || community.isError) return null;

  const stats = (partners.data ?? []).flatMap((p) => (p.stats ? [p.stats] : []));
  const totals = stats.reduce(
    (acc, s) => ({
      clicks: acc.clicks + s.clicks,
      bookings: acc.bookings + s.bookings,
      owed: acc.owed + s.commission_payable_minor,
    }),
    { clicks: 0, bookings: 0, owed: 0 },
  );
  const org = community.data?.organization;
  const reviews = community.data?.reviews;

  return (
    <Panel
      title="Audience & partners"
      subtitle="Followers, ratings and what your partner links earned."
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm sm:grid-cols-3">
        <div>
          <dt className="text-caption text-muted-foreground">Followers</dt>
          <dd className="text-h4 tabular-nums">{org ? org.follower_count : '—'}</dd>
        </div>
        {reviews && reviews.average !== null ? (
          <div>
            <dt className="text-caption text-muted-foreground">Rating</dt>
            <dd className="text-h4 tabular-nums">
              {reviews.average.toFixed(1)}{' '}
              <span className="text-caption text-muted-foreground">({reviews.count})</span>
            </dd>
          </div>
        ) : null}
        {stats.length ? (
          <>
            <div>
              <dt className="text-caption text-muted-foreground">Partner link clicks</dt>
              <dd className="text-h4 tabular-nums">{totals.clicks}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Partner bookings</dt>
              <dd className="text-h4 tabular-nums">{totals.bookings}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">Commission owed</dt>
              <dd className="text-h4 tabular-nums">{formatMoney(totals.owed)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <div className="mt-stack flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
        <Link href="/dashboard/community" className="underline">
          Community page
        </Link>
        <Link href="/dashboard/promotions" className="underline">
          Partner links
        </Link>
      </div>
    </Panel>
  );
}
