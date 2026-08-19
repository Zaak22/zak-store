"""Seed the database with a realistic starter catalogue on first boot."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .models import Category, Package, PaymentMethod, Product, SiteSettings


def get_settings(db: Session) -> SiteSettings:
    row = db.query(SiteSettings).first()
    if row is None:
        row = SiteSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


CATEGORIES = [
    {"slug": "games", "name_ar": "الألعاب", "name_en": "Games", "icon": "🎮", "sort_order": 1},
    {"slug": "apps", "name_ar": "التطبيقات", "name_en": "Apps", "icon": "📱", "sort_order": 2},
    {"slug": "subscriptions", "name_ar": "الاشتراكات", "name_en": "Subscriptions", "icon": "⭐", "sort_order": 3},
]

PRODUCTS = [
    {
        "slug": "pubg-mobile", "cat": "games",
        "name_ar": "ببجي موبايل", "name_en": "PUBG Mobile",
        "subtitle_ar": "شحن شدات UC", "subtitle_en": "UC top-up",
        "description_ar": "اختر حزمة الشدات المطلوبة وأدخل بياناتك لإتمام الشحن الفوري.",
        "description_en": "Pick your UC package and enter your details for instant delivery.",
        "image_url": "assets/img/pubg-mobile.jpg",
        "badge_ar": "الأكثر مبيعاً", "badge_en": "Best seller",
        "field_label_ar": "أدخل معرّف اللاعب (Player ID)", "field_label_en": "Enter your Player ID",
        "field_placeholder_ar": "مثال: 512345678", "field_placeholder_en": "e.g. 512345678",
        "field_type": "number", "is_featured": True, "sort_order": 1,
        "packages": [
            {"label_ar": "60 شدة", "label_en": "60 UC", "price": 13000, "sort_order": 1},
            {"label_ar": "120 شدة", "label_en": "120 UC", "price": 25000, "old_price": 27000, "is_popular": True, "sort_order": 2},
            {"label_ar": "360 شدة", "label_en": "360 UC", "price": 70000, "sort_order": 3},
            {"label_ar": "660 شدة", "label_en": "660 UC", "price": 125000, "note_ar": "أفضل قيمة", "note_en": "Best value", "sort_order": 4},
        ],
    },
    {
        "slug": "free-fire", "cat": "games",
        "name_ar": "فري فاير", "name_en": "Free Fire",
        "subtitle_ar": "شحن جواهر", "subtitle_en": "Diamonds top-up",
        "description_ar": "شحن جواهر فري فاير بأسرع وقت وبأفضل سعر.",
        "description_en": "Fast, cheap Free Fire diamond top-ups.",
        "image_url": "assets/img/free-fire.jpg",
        "badge_ar": "سريع", "badge_en": "Fast",
        "field_label_ar": "أدخل معرّف اللاعب (Player ID)", "field_label_en": "Enter your Player ID",
        "field_placeholder_ar": "مثال: 123456789", "field_placeholder_en": "e.g. 123456789",
        "field_type": "number", "is_featured": True, "sort_order": 2,
        "packages": [
            {"label_ar": "100 جوهرة", "label_en": "100 Diamonds", "price": 11000, "sort_order": 1},
            {"label_ar": "310 جوهرة", "label_en": "310 Diamonds", "price": 30000, "is_popular": True, "sort_order": 2},
            {"label_ar": "520 جوهرة", "label_en": "520 Diamonds", "price": 49000, "sort_order": 3},
        ],
    },
    {
        "slug": "capcut-pro", "cat": "apps",
        "name_ar": "كاب كات برو", "name_en": "CapCut Pro",
        "subtitle_ar": "اشتراك شهري", "subtitle_en": "Monthly plan",
        "description_ar": "فعّل اشتراك كاب كات برو على حسابك خلال دقائق.",
        "description_en": "Activate CapCut Pro on your account within minutes.",
        "image_url": "assets/img/capcut-pro.jpg",
        "badge_ar": "جديد", "badge_en": "New",
        "field_label_ar": "أدخل بريد الحساب", "field_label_en": "Enter your account email",
        "field_placeholder_ar": "name@example.com", "field_placeholder_en": "name@example.com",
        "field_type": "email", "sort_order": 3,
        "packages": [
            {"label_ar": "شهر واحد", "label_en": "1 Month", "price": 45000, "sort_order": 1},
            {"label_ar": "3 أشهر", "label_en": "3 Months", "price": 120000, "is_popular": True, "sort_order": 2},
        ],
    },
    {
        "slug": "netflix", "cat": "subscriptions",
        "name_ar": "نتفليكس", "name_en": "Netflix",
        "subtitle_ar": "حساب مشترك", "subtitle_en": "Shared profile",
        "description_ar": "اشتراك نتفليكس بجودة 4K مع ضمان كامل المدة.",
        "description_en": "Netflix 4K subscription with a full-term guarantee.",
        "image_url": "assets/img/netflix.jpg",
        "badge_ar": "ضمان", "badge_en": "Guaranteed",
        "field_label_ar": "أدخل بريد الحساب", "field_label_en": "Enter your account email",
        "field_placeholder_ar": "name@example.com", "field_placeholder_en": "name@example.com",
        "field_type": "email", "sort_order": 4,
        "packages": [
            {"label_ar": "شهر واحد", "label_en": "1 Month", "price": 60000, "sort_order": 1},
            {"label_ar": "6 أشهر", "label_en": "6 Months", "price": 320000, "old_price": 360000, "is_popular": True, "sort_order": 2},
        ],
    },
]

PAYMENT_METHODS = [
    {
        "kind": "number", "icon": "🏦",
        "name_ar": "عبر رقم الحساب", "name_en": "By account number",
        "instructions_ar": "انسخ رقم الحساب التالي وحوّل المبلغ من تطبيقك، ثم أدخل رقم الإيصال.",
        "instructions_en": "Copy the account number below, transfer from your app, then enter the receipt number.",
        "account_value": "5df2f97711300f1d9f64fc0c64aa6092",
        "sort_order": 1,
    },
    {
        "kind": "qr", "icon": "🧾",
        "name_ar": "عبر كود QR", "name_en": "By QR code",
        "instructions_ar": "امسح كود الـ QR التالي من تطبيق الدفع، ثم أدخل رقم الإيصال.",
        "instructions_en": "Scan the QR code below in your payment app, then enter the receipt number.",
        "qr_image": "",
        "sort_order": 2,
    },
]


def seed_if_empty(db: Session) -> None:
    get_settings(db)
    if db.query(Product).count() > 0:
        return

    cats: dict[str, Category] = {}
    for data in CATEGORIES:
        cat = Category(**data)
        db.add(cat)
        cats[data["slug"]] = cat
    db.flush()

    for entry in PRODUCTS:
        data = dict(entry)  # copy: never mutate the module-level template
        packages = data.pop("packages")
        cat_slug = data.pop("cat")
        product = Product(**data, category_id=cats[cat_slug].id)
        db.add(product)
        db.flush()
        for pkg in packages:
            db.add(Package(**pkg, product_id=product.id))

    for data in PAYMENT_METHODS:
        db.add(PaymentMethod(**data))

    db.commit()
