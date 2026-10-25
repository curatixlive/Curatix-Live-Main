import type { Metadata } from 'next';
import { CommunityEditor } from '@/components/organizer/community-editor';

export const metadata: Metadata = { title: 'Community page' };

export default function OrganizerCommunityPage() {
  return <CommunityEditor />;
}
