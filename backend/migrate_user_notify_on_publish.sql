-- Admin-controlled per-user toggle: when set, the user receives an email +
-- WhatsApp message every time content is published (approved).
ALTER TABLE users ADD COLUMN notify_on_publish BOOLEAN DEFAULT 0;
