import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { roleFromFlags, type ParticipantRole } from './messages';
import type { SignalPublisherType } from './signalIdentity';

/**
 * SIGNAL — the official CX Rent social/news feed (renamed from "Empire";
 * this file, its tables and its RPCs deliberately kept their original
 * `empire_*`/`Empire*` names — internal implementation details invisible
 * to users, not worth the migration risk of renaming a working schema for
 * a UI-facing rebrand; see supabase/migrations/0040_empire_feed.sql).
 * Owner/Admin publish (news, announcements, new vehicles, events, offers);
 * every signed-in user can view, like, comment, save and share. All
 * writes go through security-definer RPCs — `is_admin()` gates posting/
 * editing/deleting/pinning and already returns true for the Owner too.
 * This file never inserts/updates/deletes a table directly, only ever
 * calls `.rpc(...)`, matching the rest of the app's data-access convention.
 */

export type EmpireCategory = 'news' | 'update' | 'new_car' | 'feature' | 'event' | 'offer' | 'announcement' | 'exclusive';

export const EMPIRE_CATEGORIES: { value: EmpireCategory; label: string }[] = [
  { value: 'news', label: 'News' },
  { value: 'update', label: 'Update' },
  { value: 'new_car', label: 'New Car' },
  { value: 'feature', label: 'Feature' },
  { value: 'event', label: 'Event' },
  { value: 'offer', label: 'Offer' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'exclusive', label: 'Exclusive' },
];

const MEDIA_BUCKET = 'empire-post-media';
const FEED_PAGE_SIZE = 20;

export interface EmpirePost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  /** Always 'owner' or 'admin' in practice — only they can author a post
   *  — but typed as the same union messages.ts uses so `<VerifiedBadge>`
   *  takes it directly with no cast. */
  authorRole: ParticipantRole;
  /** Only meaningful for a `publisherType === 'self'` post (a Host or
   *  Verified Client publishing under their own real identity) — used by
   *  `resolveSignalIdentity` to pick the right badge. Sourced live from
   *  the author's own current profile flags on every fetch, never stored
   *  on the post itself. */
  authorIsHost: boolean;
  authorIsVerifiedClient: boolean;
  category: EmpireCategory;
  title: string | null;
  body: string;
  mediaPaths: string[];
  mediaUrls: string[];
  isPinned: boolean;
  isFeatured: boolean;
  commentsDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  viewCount: number;
  /** Real completed-share events (native share sheet or copy-link) — see
   *  incrementEmpirePostShare. None of these four counts are shown to
   *  regular users; SignalPostCard only surfaces them in its
   *  Owner/Admin-only "Post performance" line. */
  shareCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  /** Which of SIGNAL's three voices this post is permanently recorded
   *  as speaking under — see signalIdentity.ts. Independent of
   *  `authorId`/`authorName`, which stay the real audit trail of which
   *  admin account clicked publish. */
  publisherType: SignalPublisherType;
}

interface EmpirePostRow {
  id: string;
  author_id: string;
  author_name: string | null;
  author_avatar_url: string | null;
  author_is_owner: boolean;
  author_is_admin: boolean;
  author_is_host: boolean;
  author_is_verified_client: boolean;
  category: EmpireCategory;
  title: string | null;
  body: string;
  media_paths: string[];
  is_pinned: boolean;
  is_featured: boolean;
  comments_disabled: boolean;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  like_count: number;
  comment_count: number;
  save_count: number;
  view_count: number;
  share_count: number;
  liked_by_me: boolean;
  saved_by_me: boolean;
  publisher_type: SignalPublisherType;
}

