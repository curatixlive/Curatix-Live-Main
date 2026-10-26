import { notFound } from 'next/navigation';
import { CommunityForum } from '@/components/community/forum';
import { FRAME, Section } from '@/components/community/community-view';
import { loadCommunity } from '@/lib/community/load';

export const revalidate = 60;

/** The discussion lives on its own page: it is the one interactive tab. */
export default async function CommunityForumPage({ params }: { params: { id: string } }) {
  const data = await loadCommunity(params.id);
  if (!data) notFound();
  const org = data.organization;
  return (
    <div className={FRAME}>
      <Section id="discussion" title="Discussion forum">
        <CommunityForum
          organizationId={org.id}
          organizationName={org.name}
          returnTo={`/organizers/${org.id}/forum`}
        />
      </Section>
    </div>
  );
}
