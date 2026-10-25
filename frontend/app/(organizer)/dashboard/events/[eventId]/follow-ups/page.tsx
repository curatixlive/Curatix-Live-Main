import type { Metadata } from 'next';
import { EventFollowUps } from '@/components/organizer/follow-ups';

export const metadata: Metadata = { title: 'Waiting list and unpaid checkouts' };

export default function OrganizerEventFollowUpsPage({ params }: { params: { eventId: string } }) {
  return <EventFollowUps eventId={params.eventId} />;
}
