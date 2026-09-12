export type CommunityDiscoveryFilter = 'new' | 'hosts' | 'verified_clients' | 'vehicles' | 'popular';

const FILTERS: { value: CommunityDiscoveryFilter; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'hosts', label: 'Hosts' },
  { value: 'verified_clients', label: 'Verified Clients' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'popular', label: 'Popular' },
];

/** Community's own simple discovery row — same minimal horizontal-pill
 *  pattern as `SignalCategoryFilter` (Official's own filter), not a
 *  second design language. Deliberately just five real, honest filters
 *  mapping onto data that already exists (author_is_host/
 *  author_is_verified_client from every feed row, the existing
 *  `category = 'new_car'` filter, and the existing Trending scoring) —
 *  no discovery algorithm, no new backend concept per the brief's own
 *  "do not create a complex social algorithm." */
export function SignalCommunityDiscoveryFilter({
  value,
  onChange,
}: {
  value: CommunityDiscoveryFilter;
  onChange: (filter: CommunityDiscoveryFilter) => void;
}) {
  return (
    <div className="no-scrollbar mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-caption font-semibold uppercase tracking-wide transition-colors ${
            value === f.value ? 'bg-ink text-white' : 'bg-panel text-ink-soft hover:bg-panel-2'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
