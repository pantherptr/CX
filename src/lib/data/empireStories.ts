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

export type StoryMediaType = 'image';

export interface EmpireStorySlide {
  id: string;
  mediaPath: string;
  mediaType: StoryMediaType;
  mediaUrl: string;
  caption: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  sortOrder: number;
}

export interface EmpireStory {
  id: string;
  authorId: string;
  /** The real Owner/Admin account that clicked publish — used to
   *  resolve the 'owner' voice's live name/photo (see
   *  resolveSignalIdentity). Independent of `publisherType`. */
  authorName: string;
  authorAvatarUrl: string | null;
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
  media_path: string;
  media_type: StoryMediaType;
  caption: string | null;
  cta_label: string | null;
  cta_url: string | null;
  sort_order: number;
}

interface StoryRow {
  id: string;
  author_id: string;
  author_name: string | null;
  author_avatar_url: string | null;
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
    mediaUrl: mediaUrlFor(row.media_path),
    caption: row.caption,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    sortOrder: row.sort_order,
  };
}

function mapStory(row: StoryRow): EmpireStory {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name ?? 'CX Rent',
    authorAvatarUrl: row.author_avatar_url,
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
  mediaPath: string,
  mediaType: StoryMediaType,
  options?: { caption?: string; ctaLabel?: string; ctaUrl?: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('add_empire_story_slide', {
    p_story_id: storyId,
    p_media_path: mediaPath,
    p_media_type: mediaType,
    p_caption: options?.caption ?? null,
    p_cta_label: options?.ctaLabel ?? null,
    p_cta_url: options?.ctaUrl ?? null,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteEmpireStorySlide(slideId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_empire_story_slide', { p_slide_id: slideId });
  if (error) return { error: error.message };
  const path = (data as { media_path: string } | null)?.media_path;
  if (path) await supabase.storage.from(MEDIA_BUCKET).remove([path]);
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

/** Uploads one Story slide image — `stories/` prefixed purely to keep
 *  the shared `empire-post-media` bucket browsable in the dashboard, no
 *  policy difference from post media (same is_admin()-gated insert). */
export async function uploadEmpireStoryMedia(file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `stories/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return { url: mediaUrlFor(path), path };
}
