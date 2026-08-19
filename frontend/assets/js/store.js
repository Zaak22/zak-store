/* Storefront controller: loads the catalogue, applies admin theming,
   renders the product grid and keeps everything bilingual. */
(() => {
  let DATA = null;          // bootstrap payload
  let activeCat = 'all';

  const $ = (sel) => document.querySelector(sel);

  /* ---------- theming driven entirely by admin settings ---------- */
  function applyTheme(s) {
    const root = document.documentElement.style;
    root.setProperty('--brand', s.color_primary);
    root.setProperty('--accent', s.color_accent);
    root.setProperty('--bg', s.color_bg);
    document.body.classList.toggle('no-motion', !s.animations_enabled);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.color_bg);
  }

  /* ---------- text that comes from the database ---------- */
  function applyContent() {
    const s = DATA.settings;
    const brand = I18N.pick(s, 'brand_name');

    document.title = `${brand} — ${I18N.pick(s, 'tagline')}`;
    $('#logoMark').textContent = s.logo_emoji || '🚀';
    $('#brandName').textContent = brand;
    $('#brandTagline').textContent = I18N.pick(s, 'tagline');
    $('#heroTitle').innerHTML = highlight(I18N.pick(s, 'hero_title'));
    $('#heroSubtitle').textContent = I18N.pick(s, 'hero_subtitle');
    $('#heroCta').textContent = I18N.pick(s, 'hero_cta');
    $('#footerBrand').textContent = brand;
    $('#footerText').textContent = I18N.pick(s, 'footer_text');
    $('#year').textContent = new Date().getFullYear();
    $('#statStrip').style.display = s.show_stats ? '' : 'none';

    renderSocial(s);

    const acct = $('#acctLink');
    if (acct) acct.textContent = API.getToken('customer') ? I18N.t('my_orders') : I18N.t('nav_account');
  }

  /* Gradient-highlight the last two words of the headline. */
  function highlight(text) {
    const words = String(text).trim().split(/\s+/);
    if (words.length < 3) return `<span class="grad">${esc(text)}</span>`;
    const tail = words.splice(-2).join(' ');
    return `${esc(words.join(' '))} <span class="grad">${esc(tail)}</span>`;
  }

  function renderSocial(s) {
    const wrap = $('#social');
    const links = [];
    if (s.support_whatsapp) {
      const num = s.support_whatsapp.replace(/[^\d+]/g, '');
      links.push(`<a href="https://wa.me/${encodeURIComponent(num)}" target="_blank" rel="noopener" title="WhatsApp">💬</a>`);
    }
    if (s.support_telegram) {
      const handle = s.support_telegram.replace(/^@/, '');
      links.push(`<a href="https://t.me/${encodeURIComponent(handle)}" target="_blank" rel="noopener" title="Telegram">✈️</a>`);
    }
    wrap.innerHTML = links.join('');
  }

  /* ---------- category chips ---------- */
  function renderChips() {
    const wrap = $('#chips');
    const chips = [`<button class="chip ${activeCat === 'all' ? 'on' : ''}" data-cat="all">${esc(I18N.t('all'))}</button>`];
    DATA.categories.forEach((c) => {
      chips.push(
        `<button class="chip ${activeCat === c.slug ? 'on' : ''}" data-cat="${esc(c.slug)}">${esc(c.icon)} ${esc(I18N.pick(c, 'name'))}</button>`,
      );
    });
    wrap.innerHTML = chips.join('');

    wrap.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCat = btn.dataset.cat;
        renderChips();
        renderGrid();
      });
    });
  }

  /* ---------- product grid ---------- */
  function renderGrid() {
    const grid = $('#grid');
    const catId = activeCat === 'all'
      ? null
      : DATA.categories.find((c) => c.slug === activeCat)?.id ?? -1;

    const items = DATA.products.filter((p) => catId === null || p.category_id === catId);

    if (!items.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <span class="ico">🗂️</span>${esc(I18N.t('empty_products'))}</div>`;
      return;
    }

    const currency = I18N.pick(DATA.settings, 'currency');

    grid.innerHTML = items.map((p, i) => {
      const prices = p.packages.map((k) => Number(k.price)).filter((n) => n > 0);
      const min = prices.length ? Math.min(...prices) : 0;
      const badge = I18N.pick(p, 'badge');
      const img = p.image_url
        ? `<img src="${esc(p.image_url)}" alt="${esc(I18N.pick(p, 'name'))}" loading="lazy"
             onerror="this.remove()">`
        : '';

      return `
      <a class="zs-card" href="product.html?p=${encodeURIComponent(p.slug)}" data-reveal="${i}">
        <div class="card-media">
          <span class="fallback">${esc(DATA.categories.find((c) => c.id === p.category_id)?.icon || '🎮')}</span>
          ${img}
          ${badge ? `<span class="zs-badge">${esc(badge)}</span>` : ''}
        </div>
        <h3>${esc(I18N.pick(p, 'name'))}</h3>
        <p class="sub">${esc(I18N.pick(p, 'subtitle'))}</p>
        <div class="card-foot">
          <div>
            <span class="price-from">${esc(I18N.t('from'))}</span>
            <span class="price-val">${I18N.num(min)} ${esc(currency)}</span>
          </div>
          <span class="card-arrow" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </div>
      </a>`;
    }).join('');

    // The stat counters run on DOMContentLoaded, before the catalogue arrives —
    // reset the flag so the real product count animates instead of sticking at 0.
    const counter = $('#productCount');
    if (counter) {
      counter.setAttribute('data-count', String(DATA.products.length));
      counter.removeAttribute('data-counted');
      counter.textContent = '0';
      Motion.counters(document);
    }

    Motion.refresh(grid);
  }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------- maintenance takeover ---------- */
  function maintenance() {
    document.body.innerHTML = `
      <div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>
      <div style="min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center">
        <div class="panel" style="max-width:460px">
          <div style="font-size:3.4rem;margin-bottom:14px">🛠️</div>
          <h1 style="font-size:1.5rem;font-weight:800;margin:0 0 10px">${esc(I18N.t('maintenance'))}</h1>
          <p style="color:var(--ink-dim);margin:0">${esc(I18N.pick(DATA.settings, 'maintenance_msg'))}</p>
        </div>
      </div>`;
  }

  function renderAll() {
    applyContent();
    renderChips();
    renderGrid();
  }

  /* ---------- boot ---------- */
  async function init() {
    I18N.mountToggle();
    Motion.initAll();

    try {
      DATA = await API.get('/api/bootstrap');
    } catch (err) {
      I18N.init();          // honour the saved language even on the error path
      $('#grid').innerHTML = `<div class="empty" style="grid-column:1/-1">
        <span class="ico">⚠️</span>${esc(I18N.t('loading_fail'))}<br>
        <small style="opacity:.7">${esc(err.message)}</small></div>`;
      return;
    }

    // Honour the admin's default language on a first visit.
    I18N.init(DATA.settings.default_lang);
    applyTheme(DATA.settings);

    if (DATA.settings.maintenance_mode) { maintenance(); return; }

    renderAll();
    Motion.refresh();
    document.addEventListener('langchange', renderAll);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
