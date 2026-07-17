"""Tencent Cloud SES - send registration verification emails (TC3-HMAC-SHA256)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from config.settings import Settings

logger = logging.getLogger(__name__)

SERVICE = "ses"
# Domestic SES uses a global endpoint; region goes in X-TC-Region.
HOST = "ses.tencentcloudapi.com"
ALGORITHM = "TC3-HMAC-SHA256"


class SesError(RuntimeError):
    pass


def _settings() -> Settings:
    """Fresh settings so .env edits apply without a full process restart."""
    return Settings()


def ses_configured() -> bool:
    s = _settings()
    return bool(
        s.tencent_secret_id.strip()
        and s.tencent_secret_key.strip()
        and s.ses_from_email.strip()
    )


def _b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _tc3_authorization(
    *,
    secret_id: str,
    secret_key: str,
    service: str,
    host: str,
    action: str,
    payload: str,
    timestamp: int,
    content_type: str = "application/json; charset=utf-8",
) -> tuple[str, str]:
    date = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%d")
    canonical_headers = (
        f"content-type:{content_type}\nhost:{host}\nx-tc-action:{action.lower()}\n"
    )
    signed_headers = "content-type;host;x-tc-action"
    hashed_request_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_request = (
        "POST\n/\n\n"
        + canonical_headers
        + "\n"
        + signed_headers
        + "\n"
        + hashed_request_payload
    )
    credential_scope = f"{date}/{service}/tc3_request"
    string_to_sign = (
        f"{ALGORITHM}\n{timestamp}\n{credential_scope}\n"
        + hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    )
    secret_date = _sign(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = _sign(secret_date, service)
    secret_signing = _sign(secret_service, "tc3_request")
    signature = hmac.new(
        secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    authorization = (
        f"{ALGORITHM} Credential={secret_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return authorization, content_type


def _ses_request(action: str, params: dict[str, Any]) -> dict[str, Any]:
    s = _settings()
    if not (
        s.tencent_secret_id.strip()
        and s.tencent_secret_key.strip()
        and s.ses_from_email.strip()
    ):
        raise SesError("Email sending is not configured")

    region = (s.ses_region or "ap-hongkong").strip()
    host = HOST
    url = f"https://{host}"
    payload = json.dumps(params, ensure_ascii=False, separators=(",", ":"))
    timestamp = int(time.time())
    authorization, content_type = _tc3_authorization(
        secret_id=s.tencent_secret_id.strip(),
        secret_key=s.tencent_secret_key.strip(),
        service=SERVICE,
        host=host,
        action=action,
        payload=payload,
        timestamp=timestamp,
    )
    headers = {
        "Authorization": authorization,
        "Content-Type": content_type,
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Timestamp": str(timestamp),
        "X-TC-Version": "2020-10-02",
        "X-TC-Region": region,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, headers=headers, content=payload.encode("utf-8"))
    try:
        data = resp.json()
    except Exception as exc:
        raise SesError(
            f"Email service HTTP {resp.status_code}: invalid JSON response"
        ) from exc

    response = data.get("Response") or {}
    error = response.get("Error")
    if error:
        code = error.get("Code", "Unknown")
        msg = error.get("Message", "")
        raise SesError(f"Email send failed ({code}): {msg}")
    if resp.status_code >= 400:
        raise SesError(f"Email service HTTP {resp.status_code}")
    return response


def send_verification_email(*, to_email: str, code: str) -> str:
    """Send a 6-digit registration code. Returns MessageId.

    Prefer SES template (TemplateID) when configured — required for most new SES accounts.
    Otherwise fall back to Simple with base64 Html/Text (needs special SES permission).
    """
    s = _settings()
    from_email = s.ses_from_email.strip()
    from_name = (s.ses_from_name or "recombyn").strip()
    subject = f"[{from_name}] Your verification code"
    params: dict[str, Any] = {
        "FromEmailAddress": (
            f"{from_name} <{from_email}>" if from_name else from_email
        ),
        "Destination": [to_email.strip().lower()],
        "Subject": subject,
        "TriggerType": 1,
    }

    template_id = int(s.ses_template_id or 0)
    if template_id > 0:
        params["Template"] = {
            "TemplateID": template_id,
            "TemplateData": json.dumps({"code": code}, ensure_ascii=False),
        }
    else:
        text = (
            f"Your {from_name} verification code is: {code}\n\n"
            "This code expires in 10 minutes. "
            "If you did not request it, ignore this email.\n"
        )
        html = (
            '<div style="font-family:system-ui,sans-serif;line-height:1.5">'
            f"<p>Your <strong>{from_name}</strong> verification code is:</p>"
            f'<p style="font-size:28px;letter-spacing:4px;font-weight:700">{code}</p>'
            '<p style="color:#666">This code expires in 10 minutes. '
            "If you did not request it, ignore this email.</p></div>"
        )
        params["Simple"] = {
            "Html": _b64(html),
            "Text": _b64(text),
        }

    result = _ses_request("SendEmail", params)
    message_id = str(result.get("MessageId") or "")
    logger.info("SendEmail ok to=%s messageId=%s", to_email, message_id)
    return message_id
