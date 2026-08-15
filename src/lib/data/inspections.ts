import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/** Real before/after vehicle-condition photo evidence, tied to a booking.
 *  No approval step — just structured evidence, scoped to that booking's
 *  renter and host (see migration 0006). */

export type InspectionPhase = 'pre' | 'post';
export type InspectionAngle = 'front' | 'rear' | 'left' | 'right' | 'interior' | 'dashboard' | 'fuel';

export const INSPECTION_ANGLES: { id: InspectionAngle; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'left', label: 'Left side' },
  { id: 'right', label: 'Right side' },
  { id: 'interior', label: 'Interior' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'fuel', label: 'Fuel / battery' },
];

export interface InspectionPhoto {
  phase: InspectionPhase;
  angle: InspectionAngle;
  photoPath: string;
}

interface InspectionRow {
  phase: InspectionPhase;
  angle: InspectionAngle;
  photo_path: string;
}

export async function fetchInspectionPhotos(bookingId: string): Promise<InspectionPhoto[]> {
  const { data, error } = await supabase
    .from('booking_inspections')
    .select('phase, angle, photo_path')
    .eq('booking_id', bookingId);
  if (error) throw error;
  return (data as InspectionRow[]).map((r) => ({ phase: r.phase, angle: r.angle, photoPath: r.photo_path }));
}

export function useInspectionPhotos(bookingId: string | undefined) {
  const [photos, setPhotos] = useState<InspectionPhoto[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    fetchInspectionPhotos(bookingId).then((data) => {
      if (!cancelled) setPhotos(data);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return { photos, loading: photos === null, refresh };
}

export async function uploadInspectionPhoto(
  bookingId: string,
  uploaderId: string,
  phase: InspectionPhase,
  angle: InspectionAngle,
  file: File,
): Promise<{ error: string | null }> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${bookingId}/${phase}-${angle}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('inspection-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from('booking_inspections')
    .upsert(
      { booking_id: bookingId, phase, angle, photo_path: path, uploaded_by: uploaderId },
      { onConflict: 'booking_id,phase,angle' },
    );
  if (error) return { error: error.message };
  return { error: null };
}
