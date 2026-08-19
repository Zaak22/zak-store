"""Admin dashboard API — every endpoint requires a bearer token."""
from __future__ import annotations

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.exc import IntegrityError
from slugify import slugify
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..config import config
from ..database import get_db
from ..models import (
    Category, Notification, Order, Package, PaymentMethod, Product,
    PushSubscription,
)
from ..mailer import send_order_email
from ..push import send_to_admins
from ..schemas import (  # noqa: F401
    MAX_ID,
    CategoryIn, CategoryOut, LoginIn, NotificationFeed, NotificationOut,
    OrderOut, OrderPage, OrderPatch, PackageIn,
    PackageOut, PaymentMethodIn, PaymentMethodOut, ProductIn, ProductOut,
    PushSubscriptionIn, PushSubscriptionOut, SettingsIn, SettingsOut, StatsOut,
    TokenOut,
)
from ..security import SCOPE_ADMIN, create_token, require_admin, verify_admin_credentials
from ..seed import get_settings

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

MAX_IMAGE_CHARS = 2_000_000  # ~1.5 MB once base64-decoded


@auth_router.post("/login", response_model=TokenOut)
def login(payload: LoginIn) -> TokenOut:
    if not verify_admin_credentials(payload.username, payload.password):
        raise HTTPException(401, "Invalid username or password")
    return TokenOut(token=create_token(payload.username, SCOPE_ADMIN), username=payload.username)


@auth_router.get("/me")
def me(username: str = Depends(require_admin)) -> dict:
    return {"username": username}


def _unique_slug(db: Session, model, base: str, *, exclude_id: int | None = None) -> str:
    root = slugify(base) or "item"
    candidate, n = root, 2
    while True:
        stmt = select(model).where(model.slug == candidate)
        if exclude_id is not None:
            stmt = stmt.where(model.id != exclude_id)
        if db.scalar(stmt) is None:
            return candidate
        candidate, n = f"{root}-{n}", n + 1


def _insert_with_unique_slug(db: Session, model, data: dict, base: str, attempts: int = 6):
    """Insert, retrying on slug collision.

    `_unique_slug` is a SELECT-then-INSERT, so two concurrent creates with the
    same name both computed the same free slug and one hit the unique index.
    A double-clicked Save button was enough to trigger it.
    """
    for attempt in range(attempts):
        data["slug"] = _unique_slug(db, model, base)
        row = model(**data)
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if attempt == attempts - 1:
                raise HTTPException(409, "Could not allocate a unique slug, please retry")
            continue
        db.refresh(row)
        return row


# --------------------------------------------------------------- settings
@router.get("/settings", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db)):
    return get_settings(db)


@router.put("/settings", response_model=SettingsOut)
def update_settings(payload: SettingsIn, db: Session = Depends(get_db)):
    row = get_settings(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


# ------------------------------------------------------------- categories
@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return list(db.scalars(select(Category).order_by(Category.sort_order, Category.id)).all())


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    row = _insert_with_unique_slug(db, Category, data, data.get("slug") or data["name_en"])
    return row


@router.put("/categories/{item_id}", response_model=CategoryOut)
def update_category(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], payload: CategoryIn, db: Session = Depends(get_db)):
    row = db.get(Category, item_id)
    if row is None:
        raise HTTPException(404, "Category not found")
    data = payload.model_dump()
    data["slug"] = _unique_slug(db, Category, data.get("slug") or data["name_en"], exclude_id=item_id)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/categories/{item_id}", status_code=204)
def delete_category(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], db: Session = Depends(get_db)) -> None:
    row = db.get(Category, item_id)
    if row is None:
        raise HTTPException(404, "Category not found")
    db.delete(row)
    db.commit()


# --------------------------------------------------------------- products
@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return list(
        db.scalars(
            select(Product).options(selectinload(Product.packages)).order_by(Product.sort_order, Product.id)
        ).all()
    )


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(payload: ProductIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if len(data.get("image_url") or "") > MAX_IMAGE_CHARS:
        raise HTTPException(413, "Image is too large (max ~1.5 MB)")
    row = _insert_with_unique_slug(db, Product, data, data.get("slug") or data["name_en"])
    return row


@router.put("/products/{item_id}", response_model=ProductOut)
def update_product(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], payload: ProductIn, db: Session = Depends(get_db)):
    row = db.get(Product, item_id)
    if row is None:
        raise HTTPException(404, "Product not found")
    data = payload.model_dump()
    if len(data.get("image_url") or "") > MAX_IMAGE_CHARS:
        raise HTTPException(413, "Image is too large (max ~1.5 MB)")
    data["slug"] = _unique_slug(db, Product, data.get("slug") or data["name_en"], exclude_id=item_id)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/products/{item_id}", status_code=204)
