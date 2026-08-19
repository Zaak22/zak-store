/* Bilingual layer.
   - Static UI strings live in DICT.
   - Dynamic content (products, settings) carries _ar/_en fields from the API;
     use pick(obj, 'name') to select the right one.
   Switching language flips <html dir> and swaps the Bootstrap RTL stylesheet. */
const I18N = (() => {
  const DICT = {
    ar: {
      nav_home: 'الرئيسية',
      nav_store: 'المتجر',
      nav_how: 'كيف يعمل',
      nav_admin: 'لوحة التحكم',
      hero_badge: 'تسليم فوري · متاح الآن',
      stat_orders: 'طلب مكتمل',
      stat_delivery: 'متوسط التسليم',
      stat_support: 'دعم فني',
      stat_products: 'منتج متاح',
      minutes: 'دقائق',
      sec_products: 'المنتجات المتاحة',
      sec_products_sub: 'اختر منتجك وابدأ الشحن خلال ثوانٍ',
      all: 'الكل',
      how_title: 'كيف يعمل؟',
      how_sub: 'ثلاث خطوات فقط تفصلك عن الشحن',
      how_1_t: 'اختر منتجك',
      how_1_d: 'تصفّح المتجر واختر الحزمة المناسبة لك.',
      how_2_t: 'حوّل المبلغ',
      how_2_d: 'ادفع عبر رقم الحساب أو كود الـ QR وأدخل رقم الإيصال.',
      how_3_t: 'استلم فوراً',
      how_3_d: 'نتحقق من التحويل ونشحن حسابك خلال دقائق.',
      from: 'يبدأ من',
      buy_now: 'اشترِ الآن',
      back: 'رجوع للمتجر',
      step_pkg: 'اختر الحزمة',
      step_info: 'بياناتك',
      step_pay: 'الدفع وتأكيد الطلب',
      choose_pkg_first: 'اختر حزمة أولاً',
      receipt_label: 'أدخل رقم إيصال التحويل',
      receipt_ph: 'اكتب رقم الإيصال هنا',
      contact_label: 'رقم للتواصل (اختياري)',
      contact_ph: 'واتساب أو تيليجرام',
      copy: 'نسخ',
      copied: 'تم النسخ ✓',
      save_qr: 'حفظ كود QR',
      summary: 'ملخص الطلب',
      product: 'المنتج',
      package: 'الحزمة',
      method: 'طريقة الدفع',
      total: 'الإجمالي',
      confirm: 'لقد قمت بالتحويل — تأكيد الطلب',
      sending: 'جاري الإرسال…',
      trust_1: 'تسليم خلال دقائق',
      trust_2: 'معاملات آمنة ومشفّرة',
      trust_3: 'دعم فني على مدار الساعة',
      err_required: 'هذا الحقل مطلوب',
      err_email: 'أدخل بريداً إلكترونياً صحيحاً',
      order_no: 'رقم الطلب',
      done: 'تمام، شكراً!',
      not_found: 'المنتج غير موجود',
      empty_products: 'لا توجد منتجات متاحة حالياً',
      loading_fail: 'تعذّر تحميل البيانات',
      maintenance: 'المتجر تحت الصيانة',
      rights: 'جميع الحقوق محفوظة',
      nav_account: 'حسابي',
      sign_in: 'تسجيل الدخول',
      sign_up: 'إنشاء حساب',
      sign_out: 'تسجيل الخروج',
      full_name: 'الاسم الكامل',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      phone: 'رقم الهاتف',
      name_ph: 'مثال: أحمد محمد',
      email_ph: 'name@example.com',
      password_ph: '٦ أحرف على الأقل',
      have_account: 'لديك حساب بالفعل؟',
      no_account: 'ليس لديك حساب؟',
      my_orders: 'طلباتي',
      order_history: 'سجل الطلبات',
      no_orders: 'لا توجد طلبات بعد',
      browse_now: 'تصفّح المتجر',
      order_details: 'تفاصيل الطلب',
      status: 'الحالة',
      date: 'التاريخ',
      receipt: 'رقم الإيصال',
      player_id: 'المعرّف',
      pay_method: 'طريقة الدفع',
      back_orders: 'رجوع للطلبات',
      st_pending: 'قيد المراجعة',
      st_paid: 'تم التنفيذ',
      st_rejected: 'مرفوض',
      welcome: 'مرحباً',
      profile: 'الملف الشخصي',
      save: 'حفظ',
      saved: 'تم الحفظ',
      err_pw_short: 'كلمة المرور قصيرة جداً (٦ أحرف على الأقل)',
      checkout_as: 'الطلب باسم',
      guest_note: 'أو أكمل كزائر — أدخل اسمك وبريدك',
      page: 'صفحة',
      of: 'من',
      prev: 'السابق',
      next: 'التالي',
      track_note: 'أنشئ حساباً لتتبع حالة طلباتك',
    },
    en: {
      nav_home: 'Home',
      nav_store: 'Store',
      nav_how: 'How it works',
      nav_admin: 'Dashboard',
      hero_badge: 'Instant delivery · Online now',
      stat_orders: 'orders delivered',
      stat_delivery: 'avg. delivery',
      stat_support: 'support',
      stat_products: 'products live',
      minutes: 'minutes',
      sec_products: 'Available products',
      sec_products_sub: 'Pick a product and top up in seconds',
      all: 'All',
      how_title: 'How it works',
      how_sub: 'Just three steps between you and your top-up',
      how_1_t: 'Pick your product',
      how_1_d: 'Browse the store and choose the package that fits you.',
      how_2_t: 'Send the payment',
      how_2_d: 'Pay by account number or QR code, then enter the receipt number.',
      how_3_t: 'Get it instantly',
      how_3_d: 'We verify the transfer and top up your account within minutes.',
      from: 'From',
      buy_now: 'Buy now',
      back: 'Back to store',
      step_pkg: 'Choose a package',
      step_info: 'Your details',
      step_pay: 'Payment & confirmation',
      choose_pkg_first: 'Select a package first',
      receipt_label: 'Enter the transfer receipt number',
      receipt_ph: 'Type the receipt number here',
      contact_label: 'Contact number (optional)',
      contact_ph: 'WhatsApp or Telegram',
      copy: 'Copy',
      copied: 'Copied ✓',
      save_qr: 'Save QR code',
      summary: 'Order summary',
      product: 'Product',
      package: 'Package',
      method: 'Payment method',
      total: 'Total',
      confirm: "I've transferred — confirm order",
      sending: 'Sending…',
      trust_1: 'Delivered within minutes',
      trust_2: 'Secure, encrypted transactions',
      trust_3: '24/7 customer support',
      err_required: 'This field is required',
      err_email: 'Enter a valid email address',
      order_no: 'Order number',
      done: 'Great, thanks!',
      not_found: 'Product not found',
      empty_products: 'No products available right now',
      loading_fail: 'Could not load data',
      maintenance: 'Store under maintenance',
      rights: 'All rights reserved',
      nav_account: 'My account',
      sign_in: 'Sign in',
      sign_up: 'Create account',
      sign_out: 'Sign out',
      full_name: 'Full name',
      email: 'Email address',
      password: 'Password',
      phone: 'Phone number',
      name_ph: 'e.g. Ahmed Mohammed',
      email_ph: 'name@example.com',
      password_ph: 'At least 6 characters',
      have_account: 'Already have an account?',
      no_account: 'Don\'t have an account?',
      my_orders: 'My orders',
      order_history: 'Order history',
      no_orders: 'No orders yet',
      browse_now: 'Browse the store',
      order_details: 'Order details',
      status: 'Status',
      date: 'Date',
      receipt: 'Receipt number',
      player_id: 'Identifier',
      pay_method: 'Payment method',
      back_orders: 'Back to orders',
      st_pending: 'Under review',
      st_paid: 'Completed',
      st_rejected: 'Rejected',
      welcome: 'Welcome',
      profile: 'Profile',
      save: 'Save',
      saved: 'Saved',
      err_pw_short: 'Password is too short (at least 6 characters)',
      checkout_as: 'Ordering as',
      guest_note: 'Or continue as a guest — enter your name and email',
      page: 'Page',
      of: 'of',
      prev: 'Previous',
      next: 'Next',
      track_note: 'Create an account to track your order status',
    },
  };

  const KEY = 'lang';
  let current = 'ar';

  const t = (key) => DICT[current]?.[key] ?? DICT.ar[key] ?? key;

  /** Pick the localised variant of an API object: pick(product, 'name') -> name_ar|name_en */
  const pick = (obj, field) => {
    if (!obj) return '';
    return obj[`${field}_${current}`] ?? obj[`${field}_ar`] ?? obj[`${field}_en`] ?? '';
  };

  const get = () => current;
  const isRTL = () => current === 'ar';

  function apply(lang, { silent = false } = {}) {
    current = lang === 'en' ? 'en' : 'ar';
    try { localStorage.setItem(KEY, current); } catch {}

    const dir = isRTL() ? 'rtl' : 'ltr';
    document.documentElement.lang = current;
    document.documentElement.dir = dir;
    document.body.dir = dir;

    // Swap Bootstrap's LTR/RTL builds.
    const ltr = document.getElementById('bs-ltr');
    const rtl = document.getElementById('bs-rtl');
    if (ltr && rtl) { ltr.disabled = isRTL(); rtl.disabled = !isRTL(); }

    // Any element with data-i18n gets its text replaced.
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });

    // Language pill state
    document.querySelectorAll('.lang-toggle button').forEach((b) => {
      b.classList.toggle('on', b.dataset.lang === current);
    });
    positionGlider();

    if (!silent) document.dispatchEvent(new CustomEvent('langchange', { detail: current }));
  }

  function positionGlider() {
    const wrap = document.querySelector('.lang-toggle');
    if (!wrap) return;
    const active = wrap.querySelector('button.on');
    const glider = wrap.querySelector('.glider');
    if (!active || !glider) return;

    // inset-inline-start resolves to `right` under RTL, so measure from the
    // matching edge instead of always using the left-relative offsetLeft.
    const wr = wrap.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    const start = isRTL() ? wr.right - ar.right : ar.left - wr.left;

    glider.style.insetInlineStart = `${Math.max(0, Math.round(start))}px`;
    glider.style.inlineSize = `${Math.round(ar.width)}px`;
  }

  /** Read the stored preference; fall back to the admin-configured default. */
  function init(defaultLang = 'ar') {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    apply(saved || defaultLang, { silent: true });
  }

  function mountToggle() {
    document.querySelectorAll('.lang-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => apply(btn.dataset.lang));
    });
    window.addEventListener('resize', positionGlider);
    // Fonts can shift widths after load — re-measure once they're ready.
    if (document.fonts?.ready) document.fonts.ready.then(positionGlider);
  }

  /** Prices use Latin digits in both languages ("13,000 ل.س") — this is the
      convention on Arabic storefronts and keeps figures legible either way. */
  const num = (v) => new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);

  return { t, pick, get, isRTL, apply, init, mountToggle, num, positionGlider, DICT };
})();
