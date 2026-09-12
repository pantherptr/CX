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
  liked_by_me: boolean;
  saved_by_me: boolean;
  publisher_type: SignalPublisherType;
}

function mediaUrlFor(path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

function mapEmpirePost(row: EmpirePostRow): EmpirePost {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name ?? 'CX Rent',
    authorAvatarUrl: row.author_avatar_url,
    authorRole: roleFromFlags({ is_owner: row.author_is_owner, is_admin: row.author_is_admin, is_host: false }),
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
    likedByMe: row.liked_by_me,
    savedByMe: row.saved_by_me,
    publisherType: row.publisher_type,
  };
}

export async function fetchEmpireFeed(limit: number = FEED_PAGE_SIZE, before?: string, category?: EmpireCategory | null): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_empire_feed', { p_limit: limit, p_before: before ?? null, p_category: category ?? null });
  if (error) throw error;
  return (data as EmpirePostRow[]).map(mapEmpirePost);
}

/** Paginated feed — a plain `useX` hook isn't enough here since the list
 *  grows via `loadMore`, not a single re-fetch; `refresh` still resets it
 *  to the first page the same way every other hook's `refresh` re-runs
 *  its initial fetch. Pinned posts are never included here (fetched
 *  separately via `useEmpirePinnedPost` for the Featured section) — the
 *  feed RPC excludes `is_pinned` rows unconditionally. Re-fetches from
 *  the first page whenever `category` changes. */
export function useEmpireFeed(category: EmpireCategory | null = null) {
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadInitial = useCallback(async () => {
    try {
      const rows = await fetchEmpireFeed(FEED_PAGE_SIZE, undefined, category);
      setPosts(rows);
      setHasMore(rows.length === FEED_PAGE_SIZE);
    } catch {
      setPosts([]);
      setHasMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    setPosts(null);
    loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!posts || posts.length === 0 || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await fetchEmpireFeed(FEED_PAGE_SIZE, posts[posts.length - 1].createdAt, category);
      setPosts((prev) => [...(prev ?? []), ...rows]);
      setHasMore(rows.length === FEED_PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, loadingMore, hasMore, category]);

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

export interface EmpireComment {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
}

interface EmpireCommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

function mapComment(row: EmpireCommentRow): EmpireComment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorName: row.profiles?.full_name ?? 'CX Rent member',
    authorAvatarUrl: row.profiles?.avatar_url ?? null,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function fetchEmpirePostComments(postId: string): Promise<EmpireComment[]> {
  const { data, error } = await supabase
    .from('empire_post_comments')
    .select('id, post_id, user_id, body, created_at, profiles(full_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as EmpireCommentRow[]).map(mapComment);
}

export function useEmpirePostComments(postId: string | null) {
  const [comments, setComments] = useState<EmpireComment[] | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!postId) {
      setComments(null);
      return;
    }
    let cancelled = false;
    fetchEmpirePostComments(postId)
      .then((c) => !cancelled && setComments(c))
      .catch(() => !cancelled && setComments([]));
    return () => {
      cancelled = true;
    };
  }, [postId, reload]);

  return { comments, refresh: () => setReload((n) => n + 1) };
}

export async function addEmpireComment(postId: string, body: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('add_empire_post_comment', { p_post_id: postId, p_body: body });
  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteEmpireComment(commentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_empire_post_comment', { p_comment_id: commentId });
  if (error) return { error: error.message };
  return { error: null };
}

/** Uploads one composer image to the public `empire-post-media` bucket.
 *  Only Owner/Admin ever call this — the bucket's insert policy checks
 *  `is_admin()` directly (0040_empire_feed.sql), not a per-uploader
 *  folder like car-photos/avatars, since there's exactly one class of
 *  writer here. Same shape as `uploadCarPhoto` in cars.ts otherwise. */
export async function uploadEmpirePostMedia(file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;
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

// ---- Trending — real engagement only, recent window, minimum bar; see
// fetch_empire_trending_posts for the (deliberately simple) scoring. ----

export async function fetchEmpireTrendingPosts(limit = 5): Promise<EmpirePost[]> {
  const { data, error } = await supabase.rpc('fetch_empire_trending_posts', { p_limit: limit });
  if (error) throw error;
  return (data as EmpirePostRow[]).map(mapEmpirePost);
}

export function useEmpireTrendingPosts() {
  const [posts, setPosts] = useState<EmpirePost[] | null>(null);

  useEffect(() => {
    fetchEmpireTrendingPosts()
      .then(setPosts)
      .catch(() => setPosts([]));
  }, []);

  return { posts };
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
    total_post_views: number; total_story_views: number; posts_last_7d: number; posts_prev_7d: number;
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
    },
  };
}