function mediaUrlFor(path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm']);

/** A post's `media_paths` stays a plain text[] of storage paths — no
 *  schema change for video support there (unlike Stories, which needed
 *  media_type/poster_path columns for their circular-thumbnail viewer
 *  context). The path's own extension is enough to tell SignalPostCard/
 *  SignalMediaViewer whether to render an <img> or a <video>. */
export function mediaKindFromPath(path: string): 'image' | 'video' {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image';
}

function mapEmpirePost(row: EmpirePostRow): EmpirePost {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name ?? 'CX Rent',
    authorAvatarUrl: row.author_avatar_url,
    authorRole: roleFromFlags({ is_owner: row.author_is_owner, is_admin: row.author_is_admin, is_host: row.author_is_host }),
    authorIsHost: row.author_is_host,
    authorIsVerifiedClient: row.author_is_verified_client,
    category: row.category,
    title: row.title,
    body: row.body,
    mediaPaths: row.media_paths ?? [],
    mediaUrls: (row.media_paths ?? []).map(mediaUrlFor),
    isPinned: row.is_pinned,
    isFeatured: row.is_featured,
    commentsDisabled: row.comments_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    saveCount: row.save_count,
    viewCount: row.view_count,
    shareCount: row.share_count,
    likedByMe: row.liked_by_me,
    savedByMe: row.saved_by_me,
    publisherType: row.publisher_type,
  };
}

/** `scope` is SIGNAL's Official/Community split — 'official' matches the
 *  three fixed voices, 'community' matches real Host/Verified Client
 *  posts ('self'), omitted keeps the old unfiltered behavior. `authorKind`
 *  only means anything alongside `scope: 'community'` (Discovery's
 *  Hosts/Verified Clients chips). See 0049_signal_split_official_community.sql. */
export interface EmpireFeedScope {
  scope?: 'official' | 'community';
  authorKind?: 'host' | 'verified_client';
}

export async function fetchEmpireFeed(
  limit: number = FEED_PAGE_SIZE, before?: string, category?: EmpireCategory | null, scopeOpts?: EmpireFeedScope
): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_empire_feed', {
    p_limit: limit, p_before: before ?? null, p_category: category ?? null,
    p_publisher_scope: scopeOpts?.scope ?? null, p_author_kind: scopeOpts?.authorKind ?? null,
  });
  if (error) throw error;
  return (data as EmpirePostRow[]).map(mapEmpirePost);
}

/** Paginated feed — a plain `useX` hook isn't enough here since the list
 *  grows via `loadMore`, not a single re-fetch; `refresh` still resets it
 *  to the first page the same way every other hook's `refresh` re-runs
 *  its initial fetch. Pinned posts are never included here (fetched
 *  separately via `useEmpirePinnedPost` for the Featured section) — the
 *  feed RPC excludes `is_pinned` rows unconditionally. Re-fetches from
 *  the first page whenever `category`/`scope`/`authorKind` changes. */
