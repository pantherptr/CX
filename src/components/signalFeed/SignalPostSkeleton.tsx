/** A skeleton placeholder shaped like `SignalPostCard`, shown while the
 *  initial feed/pinned/stories fetch is in flight — reuses the same
 *  `.skeleton` shimmer utility already used across the app (see
 *  `StatCardSkeleton` in DashboardShell.tsx) instead of a bare spinner,
 *  so the loading moment reads as "the page itself, not yet filled in"
 *  rather than a generic loading screen. */
export function SignalPostSkeleton() {
  return (
    <div className="card mb-2.5 overflow-hidden p-0">
      <div className="flex items-center gap-2.5 p-3 pb-2 sm:px-4">
        <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-32 rounded-md" />
          <div className="skeleton h-3 w-20 rounded-md" />
        </div>
      </div>
      <div className="space-y-2 px-3 pb-3 sm:px-4">
        <div className="skeleton h-3.5 w-full rounded-md" />
        <div className="skeleton h-3.5 w-4/5 rounded-md" />
      </div>
      <div className="skeleton aspect-[4/5] w-full" />
    </div>
  );
}
