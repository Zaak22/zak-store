"""Storefront customer accounts: register, sign in, and view your own orders."""
from __future__ import annotations

import unicodedata

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Customer, Order
from ..schemas import (
    MAX_ID,
    CustomerLogin, CustomerOut, CustomerProfileIn, CustomerRegister,
    CustomerOrderOut, CustomerOrderPage, CustomerTokenOut,
)
from ..security import (
    SCOPE_CUSTOMER, create_token, dummy_verify, hash_password, require_customer,
    verify_password,
)

router = APIRouter(prefix="/api/customer", tags=["customer"])


def normalise_email(raw: str) -> str:
    """Canonical form used for storage and uniqueness.

    NFKC first: `str.lower()` folds U+212A KELVIN SIGN to ASCII "k", so
    "\u212Avictim@x.com" and "kvictim@x.com" collapsed to the same key while
    being different addresses to a mail server — letting an attacker squat an
    address and adopt its guest orders.
    """
    return unicodedata.normalize("NFKC", raw).strip().casefold()


def _load(db: Session, customer_id: int) -> Customer:
    """Load the account behind a token, rejecting deactivated ones.

    Every customer route goes through this — checking `is_active` only in /me
    let a banned customer keep reading orders and checking out for the
    remaining life of an already-issued token.
    """
    customer = db.get(Customer, customer_id)
    if customer is None or not customer.is_active:
        raise HTTPException(401, "Account not found")
    return customer


def current_customer(
    customer_id: int = Depends(require_customer), db: Session = Depends(get_db)
) -> Customer:
    return _load(db, customer_id)


def _adopt_guest_orders(db: Session, customer: Customer) -> int:
    """Claim unowned orders placed with this account's email."""
    claimed = (
        db.query(Order)
        .filter(Order.customer_id.is_(None), func.lower(Order.customer_email) == customer.email)
        .update({Order.customer_id: customer.id}, synchronize_session=False)
    )
    if claimed:
        db.commit()
    return int(claimed)


@router.post("/register", response_model=CustomerTokenOut, status_code=201)
def register(payload: CustomerRegister, db: Session = Depends(get_db)) -> CustomerTokenOut:
    email = normalise_email(payload.email)
    if db.scalar(select(Customer).where(Customer.email == email)) is not None:
        raise HTTPException(409, "An account with this email already exists")

    customer = Customer(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        phone=payload.phone.strip(),
    )
    db.add(customer)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent registration for the same address: the unique index is the
        # real arbiter, and the loser deserves 409, not 500.
        db.rollback()
        raise HTTPException(409, "An account with this email already exists")
    db.refresh(customer)

    _adopt_guest_orders(db, customer)

    return CustomerTokenOut(
        token=create_token(customer.id, SCOPE_CUSTOMER),
        customer=CustomerOut.model_validate(customer),
    )


@router.post("/login", response_model=CustomerTokenOut)
def login(payload: CustomerLogin, db: Session = Depends(get_db)) -> CustomerTokenOut:
    email = normalise_email(payload.email)
    customer = db.scalar(select(Customer).where(Customer.email == email))

    # Same message AND the same cost either way. Skipping the hash for an
    # unknown address made those logins ~18x faster, giving away exactly what
    # the identical error message was hiding.
    if customer is None:
        dummy_verify(payload.password)
        raise HTTPException(401, "Incorrect email or password")
    if not verify_password(payload.password, customer.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    if not customer.is_active:
        raise HTTPException(403, "This account has been disabled")

    # Guest orders placed *after* registering would otherwise never be adopted.
    _adopt_guest_orders(db, customer)

    return CustomerTokenOut(
        token=create_token(customer.id, SCOPE_CUSTOMER),
        customer=CustomerOut.model_validate(customer),
    )


@router.get("/me", response_model=CustomerOut)
def me(customer: Customer = Depends(current_customer)):
    return customer


@router.put("/me", response_model=CustomerOut)
def update_me(
    payload: CustomerProfileIn,
    customer: Customer = Depends(current_customer),
    db: Session = Depends(get_db),
):
    if payload.name is not None:
        customer.name = payload.name.strip()
    if payload.phone is not None:
        customer.phone = payload.phone.strip()
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/orders", response_model=CustomerOrderPage)
def my_orders(
    status: str | None = None,
    page: Annotated[int, Query(ge=1, le=MAX_ID)] = 1,
    per_page: Annotated[int, Query(ge=1, le=50)] = 10,
    customer: Customer = Depends(current_customer),
    db: Session = Depends(get_db),
) -> CustomerOrderPage:
    base = select(Order).where(Order.customer_id == customer.id)
    count_base = select(func.count()).select_from(Order).where(Order.customer_id == customer.id)
    if status and status != "all":
        base = base.where(Order.status == status)
        count_base = count_base.where(Order.status == status)

    total = int(db.scalar(count_base) or 0)
    rows = db.scalars(
        base.order_by(Order.created_at.desc(), Order.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()

    pages = max(1, -(-total // per_page))
    return CustomerOrderPage(
        items=[CustomerOrderOut.model_validate(o) for o in rows],
        total=total,
        page=min(page, pages),
        per_page=per_page,
        pages=pages,
    )


@router.get("/orders/{order_id}", response_model=CustomerOrderOut)
def my_order(
    order_id: Annotated[int, Path(ge=1, le=MAX_ID)],
    customer: Customer = Depends(current_customer),
    db: Session = Depends(get_db),
):
    order = db.get(Order, order_id)
    # Never leak another customer's order — same 404 for missing and forbidden.
    if order is None or order.customer_id != customer.id:
        raise HTTPException(404, "Order not found")
    return order