export function useEmpireFeed(category: EmpireCategory | null = null, scopeOpts?: EmpireFeedScope) {
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const scope = scopeOpts?.scope;
  const authorKind = scopeOpts?.authorKind;

  const loadInitial = useCallback(async () => {
    try {
      const rows = await fetchEmpireFeed(FEED_PAGE_SIZE, undefined, category, { scope, authorKind });
      setPosts(rows);
      setHasMore(rows.length === FEED_PAGE_SIZE);
    } catch {
      setPosts([]);
      setHasMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, scope, authorKind]);

  useEffect(() => {
    setPosts(null);
    loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!posts || posts.length === 0 || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await fetchEmpireFeed(FEED_PAGE_SIZE, posts[posts.length - 1].createdAt, category, { scope, authorKind });
      setPosts((prev) => [...(prev ?? []), ...rows]);
      setHasMore(rows.length === FEED_PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, loadingMore, hasMore, category, scope, authorKind]);

  /** Replaces one post in place (e.g. after a like/save toggle or an
   *  edit) without a full re-fetch. */
  const patchPost = useCallback((id: string, patch: Partial<EmpirePost>) => {
    setPosts((prev) => (prev ? prev.map((p) => (p.id === id ? { ...p, ...patch } : p)) : prev));
  }, []);

  const removePost = useCallback((id: string) => {
    setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
  }, []);

  return { posts, loadMore, loadingMore, hasMore, refresh: loadInitial, patchPost, removePost };
}

export async function fetchEmpirePinnedPost(): Promise<EmpirePost | null> {
  const { data, error } = await supabase.rpc('fetch_empire_pinned_post');
  if (error) throw error;
  const rows = data as EmpirePostRow[];
  return rows.length > 0 ? mapEmpirePost(rows[0]) : null;
}

/** The Featured Announcement slot — independent of the paginated feed,
 *  `null` means "no pinned post right now" (a real, valid state, not
 *  loading — see the `loaded` flag for that distinction). */
export function useEmpirePinnedPost() {
  const [post, setPost] = useState<EmpirePost | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    fetchEmpirePinnedPost()
      .then((p) => {
        setPost(p);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { post, loaded, refresh, setPost };
}

export interface CreateEmpirePostInput {
  category: EmpireCategory;
  title?: string;
  body: string;
  mediaPaths?: string[];
  commentsDisabled?: boolean;
  publisherType: SignalPublisherType;
}

export async function createEmpirePost(input: CreateEmpirePostInput): Promise<{ post: EmpirePost | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_empire_post', {
    p_category: input.category,
    p_title: input.title ?? null,
    p_body: input.body,
    p_media_paths: input.mediaPaths ?? [],
    p_comments_disabled: input.commentsDisabled ?? false,
    p_publisher_type: input.publisherType,
  });
  if (error) return { post: null, error: error.message };
  return { post: mapCreatedPost(data), error: null };
}

export async function updateEmpirePost(
  postId: string,
  input: CreateEmpirePostInput
): Promise<{ post: EmpirePost | null; error: string | null }> {
  const { data, error } = await supabase.rpc('update_empire_post', {
    p_post_id: postId,
    p_category: input.category,
    p_title: input.title ?? null,
    p_body: input.body,
    p_media_paths: input.mediaPaths ?? [],
    p_comments_disabled: input.commentsDisabled ?? false,
    p_publisher_type: input.publisherType,
  });
  if (error) return { post: null, error: error.message };
  return { post: mapCreatedPost(data), error: null };
}

// create_empire_post/update_empire_post return a bare `empire_posts` row
// (no joined author/count columns, unlike fetch_empire_feed) — map just
// enough to patch the feed's local state; callers already know the
// author (themselves) and starting counts (all zero) for a fresh post.
function mapCreatedPost(row: {
  id: string; author_id: string; category: EmpireCategory; title: string | null; body: string;
  media_paths: string[]; is_pinned: boolean; is_featured: boolean; comments_disabled: boolean;
  created_at: string; updated_at: string; edited_at: string | null; publisher_type: SignalPublisherType;
}): EmpirePost {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: '',
    authorAvatarUrl: null,
    authorRole: 'admin',
    authorIsHost: false,
    authorIsVerifiedClient: false,
    category: row.category,
    title: row.title,
    body: row.body,
    mediaPaths: row.media_paths ?? [],
    mediaUrls: (row.media_paths ?? []).map(mediaUrlFor),
    isPinned: row.is_pinned,
    isFeatured: row.is_featured,
    commentsDisabled: row.comments_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    viewCount: 0,
    shareCount: 0,
    likedByMe: false,
    savedByMe: false,
    publisherType: row.publisher_type,
  };
}

/** Deletes the post, then cleans up its Storage objects using the paths
 *  the RPC hands back — otherwise every deleted post leaks orphaned
 *  files in the bucket forever. */
export async function deleteEmpirePost(postId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_empire_post', { p_post_id: postId });
  if (error) return { error: error.message };
  const paths = (data as { media_paths: string[] } | null)?.media_paths ?? [];
  if (paths.length > 0) {
    await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  }
  return { error: null };
}

export async function setEmpirePostPinned(postId: string, pinned: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_empire_post_pinned', { p_post_id: postId, p_pinned: pinned });
  if (error) return { error: error.message };
  return { error: null };
}

export async function toggleEmpirePostLike(postId: string): Promise<{ liked: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_empire_post_like', { p_post_id: postId });
  if (error) return { liked: false, error: error.message };
  return { liked: Boolean(data), error: null };
}

export async function toggleEmpirePostSave(postId: string): Promise<{ saved: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_empire_post_save', { p_post_id: postId });
  if (error) return { saved: false, error: error.message };
  return { saved: Boolean(data), error: null };
}

// ---- Comments — revived for the community redesign (SIGNAL is no
// longer an Owner-only broadcast feed). The tables/RPCs were never
// removed server-side when the UI was pulled earlier, so no migration
// was needed to bring this back — see 0040_empire_feed.sql. Listing is a
// plain select (no RPC exists for it, unlike the writes) since RLS
// already allows any signed-in user to read every row; the author's
// name/avatar/role badge come along via the same FK-embed pattern
// fetchCarWithHost uses for a Host. ----

export interface EmpireComment {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorIsOwner: boolean;
  authorIsAdmin: boolean;
  authorIsHost: boolean;
  authorIsVerifiedClient: boolean;
  body: string;
  createdAt: string;
}

interface EmpireCommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: {
    full_name: string | null;
    avatar_url: string | null;
    is_owner: boolean;
    is_admin: boolean;
    is_host: boolean;
    is_verified_client: boolean;
  } | null;
}

