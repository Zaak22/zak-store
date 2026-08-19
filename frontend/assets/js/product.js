/* Checkout controller: package → details → payment → order.
   The whole page is driven by admin-configured data. */
(() => {
  let SETTINGS = null;
  let METHODS = [];
  let PRODUCT = null;
  let ME = null;          // signed-in customer, if any
  let pkg = null;         // selected package
  let method = null;      // selected payment method

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const currency = () => I18N.pick(SETTINGS, 'currency');

  /* ------------------------------------------------ rendering */
  function applyTheme(s) {
    const root = document.documentElement.style;
    root.setProperty('--brand', s.color_primary);
    root.setProperty('--accent', s.color_accent);
    root.setProperty('--bg', s.color_bg);
    document.body.classList.toggle('no-motion', !s.animations_enabled);
  }

  function renderChrome() {
    $('#logoMark').textContent = SETTINGS.logo_emoji || '🚀';
    $('#brandName').textContent = I18N.pick(SETTINGS, 'brand_name');
    $('#brandTagline').textContent = I18N.pick(SETTINGS, 'tagline');
    $('#checkoutNote').textContent = I18N.pick(SETTINGS, 'checkout_note');
    document.title = `${I18N.pick(PRODUCT, 'name')} — ${I18N.pick(SETTINGS, 'brand_name')}`;
  }

  function renderAccount() {
    const banner = $('#acctBanner');
    const guest = $('#guestFields');
    const hint = $('#trackHint');

    if (ME) {
      banner.hidden = false;
      $('#acctWho').textContent = `${ME.name} · ${ME.email}`;
      guest.hidden = true;
      hint.hidden = true;
      $('#acctLink').textContent = I18N.t('my_orders');
    } else {
      banner.hidden = true;
      guest.hidden = false;
      hint.hidden = false;
      $('#acctLink').textContent = I18N.t('nav_account');
    }
  }

  function renderProduct() {
    $('#pName').textContent = I18N.pick(PRODUCT, 'name');
    $('#pDesc').textContent = I18N.pick(PRODUCT, 'description') || I18N.pick(PRODUCT, 'subtitle');

    const wrap = $('#pImgWrap');
    wrap.innerHTML = PRODUCT.image_url
      ? `<img src="${esc(PRODUCT.image_url)}" alt="" style="inline-size:100%;block-size:100%;object-fit:cover"
           onerror="this.replaceWith(document.createTextNode('🎮'))">`
      : '🎮';

    // The identifier field label/placeholder/type all come from the DB.
    $('#refLabel').textContent = I18N.pick(PRODUCT, 'field_label');
    const input = $('#customerRef');
    input.placeholder = I18N.pick(PRODUCT, 'field_placeholder');
    input.type = ['text', 'number', 'email'].includes(PRODUCT.field_type) ? PRODUCT.field_type : 'text';
    if (PRODUCT.field_type === 'number') input.inputMode = 'numeric';
  }

  function renderPackages() {
    const grid = $('#pkgGrid');
    if (!PRODUCT.packages.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">—</div>`;
      return;
    }

    grid.innerHTML = PRODUCT.packages.map((p) => {
      const tag = I18N.pick(p, 'note') || (p.is_popular ? (I18N.get() === 'ar' ? 'الأكثر طلباً' : 'Popular') : '');
      return `
        <button type="button" class="pkg ${pkg?.id === p.id ? 'on' : ''}" data-id="${p.id}">
          ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
          <span class="label">${esc(I18N.pick(p, 'label'))}</span>
          <span class="price">${I18N.num(p.price)} ${esc(currency())}</span>
          ${p.old_price ? `<span class="old">${I18N.num(p.old_price)} ${esc(currency())}</span>` : ''}
        </button>`;
    }).join('');

    grid.querySelectorAll('.pkg').forEach((btn) => {
      btn.addEventListener('click', () => {
        pkg = PRODUCT.packages.find((p) => p.id === Number(btn.dataset.id)) || null;
        grid.querySelectorAll('.pkg').forEach((b) => b.classList.toggle('on', b === btn));
        openStep('info');
        syncSummary();
      });
    });
  }

  function renderMethods() {
    const tabs = $('#methodTabs');
    if (!METHODS.length) { tabs.innerHTML = ''; $('#methodBody').innerHTML = ''; return; }

    tabs.innerHTML = METHODS.map((m) =>
      `<button type="button" data-id="${m.id}" class="${method?.id === m.id ? 'on' : ''}">${esc(m.icon)} ${esc(I18N.pick(m, 'name'))}</button>`,
    ).join('');

    tabs.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        method = METHODS.find((m) => m.id === Number(btn.dataset.id)) || null;
        tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
        renderMethodBody();
        syncSummary();
      });
    });

    renderMethodBody();
  }

  function renderMethodBody() {
    const box = $('#methodBody');
    if (!method) { box.innerHTML = ''; return; }

    const intro = I18N.pick(method, 'instructions');
    let inner = '';

    if (method.kind === 'qr' && method.qr_image) {
      inner = `
        <div class="qr-wrap">
          <img src="${esc(method.qr_image)}" alt="QR">
          <div style="margin-block-start:14px">
            <a class="btn-ghost" style="padding:10px 20px;font-size:.85rem"
               href="${esc(method.qr_image)}" download="payment-qr">${esc(I18N.t('save_qr'))}</a>
          </div>
        </div>`;
    } else if (method.account_value) {
      inner = `
        <div class="copy-row">
          <code id="acctVal">${esc(method.account_value)}</code>
          <button type="button" class="btn-copy" id="copyBtn">${esc(I18N.t('copy'))}</button>
        </div>`;
    }

    box.innerHTML = `
      ${intro ? `<p style="color:var(--ink-dim);font-size:.9rem;line-height:1.7;margin:0 0 14px">${esc(intro)}</p>` : ''}
      ${inner}`;

    $('#copyBtn')?.addEventListener('click', async () => {
      const btn = $('#copyBtn');
      try {
        await navigator.clipboard.writeText(method.account_value);
      } catch {
        // Clipboard API needs a secure context — fall back to a hidden textarea.
        const ta = document.createElement('textarea');
        ta.value = method.account_value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        ta.remove();
      }
      btn.textContent = I18N.t('copied');
      Motion.toast(I18N.t('copied'), 'ok');
      setTimeout(() => { btn.textContent = I18N.t('copy'); }, 1800);
    });
  }

  /* ------------------------------------------------ step flow */
  function openStep(which) {
    if (which === 'info') {
      $('#stepInfo').classList.add('open');
      $('#stepPay').classList.add('open');
      $('#s1').classList.add('done');
      setTimeout(() => $('#s2').classList.add('done'), 220);
      setTimeout(() => $('#s3').classList.add('done'), 440);
      if (!method && METHODS.length) { method = METHODS[0]; renderMethods(); }
    }
  }

  function syncSummary() {
    $('#sumProduct').textContent = I18N.pick(PRODUCT, 'name');
    $('#sumPkg').textContent = pkg ? I18N.pick(pkg, 'label') : '—';
    $('#sumMethod').textContent = method ? I18N.pick(method, 'name') : '—';
    $('#sumTotal').textContent = pkg ? `${I18N.num(pkg.price)} ${currency()}` : '—';
    $('#submitBtn').disabled = !pkg;
  }

  /* ------------------------------------------------ validation */
  function validate() {
    let ok = true;

    const fail = (wrapSel, errSel, msg) => {
      $(wrapSel).classList.add('invalid');
      $(errSel).textContent = msg;
      ok = false;
    };

    // Guest checkout needs an identity; signed-in orders take it from the token.
    if (!ME) {
      const nameWrap = $('#nameField');
      const emailWrap = $('#emailField');
      nameWrap.classList.remove('invalid');
      emailWrap.classList.remove('invalid');

      if (!$('#custName').value.trim()) fail('#nameField', '#nameErr', I18N.t('err_required'));
      const email = $('#custEmail').value.trim();
      if (!email) fail('#emailField', '#emailErr', I18N.t('err_required'));
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('#emailField', '#emailErr', I18N.t('err_email'));
    }

    const refWrap = $('#refField');
    const ref = $('#customerRef');
    const refVal = ref.value.trim();
    refWrap.classList.remove('invalid');

    if (!refVal) {
      $('#refErr').textContent = I18N.t('err_required');
      refWrap.classList.add('invalid');
      ok = false;
    } else if (PRODUCT.field_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(refVal)) {
      $('#refErr').textContent = I18N.t('err_email');
      refWrap.classList.add('invalid');
      ok = false;
    }

    const rcp = $('#receipt');
    const rcpWrap = rcp.closest('.field');
    rcpWrap.classList.remove('invalid');
    if (!rcp.value.trim()) {
      $('#receiptErr').textContent = I18N.t('err_required');
      rcpWrap.classList.add('invalid');
      ok = false;
    }

    if (!ok) {
      document.querySelector('.field.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }

  /* ------------------------------------------------ submit */
  async function submit() {
    if (!pkg) { Motion.toast(I18N.t('choose_pkg_first'), 'bad'); return; }
    if (!validate()) return;

    const btn = $('#submitBtn');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span>${esc(I18N.t('sending'))}</span>`;

    try {
      const res = await API.post('/api/orders', {
        product_id: PRODUCT.id,
        package_id: pkg.id,
        customer_ref: $('#customerRef').value.trim(),
        receipt_number: $('#receipt').value.trim(),
        payment_method_id: method?.id ?? null,
        contact: $('#contact').value.trim(),
        lang: I18N.get(),
        customer_name: ME ? ME.name : $('#custName').value.trim(),
        customer_email: ME ? ME.email : $('#custEmail').value.trim(),
      }, ME ? 'customer?' : false);

      $('#okTitle').textContent = I18N.pick(SETTINGS, 'success_title');
      $('#okBody').textContent = I18N.pick(SETTINGS, 'success_body');
      $('#okCode').textContent = `${I18N.t('order_no')} #${res.id}`;
      $('#veil').classList.add('show');
      Motion.confetti();
    } catch (err) {
      I18N.init();          // honour the saved language even on the error path
      Motion.toast(err.message, 'bad');
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }

  /* ------------------------------------------------ boot */
  function renderAll() {
    renderChrome();
    renderAccount();
    renderProduct();
    renderPackages();
    renderMethods();
    syncSummary();
  }

  async function init() {
    I18N.mountToggle();
    Motion.initAll();

    const slug = new URLSearchParams(location.search).get('p');
    if (!slug) { location.replace('index.html'); return; }

    let boot;
    try {
      [boot, PRODUCT] = await Promise.all([
        API.get('/api/bootstrap'),
        API.get(`/api/products/${encodeURIComponent(slug)}`),
      ]);
    } catch (err) {
      $('#loader').innerHTML = `<div class="empty"><span class="ico">⚠️</span>
        ${esc(err.status === 404 ? I18N.t('not_found') : I18N.t('loading_fail'))}<br>
        <a href="index.html" class="btn-ghost" style="margin-block-start:16px">${esc(I18N.t('back'))}</a></div>`;
      return;
    }

    SETTINGS = boot.settings;
    METHODS = boot.payment_methods;

    // Optional: a signed-in customer skips the name/email fields entirely.
    if (API.getToken('customer')) {
      try { ME = await API.get('/api/customer/me', 'customer'); }
      catch { API.setToken('', 'customer'); }
    }

    I18N.init(SETTINGS.default_lang);
    applyTheme(SETTINGS);

    $('#loader').remove();
    $('#checkout').hidden = false;

    renderAll();
    Motion.refresh();

    $('#submitBtn').addEventListener('click', submit);
    document.addEventListener('langchange', renderAll);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
