'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  archiveCampaign,
  createCampaign,
  fetchAdminCampaigns,
  publishCampaign,
  reorderCampaigns,
  unpublishCampaign,
  updateCampaign,
  uploadCampaignImage,
  type AdminCampaign,
  type CampaignInput,
} from '@/lib/api/cms';
import { errorMessage } from '@/lib/api/errors';
import {
  campaignPhase,
  fromLocalInput,
  toLocalInput,
  type CampaignPhase,
} from '@/lib/admin/campaign-state';
import {
  EmptyState,
  ErrorState,
  Panel,
  Skeleton,
  StatusPill,
  type Tone,
} from '@/components/organizer/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { RemoteImage } from '@/components/ui/remote-image';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { formatEventDateTime } from '@/lib/discovery/format';
import { cn } from '@/lib/utils/cn';

/**
 * HERO ADVERTISEMENTS — what the top of the homepage says.
 *
 * ── PUBLISHING IS THE APPROVAL ───────────────────────────────────────────────
 *
 * A new ad is a DRAFT: saved, previewable here, and invisible to the public.
 * "Publish" is the deliberate act that puts it on the site — the server records
 * who and when, and refuses it if it is incomplete (no description for screen
 * readers, a video with no poster, a run that has already ended). The public
 * homepage never receives a draft, an archived ad or one scheduled for later.
 *
 * ── THE SERVER IS THE JUDGE, THIS SCREEN ONLY EXPLAINS ──────────────────────
 *
 * Every rule (https-only links, `.mp4`/`.webm` for video, image shape and size)
 * is enforced by the API; the form shows its message verbatim rather than
 * duplicating the rules and drifting from them.
 *
 * ── VIDEO IS A LINK ──────────────────────────────────────────────────────────
 *
 * A hero video must autoplay silently and loop, which an embedded YouTube frame
 * cannot do, so it is a direct file link (host it anywhere with https) plus a
 * poster image. Video files are not uploaded through this screen — images are.
 */

const PHASE: Record<CampaignPhase, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  live: { label: 'Live', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  ended: { label: 'Ended', tone: 'warning' },
};

const KEY = ['admin', 'campaigns'] as const;

