#!/usr/bin/env node
/**
 * Give the photos that were uploaded BEFORE "photos in several sizes" their smaller copies too, so every card
 * and grid downloads ~100 KB instead of the 2-6 MB original (src/lib/imageVariants.ts is the contract).
 *
 * For each photo it:
 *   1. makes NAME.v480.jpg and NAME.v960.jpg and uploads them,
 *   2. copies the original to NAME.v.ext (the ".v." name tells the app that the copies exist),
 *   3. points every database reference at the new name,
 *   4. only then removes the old object.
 * A photo that nothing in the database points to, or that is already small, is left alone.
 *
 *   node scripts/add-photo-copies.mjs                            # DRY RUN, both buckets: what it would do
 *   node scripts/add-photo-copies.mjs --bucket=car-photos        # DRY RUN, one bucket
 *   node scripts/add-photo-copies.mjs --bucket=car-photos --apply --limit=20    # does it (start small)
 *
 * Buckets: car-photos (car_images.url) and empire-post-media (posts, scheduled posts, story and highlight
 * slides). Options: --min-kb=150 (leave smaller files)  --limit=200  --backup=./image-backup
 * Originals are saved locally before an --apply. Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local; the key stays on this computer and is never printed. Run the dry run first.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

function loadEnv() {
  const env = { ...process.env };
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const APPLY = args.apply === true;
const MIN_BYTES = Number(args['min-kb'] ?? 150) * 1024;
const LIMIT = Number(args.limit ?? 200);
const BACKUP = String(args.backup ?? './image-backup');
const WIDTHS = [480, 960];
const BUCKETS = args.bucket ? [String(args.bucket)] : ['car-photos', 'empire-post-media'];
const IMAGE = /\.(jpe?g|png|webp)$/i;
const DONE = /\.v(\d*)\.(jpe?g|png|webp)$/i; // already marked, or one of the copies
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

async function listAll(bucket, prefix = '') {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const o of data) {
      const p = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null) out.push(...(await listAll(bucket, p)));
      else out.push({ path: p, size: o.metadata?.size ?? 0 });
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

const publicUrl = (bucket, path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

/** Every place that points at `path`, as {kind, ...}. Empty means nothing known uses it. */
async function referencesTo(bucket, path) {
  const refs = [];
  if (bucket === 'car-photos') {
    const { data, error } = await supabase.from('car_images').select('id, url').like('url', `%${path}`);
    if (error) throw error;
    for (const r of data ?? []) refs.push({ kind: 'car_images', id: r.id, url: r.url });
    return refs;
  }
  for (const table of ['empire_posts', 'empire_scheduled_posts']) {
    const { data, error } = await supabase.from(table).select('id, media_paths').contains('media_paths', [path]);
    if (error) throw error;
    for (const r of data ?? []) refs.push({ kind: 'array', table, id: r.id, paths: r.media_paths });
  }
  for (const table of ['empire_story_slides', 'empire_story_highlight_slides']) {
    const { data, error } = await supabase.from(table).select('id').eq('media_path', path);
    if (error) throw error;
    for (const r of data ?? []) refs.push({ kind: 'single', table, id: r.id });
  }
  return refs;
}

async function repoint(bucket, oldPath, newPath, refs) {
  for (const r of refs) {
    if (r.kind === 'car_images') {
      const { error } = await supabase.from('car_images').update({ url: r.url.replace(oldPath, newPath) }).eq('id', r.id);
      if (error) throw error;
    } else if (r.kind === 'array') {
      const { error } = await supabase.from(r.table).update({ media_paths: r.paths.map((p) => (p === oldPath ? newPath : p)) }).eq('id', r.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from(r.table).update({ media_path: newPath }).eq('id', r.id);
      if (error) throw error;
    }
  }
}

async function processBucket(bucket) {
  console.log(`\n== ${bucket} ${APPLY ? '(APPLY)' : '(dry run)'}`);
  const all = await listAll(bucket);
  const todo = all.filter((o) => IMAGE.test(o.path) && !DONE.test(o.path) && o.size >= MIN_BYTES).slice(0, LIMIT);
  console.log(`${all.length} files, ${todo.length} photos to give copies to (>= ${Math.round(MIN_BYTES / 1024)} KB, no copies yet)`);
  let saved = 0;
  let done = 0;
  let skipped = 0;
  for (const o of todo) {
    const ext = o.path.split('.').pop().toLowerCase();
    const base = o.path.slice(0, -(ext.length + 1));
    const newPath = `${base}.v.${ext}`;
    try {
      const refs = await referencesTo(bucket, o.path);
      if (refs.length === 0) { skipped++; console.log(`  skip ${o.path}: nothing in the database points to it`); continue; }
      if (!APPLY) { done++; console.log(`  would convert ${o.path} (${mb(o.size)}, ${refs.length} reference${refs.length > 1 ? 's' : ''})`); continue; }

      const { data: blob, error: dl } = await supabase.storage.from(bucket).download(o.path);
      if (dl || !blob) throw dl ?? new Error('download failed');
      const buf = Buffer.from(await blob.arrayBuffer());
      const meta = await sharp(buf).metadata();
      if (!meta.width || meta.width <= 576) { skipped++; console.log(`  skip ${o.path}: already narrow`); continue; }

      const backupFile = join(BACKUP, bucket, o.path);
      mkdirSync(dirname(backupFile), { recursive: true });
      writeFileSync(backupFile, buf);

      for (const w of WIDTHS) {
        const small = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: w <= 480 ? 78 : 80, mozjpeg: true }).toBuffer();
        const { error } = await supabase.storage.from(bucket).upload(`${base}.v${w}.jpg`, small, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
        if (error) throw error;
      }
      const cp = await supabase.storage.from(bucket).copy(o.path, newPath);
      if (cp.error) throw cp.error;
      await repoint(bucket, o.path, newPath, refs);
      const rm = await supabase.storage.from(bucket).remove([o.path]);
      if (rm.error) console.log(`  note: ${o.path} converted but the old object was not removed (${rm.error.message})`);
      done++;
      saved += o.size;
      console.log(`  ok ${o.path} -> ${newPath}`);
    } catch (e) {
      skipped++;
      console.log(`  FAILED ${o.path}: ${e.message ?? e}`);
    }
  }
  console.log(`${bucket}: ${done} ${APPLY ? 'converted' : 'would be converted'}, ${skipped} skipped${APPLY ? `, originals backed up in ${BACKUP}` : ''}`);
  return saved;
}

async function main() {
  console.log(APPLY ? 'APPLY: this changes Storage and the database.' : 'DRY RUN: nothing is changed. Add --apply to do it.');
  for (const b of BUCKETS) await processBucket(b);
}

main().catch((e) => { console.error(e); process.exit(1); });
