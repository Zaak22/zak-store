/* ------------------------------------------------------------------
   The ONE file you edit after deploying the backend.
   Point API_BASE at your FastAPI URL (no trailing slash).
   Leave it empty to use the same origin (local dev / single-host deploy).
   ------------------------------------------------------------------ */
window.APP_CONFIG = {
  // e.g. 'https://zak-store-api.onrender.com'
  API_BASE: '',
};

/* Local-development convenience: ?api=https://... retargets the backend
   without editing this file.

   Deliberately restricted to localhost. When this was allowed on any host, a
   single link — https://your-store.example/admin.html?api=https://attacker.tld
   — permanently repointed that browser's API base (it was persisted to
   localStorage), so the next admin sign-in POSTed the username and password,
   and every later bearer token, straight to the attacker. */
(() => {
  const LOCAL = ['localhost', '127.0.0.1', '[::1]', ''];
  if (!LOCAL.includes(location.hostname)) return;

  const override = new URLSearchParams(location.search).get('api');
  if (override) {
    window.APP_CONFIG.API_BASE = override.replace(/\/$/, '');
    try { sessionStorage.setItem('api_base', window.APP_CONFIG.API_BASE); } catch {}
    return;
  }
  // sessionStorage, not localStorage: the override dies with the tab.
  try {
    const saved = sessionStorage.getItem('api_base');
    if (saved && !window.APP_CONFIG.API_BASE) window.APP_CONFIG.API_BASE = saved;
  } catch {}
})();
