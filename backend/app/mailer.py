"""Email notification for new orders.

Plain SMTP, so it works with any provider that offers one — which includes
every free tier worth using (Gmail app passwords, Brevo, Resend, SendGrid,
Mailtrap). No SDK, no vendor lock-in, no paid dependency.

Credentials live in environment variables, never in the database: the settings
table is served to the admin dashboard over the API, and an SMTP password has
no business being in an API response.
"""
from __future__ import annotations

import html
import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import config

log = logging.getLogger("mailer")


def _plain_text(order, title: str, body: str) -> str:
    return (
        f"{title}\n{body}\n\n"
        f"Order      #{order.id}\n"
        f"Product    {order.product_name}\n"
        f"Package    {order.package_label}\n"
        f"Amount     {float(order.price):,.0f} {order.currency}\n"
        f"Reference  {order.customer_ref}\n"
        f"Receipt    {order.receipt_number}\n"
        f"Method     {order.payment_method_name or '-'}\n"
        f"Customer   {order.customer_name} <{order.customer_email}>\n"
        f"Contact    {order.contact or '-'}\n"
        f"Placed     {order.created_at:%Y-%m-%d %H:%M} UTC\n"
    )


def _html_body(order, title: str, dashboard_url: str) -> str:
    e = html.escape

    def row(label: str, value: str) -> str:
        return (
            f'<tr><td style="padding:7px 14px;color:#8b8fa8;font-size:13px">{e(label)}</td>'
            f'<td style="padding:7px 14px;color:#f4f5ff;font-size:13px;font-weight:600">{e(value)}</td></tr>'
        )

    link = (
        f'<a href="{e(dashboard_url)}#order-{order.id}" style="display:inline-block;'
        f'margin-top:22px;padding:12px 26px;border-radius:99px;background:#7c5cff;'
        f'color:#fff;text-decoration:none;font-weight:700;font-size:14px">Open in dashboard</a>'
        if dashboard_url else ""
    )

    return f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#07070f;font-family:-apple-system,Segoe UI,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#12121f;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:28px">
  <div style="font-size:19px;font-weight:800;color:#f4f5ff;margin-bottom:4px">{e(title)}</div>
  <div style="font-size:13px;color:#8b8fa8;margin-bottom:20px">{e(order.created_at.strftime('%d %b %Y, %H:%M'))} UTC</div>
  <table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,.04);border-radius:12px">
    {row('Order', f'#{order.id}')}
    {row('Product', order.product_name)}
    {row('Package', order.package_label)}
    {row('Amount', f'{float(order.price):,.0f} {order.currency}')}
    {row('Reference', order.customer_ref)}
    {row('Receipt', order.receipt_number)}
    {row('Method', order.payment_method_name or '-')}
    {row('Customer', f'{order.customer_name} <{order.customer_email}>')}
    {row('Contact', order.contact or '-')}
  </table>
  {link}
</div></body></html>"""


def send_order_email(order, *, to: str, title: str, body: str, dashboard_url: str = "") -> dict:
    """Send one order notification. Never raises."""
    if not config.smtp_configured:
        return {"sent": False, "reason": "smtp_not_configured"}
    if not to.strip():
        return {"sent": False, "reason": "no_recipient"}

    message = EmailMessage()
    message["Subject"] = title
    message["From"] = config.smtp_from or config.smtp_user
    message["To"] = to.strip()
    message.set_content(_plain_text(order, title, body))
    message.add_alternative(_html_body(order, title, dashboard_url), subtype="html")

    try:
        if config.smtp_port == 465:
            with smtplib.SMTP_SSL(
                config.smtp_host, config.smtp_port, timeout=15,
                context=ssl.create_default_context(),
            ) as server:
                server.login(config.smtp_user, config.smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=15) as server:
                server.ehlo()
                if config.smtp_tls:
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                if config.smtp_user:
                    server.login(config.smtp_user, config.smtp_password)
                server.send_message(message)
        return {"sent": True}
    except Exception as exc:
        # An order must never fail because the mail server did.
        log.warning("email failed for order %s: %s", order.id, exc)
        return {"sent": False, "reason": str(exc)[:200]}
