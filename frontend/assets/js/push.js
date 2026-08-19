/* Web Push enrolment for the admin's browser.
   Requires: HTTPS (or localhost), a service worker, and VAPID keys on the server. */
const Push = (() => {
  const SW_PATH = 'sw.js';   // resolves against the page URL -> /sw.js at the site root

  const supported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  const secure = () =>
    window.isSecureContext ||
    location.protocol === 'https:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function status() {
    if (!supported()) return { supported: false, permission: 'unsupported', subscribed: false };
    let sub = null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      sub = reg ? await reg.pushManager.getSubscription() : null;
    } catch { /* registration may not exist yet */ }
    return { supported: true, permission: Notification.permission, subscribed: !!sub };
  }

  /**
   * Ask permission, subscribe, register the endpoint with the backend.
   *
   * IMPORTANT: requestPermission() must be the first thing we do. Browsers only
   * allow the permission prompt while the click's user activation is still
   * live, and any `await` on a network call spends it — which makes Chrome
   * refuse the prompt without ever showing it.
   */
  async function enable() {
    if (!supported()) throw new Error('This browser does not support push notifications.');
    if (!secure()) throw new Error('Push notifications require HTTPS (localhost is exempt).');

    if (Notification.permission === 'denied') {
      throw new Error('Notifications are blocked for this site. Click the padlock in the address bar → Notifications → Allow, then reload.');
    }

    // 1. Permission first, while the click activation is still valid.
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(`Notification permission was not granted (${permission}).`);

    // 2. Now the async work is safe.
    let key, enabled;
    try {
      ({ key, enabled } = await API.get('/api/push/public-key'));
    } catch (e) {
      throw new Error(`Cannot reach the backend for the VAPID key: ${e.message}`);
    }
    if (!enabled || !key) {
      throw new Error('The server has no VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, then restart the backend.');
    }

    // 3. Service worker.
    let reg;
    try {
      reg = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;
    } catch (e) {
      throw new Error(`Service worker registration failed: ${e.message}. Check that /sw.js is reachable and served as JavaScript.`);
    }

    // 4. Subscribe. If an old subscription used a different VAPID key, replace it.
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const existing = sub.options?.applicationServerKey;
      const wanted = urlBase64ToUint8Array(key);
      const same = existing && new Uint8Array(existing).length === wanted.length &&
        new Uint8Array(existing).every((b, i) => b === wanted[i]);
      if (!same) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      } catch (e) {
        throw new Error(`Could not subscribe to push: ${e.message}. This usually means the VAPID public key is malformed.`);
      }
    }

    // 5. Hand the endpoint to the backend.
    const json = sub.toJSON();
    await API.post('/api/admin/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      user_agent: navigator.userAgent,
    }, true);

    return true;
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return false;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    try { await API.post('/api/admin/push/unsubscribe', { endpoint }, true); } catch {}
    return true;
  }

  const test = () => API.post('/api/admin/push/test', {}, true);

  /** Every precondition, checked one by one, so a failure names itself. */
  async function diagnose() {
    const rows = [];
    const add = (label, ok, detail = '') => rows.push({ label, ok, detail });

    add('Browser supports service workers', 'serviceWorker' in navigator);
    add('Browser supports Push API', 'PushManager' in window);
    add('Browser supports Notifications', 'Notification' in window);
    add('Secure context (HTTPS or localhost)', secure(), `${location.protocol}//${location.host}`);

    const perm = 'Notification' in window ? Notification.permission : 'n/a';
    add('Notification permission', perm === 'granted', perm);

    // Is sw.js actually served, and as JavaScript?
    try {
      const res = await fetch(SW_PATH, { cache: 'no-store' });
      const ct = res.headers.get('content-type') || '';
      add('/sw.js reachable', res.ok, `HTTP ${res.status}`);
      add('/sw.js served as JavaScript', /javascript|ecmascript/i.test(ct), ct || 'no content-type');
    } catch (e) {
      add('/sw.js reachable', false, e.message);
    }

    let reg = null;
    try {
      reg = await navigator.serviceWorker.getRegistration();
      add('Service worker registered', !!reg, reg ? `scope ${reg.scope}` : 'not registered yet');
      if (reg) add('Service worker active', !!reg.active, reg.active ? reg.active.state : 'not active');
    } catch (e) {
      add('Service worker registered', false, e.message);
    }

    try {
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      add('Browser push subscription', !!sub, sub ? new URL(sub.endpoint).host : 'none');
    } catch (e) {
      add('Browser push subscription', false, e.message);
    }

    try {
      const { enabled, key } = await API.get('/api/push/public-key');
      add('Backend reachable', true, API.base() || 'same origin');
      add('Backend has VAPID keys', !!enabled, key ? `public key, ${key.length} chars` : 'not configured');
    } catch (e) {
      add('Backend reachable', false, e.message);
    }

    try {
      const subs = await API.get('/api/admin/push/subscriptions', true);
      add('Devices registered on the server', subs.length > 0, `${subs.length} device(s)`);
    } catch (e) {
      add('Devices registered on the server', false, e.message);
    }

    return rows;
  }

  return { supported, secure, status, enable, disable, test, diagnose };
})();
