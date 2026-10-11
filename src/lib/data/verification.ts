import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { shrinkImage } from '../shrinkImage';

/**
 * Real identity-verification submissions — documents are stored in a
 * private bucket and `status` is locked server-side (see migration 0006):
 * the client can submit or resubmit at any time, but can never set its own
 * approval status. With no admin review UI in this app, `status` honestly
 * stays 'pending' until someone reviews it directly — this layer never
 * pretends otherwise.
 */

export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type DocStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type IdDocType = 'id_card' | 'passport' | 'residence_permit' | 'driving_licence';

export const ID_DOC_LABEL: Record<IdDocType, string> = {
  id_card: 'ID card',
  passport: 'Passport',
  residence_permit: 'Residence permit',
  driving_licence: 'Driving licence',
};

/** Why a document is sent back — one tap for the reviewer, shown to the person verbatim. */
export const REJECTION_REASONS = [
  'The photo is blurry or too dark',
  'Part of the document is cut off',
  'The document is expired',
  'The selfie does not match the document',
  'The back of the document is missing',
  'This is not an accepted document',
] as const;

export interface Verification {
  licencePhotoPath: string | null;
  selfiePath: string | null;
  /** Legacy single status — mirrors the licence status. */
  status: VerificationStatus;
  submittedAt: string | null;
  identityDocType: IdDocType | null;
  identityStatus: DocStatus;
  identityReason: string | null;
  identityFrontPath: string | null;
  identityBackPath: string | null;
  licenceStatus: DocStatus;
  licenceReason: string | null;
  licenceBackPath: string | null;
  /** False until migration 0106 has run (the page then shows the old, simpler state). */
  v2: boolean;
}

interface VerificationRow {
  licence_photo_path: string | null;
  selfie_path: string | null;
  status: VerificationStatus;
  submitted_at: string | null;
  identity_doc_type?: IdDocType | null;
  identity_status?: DocStatus;
  identity_reason?: string | null;
  identity_front_path?: string | null;
  identity_back_path?: string | null;
  licence_status?: DocStatus;
  licence_reason?: string | null;
  licence_back_path?: string | null;
}

function mapVerification(row: VerificationRow): Verification {
  const v2 = row.identity_status !== undefined;
  return {
    licencePhotoPath: row.licence_photo_path,
    selfiePath: row.selfie_path,
    status: row.status,
    submittedAt: row.submitted_at,
    identityDocType: row.identity_doc_type ?? null,
    identityStatus: row.identity_status ?? 'none',
    identityReason: row.identity_reason ?? null,
    identityFrontPath: row.identity_front_path ?? null,
    identityBackPath: row.identity_back_path ?? null,
    licenceStatus: row.licence_status ?? (row.licence_photo_path ? row.status : 'none'),
    licenceReason: row.licence_reason ?? null,
    licenceBackPath: row.licence_back_path ?? null,
    v2,
  };
}

const BASE_COLS = 'licence_photo_path, selfie_path, status, submitted_at';
const V2_COLS = `${BASE_COLS}, identity_doc_type, identity_status, identity_reason, identity_front_path, identity_back_path, licence_status, licence_reason, licence_back_path`;
let v2Columns: boolean | null = null;

export async function fetchMyVerification(userId: string): Promise<Verification | null> {
  const run = (cols: string) => supabase.from('verifications').select(cols).eq('user_id', userId).maybeSingle();
  let { data, error } = await run(v2Columns === false ? BASE_COLS : V2_COLS);
  if (error && v2Columns !== false && (error.code === '42703' || /identity_|licence_(status|reason|back)/.test(error.message))) {
    v2Columns = false;
    ({ data, error } = await run(BASE_COLS));
  } else if (!error && v2Columns === null) {
    v2Columns = true;
  }
  if (error) throw error;
  return data ? mapVerification(data as unknown as VerificationRow) : null;
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

async function uploadDocument(userId: string, name: string, original: File): Promise<string> {
  // Phone photos are 4–8 MB; 2000px / JPEG is plenty to read a document and keeps uploads fast.
  const file = await shrinkImage(original, 2000, 0.85);
  const path = `${userId}/${name}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('verification-documents').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
  return path;
}

const UPGRADE_MSG = 'Verification is being upgraded — please try again in a few minutes.';
const rpcError = (message: string) => (/function .* does not exist|schema cache|submit_(identity|licence)/i.test(message) ? UPGRADE_MSG : message);

/** Identity: a document (front, back unless it is a passport) + a selfie. */
export async function submitIdentity(
  userId: string,
  input: { docType: IdDocType; front: File; back?: File | null; selfie: File },
): Promise<{ error: string | null }> {
  try {
    const front = await uploadDocument(userId, 'id-front', input.front);
    const back = input.docType !== 'passport' && input.back ? await uploadDocument(userId, 'id-back', input.back) : null;
    const selfie = await uploadDocument(userId, 'selfie', input.selfie);
    const { error } = await supabase.rpc('submit_identity_verification', { p_doc_type: input.docType, p_front: front, p_back: back, p_selfie: selfie });
    return { error: error ? rpcError(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Upload failed. Please try again.' };
  }
}

/** Driving licence: front and back. */
export async function submitLicence(userId: string, input: { front: File; back: File }): Promise<{ error: string | null }> {
  try {
    const front = await uploadDocument(userId, 'licence-front', input.front);
    const back = await uploadDocument(userId, 'licence-back', input.back);
    const { error } = await supabase.rpc('submit_licence_verification', { p_front: front, p_back: back });
    return { error: error ? rpcError(error.message) : null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Upload failed. Please try again.' };
  }
}

/** True when this person may book: a licence is on file (waiting for review counts — we do not
 *  make people wait for a reviewer to start a booking, the licence is checked before hand-over). */
export function licenceReady(v: Verification | null): boolean {
  if (!v) return false;
  return v.licenceStatus === 'pending' || v.licenceStatus === 'approved';
}

/** Signed URL for a private document/photo — both new buckets are
 *  private, so a plain public URL wouldn't resolve. */
export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}
