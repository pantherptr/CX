import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { SignalPublisherType } from './signalIdentity';

/**
 * SIGNAL Stories (renamed from "Empire" — see empireFeed.ts's header for
 * why the underlying `empire_*` names stayed put) — ephemeral (24h),
 * Owner/Admin-only, multi-slide stories permanently pinned above the
 * Signal feed. Same conventions as empireFeed.ts: every write goes
 * through a security-definer RPC gated on is_admin() (see
 * supabase/migrations/0041_empire_stories.sql), this file never
 * inserts/updates/deletes a table directly.
 */

export type StoryMediaType = 'image' | 'video' | 'text';
export type StoryTextAlign = 'left' | 'center' | 'right';
export type StoryTextSize = 'sm' | 'md' | 'lg';
/** A small fixed set of original CX Rent-branded backgrounds for a text
 *  Story — see StoryBackgroundPicker.tsx for the actual color values.
 *  Deliberately not a free color picker (see the migration's own
 *  comment) — five choices, no more. */
export type StoryBgStyle = 'noir' | 'accent' | 'gold' | 'gradient-signal' | 'gradient-gold';

export interface EmpireStorySlide {
  id: string;
  /** `null` for a text slide — see `mediaType`. */
  mediaPath: string | null;
  mediaType: StoryMediaType;
  /** Empty string for a text slide (no file to resolve a URL for). */
  mediaUrl: string;
  /** A client-captured first-frame thumbnail for a video slide (see
   *  captureVideoPosterBlob in lib/media.ts) — `null` for image/text
   *  slides, used as the `<video poster>` for instant perceived load in
   *  the viewer. */
  posterUrl: string | null;
  caption: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  sortOrder: number;
  /** Text-slide-only fields — all `null` for an image/video slide. */
  textContent: string | null;
  textAlign: StoryTextAlign | null;
  textSize: StoryTextSize | null;
  bgStyle: StoryBgStyle | null;
}

export interface EmpireStory {
  id: string;
  authorId: string;
  /** The real Owner/Admin account that clicked publish — used to
   *  resolve the 'owner' voice's live name/photo (see
   *  resolveSignalIdentity). Independent of `publisherType`. */
  authorName: string;
  authorAvatarUrl: string | null;
  /** Only meaningful for a `publisherType === 'self'` Story (a Host or
   *  Verified Client's own) — resolves the correct badge, same as
   *  EmpirePost's identically-named fields. */
  authorIsHost: boolean;
  authorIsVerifiedClient: boolean;
  title: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  viewedByMe: boolean;
  slides: EmpireStorySlide[];
  /** Which of SIGNAL's three voices this Story session was published
   *  under — chosen once at creation, applies to every slide in it. See
   *  signalIdentity.ts. */
  publisherType: SignalPublisherType;
}

interface StorySlideJson {
  id: string;
  media_path: string | null;
  media_type: StoryMediaType;
  poster_path: string | null;
  caption: string | null;
  cta_label: string | null;
  cta_url: string | null;
  sort_order: number;
  text_content: string | null;
  text_align: StoryTextAlign | null;
  text_size: StoryTextSize | null;
  bg_style: StoryBgStyle | null;
}

interface StoryRow {
  id: string;
  author_id: string;
  author_name: string | null;
  author_avatar_url: string | null;
  author_is_host: boolean;
  author_is_verified_client: boolean;
  title: string | null;
  created_at: string;
  expires_at: string;
  view_count: number;
  viewed_by_me: boolean;
  slides: StorySlideJson[];
  publisher_type: SignalPublisherType;
}

const MEDIA_BUCKET = 'empire-post-media';

