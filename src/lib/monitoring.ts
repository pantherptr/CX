/** Error monitoring (Sentry). Inert until VITE_SENTRY_DSN is set; the SDK is loaded lazily so it never
 *  weighs on the first paint. Personal data (emails, chat text, URLs with tokens) is stripped before sending. */
export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  // The local dev server (hot reloads mid-edit throw errors that are not real bugs) stays out of Sentry.
  if (!dsn || import.meta.env.DEV) return;
  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: 'production',
      tracesSampleRate: 0,
      ignoreErrors: [/ResizeObserver loop/, /Failed to fetch/, /Load failed/, /NetworkError/, /AbortError/],
      beforeSend(event) {
        if (event.user) event.user = { id: event.user.id };
        if (event.request?.url) event.request.url = event.request.url.split('?')[0];
        if (event.request) delete event.request.cookies;
        return event;
      },
    });
  }).catch(() => { /* monitoring must never break the app */ });
}
