import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/**
 * Real identity-verification submissions — documents are stored in a
 * private bucket and `status` is locked server-side (see migration 0006):
 * the client can submit or resubmit at any time, but can never set its own
 * approval status. With no admin review UI in this app, `status` honestly
 * stays 'pending' until someone reviews it directly — this layer never
 * pretends otherwise.
 */

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface Verification {
  licencePhotoPath: string | null;
  selfiePath: string | null;
  status: VerificationStatus;
  submittedAt: string | null;
}

interface VerificationRow {
  licence_photo_path: string | null;
  selfie_path: string | null;
  status: VerificationStatus;
  submitted_at: string | null;
}

function mapVerification(row: VerificationRow): Verification {
  return {
    licencePhotoPath: row.licence_photo_path,
    selfiePath: row.selfie_path,
    status: row.status,
    submittedAt: row.submitted_at,
  };
}

export async function fetchMyVerification(userId: string): Promise<Verification | null> {
  const { data, error } = await supabase
    .from('verifications')
    .select('licence_photo_path, selfie_path, status, submitted_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapVerification(data as VerificationRow) : null;
}

export function useVerification(userId: string | undefined) {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMyVerification(userId)
      .then((data) => {
        if (!cancelled) setVerification(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load verification status.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return { verification, loading, error, refresh };
}

async function uploadDocument(userId: string, kind: 'licence' | 'selfie', file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('verification-documents').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function submitVerification(
  userId: string,
  files: { licenceFile?: File; selfieFile?: File },
): Promise<{ error: string | null }> {
  try {
    const updates: Record<string, unknown> = { user_id: userId, submitted_at: new Date().toISOString() };
    if (files.licenceFile) updates.licence_photo_path = await uploadDocument(userId, 'licence', files.licenceFile);
    if (files.selfieFile) updates.selfie_path = await uploadDocument(userId, 'selfie', files.selfieFile);

    const { error } = await supabase.from('verifications').upsert(updates, { onConflict: 'user_id' });
    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Upload failed. Please try again.' };
  }
}

/** Signed URL for a private document/photo — both new buckets are
 *  private, so a plain public URL wouldn't resolve. */
export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}
