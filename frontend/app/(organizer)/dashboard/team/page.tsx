import type { Metadata } from 'next';
import { TeamManager } from '@/components/organizer/team';

export const metadata: Metadata = { title: 'Team' };

/** The people who help run every event of an organisation. */
export default function OrganizerTeamPage() {
  return <TeamManager />;
}