function mapEmpireComment(row: EmpireCommentRow): EmpireComment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorName: row.author?.full_name ?? 'CX Rent user',
    authorAvatarUrl: row.author?.avatar_url ?? null,
    authorIsOwner: row.author?.is_owner ?? false,
    authorIsAdmin: row.author?.is_admin ?? false,
    authorIsHost: row.author?.is_host ?? false,
    authorIsVerifiedClient: row.author?.is_verified_client ?? false,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function fetchEmpirePostComments(postId: string): Promise<EmpireComment[]> {
  const { data, error } = await supabase
    .from('empire_post_comments')
    .select('id, post_id, user_id, body, created_at, author:profiles!empire_post_comments_user_id_fkey(full_name, avatar_url, is_owner, is_admin, is_host, is_verified_client)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as EmpireCommentRow[]).map(mapEmpireComment);
}

export async function addEmpireComment(postId: string, body: string): Promise<{ comment: EmpireComment | null; error: string | null }> {
  const { data, error } = await supabase.rpc('add_empire_post_comment', { p_post_id: postId, p_body: body });
  if (error) return { comment: null, error: error.message };
  const row = data as { id: string; post_id: string; user_id: string; body: string; created_at: string };
  // The RPC returns a bare comment row (no joined author) — the caller
  // already knows their own identity to render an optimistic entry;
  // fetchEmpirePostComments' next real fetch fills in the rest.
  return {
    comment: {
      id: row.id, postId: row.post_id, userId: row.user_id, body: row.body, createdAt: row.created_at,
      authorName: '', authorAvatarUrl: null, authorIsOwner: false, authorIsAdmin: false, authorIsHost: false, authorIsVerifiedClient: false,
    },
    error: null,
  };
}

export async function deleteEmpireComment(commentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_empire_post_comment', { p_comment_id: commentId });
  return { error: error?.message ?? null };
}

export async function reportEmpireContent(target: { postId: string } | { commentId: string }, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('report_empire_content', {
    p_post_id: 'postId' in target ? target.postId : null,
    p_comment_id: 'commentId' in target ? target.commentId : null,
    p_reason: reason,
  });
  return { error: error?.message ?? null };
}

// ---- By-author / Saved — "My Posts" and "Saved" in the Quick Control,
// and a tapped profile's own post strip. Same row shape/mapper as the
// main feed. ----

export async function fetchEmpirePostsByAuthor(authorId: string, limit = FEED_PAGE_SIZE, before?: string): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_empire_posts_by_author', { p_author_id: authorId, p_limit: limit, p_before: before ?? null });
  if (error) throw error;
  return (data as EmpirePostRow[]).map(mapEmpirePost);
}

export async function fetchEmpireSavedPosts(limit = FEED_PAGE_SIZE, before?: string): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_empire_saved_posts', { p_limit: limit, p_before: before ?? null });
  if (error) throw error;
  return (data as EmpirePostRow[]).map(mapEmpirePost);
}

