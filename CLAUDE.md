# CX Rent / SIGNAL — project notes for whoever opens this folder

Read this first. It is the hand-off between sessions and between accounts.

## What this is
Car-rental marketplace + social feed ("SIGNAL"). Vite + React 19 + TypeScript, Tailwind v4, Supabase
(Postgres + Auth + Storage + Realtime), Vercel (Hobby plan), Capacitor iOS wrapper.
The owner of the project writes in **Italian** — answer in Italian. UI copy is English; translations
(it / ro / es) live in `src/lib/i18n/dict.ts` (`["en","it","ro","es"]` rows, after the
`// ---- Keychain + Roadbook ----` marker).

## Rules the owner set (follow them)
- **SQL migrations:** write the `.sql` file in `supabase/migrations/` and tell the owner to paste it in
  the Supabase SQL Editor. **Never** probe or modify the live database yourself.
- **Git:** commit and push routine changes straight to `main`; do not wait to be asked.
- **Typecheck with `npx tsc -b`** (the Vercel build runs `tsc -b && vite build`; `tsc --noEmit -p .`
  checks nothing). Unused variables/imports fail the deploy.
- Do not ask the owner to paste secrets/keys in chat. Stripe goes live, together with domain, Resend,
  social and legal pages, **only when the owner says the site is finished**.
- Browser pane is shared with the user: test in a separate tab, remove any temporary `/dev` routes.
- The mobile bottom dock is final and static (see `src/components/BottomNav.tsx`); do not change it
  unless asked.

## Hard limits
- **Vercel Hobby: max 12 serverless functions in `api/`** (currently 12). Add behaviour to an existing
  endpoint instead of creating a new file. `api/notify-message.ts` already serves: chat push,
  verification decisions (push + email), and "new listing to review" pushes.
- Supabase quota is tight (free plan): avoid unbounded selects, keep images resized
  (`src/lib/shrinkImage.ts`).

## Migrations (all written; the owner runs them)
0098 collab · 0099 team boost notifications · 0100 sponsored posts · 0101 unpin community posts ·
0102 host commission + payout ledger · 0103 owner payout overview · 0104 chat photos/delete/report ·
0105 user devices · 0106 identity + licence verification · 0107 car catalogue (names/specs) ·
0108 listing review window (5 min) · 0109 precise pick-up point (lat/lng) · 0110 notifications inbox + web push + prefs · 0111 user language (+ localised DB-written texts) · 0112 signal push for every event · 0113 admins publish in SIGNAL only as the team (trigger) · 0114 SIGNAL search by car city/make/model · 0115 scheduled posts · 0116 welcome pass shown once to new members · 0117 verified handover + host-Respect-on-trip notification · 0118 admin view of verified handovers · 0119 return scan (second scan closes the trip) · 0120 locks the old game_stats_summary view · 0121 For-you ranking learns your cities/makes/hosts. The feed hook keeps the last feed (per person) in memory for 10 min so going away and back restores posts + scroll. A verified handover pays the host straight away (api/_lib/payout.ts via notify-message type `handover-payout`); the daily sweep still pays everything else after end_date.
Code is written to fail soft before a migration is run.

## Features worth knowing
- **Chat** (`src/pages/Messages.tsx`, `src/lib/data/messages.ts`): realtime, typing/online presence,
  photos (private bucket), delete own message, report, quick replies, thread cache. Phone layout follows
  the visual viewport through CSS vars (`--vv-top`, `--vv-h`); do not reintroduce transform/rAF chasing.
- **Auth** (`src/lib/auth.tsx`, `src/lib/sessionStorage.ts`): session manager re-verifies before signing
  out; storage mirrored to IndexedDB; devices list in Settings → Security.
- **Verification v2** (`src/components/VerificationFlow.tsx`, `src/components/admin/VerificationsPanel.tsx`):
  identity (ID/passport/permit/licence + selfie) and driving licence (front+back) reviewed separately;
  licence required before booking; rejection reasons go to the person as a CX chat message + push + email.
- **Listings**: catalogue pick (make/model/version/colour) + strict side-profile cover photo (camera with
  guide, `src/components/PoseCamera.tsx`) + exact pick-up pin (`LocationPicker`). Publish goes through a
  **5-minute team review window** (`promote_due_listings()` auto-publishes if nobody opened it).
  Admin → Review queue, Admin → Catalog.
- **Payments**: Stripe PaymentIntents + Apple Pay, Connect Express for hosts, daily sweep in
  `api/send-pickup-reminders.ts` (deposit release, host transfers, commission ledger). Sandbox keys until go-live.
- **Signal**: Official = team content only (no people suggestions there). Community has the people shelf.
- Home was trimmed to 8 blocks; CX Garage and its configurator were removed (`/garage` redirects).

