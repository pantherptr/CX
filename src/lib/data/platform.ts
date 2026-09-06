import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { logOwnerAction } from './owner';

/**
 * Platform-wide settings (maintenance mode, announcement banner) and the
 * Owner's private notes — see supabase/migrations/0022_owner_master_control.sql.
 * Settings are readable by everyone (even signed out, via the anon key —
 * a maintenance page has to render before anyone has a session); only
 * the Owner can write either table, enforced by RLS.
 */

export interface PlatformSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcementActive: boolean;
  announcementMessage: string;
  updatedAt: string;
}

interface PlatformSettingsRow {
  maintenance_mode: boolean;
  maintenance_message: string;
  announcement_active: boolean;
  announcement_message: string;
  updated_at: string;
}

function mapSettings(r: PlatformSettingsRow): PlatformSettings {
  return {
    maintenanceMode: r.maintenance_mode,
    maintenanceMessage: r.maintenance_message,
    announcementActive: r.announcement_active,
    announcementMessage: r.announcement_message,
    updatedAt: r.updated_at,
  };
}

export async function fetchPlatformSettings(): Promise<PlatformSettings | null> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('maintenance_mode, maintenance_message, announcement_active, announcement_message, updated_at')
    .eq('id', 'main')
    .maybeSingle();
  if (error || !data) return null;
  return mapSettings(data as PlatformSettingsRow);
}

/** Loads once, shared by MaintenanceGate (site-wide gate + announcement
 *  banner) and the Owner's own Settings tab. A hard failure to load
 *  (network down, table missing) fails OPEN — `null` — rather than
 *  locking every visitor out because settings couldn't be read; the
 *  Owner Control Center still separately shows the real error. */
export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    fetchPlatformSettings()
      .then(setSettings)
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  return { settings, loading, reload };
}

export type PlatformSettingsPatch = Partial<{
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcementActive: boolean;
  announcementMessage: string;
}>;

export async function updatePlatformSettings(patch: PlatformSettingsPatch): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user?.id ?? null };
  if (patch.maintenanceMode !== undefined) row.maintenance_mode = patch.maintenanceMode;
  if (patch.maintenanceMessage !== undefined) row.maintenance_message = patch.maintenanceMessage;
  if (patch.announcementActive !== undefined) row.announcement_active = patch.announcementActive;
  if (patch.announcementMessage !== undefined) row.announcement_message = patch.announcementMessage;

  const { error } = await supabase.from('platform_settings').update(row).eq('id', 'main');
  if (!error) void logOwnerAction('update_platform_settings', 'platform', 'main', patch as Record<string, unknown>);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------
// Owner notes / tasks
// ---------------------------------------------------------------------

export interface OwnerNote {
  id: string;
  content: string;
  done: boolean;
  createdAt: string;
}

export async function fetchOwnerNotes(): Promise<OwnerNote[]> {
  const { data, error } = await supabase
    .from('owner_notes')
    .select('id, content, done, created_at')
    .order('done', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as { id: string; content: string; done: boolean; created_at: string }[]).map((r) => ({
    id: r.id,
    content: r.content,
    done: r.done,
    createdAt: r.created_at,
  }));
}

export async function createOwnerNote(content: string): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const { error } = await supabase.from('owner_notes').insert({ owner_id: user.id, content });
  return { error: error?.message ?? null };
}

export async function setOwnerNoteDone(id: string, done: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('owner_notes').update({ done, updated_at: new Date().toISOString() }).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteOwnerNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('owner_notes').delete().eq('id', id);
  return { error: error?.message ?? null };
}