/** Uploads one composer image/video to the public `empire-post-media`
 *  bucket. Any authorized publisher can call this now (Owner/Admin/Host/
 *  Verified Client — see `can_publish_signal_content()`), so the path is
 *  namespaced by uploader folder (`0048_signal_community.sql`), the same
 *  pattern the `verification-documents` bucket already uses — that's
 *  what lets the delete policy scope "delete your own file, or admin"
 *  instead of "any signed-in user", since this bucket is public-read
 *  with otherwise-unguessable-but-visible paths. */
export async function uploadEmpirePostMedia(file: File): Promise<{ url: string; path: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Not signed in');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return { url: mediaUrlFor(path), path };
}

export async function markEmpireFeedSeen(): Promise<void> {
  await supabase.rpc('mark_empire_feed_seen');
}

export async function fetchEmpireUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('fetch_empire_unread_count');
  if (error) throw error;
  return (data as number) ?? 0;
}

export function useEmpireUnreadCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    fetchEmpireUnreadCount()
      .then(setCount)
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { count, refresh, clear: () => setCount(0) };
}

// ---- Featured content — Owner/Admin can mark any number of posts as
// Featured (unlike the single unique Pinned announcement); a dedicated
// section above the plain feed, collapses to nothing when none exist. ----

export async function setEmpirePostFeatured(postId: string, featured: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_empire_post_featured', { p_post_id: postId, p_featured: featured });
  if (error) return { error: error.message };
  return { error: null };
}

export async function fetchEmpireFeaturedPosts(limit = 6): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_empire_featured_posts', { p_limit: limit });
  if (error) throw error;
  return (data as EmpirePostRow[]).map(mapEmpirePost);
}

export function useEmpireFeaturedPosts() {
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);

  const refresh = useCallback(() => {
    fetchEmpireFeaturedPosts()
      .then(setPosts)
      .catch(() => setPosts([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { posts, refresh };
}

// ---- View tracking — dedup'd server-side (empire_post_views has a
// (post_id, user_id) primary key), so calling this on every card render is
// safe: a refresh or re-render never inflates the count. ----

export async function markEmpirePostViewed(postId: string): Promise<void> {
  await supabase.rpc('mark_empire_post_viewed', { p_post_id: postId });
}

// ---- Impressions — real, non-deduped (unlike Views): every render of a
// post's card counts, so this is always >= the unique-viewer view count.
// Not surfaced per-post (it would just clutter the feed card the way a
// real platform keeps this in Insights, not the public post), only as a
// site-wide total in Signal Analytics — see fetch_empire_analytics. ----

export async function incrementEmpirePostImpression(postId: string): Promise<void> {
  await supabase.rpc('increment_empire_post_impression', { p_post_id: postId });
}

// ---- Shares — a real event counter (a user actually completed the
// native share sheet or copied the link), not deduped: sharing the same
// post twice is two genuine share events, not a duplicate. ----

export async function incrementEmpirePostShare(postId: string): Promise<void> {
  await supabase.rpc('increment_empire_post_share', { p_post_id: postId });
}

// ---- Trending — real engagement only, recent window, minimum bar; see
// fetch_empire_trending_posts for the (deliberately simple) scoring. ----

export async function fetchEmpireTrendingPosts(limit = 5, scopeOpts?: EmpireFeedScope): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_empire_trending_posts', {
    p_limit: limit, p_publisher_scope: scopeOpts?.scope ?? null, p_author_kind: scopeOpts?.authorKind ?? null,
  });
  if (error) throw error;
  return (data as EmpirePostRow[]).map(mapEmpirePost);
}

export function useEmpireTrendingPosts(scopeOpts?: EmpireFeedScope, limit = 5) {
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);
  const scope = scopeOpts?.scope;
  const authorKind = scopeOpts?.authorKind;

  useEffect(() => {
    setPosts(null);
    fetchEmpireTrendingPosts(limit, { scope, authorKind })
      .then(setPosts)
      .catch(() => setPosts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, authorKind, limit]);

  /** Same shape as `useEmpireFeed`'s own patch/remove — a "Popular" list
   *  rendered as real, interactive `SignalPostCard`s (Community's
   *  Discovery filter) needs local optimistic updates the same way the
   *  main feed does; the small `SignalTrendingSection` strip doesn't use
   *  these, but they cost nothing when unused. */
  const patchPost = (id: string, patch: Partial<EmpirePost>) => {
    setPosts((prev) => (prev ? prev.map((p) => (p.id === id ? { ...p, ...patch } : p)) : prev));
  };
  const removePost = (id: string) => {
    setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
  };

  return { posts, patchPost, removePost };
}

// ---- Search — lightweight ilike over title/body, any signed-in user. ----

export async function searchEmpirePosts(query: string, category?: EmpireCategory | null, limit = 20): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('search_empire_posts', { p_query: query, p_category: category ?? null, p_limit: limit });
  if (error) throw error;
  return (data as EmpirePostRow[]).map(mapEmpirePost);
}

