/* Service worker: receives Web Push messages, tells any open dashboard about
   them, and deep-links to the triggering order when clicked. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = { title: 'New order', body: '', url: '/admin.html', tag: 'order', orderId: null };
  if (event.data) {
    try { payload = { ...payload, ...event.data.json() }; }
    catch { payload.body = event.data.text(); }
  }

  event.waitUntil((async () => {
    // Nudge any dashboard that is already open so its bell updates instantly,
    // without waiting for the next poll.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'push', payload });
    }

    await self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url, orderId: payload.orderId },
      vibrate: [90, 50, 90],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const orderId = data.orderId;
  // Deep-link to the specific order; fall back to the orders list.
  const target = data.url || (orderId ? `/admin.html#order-${orderId}` : '/admin.html#orders');

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of clients) {
      if (client.url.includes('admin')) {
        // Already open: tell it which order to focus, then bring it forward.
        client.postMessage({ type: 'focus-order', orderId });
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