function mediaUrlFor(path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

function mapSlide(row: StorySlideJson): EmpireStorySlide {
  return {
    id: row.id,
    mediaPath: row.media_path,
    mediaType: row.media_type,
    mediaUrl: row.media_path ? mediaUrlFor(row.media_path) : '',
    posterUrl: row.poster_path ? mediaUrlFor(row.poster_path) : null,
    caption: row.caption,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    sortOrder: row.sort_order,
    textContent: row.text_content,
    textAlign: row.text_align,
    textSize: row.text_size,
    bgStyle: row.bg_style,
  };
}

function mapStory(row: StoryRow): EmpireStory {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name ?? 'CX Rent',
    authorAvatarUrl: row.author_avatar_url,
    authorIsHost: row.author_is_host,
    authorIsVerifiedClient: row.author_is_verified_client,
    title: row.title,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    viewCount: row.view_count,
    viewedByMe: row.viewed_by_me,
    slides: (row.slides ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map(mapSlide),
    publisherType: row.publisher_type,
  };
}

export async function fetchActiveEmpireStories(): Promise<EmpireStory[]> {
  const { data, error } = await supabase.rpc('fetch_active_empire_stories');
  if (error) throw error;
  return (data as StoryRow[]).map(mapStory);
}

export function useActiveEmpireStories() {
  const [stories, setStories] = useState<EmpireStory[] | null>(null);

  const refresh = useCallback(() => {
    fetchActiveEmpireStories()
      .then(setStories)
      .catch(() => setStories([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stories, refresh };
}

export async function fetchAllEmpireStoriesAdmin(): Promise<EmpireStory[]> {
  const { data, error } = await supabase.rpc('fetch_all_empire_stories_admin');
  if (error) throw error;
  return (data as StoryRow[]).map(mapStory);
}

export async function createEmpireStory(
  title: string | undefined,
  publisherType: SignalPublisherType
): Promise<{ storyId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_empire_story', { p_title: title ?? null, p_publisher_type: publisherType });
  if (error) return { storyId: null, error: error.message };
  return { storyId: (data as { id: string }).id, error: null };
}

export async function addEmpireStorySlide(
  storyId: string,
  /** `null` for a text slide — see `mediaType`. */
  mediaPath: string | null,
  mediaType: StoryMediaType,
  options?: {
    caption?: string; ctaLabel?: string; ctaUrl?: string; posterPath?: string;
    textContent?: string; textAlign?: StoryTextAlign; textSize?: StoryTextSize; bgStyle?: StoryBgStyle;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('add_empire_story_slide', {
    p_story_id: storyId,
    p_media_path: mediaPath,
    p_media_type: mediaType,
    p_caption: options?.caption ?? null,
    p_cta_label: options?.ctaLabel ?? null,
    p_cta_url: options?.ctaUrl ?? null,
    p_poster_path: options?.posterPath ?? null,
    p_text_content: options?.textContent ?? null,
    p_text_align: options?.textAlign ?? null,
    p_text_size: options?.textSize ?? null,
    p_bg_style: options?.bgStyle ?? null,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteEmpireStorySlide(slideId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_empire_story_slide', { p_slide_id: slideId });
  if (error) return { error: error.message };
  const row = data as { media_path: string; poster_path: string | null } | null;
  const paths = [row?.media_path, row?.poster_path].filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  return { error: null };
}

export async function reorderEmpireStorySlides(storyId: string, slideIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reorder_empire_story_slides', { p_story_id: storyId, p_slide_ids: slideIds });
  if (error) return { error: error.message };
  return { error: null };
}

/** Deletes the story, then cleans up every one of its slides' Storage
 *  objects using the paths the RPC hands back — same "server returns the
 *  paths so cleanup is one round trip" pattern deleteEmpirePost uses. */
export async function deleteEmpireStory(storyId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_empire_story', { p_story_id: storyId });
  if (error) return { error: error.message };
  const paths = (data as string[]) ?? [];
  if (paths.length > 0) {
    await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  }
  return { error: null };
}

export async function markEmpireStoryViewed(storyId: string): Promise<void> {
  await supabase.rpc('mark_empire_story_viewed', { p_story_id: storyId });
}

/** Uploads one Story slide's media (image or video) — uid-prefixed
 *  (`${uid}/stories/...`), same shape `uploadEmpirePostMedia` uses. This
 *  MUST match the storage policy's own check: 0048_signal_community.sql
 *  rewrote the `empire-post-media` insert policy to require
 *  `auth.uid()::text = (storage.foldername(name))[1]` (whoever uploads a
 *  file owns its top-level folder), replacing the older flat
 *  `stories/<uuid>.ext` layout this function used to write — which,
 *  after that migration, made every single Story upload fail RLS with
 *  the literal string "stories" never equal to a real uid. That failure
 *  was silently swallowed by handlePublish's per-slide try/catch in
 *  SignalStoryComposer, so a Story would "publish" with zero slides and
 *  then never appear anywhere (fetch_active_empire_stories only returns
 *  stories that have at least one slide) — this is the exact "I publish
 *  a story and nothing comes public" bug. */
export async function uploadEmpireStoryMedia(file: File): Promise<{ url: string; path: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Not signed in');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${uid}/stories/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return { url: mediaUrlFor(path), path };
}

/** Uploads a video slide's client-captured poster frame (see
 *  captureVideoPosterBlob in lib/media.ts) — always a JPEG blob, never
 *  user-supplied, so no extra type validation is needed here. Same
 *  uid-prefix requirement as uploadEmpireStoryMedia above. */
export async function uploadEmpireStoryPoster(blob: Blob): Promise<{ url: string; path: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Not signed in');
  const path = `${uid}/stories/${crypto.randomUUID()}-poster.jpg`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
  if (error) throw error;
  return { url: mediaUrlFor(path), path };
}
