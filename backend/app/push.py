"""Web Push delivery to the admin's browser(s)."""
from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from .config import config
from .models import PushSubscription

log = logging.getLogger("push")


def send_to_admins(
    db: Session,
    *,
    title: str,
    body: str,
    url: str = "/admin.html",
    tag: str = "order",
    order_id: int | None = None,
) -> dict:
    """Fan a notification out to every stored subscription.

    Dead endpoints (404/410) are pruned automatically. Never raises — a failed
    notification must not fail the customer's order.
    """
    if not config.push_enabled:
        return {"sent": 0, "failed": 0, "reason": "vapid_not_configured"}

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:  # pragma: no cover
        return {"sent": 0, "failed": 0, "reason": "pywebpush_missing"}

    subs = db.query(PushSubscription).all()
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag, "orderId": order_id})
    sent = failed = 0
    stale: list[PushSubscription] = []

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=config.vapid_private_key,
                vapid_claims={"sub": config.vapid_subject},
                timeout=10,
            )
            sent += 1
        except WebPushException as exc:
            failed += 1
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):
                stale.append(sub)
            else:
                log.warning("push failed (%s): %s", status, exc)
        except Exception as exc:  # network errors, etc.
            failed += 1
            log.warning("push error: %s", exc)

    for sub in stale:
        db.delete(sub)
    if stale:
        db.commit()

    return {"sent": sent, "failed": failed, "pruned": len(stale)}
