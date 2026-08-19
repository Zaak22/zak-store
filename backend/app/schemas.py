"""Pydantic request/response models."""
from __future__ import annotations

import datetime as dt
import re
from typing import Annotated, Literal

from pydantic import (
    BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator,
)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _to_utc_iso(v: dt.datetime) -> str:
    """SQLite drops tzinfo on the way out, so a naive value is UTC by
    construction here. Emit an explicit `Z` — otherwise browsers parse the
    string as *local* time and every timestamp is off by the UTC offset."""
    if v.tzinfo is None:
        v = v.replace(tzinfo=dt.timezone.utc)
    return v.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


UtcDatetime = Annotated[dt.datetime, PlainSerializer(_to_utc_iso, return_type=str)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    token: str
    username: str


# ---------- Settings ----------
class SettingsOut(ORMModel):
    brand_name_ar: str
    brand_name_en: str
    logo_emoji: str
    tagline_ar: str
    tagline_en: str
    hero_title_ar: str
    hero_title_en: str
    hero_subtitle_ar: str
    hero_subtitle_en: str
    hero_cta_ar: str
    hero_cta_en: str
    color_primary: str
    color_accent: str
    color_bg: str
    default_lang: str
    currency_ar: str
    currency_en: str
    checkout_note_ar: str
    checkout_note_en: str
    success_title_ar: str
    success_title_en: str
    success_body_ar: str
    success_body_en: str
    support_whatsapp: str
    support_telegram: str
    footer_text_ar: str
    footer_text_en: str
    maintenance_mode: bool
    maintenance_msg_ar: str
    maintenance_msg_en: str
    show_stats: bool
    animations_enabled: bool
    push_title: str
    push_body: str
    email_enabled: bool
    email_to: str
    email_subject: str
    dashboard_url: str


class SettingsIn(BaseModel):
    """Every field optional — the dashboard PATCHes only what changed."""
    model_config = ConfigDict(extra="ignore")

    brand_name_ar: str | None = Field(default=None, max_length=120)
    brand_name_en: str | None = Field(default=None, max_length=120)
    logo_emoji: str | None = Field(default=None, max_length=16)
    tagline_ar: str | None = Field(default=None, max_length=240)
    tagline_en: str | None = Field(default=None, max_length=240)
    hero_title_ar: str | None = Field(default=None, max_length=240)
    hero_title_en: str | None = Field(default=None, max_length=240)
    hero_subtitle_ar: str | None = None
    hero_subtitle_en: str | None = None
    hero_cta_ar: str | None = Field(default=None, max_length=120)
    hero_cta_en: str | None = Field(default=None, max_length=120)
    color_primary: str | None = Field(default=None, max_length=24)
    color_accent: str | None = Field(default=None, max_length=24)
    color_bg: str | None = Field(default=None, max_length=24)
    default_lang: Literal["ar", "en"] | None = None
    currency_ar: str | None = Field(default=None, max_length=24)
    currency_en: str | None = Field(default=None, max_length=24)
    checkout_note_ar: str | None = None
    checkout_note_en: str | None = None
    success_title_ar: str | None = Field(default=None, max_length=160)
    success_title_en: str | None = Field(default=None, max_length=160)
    success_body_ar: str | None = None
    success_body_en: str | None = None
    support_whatsapp: str | None = Field(default=None, max_length=80)
    support_telegram: str | None = Field(default=None, max_length=120)
    footer_text_ar: str | None = Field(default=None, max_length=240)
    footer_text_en: str | None = Field(default=None, max_length=240)
    maintenance_mode: bool | None = None
    maintenance_msg_ar: str | None = None
    maintenance_msg_en: str | None = None
    show_stats: bool | None = None
    animations_enabled: bool | None = None
    push_title: str | None = Field(default=None, max_length=120)
    push_body: str | None = Field(default=None, max_length=400)
    email_enabled: bool | None = None
    email_to: str | None = Field(default=None, max_length=200)
    email_subject: str | None = Field(default=None, max_length=200)
    dashboard_url: str | None = Field(default=None, max_length=300)


# ---------- Category ----------
class CategoryIn(BaseModel):
    name_ar: str
    name_en: str
    slug: str | None = None
    icon: str = "🎮"
    sort_order: int = 0
    is_active: bool = True


class CategoryOut(ORMModel):
    id: int
    slug: str
    name_ar: str
    name_en: str
    icon: str
    sort_order: int
    is_active: bool


# ---------- Package ----------
class PackageIn(BaseModel):
    label_ar: str
    label_en: str
    price: float = 0
    old_price: float | None = None
    note_ar: str = ""
    note_en: str = ""
    is_popular: bool = False
    sort_order: int = 0
    is_active: bool = True


class PackageOut(ORMModel):
    id: int
    product_id: int
    label_ar: str
    label_en: str
    price: float
    old_price: float | None
    note_ar: str
    note_en: str
    is_popular: bool
    sort_order: int
    is_active: bool


# ---------- Product ----------
class ProductIn(BaseModel):
    name_ar: str
    name_en: str
    slug: str | None = None
    category_id: int | None = None
    subtitle_ar: str = ""
    subtitle_en: str = ""
    description_ar: str = ""
    description_en: str = ""
    image_url: str = ""
    badge_ar: str = ""
    badge_en: str = ""
    field_label_ar: str = "أدخل معرّف اللاعب (Player ID)"
    field_label_en: str = "Enter your Player ID"
    field_placeholder_ar: str = "مثال: 512345678"
    field_placeholder_en: str = "e.g. 512345678"
    field_type: str = "text"
    sort_order: int = 0
    is_active: bool = True
    is_featured: bool = False


class ProductOut(ORMModel):
    id: int
    slug: str
    category_id: int | None
    name_ar: str
    name_en: str
    subtitle_ar: str
    subtitle_en: str
    description_ar: str
    description_en: str
    image_url: str
    badge_ar: str
    badge_en: str
    field_label_ar: str
    field_label_en: str
    field_placeholder_ar: str
    field_placeholder_en: str
    field_type: str
    sort_order: int
    is_active: bool
    is_featured: bool
    packages: list[PackageOut] = []


# ---------- Payment method ----------
class PaymentMethodIn(BaseModel):
    kind: str = "number"
    name_ar: str
    name_en: str
    instructions_ar: str = ""
    instructions_en: str = ""
    account_value: str = ""
    qr_image: str = ""
    icon: str = "💳"
    sort_order: int = 0
    is_active: bool = True


class PaymentMethodOut(ORMModel):
    id: int
    kind: str
    name_ar: str
    name_en: str
    instructions_ar: str
    instructions_en: str
    account_value: str
    qr_image: str
    icon: str
    sort_order: int
    is_active: bool


# ---------- Orders ----------
# SQLite/Postgres both reject integers outside int64; unbounded ids reached the
# driver and surfaced as a 500 instead of a clean 404.
MAX_ID = 2 ** 63 - 1
DbId = Annotated[int, Field(ge=1, le=MAX_ID)]


class OrderIn(BaseModel):
    product_id: DbId
    package_id: DbId
    customer_ref: str = Field(min_length=1, max_length=160)
    receipt_number: str = Field(min_length=1, max_length=160)
    payment_method_id: DbId | None = None
    contact: str = Field(default="", max_length=160)
    lang: str = "ar"
    # Collected at checkout. Ignored (and taken from the token) when signed in.
    customer_name: str = Field(default="", max_length=120)
    customer_email: str = Field(default="", max_length=200)

    @field_validator("customer_ref", "receipt_number", "customer_name", mode="before")
    @classmethod
    def _strip(cls, v):
        # Strip first: min_length ran before .strip() in the router, so a
        # whitespace-only player ID or receipt number was stored empty.
        return v.strip() if isinstance(v, str) else v

    @field_validator("customer_email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        v = v.strip()
        if v and not EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v


class OrderOut(ORMModel):
    id: int
    product_id: int | None
    package_id: int | None
    customer_id: int | None
    customer_name: str
    customer_email: str
    product_name: str
    package_label: str
    price: float
    currency: str
    customer_ref: str
    receipt_number: str
    payment_method_name: str
    contact: str
    lang: str
    status: str
    admin_note: str
    created_at: UtcDatetime


class CustomerOrderOut(ORMModel):
    """Order as the customer sees it — deliberately excludes `admin_note`,
    which is an internal field and must never reach the storefront."""
    id: int
    product_id: int | None
    package_id: int | None
    product_name: str
    package_label: str
    price: float
    currency: str
    customer_ref: str
    receipt_number: str
    payment_method_name: str
    contact: str
    lang: str
    status: str
    created_at: UtcDatetime


class CustomerOrderPage(BaseModel):
    items: list[CustomerOrderOut]
    total: int
    page: int
    per_page: int
    pages: int


class OrderPage(BaseModel):
    items: list[OrderOut]
    total: int
    page: int
    per_page: int
    pages: int


class OrderPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str | None = None
    admin_note: str | None = None


class OrderAck(BaseModel):
    id: int
    status: str


# ---------- Customers ----------
class CustomerRegister(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)
    phone: str = Field(default="", max_length=60)

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v):
        # Strip *before* length validation — otherwise "  " passes min_length=2
        # and stores an empty name, which then blocks checkout.
        return v.strip() if isinstance(v, str) else v


class CustomerLogin(BaseModel):
    email: EmailStr
    password: str


class CustomerOut(ORMModel):
    id: int
    name: str
    email: str
    phone: str
    created_at: UtcDatetime


class CustomerTokenOut(BaseModel):
    token: str
    customer: CustomerOut


class CustomerProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=60)

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v


# ---------- Notifications ----------
class NotificationOut(ORMModel):
    id: int
    order_id: int | None
    kind: str
    title: str
    body: str
    is_read: bool
    created_at: UtcDatetime


class NotificationFeed(BaseModel):
    items: list[NotificationOut]
    unread: int


# ---------- Push ----------
class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=8, max_length=2000)
    keys: PushKeys
    user_agent: str = Field(default="", max_length=300)


class PushSubscriptionOut(ORMModel):
    id: int
    endpoint: str
    user_agent: str
    created_at: UtcDatetime


# ---------- Aggregates ----------
class BootstrapOut(BaseModel):
    settings: SettingsOut
    categories: list[CategoryOut]
    products: list[ProductOut]
    payment_methods: list[PaymentMethodOut]


class StatsOut(BaseModel):
    total_orders: int
    pending: int
    paid: int
    rejected: int
    revenue: float
    today_orders: int
    products: int
    subscriptions: int
    push_configured: bool
    recent: list[OrderOut]
    revenue_series: list[dict]
