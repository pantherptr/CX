/** A skeleton placeholder shaped like `SignalPostCard`, shown while the
 *  initial feed/pinned/stories fetch is in flight — reuses the same
 *  `.skeleton` shimmer utility already used across the app (see
 *  `StatCardSkeleton` in DashboardShell.tsx) instead of a bare spinner,
 *  so the loading moment reads as "the page itself, not yet filled in"
 *  rather than a generic loading screen. */
export function SignalPostSkeleton() {
  return (
    <div className="card mb-5 overflow-hidden rounded-3xl p-0 shadow-[0_20px_48px_-24px_rgba(0,0,0,0.34)] ring-1 ring-black/[0.06]">
      <div className="flex items-center gap-3 p-3 pb-2 sm:px-4">
        <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-32 rounded-md" />
          <div className="skeleton h-3 w-20 rounded-md" />
        </div>
      </div>
      <div className="space-y-2 px-3 pb-3 sm:px-4">
        <div className="skeleton h-3.5 w-full rounded-md" />
        <div className="skeleton h-3.5 w-4/5 rounded-md" />
      </div>
      <div className="skeleton mx-3 mb-3 aspect-[4/3] rounded-2xl sm:mx-4" />
      <div className="flex items-center gap-4 px-4 pb-4">
        <div className="skeleton h-6 w-6 rounded-full" />
        <div className="skeleton h-6 w-6 rounded-full" />
        <div className="skeleton ml-auto h-6 w-6 rounded-full" />
      </div>
    </div>
  );
}
