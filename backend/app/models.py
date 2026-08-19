"""Database models. Every user-visible string exists in both Arabic and English
so the admin dashboard is the single source of truth for the whole storefront."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class SiteSettings(Base):
    """Single-row table holding global, admin-editable site configuration."""
    __tablename__ = "site_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)

    # Brand
    brand_name_ar: Mapped[str] = mapped_column(String(120), default="متجر زاك")
    brand_name_en: Mapped[str] = mapped_column(String(120), default="Zak Store")
    logo_emoji: Mapped[str] = mapped_column(String(16), default="🚀")
    tagline_ar: Mapped[str] = mapped_column(String(240), default="شحن فوري وآمن")
    tagline_en: Mapped[str] = mapped_column(String(240), default="Instant & secure top-up")

    # Hero
    hero_title_ar: Mapped[str] = mapped_column(String(240), default="اشحن ألعابك في ثوانٍ")
    hero_title_en: Mapped[str] = mapped_column(String(240), default="Top up your games in seconds")
    hero_subtitle_ar: Mapped[str] = mapped_column(Text, default="أفضل الأسعار، تسليم فوري، ودعم على مدار الساعة.")
    hero_subtitle_en: Mapped[str] = mapped_column(Text, default="Best prices, instant delivery, 24/7 support.")
    hero_cta_ar: Mapped[str] = mapped_column(String(120), default="تصفّح المتجر")
    hero_cta_en: Mapped[str] = mapped_column(String(120), default="Browse the store")

    # Theme (drives CSS custom properties on the front-end)
    color_primary: Mapped[str] = mapped_column(String(24), default="#7c5cff")
    color_accent: Mapped[str] = mapped_column(String(24), default="#22d3ee")
    color_bg: Mapped[str] = mapped_column(String(24), default="#07070f")
    default_lang: Mapped[str] = mapped_column(String(4), default="ar")

    # Commerce
    currency_ar: Mapped[str] = mapped_column(String(24), default="ل.س")
    currency_en: Mapped[str] = mapped_column(String(24), default="SYP")

    # Checkout copy
    checkout_note_ar: Mapped[str] = mapped_column(Text, default="* تأكد من كتابة رقم الإيصال بشكل صحيح لتفادي إلغاء الطلب.")
    checkout_note_en: Mapped[str] = mapped_column(Text, default="* Please double-check the receipt number to avoid order cancellation.")
    success_title_ar: Mapped[str] = mapped_column(String(160), default="تم استلام طلبك!")
    success_title_en: Mapped[str] = mapped_column(String(160), default="Order received!")
    success_body_ar: Mapped[str] = mapped_column(Text, default="سيتم تنفيذ الشحن خلال دقائق بعد التحقق من التحويل.")
    success_body_en: Mapped[str] = mapped_column(Text, default="Your top-up will be delivered within minutes after we verify the transfer.")

    # Contact / footer
    support_whatsapp: Mapped[str] = mapped_column(String(80), default="")
    support_telegram: Mapped[str] = mapped_column(String(120), default="")
    footer_text_ar: Mapped[str] = mapped_column(String(240), default="جميع الحقوق محفوظة")
    footer_text_en: Mapped[str] = mapped_column(String(240), default="All rights reserved")

    # Behaviour toggles
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    maintenance_msg_ar: Mapped[str] = mapped_column(Text, default="المتجر تحت الصيانة، عد قريباً.")
    maintenance_msg_en: Mapped[str] = mapped_column(Text, default="The store is under maintenance, check back soon.")
    show_stats: Mapped[bool] = mapped_column(Boolean, default=True)
    animations_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Email notification (SMTP credentials live in env vars, not here)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    email_to: Mapped[str] = mapped_column(String(200), default="")
    email_subject: Mapped[str] = mapped_column(String(200), default="New order #{id} — {product}")
    dashboard_url: Mapped[str] = mapped_column(String(300), default="")

    # Push notification template ({product}, {package}, {price}, {id} placeholders)
    push_title: Mapped[str] = mapped_column(String(120), default="🔔 New order #{id}")
    push_body: Mapped[str] = mapped_column(String(400), default="{product} — {package} · {price}")

    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(16), default="🎮")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)

    name_ar: Mapped[str] = mapped_column(String(160))
    name_en: Mapped[str] = mapped_column(String(160))
    subtitle_ar: Mapped[str] = mapped_column(String(240), default="")
    subtitle_en: Mapped[str] = mapped_column(String(240), default="")
    description_ar: Mapped[str] = mapped_column(Text, default="")
    description_en: Mapped[str] = mapped_column(Text, default="")

    image_url: Mapped[str] = mapped_column(Text, default="")
    badge_ar: Mapped[str] = mapped_column(String(60), default="")
    badge_en: Mapped[str] = mapped_column(String(60), default="")

    # The customer-identifier field shown on the checkout page (fully configurable)
    field_label_ar: Mapped[str] = mapped_column(String(160), default="أدخل معرّف اللاعب (Player ID)")
    field_label_en: Mapped[str] = mapped_column(String(160), default="Enter your Player ID")
    field_placeholder_ar: Mapped[str] = mapped_column(String(160), default="مثال: 512345678")
    field_placeholder_en: Mapped[str] = mapped_column(String(160), default="e.g. 512345678")
    field_type: Mapped[str] = mapped_column(String(20), default="text")  # text | number | email

    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)

    category: Mapped["Category | None"] = relationship(back_populates="products")
    packages: Mapped[list["Package"]] = relationship(
        back_populates="product", cascade="all, delete-orphan",
        order_by="Package.sort_order",
    )


class Package(Base):
    """A purchasable tier for a product — e.g. '60 UC' for 13,000 SYP."""
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)

    label_ar: Mapped[str] = mapped_column(String(120))
    label_en: Mapped[str] = mapped_column(String(120))
    price: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    old_price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    note_ar: Mapped[str] = mapped_column(String(120), default="")
    note_en: Mapped[str] = mapped_column(String(120), default="")
    is_popular: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped["Product"] = relationship(back_populates="packages")


class PaymentMethod(Base):
    """How the customer pays: a copyable account number, or a QR image."""
    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), default="number")  # number | qr

    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    instructions_ar: Mapped[str] = mapped_column(Text, default="")
    instructions_en: Mapped[str] = mapped_column(Text, default="")

    account_value: Mapped[str] = mapped_column(Text, default="")   # account number, for kind=number
    qr_image: Mapped[str] = mapped_column(Text, default="")        # URL or data: URI, for kind=qr
    icon: Mapped[str] = mapped_column(String(16), default="💳")

    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Customer(Base):
    """A storefront account. Lets a customer see their own order history."""
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    phone: Mapped[str] = mapped_column(String(60), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)

    orders: Mapped[list["Order"]] = relationship(back_populates="customer")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Snapshot the display values so historical orders survive product edits.
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    package_id: Mapped[int | None] = mapped_column(ForeignKey("packages.id", ondelete="SET NULL"), nullable=True)
    product_name: Mapped[str] = mapped_column(String(160), default="")
    package_label: Mapped[str] = mapped_column(String(120), default="")
    price: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(24), default="")

    # Account that placed it (null for guest checkout), plus a snapshot so the
    # order still reads correctly if the account is later renamed or deleted.
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_name: Mapped[str] = mapped_column(String(120), default="")
    customer_email: Mapped[str] = mapped_column(String(200), default="", index=True)

    customer_ref: Mapped[str] = mapped_column(String(160), default="")   # player id / account
    receipt_number: Mapped[str] = mapped_column(String(160), default="")
    payment_method_name: Mapped[str] = mapped_column(String(120), default="")
    contact: Mapped[str] = mapped_column(String(160), default="")
    lang: Mapped[str] = mapped_column(String(4), default="ar")

    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|paid|rejected
    admin_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    customer: Mapped["Customer | None"] = relationship(back_populates="orders")


class Notification(Base):
    """An in-dashboard notification. Created for every incoming order, so the
    admin sees a history even if the browser push never arrived."""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), default="order")
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(String(400), default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_now, index=True
    )


class PushSubscription(Base):
    """A browser push endpoint belonging to the admin."""
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)