def delete_product(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], db: Session = Depends(get_db)) -> None:
    row = db.get(Product, item_id)
    if row is None:
        raise HTTPException(404, "Product not found")
    db.delete(row)
    db.commit()


# --------------------------------------------------------------- packages
@router.post("/products/{product_id}/packages", response_model=PackageOut, status_code=201)
def create_package(product_id: Annotated[int, Path(ge=1, le=MAX_ID)], payload: PackageIn, db: Session = Depends(get_db)):
    if db.get(Product, product_id) is None:
        raise HTTPException(404, "Product not found")
    row = Package(**payload.model_dump(), product_id=product_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/packages/{item_id}", response_model=PackageOut)
def update_package(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], payload: PackageIn, db: Session = Depends(get_db)):
    row = db.get(Package, item_id)
    if row is None:
        raise HTTPException(404, "Package not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/packages/{item_id}", status_code=204)
def delete_package(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], db: Session = Depends(get_db)) -> None:
    row = db.get(Package, item_id)
    if row is None:
        raise HTTPException(404, "Package not found")
    db.delete(row)
    db.commit()


# -------------------------------------------------------- payment methods
@router.get("/payment-methods", response_model=list[PaymentMethodOut])
def list_methods(db: Session = Depends(get_db)):
    return list(db.scalars(select(PaymentMethod).order_by(PaymentMethod.sort_order, PaymentMethod.id)).all())


@router.post("/payment-methods", response_model=PaymentMethodOut, status_code=201)
def create_method(payload: PaymentMethodIn, db: Session = Depends(get_db)):
    if len(payload.qr_image or "") > MAX_IMAGE_CHARS:
        raise HTTPException(413, "QR image is too large (max ~1.5 MB)")
    row = PaymentMethod(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/payment-methods/{item_id}", response_model=PaymentMethodOut)
def update_method(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], payload: PaymentMethodIn, db: Session = Depends(get_db)):
    row = db.get(PaymentMethod, item_id)
    if row is None:
        raise HTTPException(404, "Payment method not found")
    if len(payload.qr_image or "") > MAX_IMAGE_CHARS:
        raise HTTPException(413, "QR image is too large (max ~1.5 MB)")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/payment-methods/{item_id}", status_code=204)
def delete_method(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], db: Session = Depends(get_db)) -> None:
    row = db.get(PaymentMethod, item_id)
    if row is None:
        raise HTTPException(404, "Payment method not found")
    db.delete(row)
    db.commit()


# ----------------------------------------------------------------- orders
def _order_filters(stmt, status: str | None, q: str | None):
    """Shared between the listing and the page-locator so they always agree."""
    if status and status != "all":
        stmt = stmt.where(Order.status == status)
    if q and q.strip():
        # Escape LIKE metacharacters: an admin pasting a receipt containing "%"
        # or "_" was silently matching unrelated rows.
        literal = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        needle = f"%{literal}%"
        stmt = stmt.where(
            Order.customer_ref.ilike(needle, escape="\\")
            | Order.receipt_number.ilike(needle, escape="\\")
            | Order.product_name.ilike(needle, escape="\\")
            | Order.customer_name.ilike(needle, escape="\\")
            | Order.customer_email.ilike(needle, escape="\\")
        )
    return stmt


