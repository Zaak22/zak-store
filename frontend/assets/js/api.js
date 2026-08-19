/* Thin fetch wrapper: base URL, JSON, bearer token, readable errors. */
const API = (() => {
  // One-time cleanup: an earlier build persisted an ?api= override to
  // localStorage on any host. Drop it so a stale hijack cannot survive.
  try { localStorage.removeItem('api_base'); } catch {}

  const base = () => (window.APP_CONFIG?.API_BASE || '').replace(/\/$/, '');

  // Two independent sessions can coexist in one browser: the shop owner's
  // dashboard and a customer's storefront account.
  const KEYS = { admin: 'admin_token', customer: 'customer_token' };

  const getToken = (kind = 'admin') => {
    try { return localStorage.getItem(KEYS[kind] || KEYS.admin) || ''; } catch { return ''; }
  };
  const setToken = (t, kind = 'admin') => {
    const key = KEYS[kind] || KEYS.admin;
    try { t ? localStorage.setItem(key, t) : localStorage.removeItem(key); } catch {}
  };

  /** auth: false | true ('admin') | 'admin' | 'customer' | 'customer?' (optional) */
  async function request(path, { method = 'GET', body, auth = false } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    if (auth) {
      const optional = auth === 'customer?';
      const kind = auth === true ? 'admin' : String(auth).replace('?', '');
      const t = getToken(kind);
      if (!t && !optional) throw new ApiError('Not authenticated', 401);
      if (t) headers['Authorization'] = `Bearer ${t}`;
    }

    let res;
    try {
      res = await fetch(base() + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('Cannot reach the server. Check API_BASE and that the backend is running.', 0);
    }

    if (res.status === 204) return null;

    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }

    if (!res.ok) {
      const detail = (data && (data.detail ?? data.message)) || res.statusText;
      throw new ApiError(typeof detail === 'string' ? detail : JSON.stringify(detail), res.status);
    }
    return data;
  }

  class ApiError extends Error {
    constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status; }
  }

  return {
    ApiError, getToken, setToken, base,
    get: (p, auth = false) => request(p, { auth }),
    post: (p, body, auth = false) => request(p, { method: 'POST', body, auth }),
    put: (p, body, auth = false) => request(p, { method: 'PUT', body, auth }),
    patch: (p, body, auth = false) => request(p, { method: 'PATCH', body, auth }),
    del: (p, auth = false) => request(p, { method: 'DELETE', auth }),
  };
})();
