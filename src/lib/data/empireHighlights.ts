import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { EmpireStory, EmpireStorySlide, StoryMediaType } from './empireStories';

/**
 * SIGNAL Story Highlights (renamed from "Empire" — see empireFeed.ts's
 * header for why the underlying `empire_*` names stayed put) — permanent,
 * Owner/Admin-curated collections that never expire (unlike the 24h
 * Stories in empireStories.ts). A Highlight's slides are *copies* (new
 * rows) of a Story's slides, made via `save_empire_story_to_highlight` —
 * the source Story stays free to expire or be deleted on its own. Same
 * write pattern as everywhere else in Signal: every mutation goes through
 * a security-definer RPC gated on is_admin(). Mapped to the same
 * `EmpireStory` shape empireStories.ts uses so `SignalStoryViewer` can
 * render either without a second component.
 */

export interface EmpireHighlight {
  id: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  slides: EmpireStorySlide[];
}

interface HighlightSlideJson {
  id: string;
  media_path: string;
  media_type: StoryMediaType;
  poster_path: string | null;
  caption: string | null;
  cta_label: string | null;
  cta_url: string | null;
  sort_order: number;
}

interface HighlightRow {
  id: string;
  title: string;
  sort_order: number;
  created_at: string;
  slides: HighlightSlideJson[];
}

const MEDIA_BUCKET = 'empire-post-media';

function mediaUrlFor(path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

function mapSlide(row: HighlightSlideJson): EmpireStorySlide {
  return {
    id: row.id,
    mediaPath: row.media_path,
    mediaType: row.media_type,
    mediaUrl: mediaUrlFor(row.media_path),
    posterUrl: row.poster_path ? mediaUrlFor(row.poster_path) : null,
    caption: row.caption,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    sortOrder: row.sort_order,
  };
}

function mapHighlight(row: HighlightRow): EmpireHighlight {
  return {
    id: row.id,
    title: row.title,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    slides: (row.slides ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map(mapSlide),
  };
}

/** Renders a Highlight through the same `SignalStoryViewer` a live Story
 *  uses — Highlights have no author/expiry/per-viewer-view-state, so
 *  those fields are filled with inert placeholders the viewer never acts
 *  on (it only calls `onMarkViewed`/`onDeleteStory`, both overridden by
 *  the Highlights bar rather than left at their Story-specific defaults). */
export function highlightAsStory(h: EmpireHighlight): EmpireStory {
  // Highlights don't carry their own publisher identity (out of scope —
  // see signalIdentity.ts's header); 'cx' is the neutral default for a
  // permanent, Owner-curated collection with no single publish moment.
  return {
    id: h.id, authorId: '', authorName: 'CX Rent', authorAvatarUrl: null, title: h.title, createdAt: h.createdAt,
    expiresAt: '', viewCount: 0, viewedByMe: true, slides: h.slides, publisherType: 'cx',
  };
}

export async function fetchEmpireHighlights(): Promise<EmpireHighlight[]> {
  const { data, error } = await supabase.rpc('fetch_empire_highlights');
  if (error) throw error;
  return (data as HighlightRow[]).map(mapHighlight);
}

export function useEmpireHighlights() {
  const [highlights, setHighlights] = useState<EmpireHighlight[] | null>(null);

  const refresh = useCallback(() => {
    fetchEmpireHighlights()
      .then(setHighlights)
      .catch(() => setHighlights([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { highlights, refresh };
}

export async function createEmpireHighlight(title: string): Promise<{ highlightId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_empire_highlight', { p_title: title });
  if (error) return { highlightId: null, error: error.message };
  return { highlightId: (data as { id: string }).id, error: null };
}

export async function renameEmpireHighlight(highlightId: string, title: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('rename_empire_highlight', { p_highlight_id: highlightId, p_title: title });
  if (error) return { error: error.message };
  return { error: null };
}

export async function reorderEmpireHighlights(highlightIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reorder_empire_highlights', { p_highlight_ids: highlightIds });
  if (error) return { error: error.message };
  return { error: null };
}

/** Copies a live/expired Story's slides into an existing Highlight —
 *  the Owner's "save this Story permanently" action. */
export async function saveEmpireStoryToHighlight(storyId: string, highlightId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('save_empire_story_to_highlight', { p_story_id: storyId, p_highlight_id: highlightId });
  if (error) return { error: error.message };
  return { error: null };
}

export async function addEmpireHighlightSlide(
  highlightId: string,
  mediaPath: string,
  mediaType: StoryMediaType,
  options?: { caption?: string; ctaLabel?: string; ctaUrl?: string; posterPath?: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('add_empire_highlight_slide', {
    p_highlight_id: highlightId,
    p_media_path: mediaPath,
    p_media_type: mediaType,
    p_caption: options?.caption ?? null,
    p_cta_label: options?.ctaLabel ?? null,
    p_cta_url: options?.ctaUrl ?? null,
    p_poster_path: options?.posterPath ?? null,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteEmpireHighlightSlide(slideId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_empire_highlight_slide', { p_slide_id: slideId });
  if (error) return { error: error.message };
  const row = data as { media_path: string; poster_path: string | null } | null;
  const paths = [row?.media_path, row?.poster_path].filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  return { error: null };
}

export async function reorderEmpireHighlightSlides(highlightId: string, slideIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reorder_empire_highlight_slides', { p_highlight_id: highlightId, p_slide_ids: slideIds });
  if (error) return { error: error.message };
  return { error: null };
}

/** Deletes the Highlight, then cleans up every slide's Storage object
 *  using the paths the RPC hands back — same one-round-trip pattern
 *  deleteEmpireStory uses. */
export async function deleteEmpireHighlight(highlightId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_empire_highlight', { p_highlight_id: highlightId });
  if (error) return { error: error.message };
  const paths = (data as string[]) ?? [];
  if (paths.length > 0) {
    await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  }
  return { error: null };
}

export async function uploadEmpireHighlightMedia(file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `highlights/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return { url: mediaUrlFor(path), path };
}
