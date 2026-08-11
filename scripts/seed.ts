/**
 * One-time seed: imports the existing demo catalogue (src/data/*) into a
 * real Supabase project so Browse isn't empty while real hosts sign up.
 *
 * Uses the service-role key (bypasses RLS) — never imported by client code,
 * only run locally via `npm run seed`. Safe to re-run: hosts are looked up
 * by email if they already exist; cars are only ever inserted, so re-running
 * after a partial seed will duplicate cars — see the note at the bottom.
 */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cars } from '../src/data/cars.ts';
import { hosts } from '../src/data/hosts.ts';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check .env.local.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Seeding ${Object.keys(hosts).length} hosts and ${cars.length} cars…\n`);

  const hostProfileId: Record<string, string> = {};

  for (const host of Object.values(hosts)) {
    const email = `${host.id}@velora.demo`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: host.name },
    });

    if (error) {
      const { data: list, error: listError } = await admin.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = list.users.find((u) => u.email === email);
      if (!existing) throw error;
      hostProfileId[host.id] = existing.id;
      console.log(`  · ${host.name}: already exists, reusing`);
    } else {
      hostProfileId[host.id] = data.user.id;
      console.log(`  · ${host.name}: created`);
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        avatar_url: host.avatar,
        bio: host.bio,
        joined: host.joined,
        rating: host.rating,
        trips: host.trips,
        response_time: host.responseTime,
        response_rate: host.responseRate,
        verified: host.verified,
        is_superhost: host.isSuperhost,
        is_host: true,
      })
      .eq('id', hostProfileId[host.id]);
    if (profileError) throw profileError;
  }

  console.log('');

  for (const car of cars) {
    const hostId = hostProfileId[car.hostId];
    if (!hostId) throw new Error(`No seeded host for car ${car.id} (hostId=${car.hostId})`);

    const { data: carRow, error: carError } = await admin
      .from('cars')
      .insert({
        slug: car.slug,
        host_id: hostId,
        make: car.make,
        model: car.model,
        trim: car.trim ?? null,
        year: car.year,
        category: car.category,
        city: car.city,
        location: car.location,
        price_per_day: car.pricePerDay,
        transmission: car.transmission,
        fuel: car.fuel,
        seats: car.seats,
        doors: car.doors,
        mileage: car.mileage,
        drive: car.drive,
        description: car.description,
        features: car.features,
        instant_book: car.instantBook,
        status: 'published',
        rating: car.rating,
        trips: car.trips,
      })
      .select('id')
      .single();
    if (carError) throw carError;

    const images = car.images.map((imgUrl, position) => ({
      car_id: carRow.id,
      url: imgUrl,
      position,
    }));
    const { error: imgError } = await admin.from('car_images').insert(images);
    if (imgError) throw imgError;

    const reviews = car.reviews.map((r) => ({
      car_id: carRow.id,
      rating: r.rating,
      body: r.body,
      author_name: r.author,
      author_avatar_url: r.avatar,
      author_location: r.location,
    }));
    const { error: reviewError } = await admin.from('reviews').insert(reviews);
    if (reviewError) throw reviewError;

    console.log(`  · ${car.make} ${car.model} (${car.slug}): seeded`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message ?? err);
  process.exit(1);
});
