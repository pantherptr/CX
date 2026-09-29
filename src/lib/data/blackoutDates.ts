import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

/** A date range a host has manually taken off the market — own use,
 *  maintenance, an off-platform booking. See migration 0067. */
export interface CarBlackoutDate {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdAt: string;
}

interface BlackoutRow {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

function mapBlackout(row: BlackoutRow): CarBlackoutDate {
  return { id: row.id, startDate: row.start_date, endDate: row.end_date, reason: row.reason, createdAt: row.created_at };
}

export async function fetchCarBlackoutDates(carId: string): Promise<CarBlackoutDate[]> {
  const { data, error } = await supabase.rpc('fetch_car_blackout_dates', { p_car_id: carId });
  if (error) throw error;
  return ((data ?? []) as BlackoutRow[]).map(mapBlackout);
}

/** `null` while loading, `[]`/data once resolved — same convention as `useBookedRanges`. */
export function useCarBlackoutDates(carId: string | null) {
  const [dates, setDates] = useState<CarBlackoutDate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!carId) {
      setDates(null);
      return;
    }
    let cancelled = false;
    setDates(null);
    setError(null);
    fetchCarBlackoutDates(carId)
      .then((data) => {
        if (!cancelled) setDates(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load blocked dates');
      });
    return () => {
      cancelled = true;
    };
  }, [carId, version]);

  return { dates, error, refresh };
}

export async function createCarBlackoutDate(
  carId: string,
  startDate: string,
  endDate: string,
  reason?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('create_car_blackout_date', {
    p_car_id: carId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_reason: reason ?? null,
  });
  return { error: error?.message ?? null };
}

export async function deleteCarBlackoutDate(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_car_blackout_date', { p_id: id });
  return { error: error?.message ?? null };
}
