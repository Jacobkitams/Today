"""Shared platform settings defaults and DB helpers."""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

import models

PLATFORM_SETTINGS_DEFAULTS = {
    "university_name": "International University of East Africa",
    "motto": "Learning to Succeed",
    "tagline": "East Africa's premier international university",
    "logo_url": "/assets/images/iuea-logo.png",
    "founded_year": 2010,
    "contact_email": "info@iuea.ac.ug",
    "contact_phone": "+256 414 000 000",
    "contact_address": "Kansanga, Kampala, Uganda",
    "website_url": "https://iuea.ac.ug",
    "facebook_url": "https://www.facebook.com/IUEAUganda",
    "twitter_url": "https://twitter.com/IUEAUganda",
    "linkedin_url": "https://www.linkedin.com/company/international-university-of-east-africa-iuea",
    "primary_color": "#800000",
    "accent_color": "#cba052",
    "timezone": "Africa/Kampala",
    "maintenance_mode": False,
    "allow_registrations": True,
}

# Fields where empty string should be backfilled from defaults on read.
BACKFILL_ON_EMPTY = frozenset({
    "university_name", "motto", "tagline", "logo_url",
    "contact_email", "contact_phone", "contact_address", "website_url",
    "facebook_url", "twitter_url", "linkedin_url",
    "primary_color", "accent_color", "timezone",
})


def backfill_platform_settings_defaults(settings: models.PlatformSettings, db: Session) -> bool:
    """Fill missing/empty columns with IUEA defaults. Returns True if anything changed."""
    changed = False
    for key in BACKFILL_ON_EMPTY:
        current = getattr(settings, key, None)
        default = PLATFORM_SETTINGS_DEFAULTS.get(key)
        if default is None:
            continue
        if current is None or (isinstance(current, str) and not str(current).strip()):
            setattr(settings, key, default)
            changed = True
    if settings.founded_year is None and PLATFORM_SETTINGS_DEFAULTS.get("founded_year") is not None:
        settings.founded_year = PLATFORM_SETTINGS_DEFAULTS["founded_year"]
        changed = True
    if changed:
        settings.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(settings)
    return changed


def get_or_create_platform_settings(db: Session) -> models.PlatformSettings:
    settings = db.query(models.PlatformSettings).first()
    if not settings:
        settings = models.PlatformSettings(id=1, **PLATFORM_SETTINGS_DEFAULTS)
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return settings
    backfill_platform_settings_defaults(settings, db)
    return settings
