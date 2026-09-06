# Velora — Premium Car Rental Marketplace

**Rent the car. Own the journey.**

A polished, fully-interactive front-end demo of a premium European car-rental marketplace
where owners list their cars and customers browse, book and manage trips. Built to feel like
a real, established product — not a template.

## Stack

- **React 19 + TypeScript**
- **Vite** (dev server + build)
- **Tailwind CSS v4** (CSS-first design tokens in `src/index.css`)
- **React Router 7** (client-side routing)
- Zero UI dependencies — every component, icon and the earnings chart are hand-built.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build → dist/
npm run preview  # preview the production build
```

## What's inside

| Route | Page |
|-------|------|
| `/` | Homepage — hero + search, featured cars, categories, how-it-works, host CTA, testimonials |
| `/browse` | Marketplace with a full filter sidebar, sort, and mobile filter drawer |
| `/cars/:slug` | Car details — gallery + lightbox, specs, features, host, reviews, sticky booking card |
| `/book/:slug` | 4-step booking flow → confirmation |
| `/list-your-car` | 5-step host listing wizard → publish |
| `/dashboard` | Customer dashboard (trips, saved cars, stats, messages) |
| `/host` | Host dashboard (earnings chart, bookings table, reservations, fleet) |
| `/messages` | Two-pane chat with live send + auto-reply |
| `/settings` | Tabbed account settings |
| `/admin` | Platform admin — verification review queue, users, all bookings, all cars (admins only) |
| `/how-it-works`, `/about` | Marketing pages |

## Design system

A sophisticated neutral palette — warm off-white surfaces, near-black ink, hairline borders,
soft layered shadows — with a single confident brand accent (Velora green). Type is
**Clash Display** for headlines and **Satoshi** for UI. Tokens, buttons, cards, inputs, chips
and badges are defined once in `src/index.css` and reused everywhere.

## Notes

- Cars, hosts and marketing copy in `src/data/` are still mock; bookings, extras, messaging,
  verification and payments are backed by the real Supabase schema in `supabase/migrations/`.
- Payments are real Stripe, not a mock: `api/create-payment-intent.ts` prices the trip
  server-side and starts a charge, `api/stripe-webhook.ts` creates the booking only once
  Stripe confirms it succeeded (see the comments at the top of
  `supabase/migrations/0015_stripe_payments.sql` for why it's wired this way). Needs the
  Stripe env vars in `.env.example` filled in, and — because the payment step needs the
  `/api` serverless functions, which the plain Vite dev server doesn't run — local testing
  uses `vercel dev` instead of `npm run dev`, plus `stripe listen --forward-to
  localhost:3000/api/stripe-webhook` (Stripe CLI) for webhook delivery.
- Booking-confirmed and new-booking emails are real too (Resend — see `api/_lib/email.ts`),
  sent from `api/stripe-webhook.ts` right after a booking is created. Pickup/return reminders
  run on a daily schedule (`api/send-pickup-reminders.ts`, registered in `vercel.json`'s
  `crons`) rather than being triggered by the app. Needs `RESEND_API_KEY` filled in — without
  it, sends are skipped with a console warning instead of failing anything.
- Refundable security deposit: a Stripe authorization hold (not a charge — see
  `supabase/migrations/0019_security_deposit.sql`), placed right after the rental payment
  succeeds and shown to the renter on the payment step. Released automatically by the same
  daily sweep as the pickup/return reminders, the day after the trip ends; visible per-booking
  in the admin Bookings tab. No extra setup beyond the Stripe env vars above — but note
  authorization holds typically expire after ~7 days on the card network's side, so a hold on
  a rental longer than that can lapse before the trip is over (a known limitation, not a bug).
- Car imagery is sourced from Unsplash and matched to each vehicle's body style.
- Interactions — search, filtering, sorting, favouriting, the booking flow, the listing
  wizard, messaging, toasts, modals and mobile navigation — are all functional.
