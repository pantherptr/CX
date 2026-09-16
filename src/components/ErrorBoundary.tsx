import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './Icon';

/** The one thing standing between a real render-time error and a
 *  permanent blank white screen — this app had NO error boundary
 *  anywhere before this, so any uncaught error during render (a bad
 *  prop, an unexpected null field) or a failed lazy-route chunk (a stale
 *  module reference after this dev server hot-reloaded, or an old tab
 *  open across a real deploy) unmounted the entire React tree with
 *  nothing shown in its place — silent from the user's side, visible
 *  only as a console error a regular visitor never opens.
 *
 *  A failed dynamic `import()` — "Failed to fetch dynamically imported
 *  module" / "Importing a module script failed" — is specifically NOT a
 *  bug in the code that failed to load: it means the browser's already-
 *  cached JS no longer matches what the server has (the exact case that
 *  keeps happening through this session's own Vite hot-reloads, and the
 *  same thing a real visitor hits if their tab has been open since
 *  before the last deploy). The one correct fix for that is a real page
 *  reload — the browser fetches fresh assets and the same navigation
 *  just works — so this reloads once automatically rather than showing
 *  an error for something a reload silently resolves. Guarded by a
 *  session flag so a genuinely broken chunk (not just a stale one)
 *  reload-loops at most once, then falls through to the same fallback
 *  UI as any other error. */
const CHUNK_ERROR = /dynamically imported module|module script failed|Failed to fetch dynamically/i;
const CHUNK_RELOAD_FLAG = 'cx-chunk-reload';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (CHUNK_ERROR.test(error.message) && !sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
      sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
      window.location.reload();
      return;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  handleReload = () => {
    sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-panel text-muted">
            <Icon name="info" size={30} />
          </span>
          <h1 className="mt-6 font-display text-2xl font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 max-w-sm text-copy text-muted">
            This page hit an unexpected error. Reloading usually fixes it.
          </p>
          <div className="mt-7 flex gap-3">
            <button onClick={this.handleReload} className="btn btn-primary btn-lg">Reload page</button>
            <a href="/" className="btn btn-secondary btn-lg">Back home</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
