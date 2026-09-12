import { useState } from 'react';
import { SignalPostCard } from '../../components/signalFeed/SignalPostCard';
import type { EmpirePost } from '../../lib/data/empireFeed';

/**
 * Dev-only layout fixture — NOT a real feed, NOT connected to Supabase,
 * NOT reachable in production. Registered in App.tsx only behind
 * `import.meta.env.DEV`, which Vite statically replaces with `false` in
 * a production build, so this route (and this whole file, once treeshaken)
 * never ships. Its only job is letting the Owner eyeball how large real
 * numbers will wrap and truncate before that day arrives. Since the
 * "no public engagement counters" redesign, the only place a number
 * renders at all is the Owner/Admin-only "Performance" line — so this
 * renders with `canManage: true` to actually exercise that layout;
 * every number below is a hardcoded fixture for that purpose, nothing
 * here is generated, seeded, or grown over time.
 *
 * These posts don't exist in the database, so SignalPostCard's own
 * fire-and-forget view/impression tracking calls will fail silently on
 * the foreign-key constraint (empire_post_views/empire_posts.id) each
 * time a card mounts — a harmless no-op, not a real error, and not worth
 * special-casing the real component for a throwaway dev fixture.
 */

function mockPost(overrides: Partial<EmpirePost>): EmpirePost {
  return {
    id: overrides.id ?? 'preview',
    authorId: 'preview',
    authorName: 'CX Rent',
    authorAvatarUrl: null,
    authorRole: 'owner',
    category: 'announcement',
    title: 'Layout fixture — not a real post',
    body: 'This card only exists to check how large numbers wrap and truncate. It is never fetched from the database.',
    mediaPaths: [],
    mediaUrls: [],
    isPinned: false,
    isFeatured: false,
    commentsDisabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    viewCount: 0,
    shareCount: 0,
    likedByMe: false,
    savedByMe: false,
    publisherType: 'cx',
    ...overrides,
  };
}

function initialFixtures(): EmpirePost[] {
  return [
    // Already Respected/Saved from the start — tapping Respect/Save on a
    // fake id round-trips to the real toggle RPCs, which correctly fail
    // (no such post exists) and revert the optimistic update, so the
    // *resting* active style needs to be seeded rather than clicked into.
    mockPost({ id: 'small', likeCount: 3, viewCount: 12, saveCount: 1, shareCount: 0, likedByMe: true, savedByMe: true }),
    mockPost({ id: 'thousands', likeCount: 2847, viewCount: 9163, saveCount: 412, shareCount: 88 }),
    mockPost({ id: 'six-figures', likeCount: 89201, viewCount: 127483, saveCount: 15092, shareCount: 4021 }),
    mockPost({ id: 'ceiling', likeCount: 149999, viewCount: 149999, saveCount: 99999, shareCount: 49999 }),
  ];
}

const LABELS: Record<string, string> = {
  small: 'Small numbers — Respected + Saved (resting active style)',
  thousands: 'Thousands',
  'six-figures': 'Six figures',
  ceiling: 'Near the 149,999 ceiling discussed for a future real system',
};

export default function SignalMetricsPreview() {
  const [key, setKey] = useState(0);
  // Real component state, not a static prop — Respect/Save need to
  // actually toggle here for this fixture to demonstrate the interaction
  // (not just its resting layout), the same way a real feed's onChanged
  // patches its own list.
  const [posts, setPosts] = useState<EmpirePost[]>(initialFixtures);

  const patchPost = (id: string, updated: EmpirePost) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? updated : p)));
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl bg-bg px-3 py-6 sm:px-4">
      <div className="mb-5 rounded-xl border border-line bg-panel p-3 text-detail text-ink-soft">
        <p className="font-semibold text-ink">Dev-only layout fixture</p>
        <p className="mt-1">
          Hardcoded numbers, not connected to any data or growth simulation. Only reachable in a dev build
          (<code>import.meta.env.DEV</code>) — absent entirely from production. Tapping Respect/Save still
          calls the real toggle RPC, which correctly rejects these fake ids and reverts — the first card
          starts already Respected/Saved so that resting active style is checkable without relying on it.
        </p>
        <button onClick={() => { setKey((k) => k + 1); setPosts(initialFixtures()); }} className="btn btn-secondary btn-sm mt-2">
          Re-mount cards (replay animations)
        </button>
      </div>

      {posts.map((post) => (
        <div key={`${post.id}-${key}`} className="mb-2">
          <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-muted">{LABELS[post.id]}</p>
          <SignalPostCard
            post={post}
            canManage
            onChanged={(updated) => patchPost(post.id, updated)}
            onDeleted={() => {}}
          />
        </div>
      ))}
    </div>
  );
}