@router.get("/orders", response_model=OrderPage)
def list_orders(
    status: str | None = None,
    q: str | None = None,
    page: Annotated[int, Query(ge=1, le=MAX_ID)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
) -> OrderPage:
    per_page = min(max(1, per_page), 100)

    total = int(db.scalar(_order_filters(select(func.count()).select_from(Order), status, q)) or 0)
    pages = max(1, -(-total // per_page))   # ceiling division
    # Clamp rather than echo: an admin on the last page who deletes its only
    # order would otherwise land on a page that no longer exists.
    page = min(max(1, page), pages)

    stmt = _order_filters(select(Order), status, q).order_by(
        Order.created_at.desc(), Order.id.desc()
    ).offset((page - 1) * per_page).limit(per_page)

    return OrderPage(
        items=[OrderOut.model_validate(o) for o in db.scalars(stmt).all()],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get("/orders/{item_id}/locate")
def locate_order(
    item_id: Annotated[int, Path(ge=1, le=MAX_ID)],
    status: str | None = None,
    q: str | None = None,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
) -> dict:
    """Which page does this order fall on, under the given filters?

    Used when a notification deep-links to an order that is not on page 1.
    Returns found=False when the current filters exclude it, so the caller can
    reset them instead of showing an empty page.
    """
    per_page = min(max(1, per_page), 100)
    target = db.get(Order, item_id)
    if target is None:
        raise HTTPException(404, "Order not found")

    # Count how many rows sort ahead of it under the same ordering.
    ahead_stmt = _order_filters(select(func.count()).select_from(Order), status, q).where(
        (Order.created_at > target.created_at)
        | ((Order.created_at == target.created_at) & (Order.id > target.id))
    )
    matches = db.scalar(
        _order_filters(select(func.count()).select_from(Order), status, q).where(Order.id == item_id)
    )
    if not matches:
        return {"found": False, "page": 1, "per_page": per_page}

    ahead = int(db.scalar(ahead_stmt) or 0)
    return {"found": True, "page": ahead // per_page + 1, "per_page": per_page, "index": ahead}


@router.get("/orders/{item_id}", response_model=OrderOut)
def get_order(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], db: Session = Depends(get_db)):
    row = db.get(Order, item_id)
    if row is None:
        raise HTTPException(404, "Order not found")
    return row


@router.patch("/orders/{item_id}", response_model=OrderOut)
def patch_order(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], payload: OrderPatch, db: Session = Depends(get_db)):
    row = db.get(Order, item_id)
    if row is None:
        raise HTTPException(404, "Order not found")
    if payload.status is not None:
        if payload.status not in {"pending", "paid", "rejected"}:
            raise HTTPException(400, "Invalid status")
        row.status = payload.status
    if payload.admin_note is not None:
        row.admin_note = payload.admin_note
    db.commit()
    db.refresh(row)
    return row


@router.delete("/orders/{item_id}", status_code=204)
def delete_order(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], db: Session = Depends(get_db)) -> None:
    row = db.get(Order, item_id)
    if row is None:
        raise HTTPException(404, "Order not found")
    db.delete(row)
    db.commit()


# ------------------------------------------------------------------ stats
@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)) -> StatsOut:
    by_status = dict(db.execute(select(Order.status, func.count()).group_by(Order.status)).all())
    total = sum(by_status.values())
    revenue = float(db.scalar(select(func.coalesce(func.sum(Order.price), 0)).where(Order.status == "paid")) or 0)

    # Calendar day, not a rolling 24h window — "today" must mean today.
    now = dt.datetime.now(dt.timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_orders = int(db.scalar(select(func.count()).select_from(Order).where(Order.created_at >= midnight)) or 0)

    recent = list(db.scalars(select(Order).order_by(Order.created_at.desc(), Order.id.desc()).limit(8)).all())

    # Last 7 days of paid revenue, bucketed in Python so it works on SQLite + Postgres alike.
    # Floor to midnight: using a bare timestamp dropped everything that happened
    # on the oldest day before the current time-of-day, while still showing that
    # day's (understated) bucket — so the chart changed on every refresh.
    since = midnight - dt.timedelta(days=6)
    rows = db.execute(
        select(Order.created_at, Order.price).where(Order.created_at >= since, Order.status == "paid")
    ).all()
    buckets: dict[str, float] = {}
    for i in range(7):
        buckets[(since + dt.timedelta(days=i)).date().isoformat()] = 0.0
    for created, price in rows:
        if created is None:
            continue
        key = created.date().isoformat()
        if key in buckets:
            buckets[key] += float(price or 0)

    return StatsOut(
        total_orders=total,
        pending=by_status.get("pending", 0),
        paid=by_status.get("paid", 0),
        rejected=by_status.get("rejected", 0),
        revenue=revenue,
        today_orders=today_orders,
        products=int(db.scalar(select(func.count()).select_from(Product)) or 0),
        subscriptions=int(db.scalar(select(func.count()).select_from(PushSubscription)) or 0),
        push_configured=config.push_enabled,
        recent=[OrderOut.model_validate(o) for o in recent],
        revenue_series=[{"day": k, "value": v} for k, v in buckets.items()],
    )


# ---------------------------------------------------------- notifications
@router.get("/notifications", response_model=NotificationFeed)
def list_notifications(
    limit: Annotated[int, Query(ge=0, le=100)] = 30,
    since_id: Annotated[int | None, Query(ge=0, le=MAX_ID)] = None,
    db: Session = Depends(get_db),
) -> NotificationFeed:
    """Newest first. Pass since_id to poll for only what arrived after it."""
    stmt = select(Notification).order_by(Notification.id.desc())
    if since_id is not None:
        stmt = stmt.where(Notification.id > since_id)
    items = list(db.scalars(stmt.limit(max(0, min(limit, 100)))).all())
    unread = int(
        db.scalar(select(func.count()).select_from(Notification).where(Notification.is_read.is_(False))) or 0
    )
    return NotificationFeed(
        items=[NotificationOut.model_validate(n) for n in items],
        unread=unread,
    )


@router.post("/notifications/{item_id}/read", response_model=NotificationOut)
def mark_read(item_id: Annotated[int, Path(ge=1, le=MAX_ID)], db: Session = Depends(get_db)):
    row = db.get(Notification, item_id)
    if row is None:
        raise HTTPException(404, "Notification not found")
    row.is_read = True
    db.commit()
    db.refresh(row)
    return row


@router.post("/notifications/read-all")
def mark_all_read(db: Session = Depends(get_db)) -> dict:
    changed = (
        db.query(Notification)
        .filter(Notification.is_read.is_(False))
        .update({Notification.is_read: True}, synchronize_session=False)
    )
    db.commit()
    return {"marked": int(changed)}


@router.delete("/notifications", status_code=204)
def clear_notifications(db: Session = Depends(get_db)) -> None:
    db.query(Notification).delete(synchronize_session=False)
    db.commit()


# ------------------------------------------------------------------- push
@router.get("/push/subscriptions", response_model=list[PushSubscriptionOut])
def list_subscriptions(db: Session = Depends(get_db)):
    return list(db.scalars(select(PushSubscription).order_by(PushSubscription.id.desc())).all())


@router.post("/push/subscribe", response_model=PushSubscriptionOut, status_code=201)
def subscribe(payload: PushSubscriptionIn, db: Session = Depends(get_db)):
    row = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if row is None:
        row = PushSubscription(endpoint=payload.endpoint)
        db.add(row)
    row.p256dh = payload.keys.p256dh
    row.auth = payload.keys.auth
    row.user_agent = payload.user_agent[:300]
    db.commit()
    db.refresh(row)
    return row


@router.post("/push/unsubscribe", status_code=204)
def unsubscribe(payload: dict, db: Session = Depends(get_db)) -> None:
    endpoint = (payload or {}).get("endpoint") or ""
    if not endpoint:
        # An empty body must not match a junk row and delete it.
        raise HTTPException(422, "endpoint is required")
    row = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if row is not None:
        db.delete(row)
        db.commit()


@router.post("/email/test")
def email_test(db: Session = Depends(get_db)) -> dict:
    """Send a sample order email so the operator can verify SMTP end to end."""
    if not config.smtp_configured:
        raise HTTPException(400, "SMTP is not configured on the server (set SMTP_HOST / SMTP_USER / SMTP_PASSWORD)")
    settings = get_settings(db)
    if not settings.email_to.strip():
        raise HTTPException(400, "No recipient set — fill in 'Send order emails to'")

    sample = db.scalar(select(Order).order_by(Order.id.desc()))
    if sample is None:
        raise HTTPException(400, "No orders yet to use as a sample")

    result = send_order_email(
        sample,
        to=settings.email_to,
        title=f"[Test] {settings.email_subject.format(id=sample.id, product=sample.product_name, package=sample.package_label, price=sample.price, ref=sample.customer_ref, receipt=sample.receipt_number)}"[:200],
        body="This is a test email. Your SMTP settings are working.",
        dashboard_url=settings.dashboard_url,
    )
    if not result.get("sent"):
        raise HTTPException(502, f"Email failed: {result.get('reason', 'unknown')}")
    return {"sent": True, "to": settings.email_to}


@router.post("/push/test")
def push_test(db: Session = Depends(get_db)) -> dict:
    if not config.push_enabled:
        raise HTTPException(400, "VAPID keys are not configured on the server")
    return send_to_admins(
        db,
        title="🔔 Test notification",
        body="Push notifications are working correctly.",
        url="/admin.html",
        tag="test",
    )
