"""Public storefront API — no authentication required."""
from __future__ import annotations

import logging
import re
import string

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import config
from ..database import SessionLocal, get_db
from ..models import Category, Customer, Notification, Order, Package, PaymentMethod, Product
from ..mailer import send_order_email
from ..push import send_to_admins
from ..schemas import BootstrapOut, OrderAck, OrderIn, ProductOut
from ..security import optional_customer
from ..seed import get_settings

log = logging.getLogger("public")

router = APIRouter(prefix="/api", tags=["public"])


def _active_products(db: Session) -> list[Product]:
    stmt = (
        select(Product)
        .options(selectinload(Product.packages))
        .where(Product.is_active.is_(True))
        .order_by(Product.sort_order, Product.id)
    )
    return list(db.scalars(stmt).all())


def _visible(product: Product) -> ProductOut:
    """Serialise a product with inactive packages hidden.

    Deliberately does NOT assign to `product.packages`: that relationship is
    `cascade="all, delete-orphan"`, so replacing it with a filtered list arms
    the session to DELETE the inactive packages on the next flush. Filter on
    the way out instead of mutating the ORM object.
    """
    out = ProductOut.model_validate(product)
    out.packages = [p for p in out.packages if p.is_active]
    return out


@router.get("/bootstrap", response_model=BootstrapOut)
def bootstrap(db: Session = Depends(get_db)) -> BootstrapOut:
    """Everything the storefront needs, in a single round-trip."""
    categories = list(
        db.scalars(
            select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order, Category.id)
        ).all()
    )
    methods = [
        m
        for m in db.scalars(
            select(PaymentMethod)
            .where(PaymentMethod.is_active.is_(True))
            .order_by(PaymentMethod.sort_order, PaymentMethod.id)
        ).all()
        # A QR method with no image, or a number method with no number, is not
        # payable — showing "scan the QR code below" with no QR just strands
        # the customer mid-checkout.
        if (m.kind == "qr" and m.qr_image.strip())
        or (m.kind != "qr" and m.account_value.strip())
    ]
    return BootstrapOut(
        settings=get_settings(db),
        categories=categories,
        products=[_visible(p) for p in _active_products(db)],
        payment_methods=methods,
    )


@router.get("/products/{slug}", response_model=ProductOut)
def product_detail(slug: str, db: Session = Depends(get_db)) -> Product:
    product = db.scalar(
        select(Product)
        .options(selectinload(Product.packages))
        .where(Product.slug == slug, Product.is_active.is_(True))
    )
    if product is None:
        raise HTTPException(404, "Product not found")
    return _visible(product)


class _SafeFormatter(string.Formatter):
    """Formats admin-authored templates without letting them reach anything.

    `str.format` is more powerful than a template language should be:
    `{price.2f}` (a typo for `{price:.2f}`) does attribute access and raises
    AttributeError, and `{id:>9999999999}` allocates gigabytes. Only bare
    `{name}` substitutions are allowed, and pad widths are bounded.
    """

    MAX_WIDTH = 120

    def get_field(self, field_name, args, kwargs):
        if not field_name.isidentifier():
            raise ValueError(f"unsupported placeholder: {field_name!r}")
        return kwargs[field_name], field_name

    def format_field(self, value, format_spec):
        if format_spec:
            widest = max((int(n) for n in re.findall(r"\d+", format_spec)), default=0)
            if widest > self.MAX_WIDTH:
                format_spec = ""
        return super().format_field(value, format_spec)


def render_notification(settings, order: Order) -> tuple[str, str]:
    """Apply the admin-authored title/body templates to an order.

    Never raises. A broken template must degrade to the default text — it must
    never be able to fail the customer's order.
    """
    fields = {
        "id": order.id,
        "product": order.product_name,
        "package": order.package_label,
        "price": f"{float(order.price):,.0f} {order.currency}",
        "ref": order.customer_ref,
        "receipt": order.receipt_number,
    }
    formatter = _SafeFormatter()

    def render(template: str, fallback: str, cap: int) -> str:
        try:
            return formatter.vformat(template or "", (), fields)[:cap]
        except Exception:
            return fallback[:cap]

    return (
        render(settings.push_title, f"New order #{order.id}", 200),
        render(settings.push_body, f"{order.product_name} - {order.package_label}", 400),
    )


