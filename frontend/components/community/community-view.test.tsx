import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Community } from '@/lib/api/community';
import { CommunityPreview } from './community-preview';
import { CommunityTabBar, communityTabs } from './community-view';

vi.mock('@/components/discovery/event-grid', () => ({
  EventGrid: ({ events }: { events: unknown[] }) => <div>{events.length} event cards</div>,
}));

const data = {
  organization: {
    id: 'o-1',
    name: 'Groove Collective',
    logo_url: '',
    cover_url: '',
    bio: 'Resident nights since 2019.',
    verified_level: 'verified',
    follower_count: 128,
    member_since: '2024-01-01T00:00:00Z',
    events_count: 6,
    socials: { instagram: 'https://instagram.com/groove', youtube: '', x: '' },
  },
  highlights: [],
  team: [
    { id: 'm1', name: 'DJ Ria', role: 'Resident DJ', details: '', photo_url: '', photo_alt: '' },
  ],
  upcoming_events: [{ id: 'e1' }],
  past_events: [],
  reviews: { count: 0, average: null, distribution: {}, latest: [] },
} as unknown as Community;

describe('community tabs', () => {
  it('has the four sections in order, each on its own route, with real counts', () => {
    const tabs = communityTabs(data, '/organizers/o-1');
    expect(tabs.map((t) => t.label)).toEqual([
      'Overview',
      'Events',
      'Ratings & reviews',
      'Discussion forum',
    ]);
    expect(tabs.map((t) => t.href)).toEqual([
      '/organizers/o-1',
      '/organizers/o-1/events',
      '/organizers/o-1/ratings',
      '/organizers/o-1/forum',
    ]);
    expect(tabs[1].count).toBe(6);
    expect(tabs[2].count).toBe(0);
    expect(tabs[3].count).toBeNull();
  });

  it('marks exactly one tab as the current page', () => {
    render(<CommunityTabBar items={communityTabs(data, '/organizers/o-1')} activeId="events" />);
    const current = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Events');
  });
});

describe('the editor preview', () => {
  it('switches sections in place, and shows nothing the page would not', async () => {
    render(<CommunityPreview data={data} />);
    expect(screen.getByText('Resident nights since 2019.')).toBeInTheDocument();
    expect(screen.getByText('DJ Ria')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Events/ }));
    expect(screen.getByText('1 event cards')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ratings/ }));
    expect(screen.getByText(/They appear here after people who attended/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Discussion forum/ }));
    expect(screen.getByText(/own page/)).toBeInTheDocument();
  });
});
