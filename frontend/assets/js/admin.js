/* Admin dashboard controller.
   Every storefront value lives here: catalogue, pricing, copy, theme, payments. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const money = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(v) || 0);
  const when = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  };

  const STATE = { settings: null, products: [], categories: [], methods: [], orders: [],
                  filter: 'all', search: '', notifs: [], unread: 0, pollTimer: null,
                  page: 1, perPage: 20, pages: 1, total: 0 };

  /* ═══════════════════════════ auth ═══════════════════════════ */
  async function tryRestore() {
    if (!API.getToken()) return false;
    try { await API.get('/api/auth/me', true); return true; } catch { API.setToken(''); return false; }
  }

  async function showDash() {
    $('#authView').hidden = true;
    $('#authView').style.display = 'none';
    $('#dashView').hidden = false;
    // Awaited: a deep link (#order-N) changes the page, and an in-flight
    // loadAll() would otherwise land afterwards and overwrite it.
    await loadAll();
  }

  function showLogin() {
    $('#dashView').hidden = true;
    $('#authView').hidden = false;
    $('#authView').style.display = '';
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const err = $('#loginErr');
    err.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const res = await API.post('/api/auth/login', { username: $('#u').value, password: $('#p').value });
      API.setToken(res.token);
      await showDash();
      // Also start here, not only on the restored-session path — an admin
      // who actually types their password got no notification polling.
      startLiveUpdates();
    } catch (ex) {
      err.textContent = ex.message;
      err.style.display = '';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    clearInterval(STATE.pollTimer);          // otherwise it polls on after signout
    STATE.pollTimer = null;
    API.setToken('');
    showLogin();
  });

  /* ═══════════════════════════ tabs ═══════════════════════════ */
  $$('.side-link[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
  });

  function selectTab(tab) {
    $$('.side-link[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.tab-panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === tab));
    $('#tabTitle').textContent = $(`.side-link[data-tab="${tab}"]`)?.textContent.trim().replace(/\d+$/, '') || tab;
    $('#side').classList.remove('open');
    if (!/^#order-\d+$/.test(location.hash)) location.hash = tab;
    if (tab === 'notify') { refreshPush(); refreshEmailState(); }
  }

  $('#sideToggle').addEventListener('click', () => $('#side').classList.toggle('open'));
  $('#refreshBtn').addEventListener('click', () => { loadAll(); Motion.toast('Refreshed', 'ok'); });

  /* ═══════════════════════════ modal ═══════════════════════════ */
  let onSave = null;

  function openModal(title, html, handler) {
    // Reset footer chrome on every open: the packages modal hides Save.
    $('#modalSave').style.display = '';
    $('#modalCancel').textContent = 'Cancel';

    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    onSave = handler;
    $('#modalVeil').classList.add('show');
  }

  function closeModal() { $('#modalVeil').classList.remove('show'); onSave = null; }

  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalVeil').addEventListener('click', (e) => { if (e.target === $('#modalVeil')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  $('#modalSave').addEventListener('click', async () => {
    if (!onSave) return;
    const btn = $('#modalSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await onSave();
      closeModal();
      await loadAll();
      Motion.toast('Saved', 'ok');
    } catch (ex) {
      Motion.toast(ex.message, 'bad');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  /* Collect a modal form into a plain object. */
  const collect = () => {
    const out = {};
    $$('#modalBody [name]').forEach((el) => {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
      else out[el.name] = el.value;
    });
    return out;
  };

  const fieldHtml = (name, label, value = '', type = 'text', extra = '') => `
    <div class="field ${extra.includes('wide') ? 'wide' : ''}">
      <label>${esc(label)}</label>
      ${type === 'textarea'
        ? `<textarea name="${name}" rows="2">${esc(value)}</textarea>`
        : `<input name="${name}" type="${type}" value="${esc(value)}">`}
    </div>`;

  const switchHtml = (name, label, on) => `
    <label class="switch" style="margin:6px 0">
      <input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="track"></span> ${esc(label)}
    </label>`;

  /* ═══════════════════════ data loading ═══════════════════════ */
  async function loadAll() {
    try {
      const [stats, products, categories, methods, settings] = await Promise.all([
        API.get('/api/admin/stats', true),
        API.get('/api/admin/products', true),
        API.get('/api/admin/categories', true),
        API.get('/api/admin/payment-methods', true),
        API.get('/api/admin/settings', true),
      ]);
      STATE.products = products;
      STATE.categories = categories;
      STATE.methods = methods;
      STATE.settings = settings;

      renderKpis(stats);
      renderSpark(stats.revenue_series);
      renderRecent(stats.recent);
      renderProducts();
      renderCategories();
      renderMethods();
      fillSettings(settings);

      const pill = $('#pendingPill');
      pill.textContent = stats.pending;
      pill.hidden = stats.pending === 0;

      await loadOrders();
      await loadNotifications();
    } catch (ex) {
      if (ex.status === 401) { API.setToken(''); showLogin(); return; }
      Motion.toast(ex.message, 'bad');
    }
  }

  /* ───────────── overview ───────────── */
  function renderKpis(s) {
    const cur = STATE.settings ? STATE.settings.currency_en : '';
    const cards = [
      { lbl: '🧾 Total orders', val: money(s.total_orders), cls: 'brandy' },
      { lbl: '⏳ Pending', val: money(s.pending), cls: 'warn' },
      { lbl: '✅ Paid', val: money(s.paid), cls: 'ok' },
      { lbl: '❌ Rejected', val: money(s.rejected), cls: 'bad' },
      { lbl: `💰 Revenue (${esc(cur)})`, val: money(s.revenue), cls: 'brandy' },
      { lbl: '📅 Last 24h', val: money(s.today_orders), cls: '' },
      { lbl: '📦 Products', val: money(s.products), cls: '' },
      { lbl: '📱 Push devices', val: money(s.subscriptions), cls: s.push_configured ? 'ok' : 'bad' },
    ];
    $('#kpis').innerHTML = cards.map((c, i) => `
      <div class="kpi ${c.cls}" data-reveal="${i}">
        <div class="lbl">${c.lbl}</div>
        <div class="val">${c.val}</div>
      </div>`).join('');
    Motion.refresh($('#kpis'));
  }

  function renderSpark(series) {
    const wrap = $('#sparkWrap');
    if (!series?.length) { wrap.innerHTML = '<p class="hint">No data yet.</p>'; return; }

    const W = 700, H = 90, pad = 6;
    const max = Math.max(...series.map((d) => d.value), 1);
    const step = series.length > 1 ? (W - pad * 2) / (series.length - 1) : 0;
    const pts = series.map((d, i) => [pad + i * step, H - pad - (d.value / max) * (H - pad * 2)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L${pts.at(-1)[0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;

    wrap.innerHTML = `
      <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Revenue, last 7 days">
        <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity=".42"/>
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
        </linearGradient></defs>
        <path class="area" d="${area}"/>
        <path class="line" d="${line}"/>
        ${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"/>`).join('')}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--ink-faint);margin-top:6px">
        ${series.map((d) => `<span>${esc(d.day.slice(5))}</span>`).join('')}
      </div>`;
  }

  const statusCell = (s) => `<span class="status ${esc(s)}">${esc(s)}</span>`;

  function renderRecent(rows) {
    $('#recentBody').innerHTML = rows.length
      ? rows.map((o) => `
        <tr>
          <td>#${o.id}</td><td>${esc(o.product_name)}</td><td>${esc(o.package_label)}</td>
          <td><code>${esc(o.customer_ref)}</code></td>
          <td>${money(o.price)} ${esc(o.currency)}</td>
          <td>${statusCell(o.status)}</td><td>${esc(when(o.created_at))}</td>
        </tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:30px">No orders yet</td></tr>`;
  }

  /* ───────────── orders ───────────── */
  function orderQuery(extra = {}) {
    const qs = new URLSearchParams();
    if (STATE.filter !== 'all') qs.set('status', STATE.filter);
    if (STATE.search) qs.set('q', STATE.search);
    Object.entries(extra).forEach(([k, v]) => qs.set(k, v));
    return qs;
  }

  async function loadOrders() {
    const qs = orderQuery({ page: STATE.page, per_page: STATE.perPage });
    const res = await API.get(`/api/admin/orders?${qs}`, true);
    // Paginated envelope: { items, total, page, per_page, pages }
    STATE.orders = res.items;
    STATE.page = res.page;
    STATE.pages = res.pages;
    STATE.total = res.total;
    renderOrders();
  }

  function renderOrders() {
    const body = $('#ordersBody');
    renderPager();

    if (!STATE.orders.length) {
      body.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--ink-faint);padding:36px">No orders match this filter</td></tr>`;
      return;
    }
    body.innerHTML = STATE.orders.map((o) => `
      <tr data-order-row="${o.id}">
        <td><a href="order.html?id=${o.id}" class="idlink">#${o.id}</a></td>
        <td>${esc(o.product_name)}<br><span style="color:var(--ink-faint);font-size:.78rem">${esc(o.package_label)}</span></td>
        <td>${esc(o.customer_name) || '—'}<br><span style="color:var(--ink-faint);font-size:.78rem">${esc(o.customer_email) || ''}</span></td>
        <td><code>${esc(o.customer_ref)}</code></td>
        <td><code>${esc(o.receipt_number)}</code></td>
        <td>${esc(o.payment_method_name) || '—'}</td>
        <td><b>${money(o.price)} ${esc(o.currency)}</b></td>
        <td>${statusCell(o.status)}</td>
        <td>${esc(when(o.created_at))}</td>
        <td><div class="row-actions">
          <a class="mini" href="order.html?id=${o.id}">👁 View</a>
          ${o.status !== 'paid' ? `<button class="mini go" data-ord="${o.id}" data-set="paid">✓ Paid</button>` : ''}
          ${o.status !== 'rejected' ? `<button class="mini no" data-ord="${o.id}" data-set="rejected">✕ Reject</button>` : ''}
          ${o.status !== 'pending' ? `<button class="mini" data-ord="${o.id}" data-set="pending">↺ Pending</button>` : ''}
          <button class="mini no" data-del-ord="${o.id}">🗑</button>
        </div></td>
      </tr>`).join('');

    $$('[data-ord]', body).forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await API.patch(`/api/admin/orders/${btn.dataset.ord}`, { status: btn.dataset.set }, true);
        await loadAll();
        Motion.toast(`Order #${btn.dataset.ord} → ${btn.dataset.set}`, 'ok');
      } catch (ex) { Motion.toast(ex.message, 'bad'); }
    }));

    $$('[data-del-ord]', body).forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm(`Delete order #${btn.dataset.delOrd}? This cannot be undone.`)) return;
      try {
        await API.del(`/api/admin/orders/${btn.dataset.delOrd}`, true);
        await loadAll();
        Motion.toast('Order deleted', 'ok');
      } catch (ex) { Motion.toast(ex.message, 'bad'); }
    }));
  }

  function renderPager() {
    const wrap = $('#ordersPager');
    if (!wrap) return;

    const from = STATE.total === 0 ? 0 : (STATE.page - 1) * STATE.perPage + 1;
    const to = Math.min(STATE.page * STATE.perPage, STATE.total);

    // A compact window of page numbers around the current one.
    const nums = [];
    const span = 2;
    for (let i = 1; i <= STATE.pages; i++) {
      if (i === 1 || i === STATE.pages || Math.abs(i - STATE.page) <= span) nums.push(i);
      else if (nums.at(-1) !== '…') nums.push('…');
    }

    wrap.innerHTML = `
      <span class="pager-info">${from}–${to} of ${STATE.total}</span>
      <span class="pager-controls">
        <button class="mini" data-page="${STATE.page - 1}" ${STATE.page <= 1 ? 'disabled' : ''}>‹ Prev</button>
        ${nums.map((n) => n === '…'
          ? '<span class="pager-gap">…</span>'
          : `<button class="mini ${n === STATE.page ? 'on' : ''}" data-page="${n}">${n}</button>`).join('')}
        <button class="mini" data-page="${STATE.page + 1}" ${STATE.page >= STATE.pages ? 'disabled' : ''}>Next ›</button>
      </span>
      <select id="perPageSel" class="mini" style="padding:6px 10px">
        ${[10, 20, 50, 100].map((n) => `<option value="${n}" ${n === STATE.perPage ? 'selected' : ''}>${n} / page</option>`).join('')}
      </select>`;

    $$('[data-page]', wrap).forEach((b) => b.addEventListener('click', async () => {
      const target = Number(b.dataset.page);
      if (b.disabled || target < 1 || target > STATE.pages || target === STATE.page) return;
      STATE.page = target;
      await loadOrders();
      $('#ordersBody')?.scrollIntoView({ behavior: Motion.reduced() ? 'auto' : 'smooth', block: 'start' });
    }));

    $('#perPageSel', wrap)?.addEventListener('change', async (e) => {
      STATE.perPage = Number(e.target.value);
      STATE.page = 1;
      await loadOrders();
    });
  }

  $$('#orderFilters .chip').forEach((chip) => chip.addEventListener('click', () => {
    $$('#orderFilters .chip').forEach((c) => c.classList.toggle('on', c === chip));
    STATE.filter = chip.dataset.status;
    STATE.page = 1;
    loadOrders();
  }));

  let searchTimer;
  $('#orderSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { STATE.search = e.target.value.trim(); STATE.page = 1; loadOrders(); }, 320);
  });

  /* ───────────── products ───────────── */
  function renderProducts() {
    const body = $('#productsBody');
    body.innerHTML = STATE.products.length
      ? STATE.products.map((p) => {
          const cat = STATE.categories.find((c) => c.id === p.category_id);
          return `<tr>
            <td><b>${esc(p.name_en)}</b><br><span style="color:var(--ink-faint);font-size:.8rem">${esc(p.name_ar)}</span></td>
            <td>${cat ? `${esc(cat.icon)} ${esc(cat.name_en)}` : '—'}</td>
            <td>${p.packages.length}</td>
            <td>${p.is_active ? '🟢' : '⚪'}</td>
            <td>${p.sort_order}</td>
            <td><div class="row-actions">
              <button class="mini" data-edit-p="${p.id}">✏️ Edit</button>
              <button class="mini" data-pkg-p="${p.id}">📦 Packages</button>
              <button class="mini no" data-del-p="${p.id}">🗑</button>
            </div></td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:36px">No products yet</td></tr>`;

    $$('[data-edit-p]', body).forEach((b) => b.addEventListener('click', () => productModal(Number(b.dataset.editP))));
    $$('[data-pkg-p]', body).forEach((b) => b.addEventListener('click', () => packagesModal(Number(b.dataset.pkgP))));
    $$('[data-del-p]', body).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this product and all of its packages?')) return;
      try { await API.del(`/api/admin/products/${b.dataset.delP}`, true); await loadAll(); Motion.toast('Product deleted', 'ok'); }
      catch (ex) { Motion.toast(ex.message, 'bad'); }
    }));
  }

  $('#addProduct').addEventListener('click', () => productModal(null));

  function productModal(id) {
    const p = id ? STATE.products.find((x) => x.id === id) : null;
    const opts = ['<option value="">— none —</option>'].concat(
      STATE.categories.map((c) => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name_en)}</option>`),
    ).join('');

    openModal(p ? `Edit — ${p.name_en}` : 'New product', `
      <div class="form-grid">
        ${fieldHtml('name_ar', 'Name (Arabic)', p?.name_ar)}
        ${fieldHtml('name_en', 'Name (English)', p?.name_en)}
        ${fieldHtml('subtitle_ar', 'Subtitle (Arabic)', p?.subtitle_ar)}
        ${fieldHtml('subtitle_en', 'Subtitle (English)', p?.subtitle_en)}
        <div class="field wide"><label>Description (Arabic)</label><textarea name="description_ar" rows="2">${esc(p?.description_ar || '')}</textarea></div>
        <div class="field wide"><label>Description (English)</label><textarea name="description_en" rows="2">${esc(p?.description_en || '')}</textarea></div>
        <div class="field wide">
          <label>Product image</label>
          <div class="img-picker">
            <div class="img-preview" id="imgPreview">${p?.image_url
              ? `<img src="${esc(p.image_url)}" alt="">`
              : '<span>no image</span>'}</div>
            <div class="img-controls">
              <input name="image_url" id="imageUrl" value="${esc(p?.image_url || '')}" placeholder="https://…  or upload a file">
              <div class="img-actions">
                <label class="mini upload-btn">📁 Upload image
                  <input type="file" id="imgFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
                </label>
                <button type="button" class="mini no" id="imgClear">✕ Clear</button>
              </div>
              <span class="hint">PNG / JPG / WebP / SVG, up to 1.5 MB. Uploads are stored with the product — no image host needed.</span>
            </div>
          </div>
        </div>
        ${fieldHtml('badge_ar', 'Badge (Arabic)', p?.badge_ar)}
        ${fieldHtml('badge_en', 'Badge (English)', p?.badge_en)}
        <div class="field"><label>Category</label><select name="category_id">${opts}</select></div>
        <div class="field"><label>Input field type</label>
          <select name="field_type">
            ${['text', 'number', 'email'].map((t) => `<option value="${t}" ${p?.field_type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        ${fieldHtml('field_label_ar', 'Input label (Arabic)', p?.field_label_ar ?? 'أدخل معرّف اللاعب (Player ID)')}
        ${fieldHtml('field_label_en', 'Input label (English)', p?.field_label_en ?? 'Enter your Player ID')}
        ${fieldHtml('field_placeholder_ar', 'Placeholder (Arabic)', p?.field_placeholder_ar ?? 'مثال: 512345678')}
        ${fieldHtml('field_placeholder_en', 'Placeholder (English)', p?.field_placeholder_en ?? 'e.g. 512345678')}
        ${fieldHtml('sort_order', 'Sort order', p?.sort_order ?? 0, 'number')}
      </div>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        ${switchHtml('is_active', 'Visible in store', p ? p.is_active : true)}
        ${switchHtml('is_featured', 'Featured', p ? p.is_featured : false)}
      </div>`,
      async () => {
        const data = collect();
        data.category_id = data.category_id ? Number(data.category_id) : null;
        data.sort_order = Number(data.sort_order) || 0;
        if (!data.name_ar || !data.name_en) throw new Error('Both name fields are required');
        if (p) await API.put(`/api/admin/products/${p.id}`, data, true);
        else await API.post('/api/admin/products', data, true);
      });

    // ── image picker (the modal body is in the DOM by now) ──
    const preview = $('#imgPreview');
    const urlInput = $('#imageUrl');
    const paint = (src) => {
      preview.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span>no image</span>';
    };

    urlInput?.addEventListener('input', () => paint(urlInput.value.trim()));
    $('#imgClear')?.addEventListener('click', () => { urlInput.value = ''; paint(''); });

    $('#imgFile')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 1_500_000) {
        Motion.toast('Image is larger than 1.5 MB', 'bad');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        // Stored inline as a data URI: Render/Fly have an ephemeral filesystem,
        // so there is nowhere to persist an uploaded file between deploys.
        urlInput.value = reader.result;
        paint(reader.result);
        Motion.toast(`Loaded ${file.name}`, 'ok');
      };
      reader.readAsDataURL(file);
    });
  }

  /* ───────────── packages ───────────── */
  function packagesModal(productId) {
    const p = STATE.products.find((x) => x.id === productId);
    if (!p) return;

    const list = p.packages.length
      ? p.packages.map((k) => `
        <div class="pkg-line">
          <b>${esc(k.label_en)}</b>
          <span style="color:var(--ink-faint);font-size:.82rem">${esc(k.label_ar)}</span>
          <span class="p">${money(k.price)}</span>
          ${k.is_popular ? '<span class="status paid">popular</span>' : ''}
          ${k.is_active ? '' : '<span class="status rejected">hidden</span>'}
          <span class="sp">
            <button class="mini" data-edit-k="${k.id}">✏️</button>
            <button class="mini no" data-del-k="${k.id}">🗑</button>
          </span>
        </div>`).join('')
      : '<p class="hint">No packages yet — add the first one below.</p>';

    openModal(`Packages — ${p.name_en}`, `
      ${list}
      <button class="btn-ghost" id="newPkg" style="margin-top:14px;width:100%">+ Add package</button>`, null);

    // This modal manages its own actions; the footer Save button is not used.
    $('#modalSave').style.display = 'none';
    $('#modalCancel').textContent = 'Close';

    // Restoring the footer chrome is openModal's job — doing it on the
    // Cancel/Close buttons missed Esc and backdrop dismissals, which left
    // the NEXT modal (edit product/category/method) with no Save button.
    const restore = () => {};

    $('#newPkg').addEventListener('click', () => { restore(); packageModal(productId, null); });
    $$('[data-edit-k]').forEach((b) => b.addEventListener('click', () => {
      restore();
      packageModal(productId, p.packages.find((k) => k.id === Number(b.dataset.editK)));
    }));
    $$('[data-del-k]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this package?')) return;
      try {
        await API.del(`/api/admin/packages/${b.dataset.delK}`, true);
        restore(); closeModal(); await loadAll();
        Motion.toast('Package deleted', 'ok');
      } catch (ex) { Motion.toast(ex.message, 'bad'); }
    }));
  }

  function packageModal(productId, k) {
    openModal(k ? `Edit package — ${k.label_en}` : 'New package', `
      <div class="form-grid">
        ${fieldHtml('label_ar', 'Label (Arabic)', k?.label_ar, 'text')}
        ${fieldHtml('label_en', 'Label (English)', k?.label_en, 'text')}
        ${fieldHtml('price', 'Price', k?.price ?? 0, 'number')}
        ${fieldHtml('old_price', 'Old price (optional)', k?.old_price ?? '', 'number')}
        ${fieldHtml('note_ar', 'Tag (Arabic)', k?.note_ar)}
        ${fieldHtml('note_en', 'Tag (English)', k?.note_en)}
        ${fieldHtml('sort_order', 'Sort order', k?.sort_order ?? 0, 'number')}
      </div>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        ${switchHtml('is_popular', 'Mark as popular', k ? k.is_popular : false)}
        ${switchHtml('is_active', 'Visible in store', k ? k.is_active : true)}
      </div>`,
      async () => {
        const data = collect();
        data.price = Number(data.price) || 0;
        data.old_price = data.old_price === null || data.old_price === '' ? null : Number(data.old_price);
        data.sort_order = Number(data.sort_order) || 0;
        if (!data.label_ar || !data.label_en) throw new Error('Both label fields are required');
        if (k) await API.put(`/api/admin/packages/${k.id}`, data, true);
        else await API.post(`/api/admin/products/${productId}/packages`, data, true);
      });
  }

  /* ───────────── categories ───────────── */
  function renderCategories() {
    const body = $('#categoriesBody');
    body.innerHTML = STATE.categories.length
      ? STATE.categories.map((c) => `
        <tr>
          <td style="font-size:1.2rem">${esc(c.icon)}</td>
          <td>${esc(c.name_ar)}</td><td>${esc(c.name_en)}</td>
          <td><code>${esc(c.slug)}</code></td>
          <td>${c.is_active ? '🟢' : '⚪'}</td>
          <td>${c.sort_order}</td>
          <td><div class="row-actions">
            <button class="mini" data-edit-c="${c.id}">✏️ Edit</button>
            <button class="mini no" data-del-c="${c.id}">🗑</button>
          </div></td>
        </tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:36px">No categories yet</td></tr>`;

    $$('[data-edit-c]', body).forEach((b) => b.addEventListener('click', () => categoryModal(Number(b.dataset.editC))));
    $$('[data-del-c]', body).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this category? Products in it will become uncategorised.')) return;
      try { await API.del(`/api/admin/categories/${b.dataset.delC}`, true); await loadAll(); Motion.toast('Category deleted', 'ok'); }
      catch (ex) { Motion.toast(ex.message, 'bad'); }
    }));
  }

  $('#addCategory').addEventListener('click', () => categoryModal(null));

  function categoryModal(id) {
    const c = id ? STATE.categories.find((x) => x.id === id) : null;
    openModal(c ? `Edit — ${c.name_en}` : 'New category', `
      <div class="form-grid">
        ${fieldHtml('name_ar', 'Name (Arabic)', c?.name_ar)}
        ${fieldHtml('name_en', 'Name (English)', c?.name_en)}
        ${fieldHtml('icon', 'Icon (emoji)', c?.icon ?? '🎮')}
        ${fieldHtml('sort_order', 'Sort order', c?.sort_order ?? 0, 'number')}
      </div>
      ${switchHtml('is_active', 'Visible in store', c ? c.is_active : true)}`,
      async () => {
        const data = collect();
        data.sort_order = Number(data.sort_order) || 0;
        if (!data.name_ar || !data.name_en) throw new Error('Both name fields are required');
        if (c) await API.put(`/api/admin/categories/${c.id}`, data, true);
        else await API.post('/api/admin/categories', data, true);
      });
  }

  /* ───────────── payment methods ───────────── */
  function renderMethods() {
    const body = $('#methodsBody');
    body.innerHTML = STATE.methods.length
      ? STATE.methods.map((m) => `
        <tr>
          <td style="font-size:1.2rem">${esc(m.icon)}</td>
          <td>${esc(m.name_en)}<br><span style="color:var(--ink-faint);font-size:.8rem">${esc(m.name_ar)}</span></td>
          <td><span class="status ${m.kind === 'qr' ? 'paid' : 'pending'}">${esc(m.kind)}</span></td>
          <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${m.kind === 'qr'
              ? (m.qr_image ? `<img src="${esc(m.qr_image)}" style="height:40px;border-radius:6px;background:#fff;padding:2px">` : '<span style="color:var(--bad)">no image</span>')
              : `<code>${esc(m.account_value)}</code>`}
          </td>
          <td>${m.is_active ? '🟢' : '⚪'}</td>
          <td><div class="row-actions">
            <button class="mini" data-edit-m="${m.id}">✏️ Edit</button>
            <button class="mini no" data-del-m="${m.id}">🗑</button>
          </div></td>
        </tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:36px">No payment methods yet</td></tr>`;

    $$('[data-edit-m]', body).forEach((b) => b.addEventListener('click', () => methodModal(Number(b.dataset.editM))));
    $$('[data-del-m]', body).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this payment method?')) return;
      try { await API.del(`/api/admin/payment-methods/${b.dataset.delM}`, true); await loadAll(); Motion.toast('Payment method deleted', 'ok'); }
      catch (ex) { Motion.toast(ex.message, 'bad'); }
    }));
  }

  $('#addMethod').addEventListener('click', () => methodModal(null));

  function methodModal(id) {
    const m = id ? STATE.methods.find((x) => x.id === id) : null;
    openModal(m ? `Edit — ${m.name_en}` : 'New payment method', `
      <div class="form-grid">
        <div class="field"><label>Type</label>
          <select name="kind" id="kindSel">
            <option value="number" ${m?.kind === 'number' ? 'selected' : ''}>Account number (copyable)</option>
            <option value="qr" ${m?.kind === 'qr' ? 'selected' : ''}>QR code image</option>
          </select>
        </div>
        ${fieldHtml('icon', 'Icon (emoji)', m?.icon ?? '💳')}
        ${fieldHtml('name_ar', 'Name (Arabic)', m?.name_ar)}
        ${fieldHtml('name_en', 'Name (English)', m?.name_en)}
        <div class="field wide"><label>Instructions (Arabic)</label><textarea name="instructions_ar" rows="2">${esc(m?.instructions_ar || '')}</textarea></div>
        <div class="field wide"><label>Instructions (English)</label><textarea name="instructions_en" rows="2">${esc(m?.instructions_en || '')}</textarea></div>
        <div class="field wide" id="numZone"><label>Account number</label><input name="account_value" value="${esc(m?.account_value || '')}"></div>
        <div class="field wide" id="qrZone">
          <label>QR image</label>
          <input type="file" accept="image/*" id="qrFile">
          <input type="hidden" name="qr_image" value="${esc(m?.qr_image || '')}">
          <div id="qrPreview" style="margin-top:10px">${m?.qr_image ? `<img src="${esc(m.qr_image)}" style="max-height:130px;border-radius:10px;background:#fff;padding:6px">` : ''}</div>
          <p class="hint">Stored in the database as a data URL — max ~1.5 MB.</p>
        </div>
        ${fieldHtml('sort_order', 'Sort order', m?.sort_order ?? 0, 'number')}
      </div>
      ${switchHtml('is_active', 'Visible at checkout', m ? m.is_active : true)}`,
      async () => {
        const data = collect();
        data.sort_order = Number(data.sort_order) || 0;
        if (!data.name_ar || !data.name_en) throw new Error('Both name fields are required');
        if (m) await API.put(`/api/admin/payment-methods/${m.id}`, data, true);
        else await API.post('/api/admin/payment-methods', data, true);
      });

    const sync = () => {
      const kind = $('#kindSel').value;
      $('#numZone').style.display = kind === 'number' ? '' : 'none';
      $('#qrZone').style.display = kind === 'qr' ? '' : 'none';
    };
    $('#kindSel').addEventListener('change', sync);
    sync();

    $('#qrFile').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 1_500_000) { Motion.toast('Image is larger than 1.5 MB', 'bad'); e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => {
        $('[name="qr_image"]').value = reader.result;
        $('#qrPreview').innerHTML = `<img src="${esc(reader.result)}" style="max-height:130px;border-radius:10px;background:#fff;padding:6px">`;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ───────────── settings ───────────── */
  function fillSettings(s) {
    fillEmailSettings();          // the email card lives outside #settingsForm
    const form = $('#settingsForm');
    Object.entries(s).forEach(([k, v]) => {
      const el = form.elements[k];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
    });
    // Mirror colour pickers into their hex text inputs and keep both in sync.
    [['color_primary', 'hexPrimary'], ['color_accent', 'hexAccent'], ['color_bg', 'hexBg']].forEach(([name, hexId]) => {
      const picker = form.elements[name];
      const hex = $(`#${hexId}`);
      hex.value = picker.value;
      picker.oninput = () => { hex.value = picker.value; };
      hex.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value; };
    });
  }

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#saveSettings');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const form = e.target;
      const data = {};
      [...form.elements].forEach((el) => {
        if (!el.name) return;
        data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      STATE.settings = await API.put('/api/admin/settings', data, true);
      Motion.toast('Settings saved — reload the store to see them', 'ok');
      fillEmailSettings();
      await loadAll();
    } catch (ex) {
      Motion.toast(ex.message, 'bad');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save all settings';
    }
  });

  /* ───────────── push ───────────── */
  async function refreshEmailState() {
    const box = $('#smtpState');
    if (!box) return;
    try {
      const h = await API.get('/health');
      if (h.smtp) {
        box.className = 'note';
        box.textContent = '✓ SMTP is configured on the server. Turn the switch on and save.';
      } else {
        box.className = 'note warn';
        box.textContent = 'SMTP is not configured on the server. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in your backend environment, then redeploy.';
      }
    } catch { /* health is optional */ }
  }

  async function refreshPush() {
    const box = $('#pushState');
    try {
      const [{ enabled }, state, subs] = await Promise.all([
        API.get('/api/push/public-key'),
        Push.status(),
        API.get('/api/admin/push/subscriptions', true),
      ]);

      let cls = 'note', msg;
      if (!state.supported) { cls = 'note warn'; msg = '⚠️ This browser does not support push notifications.'; }
      else if (!enabled) { cls = 'note warn'; msg = '⚠️ The server has no VAPID keys. Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY and restart.'; }
      else if (state.permission === 'denied') { cls = 'note warn'; msg = '🚫 Notifications are blocked in this browser. Re-allow them from the padlock icon in the address bar.'; }
      else if (state.subscribed) { cls = 'note ok'; msg = '✅ Notifications are ON for this device. New orders will alert you.'; }
      else { msg = '🔕 Notifications are off on this device. Click “Enable notifications”.'; }

      box.className = cls;
      box.textContent = msg;

      $('#subsBody').innerHTML = subs.length
        ? subs.map((s) => `<tr><td>#${s.id}</td>
            <td style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.user_agent || '—')}</td>
            <td>${esc(when(s.created_at))}</td></tr>`).join('')
        : `<tr><td colspan="3" style="text-align:center;color:var(--ink-faint);padding:30px">No devices subscribed</td></tr>`;
    } catch (ex) {
      box.className = 'note warn';
      box.textContent = ex.message;
    }
  }

  $('#pushEnable').addEventListener('click', async () => {
    try { await Push.enable(); Motion.toast('Notifications enabled', 'ok'); await refreshPush(); await loadAll(); }
    catch (ex) { Motion.toast(ex.message, 'bad'); await refreshPush(); }
  });

  function fillEmailSettings() {
    const s = STATE.settings;
    if (!s) return;
    $('#emailEnabled').checked = !!s.email_enabled;
    $('#emailTo').value = s.email_to || '';
    $('#emailSubject').value = s.email_subject || '';
    $('#dashboardUrl').value = s.dashboard_url || '';
  }

  $('#saveEmail')?.addEventListener('click', async () => {
    try {
      STATE.settings = await API.put('/api/admin/settings', {
        email_enabled: $('#emailEnabled').checked,
        email_to: $('#emailTo').value.trim(),
        email_subject: $('#emailSubject').value.trim(),
        dashboard_url: $('#dashboardUrl').value.trim(),
      }, true);
      Motion.toast('Email settings saved', 'ok');
    } catch (ex) { Motion.toast(ex.message, 'bad'); }
  });

  $('#emailTest')?.addEventListener('click', async () => {
    try {
      const r = await API.post('/api/admin/email/test', {}, true);
      Motion.toast(`Test email sent to ${r.to}`, 'ok');
    } catch (ex) { Motion.toast(ex.message, 'bad'); }
  });

  $('#soundTest')?.addEventListener('click', () => {
    Motion.chime();
    if (!Motion.soundEnabled()) Motion.toast('Sound is switched off below', 'bad');
  });

  const soundToggle = $('#soundToggle');
  if (soundToggle) {
    soundToggle.checked = Motion.soundEnabled();
    soundToggle.addEventListener('change', () => {
      Motion.setSound(soundToggle.checked);
      if (soundToggle.checked) Motion.chime();
    });
  }

  $('#pushTest').addEventListener('click', async () => {
    try {
      const r = await Push.test();
      Motion.toast(r.sent ? `Sent to ${r.sent} device(s)` : `Nothing sent (${r.reason || r.failed + ' failed'})`, r.sent ? 'ok' : 'bad');
    } catch (ex) { Motion.toast(ex.message, 'bad'); }
  });

  $('#pushDisable').addEventListener('click', async () => {
    try { await Push.disable(); Motion.toast('Disabled on this device', 'ok'); await refreshPush(); await loadAll(); }
    catch (ex) { Motion.toast(ex.message, 'bad'); }
  });

  /* ═══════════════════ notification centre ═══════════════════ */
  const ago = (iso) => {
    const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  async function loadNotifications({ announce = false } = {}) {
    let feed;
    try { feed = await API.get('/api/admin/notifications?limit=30', true); }
    catch { return; }

    const previousTop = STATE.notifs[0]?.id ?? 0;
    STATE.notifs = feed.items;
    STATE.unread = feed.unread;

    // Something genuinely new arrived while the dashboard was open.
    const newest = feed.items[0];
    if (announce && newest && newest.id > previousTop && previousTop !== 0) {
      Motion.toast(`🔔 ${newest.title}`, 'ok');
      Motion.chime();
      Motion.confetti(28);
    }

    renderBell();
    renderNotifications();
  }

  function renderBell() {
    const btn = $('#bellBtn');
    const count = $('#bellCount');
    count.textContent = STATE.unread > 99 ? '99+' : String(STATE.unread);
    count.hidden = STATE.unread === 0;
    btn.classList.toggle('has-unread', STATE.unread > 0);
  }

  function renderNotifications() {
    const list = $('#notifList');
    if (!STATE.notifs.length) {
      list.innerHTML = '<div class="notif-empty">No notifications yet.<br>New orders will appear here.</div>';
      return;
    }

    list.innerHTML = STATE.notifs.map((n) => `
      <button class="notif-item ${n.is_read ? 'read' : 'unread'}" data-notif="${n.id}" data-order="${n.order_id ?? ''}">
        <span class="dot-col"><span class="udot"></span></span>
        <span class="txt">
          <span class="t">${esc(n.title)}</span>
          <span class="b">${esc(n.body)}</span>
          <span class="w">${esc(ago(n.created_at))}${n.order_id ? ` · order #${n.order_id}` : ''}</span>
        </span>
      </button>`).join('');

    $$('.notif-item', list).forEach((item) => {
      item.addEventListener('click', async () => {
        const id = Number(item.dataset.notif);
        const orderId = item.dataset.order ? Number(item.dataset.order) : null;
        try { await API.post(`/api/admin/notifications/${id}/read`, {}, true); } catch {}
        closePanel();
        await loadNotifications();
        if (orderId) focusOrder(orderId);
      });
    });
  }

  function openPanel() {
    $('#notifPanel').hidden = false;
    $('#bellBtn').setAttribute('aria-expanded', 'true');
    loadNotifications();
  }

  function closePanel() {
    $('#notifPanel').hidden = true;
    $('#bellBtn').setAttribute('aria-expanded', 'false');
  }

  $('#bellBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#notifPanel').hidden ? openPanel() : closePanel();
  });

  document.addEventListener('click', (e) => {
    if (!$('#notifPanel').hidden && !e.target.closest('.bell-wrap')) closePanel();
  });

  $('#markAllRead').addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await API.post('/api/admin/notifications/read-all', {}, true); await loadNotifications(); }
    catch (ex) { Motion.toast(ex.message, 'bad'); }
  });

  $('#clearNotifs').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Clear all notifications?')) return;
    try { await API.del('/api/admin/notifications', true); await loadNotifications(); }
    catch (ex) { Motion.toast(ex.message, 'bad'); }
  });

  /** Jump to a specific order — even when it is not on the current page. */
  async function focusOrder(orderId) {
    selectTab('orders');

    try {
      // Ask the server which page this order lands on under the active filters.
      let loc = await API.get(
        `/api/admin/orders/${orderId}/locate?${orderQuery({ per_page: STATE.perPage })}`, true,
      );

      // Excluded by the current filter/search — clear them and locate again.
      if (!loc.found) {
        STATE.filter = 'all';
        STATE.search = '';
        $('#orderSearch').value = '';
        $$('#orderFilters .chip').forEach((c) => c.classList.toggle('on', c.dataset.status === 'all'));
        loc = await API.get(
          `/api/admin/orders/${orderId}/locate?${orderQuery({ per_page: STATE.perPage })}`, true,
        );
      }

      STATE.page = loc.found ? loc.page : 1;
      await loadOrders();
    } catch (ex) {
      if (ex.status === 404) { Motion.toast(`Order #${orderId} no longer exists`, 'bad'); return; }
      await loadOrders();
    }

    requestAnimationFrame(() => {
      const row = $(`#ordersBody tr[data-order-row="${orderId}"]`);
      if (!row) { Motion.toast(`Could not locate order #${orderId}`, 'bad'); return; }
      row.scrollIntoView({ behavior: Motion.reduced() ? 'auto' : 'smooth', block: 'center' });
      row.classList.remove('flash-row');
      void row.offsetWidth;              // restart the animation
      row.classList.add('flash-row');
    });
  }

  /* Live delivery: the service worker pings us the moment a push lands, and we
     poll as a fallback for when push is unavailable or blocked. */
  function startLiveUpdates() {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.type === 'push') { loadNotifications({ announce: true }); loadAll(); }
        if (msg.type === 'focus-order' && msg.orderId) focusOrder(Number(msg.orderId));
      });
    }

    clearInterval(STATE.pollTimer);
    STATE.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadNotifications({ announce: true });
    }, 15000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadNotifications({ announce: true });
    });
  }

  /** Handle #order-123 in the URL (arriving from a clicked OS notification). */
  function handleHash() {
    const m = location.hash.match(/^#order-(\d+)$/);
    if (m) { focusOrder(Number(m[1])); return true; }
    return false;
  }

  window.addEventListener('hashchange', handleHash);

  /* ═══════════════════════════ boot ═══════════════════════════ */
  (async () => {
    Motion.stickyNav();
    Motion.ripples();
    if (await tryRestore()) {
      await showDash();
      startLiveUpdates();
      // A deep link (#order-12) wins over a plain tab hash (#orders).
      if (!handleHash()) {
        const tab = location.hash.replace('#', '');
        if (tab && $(`.side-link[data-tab="${tab}"]`)) selectTab(tab);
      }
    } else {
      showLogin();
    }
  })();
})();