// ---- Single-post fetch — powers the /empire/post/:id deep link. `null`
// means the post doesn't exist (deleted, or a bad id), a real, distinct
// state from "still loading". ----

export async function fetchEmpirePostById(postId: string): Promise<EmpirePost | null> {
  const { data, error } = await supabase.rpc('fetch_empire_post_by_id', { p_post_id: postId });
  if (error) throw error;
  const rows = data as EmpirePostRow[];
  return rows.length > 0 ? mapEmpirePost(rows[0]) : null;
}

// ---- Owner/Admin analytics — one compact aggregate object, not a
// dashboard's worth of separate queries. ----

export interface EmpirePublisherStats {
  views: number;
  likes: number;
  comments: number;
  saves: number;
}

export interface EmpireAnalytics {
  totalPostViews: number;
  /** Real, non-deduped render count — see incrementEmpirePostImpression. */
  totalImpressions: number;
  totalStoryViews: number;
  postsLast7d: number;
  postsPrev7d: number;
  engagementLast7d: number;
  engagementPrev7d: number;
  mostViewed: { id: string; title: string; count: number } | null;
  mostLiked: { id: string; title: string; count: number } | null;
  mostCommented: { id: string; title: string; count: number } | null;
  mostSaved: { id: string; title: string; count: number } | null;
  /** Which of the three SIGNAL voices is performing best — real counts
   *  grouped by `empire_posts.publisher_type`, computed server-side. */
  byPublisher: Record<SignalPublisherType, EmpirePublisherStats>;
}

export async function fetchEmpireAnalytics(): Promise<EmpireAnalytics> {
  const { data, error } = await supabase.rpc('fetch_empire_analytics');
  if (error) throw error;
  const d = data as {
    total_post_views: number; total_impressions: number; total_story_views: number; posts_last_7d: number; posts_prev_7d: number;
    engagement_last_7d: number; engagement_prev_7d: number;
    most_viewed: { id: string; title: string; count: number } | null;
    most_liked: { id: string; title: string; count: number } | null;
    most_commented: { id: string; title: string; count: number } | null;
    most_saved: { id: string; title: string; count: number } | null;
    by_publisher: Partial<Record<SignalPublisherType, { views: number; likes: number; comments: number; saves: number }>> | null;
  };
  const emptyStats: EmpirePublisherStats = { views: 0, likes: 0, comments: 0, saves: 0 };
  return {
    totalPostViews: d.total_post_views,
    totalImpressions: d.total_impressions,
    totalStoryViews: d.total_story_views,
    postsLast7d: d.posts_last_7d,
    postsPrev7d: d.posts_prev_7d,
    engagementLast7d: d.engagement_last_7d,
    engagementPrev7d: d.engagement_prev_7d,
    mostViewed: d.most_viewed,
    mostLiked: d.most_liked,
    mostCommented: d.most_commented,
    mostSaved: d.most_saved,
    byPublisher: {
      owner: d.by_publisher?.owner ?? emptyStats,
      assistant: d.by_publisher?.assistant ?? emptyStats,
      cx: d.by_publisher?.cx ?? emptyStats,
      self: d.by_publisher?.self ?? emptyStats,
    },
  };
}
