'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Users } from 'lucide-react';
import { CommunityView } from '@/components/community/community-view';
import { errorMessage } from '@/lib/api/errors';
import { fetchCommunity, type Community } from '@/lib/api/community';
import { updateOrganizationProfile } from '@/lib/api/organizations';
import { useActiveOrganization } from '@/lib/organizer/active-organization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, Skeleton } from '@/components/organizer/primitives';

const BIO_MAX = 2000;

/** What the preview shows for a typed handle: the real normalisation is the server's. */
function previewSocial(typed: string, base: string, at = false): string {
  const t = typed.trim();
  if (!t) return '';
  if (t.includes('/')) return t.startsWith('http') ? t : `https://${t}`;
  return `${base}${at ? '@' : ''}${t.replace(/^@/, '')}`;
}

/**
 * Edit the public community page and SEE it as you type.
 *
 * The preview is the SAME `CommunityView` the public page renders, fed the live
 * payload with the unsaved edits laid over it — so what the organizer sees is
 * what a follower will, and nothing here can drift from the page.
 *
 * Followers, ratings and events are not editable: they are counted from follows,
 * reviews and the events the organizer runs. The team (photos, designations) is
 * the crew roster, edited where it already lives.
 */
export function CommunityEditor() {
  const { organization, ready, hasNone, needsChoice } = useActiveOrganization();
  const client = useQueryClient();
  const orgId = organization?.id;

  const page = useQuery({
    queryKey: ['organizer', 'community', orgId],
    queryFn: () => fetchCommunity(orgId!),
    enabled: Boolean(orgId),
    staleTime: 0,
  });

  const [bio, setBio] = React.useState<string | null>(null);
  const [cover, setCover] = React.useState<File | null>(null);
  const [instagram, setInstagram] = React.useState<string | null>(null);
  const [youtube, setYoutube] = React.useState<string | null>(null);
  const [x, setX] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const current = page.data?.organization;
  const shownBio = bio ?? current?.bio ?? '';
  const shownInstagram = instagram ?? current?.socials.instagram ?? '';
  const shownYoutube = youtube ?? current?.socials.youtube ?? '';
  const shownX = x ?? current?.socials.x ?? '';

  // An object URL for the chosen banner, revoked when it changes or unmounts.
  const [coverPreview, setCoverPreview] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!cover) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  const previewData: Community | null = React.useMemo(() => {
    if (!page.data) return null;
    return {
      ...page.data,
      organization: {
        ...page.data.organization,
        bio: shownBio,
        cover_url: coverPreview ?? page.data.organization.cover_url,
        socials: {
          instagram: previewSocial(shownInstagram, 'https://instagram.com/'),
          youtube: previewSocial(shownYoutube, 'https://youtube.com/', true),
          x: previewSocial(shownX, 'https://x.com/'),
        },
      },
    };
  }, [page.data, shownBio, coverPreview, shownInstagram, shownYoutube, shownX]);

  const dirty =
    bio !== null || cover !== null || instagram !== null || youtube !== null || x !== null;

  const save = useMutation({
    mutationFn: () =>
      updateOrganizationProfile(orgId!, {
        ...(bio !== null ? { bio: bio.trim() } : {}),
        ...(instagram !== null ? { instagram } : {}),
        ...(youtube !== null ? { youtube } : {}),
        ...(x !== null ? { x } : {}),
        cover: cover ?? undefined,
      }),
    onSuccess: () => {
      setCover(null);
      setBio(null);
      setInstagram(null);
      setYoutube(null);
      setX(null);
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['organizer', 'community', orgId] });
    },
  });

  if (!ready) return <Skeleton className="h-64 w-full" />;
  if (hasNone || needsChoice || !organization) {
    return (
      <Panel title="Community page">
        <p className="p-card text-body-sm text-muted-foreground">
          Choose or create an organisation first — the community page belongs to one.
        </p>
      </Panel>
    );
  }

  const touch = () => setSaved(false);

  return (
    <div className="flex flex-col gap-block">
      <header className="flex flex-col gap-stack sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-h3 md:text-h2">Community page</h1>
          <p className="max-w-prose text-body text-muted-foreground">
            The public page people follow. Edit on the left and watch the preview update.
          </p>
        </div>
        <Button variant="outline" asChild className="shrink-0 gap-1.5">
          <Link href={`/organizers/${organization.id}`} target="_blank">
            View public page
            <ExternalLink className="size-4" aria-hidden />
          </Link>
        </Button>
      </header>

      <div className="grid items-start gap-block xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-block">
          <Panel title="About and banner">
            <form
              className="flex flex-col gap-stack p-card"
              onSubmit={(e) => {
                e.preventDefault();
                setSaved(false);
                if (dirty && !save.isPending) save.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="community-bio">About you</Label>
                <textarea
                  id="community-bio"
                  rows={6}
                  maxLength={BIO_MAX}
                  value={shownBio}
                  onChange={(e) => {
                    touch();
                    setBio(e.target.value);
                  }}
                  placeholder="Who you are, what kind of nights you run, what people can expect."
                  className="w-full rounded-lg border border-border bg-background p-3 text-body-sm"
                />
                <p className="text-caption text-muted-foreground">
                  {shownBio.length}/{BIO_MAX}. Nothing is written for you.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="community-cover">Banner image</Label>
                <input
                  id="community-cover"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    touch();
                    setCover(e.target.files?.[0] ?? null);
                  }}
                  className="text-body-sm"
                />
                <p className="text-caption text-muted-foreground">
                  A wide image works best (around 1600 × 400). JPEG, PNG or WebP, up to 10 MB.
                </p>
              </div>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-body-sm font-semibold">Social accounts</legend>
                <SocialField
                  id="soc-instagram"
                  label="Instagram"
                  value={shownInstagram}
                  placeholder="@yourband"
                  onChange={(v) => {
                    touch();
                    setInstagram(v);
                  }}
                />
                <SocialField
                  id="soc-youtube"
                  label="YouTube"
                  value={shownYoutube}
                  placeholder="@yourchannel"
                  onChange={(v) => {
                    touch();
                    setYoutube(v);
                  }}
                />
                <SocialField
                  id="soc-x"
                  label="X"
                  value={shownX}
                  placeholder="@yourhandle"
                  onChange={(v) => {
                    touch();
                    setX(v);
                  }}
                />
                <p className="text-caption text-muted-foreground">
                  A handle or the full link. Leave blank to hide it.
                </p>
              </fieldset>

              {save.isError ? (
                <p role="alert" className="text-danger-subtle-foreground text-body-sm">
                  {errorMessage(save.error)}
                </p>
              ) : null}
              <div className="flex items-center gap-3">
                <Button type="submit" loading={save.isPending} disabled={!dirty}>
                  Save changes
                </Button>
                {saved ? (
                  <span role="status" className="text-body-sm text-muted-foreground">
                    Saved
                  </span>
                ) : null}
              </div>
            </form>
          </Panel>

          <Panel title="Team members">
            <div className="flex flex-col gap-3 p-card">
              <p className="text-body-sm text-muted-foreground">
                The people shown under “Meet the team” — photo, name and designation — are your crew
                roster. Add or change them there and they appear here.
              </p>
              <div>
                <Button variant="outline" asChild className="gap-1.5">
                  <Link href="/dashboard/crew">
                    <Users className="size-4" aria-hidden />
                    Manage team members
                  </Link>
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="Live preview"
          subtitle="Exactly what followers will see, including your unsaved edits."
        >
          <div className="max-h-[80vh] overflow-y-auto rounded-b-xl bg-background py-4">
            {page.isPending ? (
              <Skeleton className="m-4 h-72" />
            ) : page.isError || !previewData ? (
              <p role="alert" className="p-card text-body-sm text-muted-foreground">
                Could not load the preview. {page.isError ? errorMessage(page.error) : ''}
              </p>
            ) : (
              <CommunityView data={previewData} preview />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SocialField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
}
