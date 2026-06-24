import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import models, schemas
from database import get_db
from auth import get_current_user
from models import User
import notifications_service
from platform_settings_service import (
    PLATFORM_SETTINGS_DEFAULTS,
    get_or_create_platform_settings,
)

router = APIRouter()

# --- Role Guards ---
def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["super_admin", "content_editor", "admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def require_super_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user

# --- APPROVAL CONTENT TYPES (shared by stats + kanban) ---
APPROVAL_CONTENT_TYPES = [
    ("news", models.News),
    ("events", models.Event),
    ("innovations", models.Innovation),
    ("startups", models.Startup),
    ("alumni", models.AlumniProfile),
    ("commission", models.CommissionItem),
    ("publications", models.Publication),
]

# --- STATS ---
CONTENT_TYPE_LABELS = {
    "news": "News",
    "events": "Events",
    "innovations": "Innovations",
    "startups": "Startups",
    "alumni": "Alumni",
    "commission": "Commission",
    "publications": "Publications",
}

USER_ROLE_LABELS = {
    "public_visitor": "Public Visitors",
    "registered_user": "Registered Users",
    "student_innovator": "Student Innovators",
    "alumni": "Alumni",
    "donor_partner": "Donors & Partners",
    "content_editor": "Content Editors",
    "super_admin": "Super Admins",
    "admin": "Admins",
}

ENGAGEMENT_MODELS = [
    models.News,
    models.Event,
    models.Innovation,
    models.Startup,
    models.AlumniProfile,
    models.CommissionItem,
    models.TechParkItem,
    models.ResearchLab,
]

COMMENT_MODELS = [
    models.NewsComment,
    models.EventComment,
    models.InnovationComment,
    models.StartupComment,
    models.AlumniComment,
    models.CommissionComment,
    models.ResearchAreaComment,
    models.PublicationComment,
    models.ResearchLabComment,
    models.TechParkComment,
]

API_VERSION = "2.0.0"

def _period_start(period: str):
    now = datetime.now(timezone.utc)
    if period == "30d":
        return now - timedelta(days=30)
    if period == "year":
        return datetime(now.year, 1, 1, tzinfo=timezone.utc)
    return None

def _apply_period(query, model, period_start):
    if period_start is not None and hasattr(model, "created_at"):
        return query.filter(model.created_at >= period_start)
    return query

def _status_count(model, db, status: str, period_start=None) -> int:
    query = db.query(model).filter(model.status == status)
    return _apply_period(query, model, period_start).count()

def _sum_column(model, db, column_name: str, period_start=None) -> int:
    if not hasattr(model, column_name):
        return 0
    col = getattr(model, column_name)
    query = db.query(func.coalesce(func.sum(col), 0)).select_from(model)
    if period_start is not None and hasattr(model, "created_at"):
        query = query.filter(model.created_at >= period_start)
    return int(query.scalar() or 0)

def _count_comments(db: Session, period_start=None) -> int:
    total = 0
    for comment_model in COMMENT_MODELS:
        query = db.query(comment_model)
        if period_start is not None and hasattr(comment_model, "created_at"):
            query = query.filter(comment_model.created_at >= period_start)
        total += query.count()
    return total

def _collect_content_by_type(db: Session, period_start=None) -> list:
    rows = []
    for content_type, model in APPROVAL_CONTENT_TYPES:
        total_q = db.query(model)
        total = _apply_period(total_q, model, period_start).count()
        rows.append({
            "type": content_type,
            "label": CONTENT_TYPE_LABELS.get(content_type, content_type.title()),
            "total": total,
            "approved": _status_count(model, db, "approved", period_start),
            "pending": _status_count(model, db, "pending", period_start),
            "rejected": _status_count(model, db, "rejected", period_start),
        })
    return rows

def _collect_users_by_role(db: Session, period_start=None) -> list:
    query = db.query(User.role, func.count(User.id)).group_by(User.role)
    if period_start is not None:
        query = query.filter(User.created_at >= period_start)
    rows = []
    for role, count in query.all():
        rows.append({
            "role": role,
            "label": USER_ROLE_LABELS.get(role, role.replace("_", " ").title()),
            "count": count,
        })
    rows.sort(key=lambda r: r["count"], reverse=True)
    return rows

def _activity_title(item, content_type: str) -> str:
    if hasattr(item, "title") and item.title:
        return item.title
    if content_type == "alumni" and hasattr(item, "first_name"):
        return f"{item.first_name} {item.last_name}".strip()
    if content_type == "publications" and hasattr(item, "title"):
        return item.title or "Untitled"
    return "Untitled"

def _collect_recent_activity(db: Session, limit: int = 8) -> list:
    items = []
    for content_type, model in APPROVAL_CONTENT_TYPES:
        for item in db.query(model).order_by(model.created_at.desc()).limit(limit).all():
            ts = item.created_at or getattr(item, "updated_at", None)
            status = getattr(item, "status", "submitted")
            action = {
                "pending": "Submitted for review",
                "approved": "Approved",
                "rejected": "Rejected",
            }.get(status, "Updated")
            items.append({
                "action": action,
                "title": _activity_title(item, content_type),
                "content_type": CONTENT_TYPE_LABELS.get(content_type, content_type.title()),
                "timestamp": str(ts) if ts else "",
            })
    items.sort(key=lambda x: x["timestamp"], reverse=True)
    return items[:limit]

def _system_info(db: Session) -> dict:
    db_ok = True
    try:
        db.query(User.id).limit(1).first()
    except Exception:
        db_ok = False
    return {
        "api_status": "online",
        "database_connected": db_ok,
        "version": API_VERSION,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }

@router.get("/stats", response_model=schemas.AdminStats)
def get_stats(
    period: str = Query("all", pattern="^(all|30d|year)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    period_start = _period_start(period)
    content_by_type = _collect_content_by_type(db, period_start)
    approval_pipeline = {
        "pending": sum(row["pending"] for row in content_by_type),
        "approved": sum(row["approved"] for row in content_by_type),
        "rejected": sum(row["rejected"] for row in content_by_type),
    }
    pending = approval_pipeline["pending"]
    total_likes = sum(_sum_column(m, db, "likes", period_start) for m in ENGAGEMENT_MODELS)
    total_comments = _count_comments(db, period_start)

    users_q = db.query(models.User)
    if period_start is not None:
        users_q = users_q.filter(models.User.created_at >= period_start)

    return {
        "total_users": users_q.count() if period_start else db.query(models.User).count(),
        "total_news": _apply_period(db.query(models.News), models.News, period_start).count(),
        "total_events": _apply_period(db.query(models.Event), models.Event, period_start).count(),
        "total_innovations": _apply_period(db.query(models.Innovation), models.Innovation, period_start).count(),
        "total_startups": _apply_period(db.query(models.Startup), models.Startup, period_start).count(),
        "total_alumni": _apply_period(db.query(models.AlumniProfile), models.AlumniProfile, period_start).count(),
        "total_donations": _apply_period(db.query(models.Donation), models.Donation, period_start).count(),
        "pending_content": pending,
        "active_users": db.query(models.User).filter(models.User.is_active == True).count(),
        "approved_content": approval_pipeline["approved"],
        "rejected_content": approval_pipeline["rejected"],
        "total_publications": _apply_period(db.query(models.Publication), models.Publication, period_start).count(),
        "total_likes": total_likes,
        "total_comments": total_comments,
        "content_by_type": content_by_type,
        "users_by_role": _collect_users_by_role(db, period_start),
        "approval_pipeline": approval_pipeline,
        "recent_activity": _collect_recent_activity(db),
        "system": _system_info(db),
        "period": period,
    }

# --- USER MANAGEMENT (super_admin only) ---
@router.get("/users", response_model=List[schemas.UserResponse])
def get_all_users(db: Session = Depends(get_db), current_user: User = Depends(require_super_admin)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()

@router.put("/users/{user_id}/role")
def update_user_role(user_id: int, data: schemas.UserRoleUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_super_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    valid_roles = ["public_visitor", "registered_user", "student_innovator", "alumni", "donor_partner", "content_editor", "super_admin"]
    if data.role not in valid_roles:
        raise HTTPException(status_code=400, detail="Invalid role")
    user.role = data.role
    db.commit()
    notifications_service.notify_role_updated(db, user, data.role)
    db.commit()
    return {"message": f"User role updated to {data.role}"}

@router.put("/users/{user_id}/status")
def update_user_status(user_id: int, data: schemas.UserStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_super_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = data.is_active
    db.commit()
    return {"message": f"User {'activated' if data.is_active else 'deactivated'}"}

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_super_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

# --- APPROVAL KANBAN CONTENT ---
RECENT_APPROVAL_LIMIT = 30

def _author_display(db: Session, item) -> str | None:
    if hasattr(item, "author_name") and item.author_name:
        return item.author_name
    if hasattr(item, "author_id") and item.author_id:
        user = db.query(User).filter(User.id == item.author_id).first()
        if user:
            return user.name
    return None

def _item_to_kanban(item, content_type: str, db: Session) -> dict:
    data = {
        "id": item.id,
        "content_type": content_type,
        "status": item.status,
        "created_at": str(item.created_at) if item.created_at else None,
        "updated_at": str(item.updated_at) if getattr(item, "updated_at", None) else None,
    }
    if hasattr(item, "title"):
        data["title"] = item.title
    if hasattr(item, "description"):
        data["description"] = item.description
    image_val = getattr(item, "image", None)
    if image_val is not None:
        image_str = str(image_val).strip()
        if image_str:
            data["image"] = image_str
            data["image_url"] = image_str
    if hasattr(item, "first_name"):
        data["title"] = f"{item.first_name} {item.last_name}"
        data["description"] = item.role
    if content_type == "publications" and hasattr(item, "authors"):
        data["description"] = item.authors
    author = _author_display(db, item)
    if author:
        data["author_name"] = author
    return data

def _kanban_sort_key(item: dict) -> str:
    return item.get("updated_at") or item.get("created_at") or ""

def _collect_kanban_items(db: Session, status: str, *, user_submitted_only: bool = False, limit: int | None = None):
    items = []
    for content_type, model in APPROVAL_CONTENT_TYPES:
        query = db.query(model).filter(model.status == status)
        if user_submitted_only and hasattr(model, "author_id"):
            query = query.filter(model.author_id.isnot(None))
        for item in query.all():
            items.append(_item_to_kanban(item, content_type, db))

    items.sort(key=_kanban_sort_key, reverse=True)
    if limit is not None:
        items = items[:limit]
    return items

@router.get("/pending-content")
def get_pending_content(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    return _collect_kanban_items(db, "pending")

@router.get("/approved-content")
def get_approved_content(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    return _collect_kanban_items(
        db,
        "approved",
        user_submitted_only=True,
        limit=RECENT_APPROVAL_LIMIT,
    )

@router.get("/rejected-content")
def get_rejected_content(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    return _collect_kanban_items(db, "rejected", limit=RECENT_APPROVAL_LIMIT)

# --- CONTENT CRUD ---
CONTENT_TYPE_MAP = {
    "news": models.News,
    "events": models.Event,
    "innovations": models.Innovation,
    "startups": models.Startup,
    "alumni": models.AlumniProfile,
    "donations": models.Donation,
    "donation-tiers": models.DonationTier,
    "endowment-stats": models.EndowmentStat,
    "endowment-campaigns": models.EndowmentCampaign,
    "endowment-info": models.EndowmentInfo,
    "research-areas": models.ResearchArea,
    "tech-park": models.TechParkItem,
    "commission": models.CommissionItem,
    "publications": models.Publication,
    "research-labs": models.ResearchLab,
}

MODEL_MAP = CONTENT_TYPE_MAP

NEWS_VIRTUAL_TYPES = {
    "innovation-news": "innovation",
    "startup-news": "startup",
    "alumni-news": "alumni",
}

# Campus/general news admin + public listings include typed news rows (innovation, startup, alumni).
GENERAL_NEWS_LIST_TYPES = ("news", "innovation", "startup", "alumni")

COMMISSION_VIRTUAL_TYPES = {
    "commission-news": "news",
    "commission-committees": "committee",
    "commission-initiatives": "initiative",
    "commission-reports": "report",
}

def _content_to_dict(item):
    data = {}
    for col in item.__table__.columns:
        val = getattr(item, col.name)
        if val is not None and hasattr(val, "isoformat"):
            val = val.isoformat()
        data[col.name] = val
    return data

def _get_content_model(content_type: str):
    if content_type in NEWS_VIRTUAL_TYPES:
        return models.News
    if content_type in COMMISSION_VIRTUAL_TYPES:
        return models.CommissionItem
    model = CONTENT_TYPE_MAP.get(content_type)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid content type")
    return model

def _get_content_item(content_type: str, content_id: int, db: Session):
    model = _get_content_model(content_type)
    item = db.query(model).filter(model.id == content_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    news_type = NEWS_VIRTUAL_TYPES.get(content_type)
    if news_type and getattr(item, "type", None) != news_type:
        raise HTTPException(status_code=404, detail="Content not found")
    if content_type == "news":
        item_type = getattr(item, "type", None) or "news"
        if item_type not in GENERAL_NEWS_LIST_TYPES:
            raise HTTPException(status_code=404, detail="Content not found")
    commission_type = COMMISSION_VIRTUAL_TYPES.get(content_type)
    if commission_type and getattr(item, "type", None) != commission_type:
        raise HTTPException(status_code=404, detail="Content not found")
    return model, item

@router.get("/content/{content_type}")
def list_admin_content(content_type: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    model = _get_content_model(content_type)
    query = db.query(model)
    news_type = NEWS_VIRTUAL_TYPES.get(content_type)
    if news_type:
        query = query.filter(models.News.type == news_type)
    elif content_type == "news":
        query = query.filter(models.News.type.in_(GENERAL_NEWS_LIST_TYPES))
    commission_type = COMMISSION_VIRTUAL_TYPES.get(content_type)
    if commission_type:
        query = query.filter(models.CommissionItem.type == commission_type)
    items = query.order_by(model.created_at.desc()).all()
    return [_content_to_dict(item) for item in items]

@router.get("/content/{content_type}/{content_id}")
def get_admin_content(content_type: str, content_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    _, item = _get_content_item(content_type, content_id, db)
    return _content_to_dict(item)

@router.put("/content/{content_type}/{content_id}")
def update_admin_content(content_type: str, content_id: int, data: schemas.AdminContentUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    _, item = _get_content_item(content_type, content_id, db)
    for key, value in data.dict(exclude_unset=True).items():
        if hasattr(item, key):
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return {"message": "Content updated", "item": _content_to_dict(item)}

@router.delete("/content/{content_type}/{content_id}")
def delete_admin_content(content_type: str, content_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    _, item = _get_content_item(content_type, content_id, db)
    db.delete(item)
    db.commit()
    return {"message": "Content deleted"}

@router.put("/content/{content_type}/{content_id}/approve")
def approve_content(content_type: str, content_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    _, item = _get_content_item(content_type, content_id, db)
    item.status = "approved"
    if hasattr(item, "updated_at"):
        item.updated_at = datetime.now(timezone.utc)
    db.commit()
    author_id = getattr(item, "author_id", None)
    notifications_service.notify_content_status(db, author_id, content_type, _activity_title(item, content_type), "approved")
    db.commit()
    return {"message": "Content approved"}

@router.put("/content/{content_type}/{content_id}/reject")
def reject_content(content_type: str, content_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    _, item = _get_content_item(content_type, content_id, db)
    item.status = "rejected"
    if hasattr(item, "updated_at"):
        item.updated_at = datetime.now(timezone.utc)
    db.commit()
    author_id = getattr(item, "author_id", None)
    notifications_service.notify_content_status(db, author_id, content_type, _activity_title(item, content_type), "rejected")
    db.commit()
    return {"message": "Content rejected"}

# --- PLATFORM SETTINGS ---
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
URL_RE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)

def _validate_platform_settings_payload(data: schemas.PlatformSettingsUpdate):
    payload = data.dict(exclude_unset=True)
    if "contact_email" in payload and payload["contact_email"]:
        if "@" not in payload["contact_email"]:
            raise HTTPException(status_code=400, detail="Invalid contact email address")
    for color_key in ("primary_color", "accent_color"):
        if color_key in payload and payload[color_key] and not HEX_COLOR_RE.match(payload[color_key]):
            raise HTTPException(status_code=400, detail=f"Invalid {color_key.replace('_', ' ')} (use #RRGGBB)")
    for url_key in ("logo_url", "website_url", "facebook_url", "twitter_url", "linkedin_url"):
        if url_key in payload and payload[url_key]:
            url_val = (payload[url_key] or "").strip()
            if not url_val:
                continue
            if url_key == "logo_url" and (url_val.startswith("/assets/") or url_val.startswith("assets/")):
                continue
            if not URL_RE.match(url_val):
                raise HTTPException(status_code=400, detail=f"Invalid {url_key.replace('_', ' ')} (use https://…)")
    if "founded_year" in payload and payload["founded_year"] is not None:
        year = payload["founded_year"]
        if not isinstance(year, int) or year < 1800 or year > 2100:
            raise HTTPException(status_code=400, detail="Founded year must be between 1800 and 2100")
    if "university_name" in payload and not (payload["university_name"] or "").strip():
        raise HTTPException(status_code=400, detail="University name is required")

@router.get("/settings", response_model=schemas.PlatformSettingsResponse)
def get_platform_settings(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    return get_or_create_platform_settings(db)

@router.put("/settings", response_model=schemas.PlatformSettingsResponse)
def update_platform_settings(
    data: schemas.PlatformSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _validate_platform_settings_payload(data)
    settings = get_or_create_platform_settings(db)
    for key, value in data.dict(exclude_unset=True).items():
        if key == "university_name" and value is not None:
            value = value.strip()
        setattr(settings, key, value)
    settings.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(settings)
    return settings
