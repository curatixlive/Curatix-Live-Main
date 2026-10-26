'use client';

import * as React from 'react';
import type { Community } from '@/lib/api/community';
import {
  CommunityHeader,
  CommunityTabBar,
  EventsTab,
  FRAME,
  OverviewTab,
  RatingsTab,
  Section,
  communityTabs,
  type CommunityTabId,
} from './community-view';

/**
 * The editor's live preview: the same header, tab bar and tab bodies the public
 * site renders, with the active tab held in local state instead of the URL.
 */
export function CommunityPreview({ data }: { data: Community }) {
  const [tab, setTab] = React.useState<CommunityTabId>('overview');
  return (
    <div className="flex flex-col gap-section">
      <CommunityHeader data={data} />
      <CommunityTabBar items={communityTabs(data, null)} activeId={tab} onSelect={setTab} />
      {tab === 'overview' ? <OverviewTab data={data} /> : null}
      {tab === 'events' ? <EventsTab data={data} /> : null}
      {tab === 'ratings' ? <RatingsTab data={data} preview /> : null}
      {tab === 'forum' ? (
        <div className={FRAME}>
          <Section id="discussion" title="Discussion forum">
            <p className="text-body-sm text-muted-foreground">
              Followers will see the discussion forum on its own page.
            </p>
          </Section>
        </div>
      ) : null}
    </div>
  );
}
