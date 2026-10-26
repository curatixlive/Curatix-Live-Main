'use client';

import * as React from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import {
  createForumPost,
  fetchForum,
  fetchForumMe,
  fetchReplies,
  removeForumPost,
  type ForumPost,
} from '@/lib/api/community';
import { cursorFromNextLink } from '@/lib/api/events';
import { errorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthSheet } from '@/components/auth/auth-sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

const MAX = 1000;

/**
 * The community's discussion.
 *
 * Anybody can READ it. Writing needs an account AND following the organiser —
 * the server enforces that and answers `follow_to_post`, which this renders as
 * an invitation rather than a failure. Replies go one level deep. Whoever wrote
 * a post, and the organiser, can remove it; which posts are "yours" comes from
 * a private per-person endpoint, never from the shared public list.
 */
export function CommunityForum({
  organizationId,
  organizationName,
  returnTo,
}: {
  organizationId: string;
  organizationName: string;
  returnTo: string;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const listKey = ['forum', organizationId];

  const posts = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => fetchForum(organizationId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => cursorFromNextLink(last.meta.next),
    staleTime: 10_000,
  });
  const me = useQuery({
    queryKey: ['forum-me', organizationId, user?.id],
    queryFn: () => fetchForumMe(organizationId),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: listKey });
    void client.invalidateQueries({ queryKey: ['forum-me', organizationId] });
  };

  const rows = posts.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Composer
        organizationId={organizationId}
        organizationName={organizationName}
        returnTo={returnTo}
        onPosted={refresh}
        placeholder="Start a conversation with the community…"
      />

      {posts.isPending ? (
        <p className="text-body-sm text-muted-foreground">Loading the discussion…</p>
      ) : posts.isError ? (
        <p role="alert" className="text-body-sm text-muted-foreground">
          Could not load the discussion. {errorMessage(posts.error)}
        </p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <MessageSquare className="size-4" aria-hidden />
          No posts yet. Be the first to say something.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((post) => (
            <li key={post.id}>
              <PostCard
                post={post}
                organizationId={organizationId}
                organizationName={organizationName}
                returnTo={returnTo}
                mine={Boolean(me.data?.my_post_ids.includes(post.id))}
                canModerate={Boolean(me.data?.can_moderate)}
                onChanged={refresh}
              />
            </li>
          ))}
        </ul>
      )}

      {posts.hasNextPage ? (
        <div>
          <Button
            variant="outline"
            onClick={() => void posts.fetchNextPage()}
            loading={posts.isFetchingNextPage}
          >
            Show older posts
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Composer({
  organizationId,
  organizationName,
  returnTo,
  parentId,
  onPosted,
  placeholder,
  compact,
}: {
  organizationId: string;
  organizationName: string;
  returnTo: string;
  parentId?: string;
  onPosted: () => void;
  placeholder: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [text, setText] = React.useState('');
  const [authOpen, setAuthOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const post = useMutation({
    mutationFn: () => createForumPost(organizationId, text.trim(), parentId),
    onSuccess: () => {
      setText('');
      setNotice(null);
      onPosted();
    },
    onError: (error) => {
      // The server's own sentence; "follow to post" reads as an invitation.
      setNotice(errorMessage(error));
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (text.trim() && !post.isPending) post.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`post-${parentId ?? 'new'}`}>
        {placeholder}
      </label>
      <textarea
        id={`post-${parentId ?? 'new'}`}
        value={text}
        maxLength={MAX}
        rows={compact ? 2 : 3}
        onChange={(e) => setText(e.target.value)}
        placeholder={user ? placeholder : 'Sign in to join the discussion…'}
        className="w-full rounded-xl border border-border bg-background p-3 text-body-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size={compact ? 'sm' : 'md'} loading={post.isPending}>
          {user ? (parentId ? 'Reply' : 'Post') : 'Sign in to post'}
        </Button>
        <span className="text-caption tabular-nums text-muted-foreground">
          {text.length}/{MAX}
        </span>
        {notice ? (
          <span role="alert" className="text-caption text-muted-foreground">
            {notice}
          </span>
        ) : null}
      </div>
      <AuthSheet
        open={authOpen}
        onOpenChange={setAuthOpen}
        onAuthenticated={() => setAuthOpen(false)}
        next={returnTo}
        heading="Sign in to join the discussion"
        subheading={`Follow ${organizationName} to post.`}
      />
    </form>
  );
}

function PostCard({
  post,
  organizationId,
  organizationName,
  returnTo,
  mine,
  canModerate,
  onChanged,
}: {
  post: ForumPost;
  organizationId: string;
  organizationName: string;
  returnTo: string;
  mine: boolean;
  canModerate: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const replies = useQuery({
    queryKey: ['forum-replies', post.id],
    queryFn: () => fetchReplies(post.id),
    enabled: open,
    staleTime: 5_000,
  });
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeForumPost(post.id),
    onSuccess: onChanged,
  });

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-card">
      <Byline post={post} />
      <p className="whitespace-pre-line text-body-sm">{post.body}</p>
      <div className="flex flex-wrap items-center gap-3 text-caption">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="font-medium underline-offset-2 hover:underline"
        >
          {open
            ? 'Hide replies'
            : post.reply_count
              ? `${post.reply_count} ${post.reply_count === 1 ? 'reply' : 'replies'}`
              : 'Reply'}
        </button>
        {mine || canModerate ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Remove this post?')) remove.mutate();
            }}
            className="text-muted-foreground underline-offset-2 hover:underline"
          >
            Remove
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-1 flex flex-col gap-3 border-l-2 border-border pl-4">
          {replies.isPending ? (
            <p className="text-caption text-muted-foreground">Loading…</p>
          ) : (
            (replies.data?.data ?? []).map((reply) => (
              <div key={reply.id} className="flex flex-col gap-1">
                <Byline post={reply} />
                <p className="whitespace-pre-line text-body-sm">{reply.body}</p>
              </div>
            ))
          )}
          <Composer
            organizationId={organizationId}
            organizationName={organizationName}
            returnTo={returnTo}
            parentId={post.id}
            compact
            placeholder="Write a reply…"
            onPosted={() => {
              void client.invalidateQueries({ queryKey: ['forum-replies', post.id] });
              onChanged();
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

function Byline({ post }: { post: ForumPost }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
      <span className="text-body-sm font-semibold text-foreground">{post.author}</span>
      {post.is_organizer ? (
        <span
          className={cn(
            'rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] font-semibold text-primary-foreground',
          )}
        >
          Organiser
        </span>
      ) : null}
      <time dateTime={post.created_at}>
        {new Date(post.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </time>
    </p>
  );
}
