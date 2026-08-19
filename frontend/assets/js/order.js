/* Order details.
   Works for both audiences: a signed-in customer viewing their own order, and
   the shop owner arriving from the dashboard (who also gets status controls). */
(() => {
  let SETTINGS = null;
  let ORDER = null;
  let viewer = 'guest';               // customer | admin | guest

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const statusLabel = (s) => I18N.t(`st_${s}`) || s;
  const when = (iso) => new Date(iso).toLocaleString(
    I18N.get() === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'full', timeStyle: 'short' });

  function applyTheme(s) {
    const root = document.documentElement.style;
    root.setProperty('--brand', s.color_primary);
    root.setProperty('--accent', s.color_accent);
    root.setProperty('--bg', s.color_bg);
    document.body.classList.toggle('no-motion', !s.animations_enabled);
  }

  const STEPS = ['pending', 'paid'];

  function timeline(status) {
    if (status === 'rejected') {
      return `<div class="tl">
        <div class="tl-node done"><i>✓</i><span>${esc(I18N.t('st_pending'))}</span></div>
        <div class="tl-bar bad"></div>
        <div class="tl-node bad"><i>✕</i><span>${esc(I18N.t('st_rejected'))}</span></div>
      </div>`;
    }
    const at = STEPS.indexOf(status);
    return `<div class="tl">
      ${STEPS.map((step, i) => `
        ${i ? `<div class="tl-bar ${i <= at ? 'done' : ''}"></div>` : ''}
        <div class="tl-node ${i <= at ? 'done' : ''}">
          <i>${i <= at ? '✓' : i + 1}</i><span>${esc(statusLabel(step))}</span>
        </div>`).join('')}
    </div>`;
  }

  const row = (label, value, mono = false) => value
    ? `<div class="summary-row"><span>${esc(label)}</span><b${mono ? ' style="font-family:ui-monospace,monospace"' : ''}>${esc(value)}</b></div>`
    : '';

  function render() {
    if (!ORDER) return;
    const o = ORDER;
    document.title = `#${o.id} — ${I18N.pick(SETTINGS, 'brand_name')}`;

    $('#page').innerHTML = `
      <a class="back-link" href="${viewer === 'admin' ? 'admin.html#orders' : 'account.html'}">
        <span class="arrow"></span> ${esc(I18N.t(viewer === 'admin' ? 'back_orders' : 'my_orders'))}
      </a>

      <div class="order-head" data-reveal="0">
        <div>
          <h1>${esc(I18N.t('order_details'))} <span class="ohash">#${o.id}</span></h1>
          <p>${esc(when(o.created_at))}</p>
        </div>
        <span class="status ${esc(o.status)}" style="font-size:.9rem;padding:8px 16px">${esc(statusLabel(o.status))}</span>
      </div>

      <div class="panel" data-reveal="1">${timeline(o.status)}</div>

      <div class="order-grid">
        <div class="panel" data-reveal="2">
          <div class="panel-title">📦 ${esc(I18N.t('product'))}</div>
          ${row(I18N.t('product'), o.product_name)}
          ${row(I18N.t('package'), o.package_label)}
          ${row(I18N.t('player_id'), o.customer_ref, true)}
          <div class="summary-total">
            <span style="color:var(--ink-faint);font-size:.88rem">${esc(I18N.t('total'))}</span>
            <span class="amt">${I18N.num(o.price)} ${esc(o.currency)}</span>
          </div>
        </div>

        <div class="panel" data-reveal="3">
          <div class="panel-title">🧾 ${esc(I18N.t('pay_method'))}</div>
          ${row(I18N.t('pay_method'), o.payment_method_name || '—')}
          ${row(I18N.t('receipt'), o.receipt_number, true)}
          ${row(I18N.t('full_name'), o.customer_name)}
          ${row(I18N.t('email'), o.customer_email)}
          ${row(I18N.t('contact_label'), o.contact)}
        </div>
      </div>

      ${o.admin_note ? `<div class="panel" data-reveal="4">
        <div class="panel-title">💬 Note</div>
        <p style="margin:0;color:var(--ink-dim);font-size:.92rem;line-height:1.7">${esc(o.admin_note)}</p>
      </div>` : ''}

      ${viewer === 'admin' ? `
        <div class="panel" data-reveal="5">
          <div class="panel-title">⚙️ Admin actions</div>
          <div style="display:flex;gap:9px;flex-wrap:wrap;margin-block-end:16px">
            <button class="btn-glow" data-set="paid" style="padding:11px 22px;font-size:.87rem">✓ Mark paid</button>
            <button class="btn-ghost" data-set="rejected" style="padding:11px 22px;font-size:.87rem">✕ Reject</button>
            <button class="btn-ghost" data-set="pending" style="padding:11px 22px;font-size:.87rem">↺ Pending</button>
          </div>
          <div class="field" style="margin:0">
            <label>Internal note</label>
            <textarea id="adminNote" rows="2">${esc(o.admin_note || '')}</textarea>
          </div>
          <button class="btn-ghost" id="saveNote" style="margin-block-start:12px">Save note</button>
        </div>` : ''}
    `;

    document.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', async () => {
      try {
        ORDER = await API.patch(`/api/admin/orders/${o.id}`, { status: b.dataset.set }, 'admin');
        render();
        Motion.toast(`Order #${o.id} → ${b.dataset.set}`, 'ok');
      } catch (ex) { Motion.toast(ex.message, 'bad'); }
    }));

    $('#saveNote')?.addEventListener('click', async () => {
      try {
        ORDER = await API.patch(`/api/admin/orders/${o.id}`, { admin_note: $('#adminNote').value }, 'admin');
        render();
        Motion.toast('Note saved', 'ok');
      } catch (ex) { Motion.toast(ex.message, 'bad'); }
    });

    Motion.refresh($('#page'));
  }

  function fail(msg, showLogin = false) {
    $('#page').innerHTML = `<div class="empty">
      <span class="ico">🔒</span>${esc(msg)}
      ${showLogin ? `<br><a href="account.html" class="btn-glow" style="margin-block-start:18px">${esc(I18N.t('sign_in'))}</a>` : ''}
    </div>`;
  }

  async function init() {
    I18N.mountToggle();
    Motion.initAll();

    const id = new URLSearchParams(location.search).get('id');
    if (!id) { location.replace('account.html'); return; }

    try {
      const boot = await API.get('/api/bootstrap');
      SETTINGS = boot.settings;
      I18N.init(SETTINGS.default_lang);
      applyTheme(SETTINGS);
      $('#logoMark').textContent = SETTINGS.logo_emoji || '🚀';
      $('#brandName').textContent = I18N.pick(SETTINGS, 'brand_name');
      $('#brandTagline').textContent = I18N.pick(SETTINGS, 'tagline');
    } catch { I18N.init('ar'); }

    // Prefer the admin view when a dashboard session exists on this browser.
    if (API.getToken('admin')) {
      try { ORDER = await API.get(`/api/admin/orders/${id}`, 'admin'); viewer = 'admin'; } catch {}
    }
    if (!ORDER && API.getToken('customer')) {
      try { ORDER = await API.get(`/api/customer/orders/${id}`, 'customer'); viewer = 'customer'; } catch {}
    }

    if (!ORDER) { fail(I18N.t('not_found'), true); return; }

    render();
    document.addEventListener('langchange', render);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
