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
| `/how-it-works`, `/about` | Marketing pages |

## Design system

A sophisticated neutral palette — warm off-white surfaces, near-black ink, hairline borders,
soft layered shadows — with a single confident brand accent (Velora green). Type is
**Clash Display** for headlines and **Satoshi** for UI. Tokens, buttons, cards, inputs, chips
and badges are defined once in `src/index.css` and reused everywhere.

## Notes

- All data is mock (`src/data/`). No backend; the payment step is a realistic mock and takes
  no real payment.
- Car imagery is sourced from Unsplash and matched to each vehicle's body style.
- Interactions — search, filtering, sorting, favouriting, the booking flow, the listing
  wizard, messaging, toasts, modals and mobile navigation — are all functional.
