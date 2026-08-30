"""
Email + WhatsApp sending for content-publish alerts.

Nobody has API credentials for either channel yet, so every function here
is provider-agnostic and reads its config from environment variables
(see .env). Until those are set, each function logs what it *would* have
sent and returns False -- nothing crashes, nothing silently pretends to
have sent something it didn't.

When credentials do arrive, just add the matching env vars below. No other
code needs to change -- notifications_service.py calls these two functions
without caring which provider ends up configured.

    EMAIL (SMTP -- works with Gmail, Outlook, a corporate mail server, or
    the SMTP relay most transactional-email providers also expose):
        SMTP_HOST
        SMTP_PORT        (default 587)
        SMTP_USER
        SMTP_PASSWORD
        SMTP_FROM_EMAIL  (defaults to SMTP_USER)

    WHATSAPP -- supports either of these; whichever is configured first wins:
      Twilio:
        TWILIO_ACCOUNT_SID
        TWILIO_AUTH_TOKEN
        TWILIO_WHATSAPP_FROM   (e.g. "whatsapp:+14155238886")
      Meta WhatsApp Cloud API:
        META_WHATSAPP_TOKEN
        META_WHATSAPP_PHONE_ID
"""
import base64
import json
import os
import smtplib
import urllib.error
import urllib.parse
import urllib.request
from email.mime.text import MIMEText


def send_email_notification(to_email: str, subject: str, body: str) -> bool:
    host = os.getenv("SMTP_HOST")
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL") or user
    port = int(os.getenv("SMTP_PORT", "587"))

    if not (host and user and password and from_email):
        print(f"[notify] Email not configured — would send to {to_email!r}: {subject!r}")
        return False

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = to_email
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(from_email, [to_email], msg.as_string())
        return True
    except Exception as e:
        print(f"[notify] Email send failed for {to_email!r}: {e}")
        return False


def send_whatsapp_notification(phone: str, message: str) -> bool:
    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
    twilio_token = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_from = os.getenv("TWILIO_WHATSAPP_FROM")
    if twilio_sid and twilio_token and twilio_from:
        return _send_via_twilio(twilio_sid, twilio_token, twilio_from, phone, message)

    meta_token = os.getenv("META_WHATSAPP_TOKEN")
    meta_phone_id = os.getenv("META_WHATSAPP_PHONE_ID")
    if meta_token and meta_phone_id:
        return _send_via_meta(meta_token, meta_phone_id, phone, message)

    print(f"[notify] WhatsApp not configured — would send to {phone!r}: {message!r}")
    return False


def _send_via_twilio(sid: str, token: str, from_number: str, to_phone: str, message: str) -> bool:
    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        data = urllib.parse.urlencode({
            "From": from_number,
            "To": f"whatsapp:{to_phone}",
            "Body": message,
        }).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        creds = base64.b64encode(f"{sid}:{token}".encode()).decode()
        req.add_header("Authorization", f"Basic {creds}")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status < 300
    except urllib.error.HTTPError as e:
        print(f"[notify] Twilio WhatsApp send failed for {to_phone!r}: {e.code} {e.read()[:300]}")
        return False
    except Exception as e:
        print(f"[notify] Twilio WhatsApp send failed for {to_phone!r}: {e}")
        return False


def _send_via_meta(token: str, phone_id: str, to_phone: str, message: str) -> bool:
    try:
        url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
        payload = json.dumps({
            "messaging_product": "whatsapp",
            "to": to_phone.lstrip("+"),
            "type": "text",
            "text": {"body": message},
        }).encode()
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status < 300
    except urllib.error.HTTPError as e:
        print(f"[notify] Meta WhatsApp send failed for {to_phone!r}: {e.code} {e.read()[:300]}")
        return False
    except Exception as e:
        print(f"[notify] Meta WhatsApp send failed for {to_phone!r}: {e}")
        return False
