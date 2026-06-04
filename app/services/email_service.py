from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.core.config import get_settings


def send_quote_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    attachment_filename: str,
    attachment_bytes: bytes,
) -> None:
    settings = get_settings()
    if not settings.SMTP_HOST:
        raise RuntimeError("SMTP is not configured")

    message = EmailMessage()
    message["From"] = settings.quote_from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    message.add_attachment(
        attachment_bytes,
        maintype="application",
        subtype="pdf",
        filename=attachment_filename,
    )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USERNAME:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(message)