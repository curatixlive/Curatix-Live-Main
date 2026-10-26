import { notFound } from 'next/navigation';
import { OverviewTab } from '@/components/community/community-view';
import { loadCommunity } from '@/lib/community/load';

export const revalidate = 60;

export default async function CommunityOverviewPage({ params }: { params: { id: string } }) {
  const data = await loadCommunity(params.id);
  if (!data) notFound();
  return <OverviewTab data={data} />;
}
