import * as React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CommunityForum } from '@/components/community/forum';
import { CommunityView } from '@/components/community/community-view';
import { FollowButton } from '@/components/community/follow-button';
import { fetchCommunity, type Community } from '@/lib/api/community';
import { isApiError } from '@/lib/api/errors';
import { pageMetadata } from '@/lib/seo/metadata';

/**
 * An organizer's community page — their portfolio, as a follower sees it.
 *
 * All the drawing is in `CommunityView`, which the dashboard's live preview
 * renders too. This file only fetches, wires the two interactive pieces (the
 * follow button and the forum) and handles "not found".
 */
export const revalidate = 60;

async function load(id: string): Promise<Community | null> {
  try {
    return await fetchCommunity(id);
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await load(params.id);
  if (!data) return { title: 'Organiser not found', robots: { index: false } };
  const { organization: org } = data;
  return pageMetadata(
    `${org.name} — events and community`,
    org.bio ? org.bio.slice(0, 160) : `Upcoming and past events from ${org.name}.`,
  );
}

export default async function CommunityPage({ params }: { params: { id: string } }) {
  const data = await load(params.id);
  if (!data) notFound();
  const org = data.organization;
  const returnTo = `/organizers/${org.id}`;

  return (
    <div className="pb-section">
      <CommunityView
        data={data}
        actions={
          <FollowButton
            organizationId={org.id}
            initialCount={org.follower_count}
            returnTo={returnTo}
            showCount={false}
          />
        }
        forum={
          <CommunityForum organizationId={org.id} organizationName={org.name} returnTo={returnTo} />
        }
      />
    </div>
  );
}
