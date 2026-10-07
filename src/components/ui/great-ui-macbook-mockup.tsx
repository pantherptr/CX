import { type ReactNode, type Ref } from 'react';
import { motion } from '../motionKit';

/** The Great UI MacBook messaging mock-up — look and layout kept exactly as
 *  designed (laptop frame, WhatsApp-style dual pane), made data-driven so
 *  the Messages page can feed it real conversations instead of the demo
 *  script. The sidebar list, the open chat's header, the message stream
 *  (`children`) and the composer (`composer`) all come from the caller. */

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

const SearchIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const FilterIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
const MoreVerticalIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);
const StatusCircleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
  </svg>
);
const NewChatIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="12" y1="8" x2="12" y2="14" />
    <line x1="9" y1="11" x2="15" y2="11" />
  </svg>
);
export const LockIcon = ({ className = 'w-3 h-3' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
export const DoubleCheckIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 11" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.045 0.584961L11.9883 1.52829L5.85833 7.65829L2.55833 4.35829L3.50167 3.41496L5.85833 5.77163L11.045 0.584961ZM14.345 0.584961L15.2883 1.52829L9.15833 7.65829L8.215 6.71496L14.345 0.584961ZM9.15833 9.54496L5.85833 6.24496L6.80167 5.30163L9.15833 7.65829L14.345 2.47163L15.2883 3.41496L9.15833 9.54496Z" />
  </svg>
);

export interface SidebarChatItem {
  id: string;
  name: string;
  initial: string;
  avatarUrl?: string | null;
  lastMsg: string;
  time: string;
  unreadCount?: number;
  isActive?: boolean;
}

export interface MacbookMockupProps {
  headerTitle: string;
  headerSubtitle?: ReactNode;
  avatarUrl?: string | null;
  avatarFallback?: string;
  userAvatarUrl?: string | null;
  chats: SidebarChatItem[];
  onSelectChat?: (id: string) => void;
  search?: string;
  onSearch?: (q: string) => void;
  onNewChat?: () => void;
  /** The message stream. */
  children?: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  /** The bottom bar — defaults to the static "Write a message…" bar. */
  composer?: ReactNode;
  headerAction?: ReactNode;
  className?: string;
}

const Avatar = ({ url, alt, initial, className }: { url?: string | null; alt: string; initial: string; className: string }) => (
  <div className={className}>
    {url ? <img src={url} alt={alt} className="h-full w-full rounded-full object-cover" /> : <span>{initial}</span>}
  </div>
);

export function MacbookMockup({
  headerTitle,
  headerSubtitle = '',
  avatarUrl,
  avatarFallback = 'A',
  userAvatarUrl,
  chats,
  onSelectChat,
  search = '',
  onSearch,
  onNewChat,
  children,
  scrollRef,
  composer,
  headerAction,
  className,
}: MacbookMockupProps) {
  return (
    <div
      className={cx(
        'relative mx-auto flex w-full max-w-[480px] transform-gpu flex-col items-center justify-center py-4 [perspective:1200px] sm:max-w-[680px] md:max-w-[920px] lg:max-w-[1120px]',
        className,
      )}
    >
      <motion.div
        initial={{ rotateX: -70, opacity: 0, scale: 0.92 }}
        animate={{ rotateX: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 20, mass: 0.9 }}
        style={{ transformOrigin: 'bottom center' }}
        className="relative z-10 flex h-[360px] w-full transform-gpu flex-col overflow-hidden rounded-t-2xl bg-neutral-900 p-2 sm:h-[470px] sm:p-2.5 md:h-[580px] lg:h-[680px] dark:bg-neutral-950"
      >
        <div className="relative isolate flex h-full w-full transform-gpu overflow-hidden rounded-t-[10px] bg-white text-neutral-900 transition-colors">
          {/* Sidebar */}
          <div className="flex w-[170px] shrink-0 flex-col bg-[#f6f7f5] transition-colors sm:w-[220px] md:w-[300px] lg:w-[340px]">
            <div className="flex shrink-0 items-center justify-between bg-[#f6f7f5] px-3 py-2">
              <Avatar url={userAvatarUrl} alt="You" initial="Y" className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-ink text-[13.5px] font-bold text-white" />
              <div className="flex items-center gap-2.5 text-neutral-600">
                <span className="transition-colors hover:text-accent"><StatusCircleIcon /></span>
                {onNewChat ? (
                  <button type="button" onClick={onNewChat} aria-label="New message" className="transition-colors hover:text-accent"><NewChatIcon /></button>
                ) : (
                  <span className="transition-colors hover:text-accent"><NewChatIcon /></span>
                )}
                <span className="transition-colors hover:text-accent"><MoreVerticalIcon /></span>
              </div>
            </div>

            <div className="p-2">
              <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-[13.5px] text-neutral-400">
                <SearchIcon className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                {onSearch ? (
                  <input
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="Search conversations"
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] text-neutral-800 outline-none placeholder:text-neutral-400"
                  />
                ) : (
                  <span className="truncate text-[12.5px]">Search conversations</span>
                )}
                <FilterIcon className="ml-auto h-3 w-3 shrink-0 text-neutral-400" />
              </div>
            </div>

            <div className="flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectChat?.(chat.id)}
                  onKeyDown={(e) => (e.key === 'Enter' ? onSelectChat?.(chat.id) : undefined)}
                  className={cx(
                    'relative flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors',
                    chat.isActive ? 'bg-accent-050' : 'hover:bg-neutral-200/40',
                  )}
                >
                  {chat.isActive && <div className="absolute top-0 bottom-0 left-0 w-1 bg-accent" />}
                  <Avatar url={chat.avatarUrl} alt={chat.name} initial={chat.initial} className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-[13.5px] font-bold text-white sm:h-10 sm:w-10" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-[13.5px] font-semibold text-neutral-900">{chat.name}</span>
                      <span className="shrink-0 text-[11px] text-neutral-400">{chat.time}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-neutral-500">{chat.lastMsg}</p>
                  </div>
                  {!!chat.unreadCount && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                      {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-[#f1f2ee] transition-colors">
            <div className="z-10 flex shrink-0 items-center justify-between bg-[#f6f7f5] px-3.5 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar url={avatarUrl} alt={headerTitle} initial={avatarFallback} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-[13.5px] font-bold text-white" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] leading-tight font-semibold text-neutral-900">{headerTitle}</span>
                  <span className="truncate text-[12px] font-medium text-accent">{headerSubtitle}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-neutral-600">
                {headerAction}
                <span className="transition-colors hover:text-accent"><SearchIcon /></span>
                <span className="transition-colors hover:text-accent"><MoreVerticalIcon /></span>
              </div>
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-end overflow-hidden p-3.5">
              <div ref={scrollRef} className="h-full w-full [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden">
                {children}
              </div>
            </div>

            {composer ?? (
              <div className="z-10 flex shrink-0 items-center gap-2 bg-[#f6f7f5] p-2.5">
                <div className="flex-1 rounded-lg bg-white px-3 py-1.5 text-[13.5px] text-neutral-400">Write a message…</div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <div className="relative z-20 flex h-3.5 w-[520px] max-w-full items-start justify-center rounded-b-xl bg-neutral-300 sm:h-4 sm:w-[670px] md:w-[980px] lg:w-[1200px]">
        <div className="h-1.5 w-14 rounded-b-md bg-neutral-400/90 sm:w-20" />
      </div>
    </div>
  );
}

export default MacbookMockup;
