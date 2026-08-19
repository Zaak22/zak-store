/* Motion toolkit: scroll reveals, pointer spotlight, tilt, ripples,
   counters, toasts and a lightweight confetti burst.
   Everything degrades gracefully with prefers-reduced-motion. */
const Motion = (() => {
  const reduced = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.body.classList.contains('no-motion');

  /* Reveal elements as they enter the viewport, with a stagger. */
  function reveal(root = document) {
    const targets = root.querySelectorAll('[data-reveal]:not(.in)');
    if (!targets.length) return;

    if (reduced()) {
      targets.forEach((el) => el.classList.add('in'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        const stagger = Number(entry.target.dataset.reveal) || 0;
        entry.target.style.setProperty('--delay', `${stagger * 0.07 + i * 0.03}s`);
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px' });

    targets.forEach((el) => io.observe(el));
  }

  /* Cursor-follow spotlight + subtle 3D tilt on cards. */
  function spotlight(root = document) {
    if (reduced()) return;
    root.querySelectorAll('.zs-card:not([data-spot])').forEach((card) => {
      card.dataset.spot = '1';

      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        card.style.setProperty('--mx', `${x}px`);
        card.style.setProperty('--my', `${y}px`);

        const rx = ((y / r.height) - 0.5) * -7;
        const ry = ((x / r.width) - 0.5) * 7;
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px)`;
      });

      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  /* Material-style ripple on any .btn-glow / .btn-copy click. */
  function ripples() {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.btn-glow, .btn-copy, .chip, .pkg');
      if (!btn || reduced()) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${e.clientX - r.left - size / 2}px`;
      span.style.top = `${e.clientY - r.top - size / 2}px`;
      if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
      btn.appendChild(span);
      setTimeout(() => span.remove(), 620);
    });
  }

  /* Count a number up when it scrolls into view. */
  function counters(root = document) {
    const els = root.querySelectorAll('[data-count]:not([data-counted])');
    if (!els.length) return;

    const run = (el) => {
      el.dataset.counted = '1';
      const target = Number(el.dataset.count) || 0;
      if (reduced()) { el.textContent = I18N.num(target); return; }
      const dur = 1400;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = I18N.num(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.4 });
    els.forEach((el) => io.observe(el));
  }

  /* Navbar gains a border once the page is scrolled. */
  function stickyNav() {
    const nav = document.querySelector('.zs-nav');
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('stuck', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* Toasts */
  function toast(message, kind = '') {
    let stack = document.querySelector('.zs-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'zs-toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `zs-toast ${kind}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 360);
    }, 3200);
  }

  /* Canvas-free confetti: absolutely-positioned divs, cleaned up after. */
  function confetti(count = 90) {
    if (reduced()) return;
    const palette = ['#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#ffffff'];
    const layer = document.createElement('div');
    Object.assign(layer.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '500', overflow: 'hidden',
    });
    document.body.appendChild(layer);

    for (let i = 0; i < count; i++) {
      const bit = document.createElement('i');
      const size = 6 + Math.random() * 8;
      Object.assign(bit.style, {
        position: 'absolute',
        left: `${Math.random() * 100}%`,
        top: '-20px',
        width: `${size}px`,
        height: `${size * (0.4 + Math.random())}px`,
        background: palette[(Math.random() * palette.length) | 0],
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        opacity: String(0.7 + Math.random() * 0.3),
      });
      layer.appendChild(bit);

      bit.animate(
        [
          { transform: `translate3d(0,0,0) rotate(0deg)`, opacity: 1 },
          {
            transform: `translate3d(${(Math.random() - 0.5) * 260}px, ${window.innerHeight + 80}px, 0) rotate(${Math.random() * 900 - 450}deg)`,
            opacity: 0,
          },
        ],
        { duration: 2200 + Math.random() * 1600, easing: 'cubic-bezier(.2,.6,.35,1)', delay: Math.random() * 350 },
      );
    }
    setTimeout(() => layer.remove(), 4400);
  }

  /* Smooth-scroll for in-page anchors. */
  function anchors() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    });
  }

  /* Spawn the rising motes. Cheap: a fixed number of CSS-animated dots. */
  function motes(count = 18) {
    const host = document.getElementById('motes');
    if (!host || reduced() || host.childElementCount) return;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('i');
      const size = 2 + Math.random() * 4;
      dot.style.left = `${Math.random() * 100}%`;
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.animationDuration = `${16 + Math.random() * 22}s`;
      dot.style.animationDelay = `${-Math.random() * 30}s`;
      dot.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      if (i % 3 === 0) dot.style.background = 'var(--brand)';
      frag.appendChild(dot);
    }
    host.appendChild(frag);
  }

  /* A two-tone chime built with the Web Audio API.

     Note this is the *in-page* sound, for when the dashboard is open. The
     sound an OS-level push notification makes is chosen by the operating
     system — the Notification API's `sound` property was never implemented in
     Chrome, so a web page cannot set it. */
  let audioCtx = null;

  function chime(volume = 0.35) {
    if (localStorage.getItem('notif_sound') === 'off') return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      // Browsers start the context suspended until a user gesture.
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      [[880, 0], [1318.5, 0.13]].forEach(([freq, offset]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(volume, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.4);
      });
    } catch { /* audio is a nicety, never a failure */ }
  }

  const soundEnabled = () => localStorage.getItem('notif_sound') !== 'off';
  const setSound = (on) => localStorage.setItem('notif_sound', on ? 'on' : 'off');

  function initAll() {
    stickyNav(); ripples(); anchors(); reveal(); spotlight(); counters(); motes();
  }

  /* Re-scan after rendering new DOM. */
  function refresh(root = document) {
    reveal(root); spotlight(root); counters(root);
  }

  return { reveal, spotlight, ripples, counters, stickyNav, toast, confetti, motes,
           chime, soundEnabled, setSound, initAll, refresh, reduced };
})();