export function CampaignsAdmin() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<AdminCampaign | 'new' | null>(null);
  const [removing, setRemoving] = React.useState<AdminCampaign | null>(null);

  const list = useQuery({ queryKey: KEY, queryFn: fetchAdminCampaigns });
  const rows = list.data?.data ?? [];

  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  const fail = (error: unknown) => toast({ title: errorMessage(error), variant: 'destructive' });

  const publish = useMutation({
    mutationFn: (id: string) => publishCampaign(id),
    onSuccess: () => {
      toast({
        title: 'Published. It is on the homepage when its run is open.',
        variant: 'success',
      });
      void refresh();
    },
    onError: fail,
  });
  const unpublish = useMutation({
    mutationFn: (id: string) => unpublishCampaign(id),
    onSuccess: () => {
      toast({ title: 'Taken down. It is a draft again.', variant: 'success' });
      void refresh();
    },
    onError: fail,
  });
  const archive = useMutation({
    mutationFn: (id: string) => archiveCampaign(id),
    onSuccess: () => {
      toast({ title: 'Archived', variant: 'success' });
      setRemoving(null);
      void refresh();
    },
    onError: fail,
  });
  const reorder = useMutation({
    mutationFn: (order: { id: string; position: number }[]) => reorderCampaigns(order),
    onSuccess: () => void refresh(),
    onError: fail,
  });

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    reorder.mutate(next.map((row, position) => ({ id: row.id, position })));
  };

  return (
    <Panel
      title="Hero advertisements"
      subtitle="The banner at the very top of the homepage. With none live, visitors see the Curatix welcome instead."
      actions={
        <Button onClick={() => setEditing('new')} leftIcon={<Plus className="size-4" />}>
          New advertisement
        </Button>
      }
    >
      {list.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : list.isError ? (
        <ErrorState message="Could not load advertisements." onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No advertisements yet"
          body="Create one, preview it as a draft, then publish it when it is ready."
          action={<Button onClick={() => setEditing('new')}>New advertisement</Button>}
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, index) => {
            const phase = campaignPhase(row);
            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center"
              >
                <div className="relative aspect-[16/7] w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-44">
                  <RemoteImage
                    src={row.kind === 'video' ? row.poster_url : row.media_url}
                    alt=""
                    className="size-full object-cover"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-caption font-medium text-white">
                    {row.kind === 'video' ? 'Video' : 'Image'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-label">{row.title}</h3>
                    <StatusPill tone={PHASE[phase].tone}>{PHASE[phase].label}</StatusPill>
                  </div>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {row.starts_at || row.ends_at
                      ? `${row.starts_at ? formatEventDateTime(row.starts_at) : 'Now'} → ${row.ends_at ? formatEventDateTime(row.ends_at) : 'no end'}`
                      : 'Runs until taken down'}
                    {row.cta_href ? ` · ${row.cta_label} → ${row.cta_href}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={index === rows.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                    <Pencil className="size-4" aria-hidden />
                    Edit
                  </Button>
                  {row.status === 'published' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={unpublish.isPending && unpublish.variables === row.id}
                      onClick={() => unpublish.mutate(row.id)}
                    >
                      <Undo2 className="size-4" aria-hidden />
                      Take down
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      loading={publish.isPending && publish.variables === row.id}
                      onClick={() => publish.mutate(row.id)}
                    >
                      <Rocket className="size-4" aria-hidden />
                      Publish
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Archive"
                    onClick={() => setRemoving(row)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {editing ? (
        <CampaignForm
          campaign={editing === 'new' ? null : editing}
          position={rows.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}

      <Modal open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Archive this advertisement?</ModalTitle>
            <ModalDescription>
              {removing?.title} comes off the homepage and out of this list. The record is kept for
              the audit trail.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={archive.isPending}
              onClick={() => removing && archive.mutate(removing.id)}
            >
              Archive
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Panel>
  );
}

type FormState = {
  kind: 'image' | 'video';
  title: string;
  description: string;
  alt_text: string;
  media_url: string;
  mobile_media_url: string;
  poster_url: string;
  cta_label: string;
  cta_href: string;
  starts_at: string;
  ends_at: string;
};

function initial(campaign: AdminCampaign | null): FormState {
  return {
    kind: campaign?.kind ?? 'image',
    title: campaign?.title ?? '',
    description: campaign?.description ?? '',
    alt_text: campaign?.alt_text ?? '',
    media_url: campaign?.media_url ?? '',
    mobile_media_url: campaign?.mobile_media_url ?? '',
    poster_url: campaign?.poster_url ?? '',
    cta_label: campaign?.cta_label ?? '',
    cta_href: campaign?.cta_href ?? '',
    starts_at: toLocalInput(campaign?.starts_at ?? null),
    ends_at: toLocalInput(campaign?.ends_at ?? null),
  };
}

function CampaignForm({
  campaign,
  position,
  onClose,
  onSaved,
}: {
  campaign: AdminCampaign | null;
  position: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<FormState>(() => initial(campaign));
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const body: CampaignInput = {
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim(),
        alt_text: form.alt_text.trim(),
        media_url: form.media_url.trim(),
        mobile_media_url: form.mobile_media_url.trim(),
        poster_url: form.poster_url.trim(),
        cta_label: form.cta_label.trim(),
        cta_href: form.cta_href.trim(),
        starts_at: fromLocalInput(form.starts_at),
        ends_at: fromLocalInput(form.ends_at),
      };
      return campaign
        ? updateCampaign(campaign.id, body)
        : createCampaign({ ...body, title: body.title ?? '', position });
    },
    onSuccess: () => {
      toast({ title: campaign ? 'Saved' : 'Saved as a draft', variant: 'success' });
      onSaved();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <ModalHeader>
          <ModalTitle>{campaign ? 'Edit advertisement' : 'New advertisement'}</ModalTitle>
          <ModalDescription>
            Saved as a draft until you publish it. Nothing here is public yet.
          </ModalDescription>
        </ModalHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <fieldset className="flex gap-2" aria-label="Type">
            {(['image', 'video'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={form.kind === kind}
                onClick={() => set('kind', kind)}
                className={cn(
                  'h-control rounded-full border px-4 text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  form.kind === kind
                    ? 'border-transparent bg-cta text-cta-foreground'
                    : 'border-border bg-surface hover:bg-muted',
                )}
              >
                {kind === 'image' ? 'Image' : 'Video'}
              </button>
            ))}
          </fieldset>

          <Field label="Headline" counter={`${form.title.length}/80`}>
            <Input
              value={form.title}
              maxLength={80}
              required
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <Field label="Supporting line (optional)" counter={`${form.description.length}/180`}>
            <Textarea
              value={form.description}
              maxLength={180}
              rows={2}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>

          {form.kind === 'image' ? (
            <>
              <ImageField
                label="Image"
                hint="Wide artwork, at least 1200 px across (2400 × 1000 is ideal). It is cropped to a wide frame, so keep the subject centred."
                value={form.media_url}
                onChange={(url) => set('media_url', url)}
              />
              <ImageField
                label="Phone version (optional)"
                hint="A tighter crop for narrow screens, if the wide one loses the subject."
                value={form.mobile_media_url}
                onChange={(url) => set('mobile_media_url', url)}
              />
            </>
          ) : (
            <>
              <Field label="Video link">
                <Input
                  value={form.media_url}
                  inputMode="url"
                  placeholder="https://…/promo.mp4"
                  onChange={(e) => set('media_url', e.target.value)}
                />
                <Hint>
                  A direct https link to a .mp4 or .webm file. It plays silently and loops; YouTube
                  and Vimeo links cannot be used as a banner.
                </Hint>
              </Field>
              <ImageField
                label="Poster image"
                hint="Shown while the video loads, and to anyone with reduced motion or data saving on. Required to publish."
                value={form.poster_url}
                onChange={(url) => set('poster_url', url)}
              />
            </>
          )}

          <Field
            label="Describe the artwork for screen readers"
            counter={`${form.alt_text.length}/200`}
          >
            <Input
              value={form.alt_text}
              maxLength={200}
              onChange={(e) => set('alt_text', e.target.value)}
            />
            <Hint>
              Required to publish. For example: “Dancers in colourful costumes at a night festival”.
            </Hint>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Button text (optional)">
              <Input
                value={form.cta_label}
                maxLength={40}
                onChange={(e) => set('cta_label', e.target.value)}
              />
            </Field>
            <Field label="Button link (optional)">
              <Input
                value={form.cta_href}
                inputMode="url"
                placeholder="/events?q=navratri or https://…"
                onChange={(e) => set('cta_href', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts (optional)">
              <Input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => set('starts_at', e.target.value)}
              />
            </Field>
            <Field label="Ends (optional)">
              <Input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => set('ends_at', e.target.value)}
              />
            </Field>
          </div>
          <Hint>
            Times are in your browser’s time zone. Leave both blank to run until you take it down.
          </Hint>

          {error ? (
            // Neutral, with the words doing the work — failure messaging on this
            // platform is not coloured red (see `ui/notice.tsx`).
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {campaign ? 'Save changes' : 'Save as draft'}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

function Field({
  label,
  counter,
  children,
}: {
  label: string;
  counter?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {counter ? <span className="text-caption text-muted-foreground">{counter}</span> : null}
      </div>
      {React.Children.map(children, (child, index) =>
        index === 0 && React.isValidElement<{ id?: string }>(child)
          ? React.cloneElement(child, { id })
          : child,
      )}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-caption text-muted-foreground">{children}</p>;
}

/** Upload an image (validated server-side) or paste a link; shows what is set. */
function ImageField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadCampaignImage(file),
    onSuccess: ({ url }) => onChange(url),
    onError: (e) => toast({ title: errorMessage(e), variant: 'destructive' }),
  });
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative aspect-[16/7] w-40 overflow-hidden rounded-lg border border-border bg-muted">
          <RemoteImage src={value} alt="" className="size-full object-cover" />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload.mutate(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden />
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
            Remove
          </Button>
        ) : null}
      </div>
      <Hint>{hint}</Hint>
    </div>
  );
}