def _safe_subject(settings, order: Order, fallback: str) -> str:
    """Render the email subject through the same hardened formatter."""
    fields = {
        "id": order.id,
        "product": order.product_name,
        "package": order.package_label,
        "price": f"{float(order.price):,.0f} {order.currency}",
        "ref": order.customer_ref,
        "receipt": order.receipt_number,
    }
    try:
        return _SafeFormatter().vformat(settings.email_subject or "", (), fields)[:200] or fallback
    except Exception:
        return fallback


def _notify_new_order(order_id: int) -> None:
    """Runs after the response is sent, on its own session."""
    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if order is None:
            return
        settings = get_settings(db)
        title, body = render_notification(settings, order)

        send_to_admins(
            db,
            title=title,
            body=body,
            # Deep-link straight to the order that triggered this.
            url=f"/admin.html#order-{order.id}",
            tag=f"order-{order.id}",
            order_id=order.id,
        )

        if settings.email_enabled and settings.email_to:
            subject = _safe_subject(settings, order, fallback=title)
            send_order_email(
                order,
                to=settings.email_to,
                title=subject,
                body=body,
                dashboard_url=settings.dashboard_url,
            )
    except Exception:
        # This runs after the response; the customer's order is already safe.
        log.exception("notification dispatch failed for order %s", order_id)
    finally:
        db.close()


@router.post("/orders", response_model=OrderAck, status_code=201)
def create_order(
    payload: OrderIn,
    tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    customer_id: int | None = Depends(optional_customer),
) -> OrderAck:
    settings = get_settings(db)
    if settings.maintenance_mode:
        raise HTTPException(503, "Store is under maintenance")

    product = db.get(Product, payload.product_id)
    if product is None or not product.is_active:
        raise HTTPException(404, "Product not found")

    package = db.get(Package, payload.package_id)
    if package is None or not package.is_active or package.product_id != product.id:
        raise HTTPException(400, "Invalid package for this product")

    method_name = ""
    if payload.payment_method_id is not None:
        method = db.get(PaymentMethod, payload.payment_method_id)
        # Only methods the storefront actually offers — an inactive one would
        # direct the customer to pay through a retired channel.
        if method is not None and method.is_active:
            method_name = method.name_en if payload.lang == "en" else method.name_ar

    # A signed-in customer's own record wins over anything posted in the body.
    name, email = payload.customer_name.strip(), payload.customer_email.strip().lower()
    if customer_id is not None:
        account = db.get(Customer, customer_id)
        # A deactivated account must not be able to keep ordering on a token
        # issued before it was disabled — fall back to guest details.
        if account is not None and account.is_active:
            name, email = account.name, account.email
        else:
            customer_id = None
    if not name or not email:
        raise HTTPException(422, "Name and email are required")

    lang = "en" if payload.lang == "en" else "ar"
    order = Order(
        product_id=product.id,
        package_id=package.id,
        customer_id=customer_id,
        customer_name=name,
        customer_email=email,
        product_name=product.name_en if lang == "en" else product.name_ar,
        package_label=package.label_en if lang == "en" else package.label_ar,
        price=package.price,
        currency=settings.currency_en if lang == "en" else settings.currency_ar,
        customer_ref=payload.customer_ref.strip(),
        receipt_number=payload.receipt_number.strip(),
        payment_method_name=method_name,
        contact=payload.contact.strip(),
        lang=lang,
        status="pending",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # Record the dashboard notification synchronously — it must survive even if
    # the browser push fails or no device is subscribed. The order is already
    # committed at this point, so nothing here may raise: a failure would return
    # 500 for an order that exists, leaving the customer with no id and the
    # admin with no notification.
    try:
        title, body = render_notification(settings, order)
        db.add(Notification(order_id=order.id, kind="order", title=title, body=body))
        db.commit()
    except Exception:
        db.rollback()
        log.exception("failed to record notification for order %s", order.id)

    tasks.add_task(_notify_new_order, order.id)
    return OrderAck(id=order.id, status=order.status)


@router.get("/push/public-key")
def push_public_key() -> dict:
    return {"key": config.vapid_public_key, "enabled": config.push_enabled}
