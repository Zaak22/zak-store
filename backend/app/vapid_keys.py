"""Generate a VAPID key pair for Web Push.

Usage:  python -m app.vapid_keys
Copy the printed values into VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
"""
from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    private_raw = key.private_numbers().private_value.to_bytes(32, "big")
    public_raw = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    print("VAPID_PUBLIC_KEY=" + _b64(public_raw))
    print("VAPID_PRIVATE_KEY=" + _b64(private_raw))


if __name__ == "__main__":
    main()
