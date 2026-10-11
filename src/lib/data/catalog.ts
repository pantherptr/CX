import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Car } from '../../data/types';

/**
 * The CX car catalogue (migration 0107). Everything fails soft: before the migration has run, or
 * while the catalogue is empty, the app keeps working exactly as before with host photos only.
 */

export interface CatalogImage {
  id: string;
  catalogId: string;
  colorKey: string;
  colorLabel: string;
  colorHex: string;
  url: string;
  isDefault: boolean;
  position: number;
}

export interface CatalogModel {
  id: string;
  make: string;
  model: string;
  version: string | null;
  yearFrom: number;
  yearTo: number | null;
  category: Car['category'];
  seats: number;
  doors: number;
  luggage: number;
  fuels: Car['fuel'][];
  transmissions: Car['transmission'][];
  drives: string[];
  active: boolean;
  images: CatalogImage[];
}

interface ModelRow {
  id: string;
  make: string;
  model: string;
  version: string | null;
  year_from: number;
  year_to: number | null;
  category: Car['category'];
  seats: number;
  doors: number;
  luggage: number;
  fuels: string[];
  transmissions: string[];
  drives: string[];
  active: boolean;
}
interface ImageRow {
  id: string;
  catalog_id: string;
  color_key: string;
  color_label: string;
  color_hex: string;
  url: string;
  is_default: boolean;
  position: number;
}

const toImage = (r: ImageRow): CatalogImage => ({
  id: r.id, catalogId: r.catalog_id, colorKey: r.color_key, colorLabel: r.color_label, colorHex: r.color_hex,
  url: r.url, isDefault: r.is_default, position: r.position,
});

let cache: { at: number; models: CatalogModel[] } | null = null;
let inflight: Promise<CatalogModel[]> | null = null;
const FRESH_MS = 10 * 60 * 1000;

/** Every model with its images; one small request, shared and cached for ten minutes. */
export function loadCatalog(force = false): Promise<CatalogModel[]> {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.models);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [m, i] = await Promise.all([
        supabase.from('car_catalog').select('*').order('make').order('model').order('year_from', { ascending: false }),
        supabase.from('car_catalog_images').select('*').order('position'),
      ]);
      if (m.error || !m.data) return cache?.models ?? [];
      const imgs = ((i.data ?? []) as ImageRow[]).map(toImage);
      const by = new Map<string, CatalogImage[]>();
      for (const im of imgs) by.set(im.catalogId, [...(by.get(im.catalogId) ?? []), im]);
      const models = (m.data as ModelRow[]).map<CatalogModel>((r) => ({
        id: r.id, make: r.make, model: r.model, version: r.version, yearFrom: r.year_from, yearTo: r.year_to,
        category: r.category, seats: r.seats, doors: r.doors, luggage: r.luggage,
        fuels: r.fuels as Car['fuel'][], transmissions: r.transmissions as Car['transmission'][], drives: r.drives,
        active: r.active, images: by.get(r.id) ?? [],
      }));
      cache = { at: Date.now(), models };
      return models;
    } catch {
      return cache?.models ?? [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateCatalog() {
  cache = null;
}

export function useCatalog() {
  const [models, setModels] = useState<CatalogModel[] | null>(cache ? cache.models : null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    void loadCatalog(tick > 0).then((m) => { if (!off) setModels(m); });
    return () => { off = true; };
  }, [tick]);
  return { models, loading: models === null, reload: () => { invalidateCatalog(); setTick((t) => t + 1); } };
}

/** The image to lead a listing with: the picked colour, else the model's default, else its first. */
export function pickCatalogImage(images: CatalogImage[], colorKey?: string | null): CatalogImage | null {
  if (!images.length) return null;
  return (colorKey && images.find((i) => i.colorKey === colorKey)) || images.find((i) => i.isDefault) || images[0];
}

/** Looks up a model's hero URL synchronously from what has already been loaded (see loadCatalog). */
export function catalogHeroUrl(catalogId: string | null | undefined, colorKey: string | null | undefined): string | null {
  if (!catalogId || !cache) return null;
  const model = cache.models.find((m) => m.id === catalogId);
  return model ? pickCatalogImage(model.images, colorKey)?.url ?? null : null;
}

/** Makes in catalogue order, each with its models grouped by name. */
export function groupByMake(models: CatalogModel[]): { make: string; models: string[] }[] {
  const out = new Map<string, Set<string>>();
  for (const m of models) {
    if (!m.active) continue;
    if (!out.has(m.make)) out.set(m.make, new Set());
    out.get(m.make)!.add(m.model);
  }
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([make, set]) => ({ make, models: [...set].sort() }));
}

// ----------------------------------------------------------------------------------- admin

const BUCKET = 'car-catalog';

export async function saveCatalogModel(input: Omit<CatalogModel, 'id' | 'images' | 'active'> & { id?: string; active?: boolean }): Promise<{ error: string | null; id?: string }> {
  const row = {
    make: input.make.trim(), model: input.model.trim(), version: input.version?.trim() || null,
    year_from: input.yearFrom, year_to: input.yearTo, category: input.category, seats: input.seats,
    doors: input.doors, luggage: input.luggage, fuels: input.fuels, transmissions: input.transmissions,
    drives: input.drives, active: input.active ?? true,
  };
  const q = input.id
    ? supabase.from('car_catalog').update(row).eq('id', input.id).select('id').single()
    : supabase.from('car_catalog').insert(row).select('id').single();
  const { data, error } = await q;
  if (error) return { error: error.message };
  invalidateCatalog();
  return { error: null, id: (data as { id: string }).id };
}

export async function setCatalogActive(id: string, active: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('car_catalog').update({ active }).eq('id', id);
  invalidateCatalog();
  return { error: error ? error.message : null };
}

/** Uploads one colour's cut-out for a model (replacing that colour if it exists). */
export async function uploadCatalogImage(
  catalogId: string,
  color: { key: string; label: string; hex: string },
  file: File,
  makeDefault: boolean,
): Promise<{ error: string | null }> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${catalogId}/${color.key}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type || 'image/png' });
  if (up.error) return { error: up.error.message };
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  if (makeDefault) await supabase.from('car_catalog_images').update({ is_default: false }).eq('catalog_id', catalogId);
  const { error } = await supabase.from('car_catalog_images').upsert(
    { catalog_id: catalogId, color_key: color.key, color_label: color.label, color_hex: color.hex, url, is_default: makeDefault },
    { onConflict: 'catalog_id,color_key' },
  );
  invalidateCatalog();
  return { error: error ? error.message : null };
}

export async function deleteCatalogImage(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('car_catalog_images').delete().eq('id', id);
  invalidateCatalog();
  return { error: error ? error.message : null };
}

export async function setCatalogDefaultImage(catalogId: string, imageId: string): Promise<{ error: string | null }> {
  await supabase.from('car_catalog_images').update({ is_default: false }).eq('catalog_id', catalogId);
  const { error } = await supabase.from('car_catalog_images').update({ is_default: true }).eq('id', imageId);
  invalidateCatalog();
  return { error: error ? error.message : null };
}
