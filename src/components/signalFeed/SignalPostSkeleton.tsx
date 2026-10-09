/** A skeleton placeholder shaped like `SignalPostCard`, shown while the
 *  initial feed/pinned/stories fetch is in flight — reuses the same
 *  `.skeleton` shimmer utility already used across the app, so the loading
 *  moment reads as "the page itself, not yet filled in". */
export function SignalPostSkeleton() {
  return (
    <div className="overflow-hidden border-b border-line bg-surface">
      <div className="flex items-center gap-3 px-4 pb-2.5 pt-3.5 sm:px-5">
        <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-40 rounded-md" />
        </div>
      </div>
      <div className="space-y-2 px-4 pb-3 sm:px-5">
        <div className="skeleton h-3.5 w-full rounded-md" />
        <div className="skeleton h-3.5 w-4/5 rounded-md" />
      </div>
      <div className="skeleton mx-4 mb-3 aspect-[4/3] rounded-2xl sm:mx-5" />
      <div className="flex items-center gap-4 px-4 pb-4 sm:px-5">
        <div className="skeleton h-6 w-6 rounded-full" />
        <div className="skeleton h-6 w-6 rounded-full" />
        <div className="skeleton ml-auto h-6 w-6 rounded-full" />
      </div>
    </div>
  );
}
