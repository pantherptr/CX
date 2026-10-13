#!/usr/bin/env node
/**
 * Recompress the photos already sitting in a Supabase Storage bucket, in place (same path, so no link in
 * the database changes). New uploads are already shrunk by the app (src/lib/shrinkImage.ts); this is for
 * what was uploaded before that, which is what keeps burning the storage traffic quota.
 *
 *   node scripts/recompress-images.mjs                       # lists the buckets
 *   node scripts/recompress-images.mjs --bucket=empire-media # DRY RUN: what it would save, touches nothing
 *   node scripts/recompress-images.mjs --bucket=empire-media --apply   # does it (originals saved locally first)
 *
 * Options: --max=1920 (longest side, px)  --quality=82  --min-kb=400 (leave smaller files alone)
 *          --backup=./image-backup (where originals go before an --apply)  --limit=500
 *
 * Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local — the key stays on this computer
 * and is never printed. Private documents (identity, licence) are refused unless you pass --i-know.
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

const MAX = Number(args.max ?? 1920);
const QUALITY = Number(args.quality ?? 82);
const MIN_BYTES = Number(args['min-kb'] ?? 400) * 1024;
const LIMIT = Number(args.limit ?? 500);
const BACKUP = String(args.backup ?? './image-backup');
const APPLY = args.apply === true;
const PRIVATE = /verif|identity|licen|document|passport|id-card/i;
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
      else out.push({ path: p, size: o.metadata?.size ?? 0, type: o.metadata?.mimetype ?? '' });
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

async function main() {
  if (!args.bucket) {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    console.log('Buckets:');
    for (const b of data) console.log(`  ${b.name}${b.public ? '' : '  (private)'}`);
    console.log('\nPick one:  node scripts/recompress-images.mjs --bucket=<name>');
    return;
  }
  const bucket = String(args.bucket);
  if (PRIVATE.test(bucket) && !args['i-know']) {
    console.error(`"${bucket}" looks like private documents. Refusing (pass --i-know if you really mean it).`);
    process.exit(1);
  }
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} on "${bucket}" — max ${MAX}px, quality ${QUALITY}, files over ${Math.round(MIN_BYTES / 1024)} KB`);
  const all = (await listAll(bucket)).filter((o) => /\.(jpe?g|png|webp)$/i.test(o.path) && o.size >= MIN_BYTES);
  const todo = all.sort((a, b) => b.size - a.size).slice(0, LIMIT);
  console.log(`${all.length} large images found; looking at the biggest ${todo.length}.`);

  let before = 0;
  let after = 0;
  let changed = 0;
  for (const o of todo) {
    const { data, error } = await supabase.storage.from(bucket).download(o.path);
    if (error || !data) { console.log(`  skip ${o.path}: ${error?.message ?? 'no data'}`); continue; }
    const input = Buffer.from(await data.arrayBuffer());
    const isPng = /\.png$/i.test(o.path);
    const isWebp = /\.webp$/i.test(o.path);
    let pipe = sharp(input).rotate().resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
    pipe = isPng ? pipe.png({ compressionLevel: 9, palette: true, quality: QUALITY }) : isWebp ? pipe.webp({ quality: QUALITY }) : pipe.jpeg({ quality: QUALITY, mozjpeg: true });
    const out = await pipe.toBuffer();
    before += input.length;
    if (out.length > input.length * 0.85) { after += input.length; continue; } // not worth touching
    after += out.length;
    changed++;
    console.log(`  ${o.path}  ${(input.length / 1024).toFixed(0)} KB → ${(out.length / 1024).toFixed(0)} KB`);
    if (APPLY) {
      const dest = join(BACKUP, bucket, o.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, input);
      const { error: upErr } = await supabase.storage.from(bucket).upload(o.path, out, {
        upsert: true,
        cacheControl: '31536000',
        contentType: isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg',
      });
      if (upErr) console.log(`    could not replace: ${upErr.message}`);
    }
  }
  console.log(`\n${changed} images ${APPLY ? 'recompressed' : 'would be recompressed'}: ${mb(before)} → ${mb(after)} (saves ${mb(before - after)}).`);
  if (!APPLY) console.log('Nothing was changed. Add --apply to do it (originals are copied to ' + BACKUP + ' first).');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