## SIGNAL additions (latest)
- Ratings are not shown anywhere any more: stars were swapped for trip counts (cars, quick view, compare, filters,
  host dashboard, profiles). Per-review data still exists in the DB, just not displayed.
- Profiles: achievements (`SignalAchievements.tsx`; Golden Host = 25 trips), Book button on the host's car grid.
- Search: Trending hashtags / cities + Top this week when empty; 0114 lets it match car city/make/model.
- Creator tools: drafts (localStorage), scheduled posts (0115; published by whoever opens SIGNAL + the daily sweep),
  per-post insights sheet (`SignalPostInsights.tsx`).
- Reels: `/signal/reels` (`SignalReels.tsx`) = vertical feed of posts that contain a video.
- Admins who are not the Owner publish only as CX/Assistant (UI + trigger 0113).
- Installed app (PWA/native) opens on the normal home, country picked from the phone language (`src/lib/appMode.ts`).

## App feel (gestures, haptics, optimistic)
- Haptics: `haptics` in `src/lib/native.ts` (native in Capacitor; hidden `<input switch>` tick on iOS Safari 17.4+;
  Vibration API on Android). `vibrateTap()` in `components/motion.tsx` routes to it.
- Gestures: `EdgeSwipeBack` (installed PWA / `?app=1` only, not in the Capacitor shell); `Modal` sheets drag down from
  anywhere when scrolled to the top (`data-no-sheet-drag` opts out); mark own-gesture layers `data-no-edge-back`.
- Optimistic UI: Respect/save/follow/comments/poll votes/story respect/archive/profile pin update at once and roll back on error.

- Instant opens (X-style): `src/lib/data/seedCache.ts` keeps seen posts/profiles 10 min so a post or profile paints at
  once and refreshes behind; `prefetch.ts` starts a profile load on touch; `useWarmRoutes` (App.tsx) warms page chunks on idle;
  `scrollMemory.ts` + `ScrollToTop` restore scroll; the feed paints a device snapshot on cold start.

- Theme: the site theme is `cx-theme`; SIGNAL wears its own (`cx-signal-theme`, dark the first time) via
  `setInSignal` in `src/lib/theme.ts` (called from App.tsx on route change). Toggling inside SIGNAL only changes SIGNAL's.

## Tests (Playwright)
- `npm run test:e2e` (config `playwright.config.ts`, tests in `e2e/`): public pages × light/dark × phone/desktop —
  loads, nothing wider than the screen, no console errors, one-line hero, Italian copy, dark background.
  `E2E_BASE_URL=<preview url>` tests a deployed preview. `e2e/handover.spec.ts` needs two TEST accounts via env
  (`E2E_HOST_*`, `E2E_RENTER_*`, `E2E_BOOKING_ID`) and is skipped otherwise. Never put real credentials in git.

## Notifications (migration 0110)
- Inbox: `app_notifications` (bell + /notifications "Updates" tab). API writes through `notifyUser()` in
  `api/_lib/push.ts` (inbox row + APNs + Web Push, honours `user_notification_prefs`); DB functions use
  `create_app_notification()`. Chat messages push but are not in the inbox (they have their own badge).
- Web Push: `public/sw.js`, `src/lib/webPush.ts`; env `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. iPhone needs the site on the Home Screen.
- Optional DB→push fan-out: fill `notify_config` (url + secret) and set `NOTIFY_FANOUT_SECRET` on Vercel.

## Languages
- UI is English-keyed: `src/lib/i18n/dict.ts` rows `[en, it, ro, es]` (+ `auto/*.json` for the rest, applied
  by the DOM translator). English is selectable from the country map (UK) and via "Continue in English".
- Dates/numbers follow the chosen language through `uiLocale()` (never hard-code `'en-GB'`; note `src/lib/format.ts`
  is imported by the server, so its imports need `.js`).
- Server-written texts (push, inbox, CX chat messages, emails) are per language: `api/_lib/texts.ts`,
  `cx_texts` table + `cx_text()` in SQL, `tx()` in `api/_lib/email.ts`. The app saves the language with
  `save_my_language` (see `NotificationToaster`).
- When you add UI text, add a row to `dict.ts` (it/ro/es) in the same change.

## Open items / ideas
- Go-live checklist (domain `cxworld.eu`, Resend sender domain, APNs keys for push, legal pages, Stripe live).
- Studio-image catalogue was set aside in favour of the host's own cover pose (admin image upload is hidden
  behind `STUDIO_IMAGES = false` in `CatalogPanel.tsx`).
- Existing cars do not have a precise pin yet (host can set it when creating; editing it in ManageCar is not built).
- Optional: push/email on new chat reports; geocoder provider with a key instead of public Photon.
