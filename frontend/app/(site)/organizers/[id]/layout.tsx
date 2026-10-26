import * as React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CommunityHeader } from '@/components/community/community-view';
import { FollowButton } from '@/components/community/follow-button';
import { PublicCommunityTabs } from '@/components/community/public-tabs';
import { loadCommunity } from '@/lib/community/load';
import { pageMetadata } from '@/lib/seo/metadata';

/**
 * The frame every community tab shares: banner, identity, follow button and the
 * tab bar. Each tab is its OWN route (Overview, Events, Ratings, Discussion
 * forum), so a tab is linkable, the back button works, and the forum — the
 * heaviest and most interactive part — is not loaded until somebody opens it.
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await loadCommunity(params.id);
  if (!data) return { title: 'Organiser not found', robots: { index: false } };
  const { organization: org } = data;
  return pageMetadata(
    `${org.name} — events and community`,
    org.bio ? org.bio.slice(0, 160) : `Upcoming and past events from ${org.name}.`,
  );
}

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const data = await loadCommunity(params.id);
  if (!data) notFound();
  const org = data.organization;
  const base = `/organizers/${org.id}`;
  return (
    <div className="flex flex-col gap-section pb-section">
      <CommunityHeader
        data={data}
        actions={
          <FollowButton
            organizationId={org.id}
            initialCount={org.follower_count}
            returnTo={base}
            showCount={false}
          />
        }
      />
      <PublicCommunityTabs data={data} base={base} />
      {children}
    </div>
  );
}
