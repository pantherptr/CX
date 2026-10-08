import { Fragment } from 'react';

export const SIGNAL_SEARCH_EVENT = 'signal:search';

const TOKEN = /(https?:\/\/[^\s]+|#[\p{L}\p{N}_]{2,40}|@[A-Za-z0-9_.]{3,30})/gu;
const TRAILING = /[.,;:!?)\]}'"»”]+$/;

/** A post's text with links, #hashtags and @mentions picked out: links open in
 *  a new tab, a hashtag opens SIGNAL's search for it, a mention is highlighted. */
export function PostText({ text }: { text: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        if (part.startsWith('http')) {
          const tail = part.match(TRAILING)?.[0] ?? '';
          const url = tail ? part.slice(0, -tail.length) : part;
          return (
            <Fragment key={i}>
              <a href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()} className="break-all font-medium text-accent-700 underline decoration-accent-bright/40 underline-offset-2 hover:decoration-accent-bright">
                {url.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
              {tail}
            </Fragment>
          );
        }
        if (part.startsWith('#')) {
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent(SIGNAL_SEARCH_EVENT, { detail: part }));
              }}
              className="font-medium text-accent-700 hover:underline"
            >
              {part}
            </button>
          );
        }
        return <span key={i} className="font-medium text-accent-700">{part}</span>;
      })}
    </>
  );
}
