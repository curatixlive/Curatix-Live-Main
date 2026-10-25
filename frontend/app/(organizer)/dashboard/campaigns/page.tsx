import type { Metadata } from 'next';
import { Campaigns } from '@/components/organizer/campaigns';

export const metadata: Metadata = { title: 'Campaigns' };

/** Customer insight and email campaigns to past buyers. */
export default function OrganizerCampaignsPage() {
  return <Campaigns />;
}
