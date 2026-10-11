/* CX service worker — notifications only.
 * No caching and no fetch handler: it exists so the browser can show a notification (and open the
 * right page when it is tapped) while the site is closed. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'CX', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'CX';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png?v=2',
      badge: '/icons/icon-192.png?v=2',
      data: { url: data.url || '/' },
      tag: data.tag || undefined,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          w.focus();
          if ('navigate' in w) return w.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
