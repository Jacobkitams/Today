import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db
from models import User

router = APIRouter()


def require_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def _notification_response(item: models.Notification) -> schemas.NotificationResponse:
    return schemas.NotificationResponse(
        id=item.id,
        type=item.type,
        title=item.title,
        body=item.body,
        link=item.link,
        read_at=item.read_at,
        created_at=item.created_at,
    )


def _unread_count(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(models.Notification.id))
        .filter(
            models.Notification.user_id == user_id,
            models.Notification.read_at == None,
        )
        .scalar()
        or 0
    )


@router.get("/notifications", response_model=schemas.NotificationListResponse)
def list_notifications(
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    limit = max(1, min(limit, 100))
    items = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == current_user.id)
        .order_by(models.Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return schemas.NotificationListResponse(
        items=[_notification_response(item) for item in items],
        unread_count=_unread_count(db, current_user.id),
    )


@router.get("/notifications/unread-count", response_model=schemas.UnreadCountResponse)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    return schemas.UnreadCountResponse(count=_unread_count(db, current_user.id))


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    item = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.user_id == current_user.id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not item.read_at:
        item.read_at = datetime.now(timezone.utc)
        db.commit()
    return {"message": "Notification marked as read"}


@router.patch("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    now = datetime.now(timezone.utc)
    updated = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == current_user.id,
            models.Notification.read_at == None,
        )
        .update({"read_at": now}, synchronize_session=False)
    )
    db.commit()
    return {"marked_read": updated}
