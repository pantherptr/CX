import { supabase } from '../supabase';

/**
 * System announcements (migration 0135): the team writes once, the message lands in people's inbox as a plain
 * notice. Sending is the `send_system_announcement` RPC (Owner / Admin only, checked in the database).
 */
export type AnnouncementAudience = 'all' | 'hosts' | 'clients' | 'team' | 'people';

export const AUDIENCES: { id: AnnouncementAudience; label: string; hint: string }[] = [
  { id: 'all', label: 'Everyone', hint: 'Every member of CX' },
  { id: 'hosts', label: 'Hosts', hint: 'People who list cars' },
  { id: 'clients', label: 'Verified clients', hint: 'Renters with a verified profile' },
  { id: 'team', label: 'Team', hint: 'Owner and admins' },
  { id: 'people', label: 'Chosen people', hint: 'Pick the people yourself' },
];

/** Places a button may open — fixed list, so a message can never send people somewhere unexpected. */
export const CTA_TARGETS: { label: string; path: string }[] = [
  { label: 'Browse cars', path: '/browse' },
  { label: 'List your car', path: '/list-your-car' },
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Host dashboard', path: '/host' },
  { label: 'SIGNAL', path: '/signal' },
  { label: 'SIGNAL Reels', path: '/signal/reels' },
  { label: 'Messages', path: '/messages' },
  { label: 'Settings', path: '/settings' },
  { label: 'Help centre', path: '/help' },
];

export interface SystemAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  recipientsCount: number;
  ctaLabel: string | null;
  ctaUrl: string | null;
  createdAt: string;
}

export async function sendAnnouncement(input: {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  userIds?: string[];
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}): Promise<{ count: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('send_system_announcement', {
    p_title: input.title,
    p_body: input.body,
    p_audience: input.audience,
    p_user_ids: input.audience === 'people' ? input.userIds ?? [] : null,
    p_cta_label: input.ctaLabel ?? null,
    p_cta_url: input.ctaUrl ?? null,
  });
  if (error) return { count: null, error: error.message };
  return { count: typeof data === 'number' ? data : 0, error: null };
}

export async function fetchAnnouncements(limit = 30): Promise<{ data: SystemAnnouncement[]; error: string | null }> {
  const { data, error } = await supabase
    .from('system_announcements')
    .select('id, title, body, audience, recipients_count, cta_label, cta_url, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      title: r.title as string,
      body: r.body as string,
      audience: r.audience as AnnouncementAudience,
      recipientsCount: (r.recipients_count as number) ?? 0,
      ctaLabel: (r.cta_label as string | null) ?? null,
      ctaUrl: (r.cta_url as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
    error: null,
  };
}
