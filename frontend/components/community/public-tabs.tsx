'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import type { Community } from '@/lib/api/community';
import { CommunityTabBar, communityTabs, type CommunityTabId } from './community-view';

/** The tab bar on the public routes: the active tab is read from the URL. */
export function PublicCommunityTabs({ data, base }: { data: Community; base: string }) {
  const path = usePathname() ?? '';
  const rest = path.startsWith(base) ? path.slice(base.length).replace(/^\/+/, '') : '';
  const known: Record<string, CommunityTabId> = {
    events: 'events',
    ratings: 'ratings',
    forum: 'forum',
  };
  const active: CommunityTabId = known[rest.split('/')[0] ?? ''] ?? 'overview';
  return <CommunityTabBar items={communityTabs(data, base)} activeId={active} />;
}
