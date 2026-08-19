/* Customer account: sign in / register, profile, and order history. */
(() => {
  let SETTINGS = null;
  let ME = null;
  let PAGE = { items: [], page: 1, pages: 1, total: 0, per_page: 10 };
  let filter = 'all';
  let mode = 'login';                 // login | register

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const currency = () => (SETTINGS ? I18N.pick(SETTINGS, 'currency') : '');
  const statusLabel = (s) => I18N.t(`st_${s}`) || s;

  const when = (iso) => new Date(iso).toLocaleString(
    I18N.get() === 'ar' ? 'ar-EG' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short' },
  );

  function applyTheme(s) {
    const root = document.documentElement.style;
    root.setProperty('--brand', s.color_primary);
    root.setProperty('--accent', s.color_accent);
    root.setProperty('--bg', s.color_bg);
    document.body.classList.toggle('no-motion', !s.animations_enabled);
  }

  function chrome() {
    // SETTINGS is null when the backend is unreachable. Without this guard the
    // TypeError rejected init() before render() ran, leaving a completely
    // blank page — no sign-in form and no error message.
    if (!SETTINGS) return;
    $('#logoMark').textContent = SETTINGS.logo_emoji || '🚀';
    $('#brandName').textContent = I18N.pick(SETTINGS, 'brand_name');
    $('#brandTagline').textContent = I18N.pick(SETTINGS, 'tagline');
    document.title = `${I18N.t(ME ? 'my_orders' : 'nav_account')} — ${I18N.pick(SETTINGS, 'brand_name')}`;
  }

  /* ───────────────────── auth form ───────────────────── */
  function renderAuth() {
    const isReg = mode === 'register';
    $('#page').innerHTML = `
      <div style="display:grid;place-items:center;min-block-size:60dvh">
        <div class="panel" style="inline-size:min(430px,100%)" data-reveal="0">
          <h1 style="font-size:1.4rem;font-weight:800;margin:0 0 6px;letter-spacing:-.02em">
            ${esc(I18N.t(isReg ? 'sign_up' : 'sign_in'))}
          </h1>
          <p style="color:var(--ink-faint);font-size:.88rem;margin:0 0 24px">
            ${esc(I18N.t('track_note'))}
          </p>

          <form id="authForm">
            ${isReg ? `
              <div class="field">
                <label data-i18n="full_name">${esc(I18N.t('full_name'))}</label>
                <input name="name" autocomplete="name" placeholder="${esc(I18N.t('name_ph'))}" required>
              </div>` : ''}

            <div class="field">
              <label>${esc(I18N.t('email'))}</label>
              <input name="email" type="email" autocomplete="email" placeholder="${esc(I18N.t('email_ph'))}" required>
            </div>

            <div class="field">
              <label>${esc(I18N.t('password'))}</label>
              <input name="password" type="password"
                     autocomplete="${isReg ? 'new-password' : 'current-password'}"
                     placeholder="${esc(I18N.t('password_ph'))}" required>
            </div>

            ${isReg ? `
              <div class="field">
                <label>${esc(I18N.t('phone'))}</label>
                <input name="phone" autocomplete="tel" placeholder="+963...">
              </div>` : ''}

            <div class="err-box" id="authErr" hidden></div>

            <button class="btn-glow" type="submit" style="inline-size:100%;margin-block-start:6px" id="authBtn">
              ${esc(I18N.t(isReg ? 'sign_up' : 'sign_in'))}
            </button>
          </form>

          <p style="text-align:center;font-size:.86rem;color:var(--ink-faint);margin:20px 0 0">
            ${esc(I18N.t(isReg ? 'have_account' : 'no_account'))}
            <button class="linkish" id="swapMode">${esc(I18N.t(isReg ? 'sign_in' : 'sign_up'))}</button>
          </p>
        </div>
      </div>`;

    $('#swapMode').addEventListener('click', () => { mode = isReg ? 'login' : 'register'; renderAuth(); });
    $('#authForm').addEventListener('submit', submitAuth);
    Motion.refresh($('#page'));
  }

  async function submitAuth(e) {
    e.preventDefault();
    const form = e.target;
    const btn = $('#authBtn');
    const err = $('#authErr');
    err.hidden = true;

    const body = Object.fromEntries(new FormData(form).entries());
    if (mode === 'register' && String(body.password).length < 6) {
      err.textContent = I18N.t('err_pw_short');
      err.hidden = false;
      return;
    }

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '…';
    try {
      const path = mode === 'register' ? '/api/customer/register' : '/api/customer/login';
      const res = await API.post(path, body);
      API.setToken(res.token, 'customer');
      ME = res.customer;
      await loadOrders();
      renderAccount();
      Motion.toast(`${I18N.t('welcome')} ${ME.name}`, 'ok');
      Motion.confetti(40);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* ───────────────────── order history ───────────────────── */
  async function loadOrders() {
    const qs = new URLSearchParams({ page: PAGE.page, per_page: PAGE.per_page });
    if (filter !== 'all') qs.set('status', filter);
    PAGE = { ...PAGE, ...(await API.get(`/api/customer/orders?${qs}`, 'customer')) };
  }

  function renderAccount() {
    chrome();
    const rows = PAGE.items;

    $('#page').innerHTML = `
      <div class="sec-head" data-reveal="0">
        <div>
          <h2>${esc(I18N.t('my_orders'))}</h2>
          <p>${esc(ME.name)} · ${esc(ME.email)}</p>
        </div>
        <button class="btn-ghost" id="signOut">${esc(I18N.t('sign_out'))}</button>
      </div>

      <div class="chips" style="margin-block-end:20px" data-reveal="1">
        ${['all', 'pending', 'paid', 'rejected'].map((k) => `
          <button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">
            ${esc(k === 'all' ? I18N.t('all') : statusLabel(k))}
          </button>`).join('')}
      </div>

      ${rows.length ? `
        <div class="order-list">
          ${rows.map((o, i) => `
            <a class="order-row" href="order.html?id=${o.id}" data-reveal="${i}">
              <span class="or-id">#${o.id}</span>
              <span class="or-main">
                <b>${esc(o.product_name)}</b>
                <small>${esc(o.package_label)} · ${esc(when(o.created_at))}</small>
              </span>
              <span class="or-amt">${I18N.num(o.price)} ${esc(o.currency || currency())}</span>
              <span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span>
              <span class="or-go" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </span>
            </a>`).join('')}
        </div>

        ${PAGE.pages > 1 ? `
          <div class="pager-lite" data-reveal="0">
            <button class="btn-ghost" id="prevPage" ${PAGE.page <= 1 ? 'disabled' : ''}>‹ ${esc(I18N.t('prev'))}</button>
            <span>${esc(I18N.t('page'))} ${PAGE.page} ${esc(I18N.t('of'))} ${PAGE.pages}</span>
            <button class="btn-ghost" id="nextPage" ${PAGE.page >= PAGE.pages ? 'disabled' : ''}>${esc(I18N.t('next'))} ›</button>
          </div>` : ''}
      ` : `
        <div class="empty" data-reveal="1">
          <span class="ico">📦</span>${esc(I18N.t('no_orders'))}<br>
          <a href="index.html" class="btn-glow" style="margin-block-start:18px">${esc(I18N.t('browse_now'))}</a>
        </div>`}
    `;

    $('#signOut').addEventListener('click', () => {
      API.setToken('', 'customer');
      ME = null;
      PAGE = { items: [], page: 1, pages: 1, total: 0, per_page: 10 };
      mode = 'login';
      renderAuth();
    });

    $$('[data-f]').forEach((b) => b.addEventListener('click', async () => {
      filter = b.dataset.f;
      PAGE.page = 1;
      await loadOrders();
      renderAccount();
    }));

    $('#prevPage')?.addEventListener('click', async () => { PAGE.page--; await loadOrders(); renderAccount(); });
    $('#nextPage')?.addEventListener('click', async () => { PAGE.page++; await loadOrders(); renderAccount(); });

    Motion.refresh($('#page'));
  }

  const render = () => (ME ? renderAccount() : renderAuth());

  /* ───────────────────── boot ───────────────────── */
  async function init() {
    I18N.mountToggle();
    Motion.initAll();

    try {
      const boot = await API.get('/api/bootstrap');
      SETTINGS = boot.settings;
      I18N.init(SETTINGS.default_lang);
      applyTheme(SETTINGS);
    } catch {
      I18N.init('ar');
      Motion.toast('Cannot reach the store backend', 'bad');
    }

    if (API.getToken('customer')) {
      try {
        ME = await API.get('/api/customer/me', 'customer');
        await loadOrders();
      } catch { API.setToken('', 'customer'); ME = null; }
    }

    chrome();
    render();
    document.addEventListener('langchange', render);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
