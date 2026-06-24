import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import Session

import models, schemas
from database import get_db
from auth import get_current_user
from models import User
import notifications_service

router = APIRouter()

ADMIN_ROLES = ["super_admin", "content_editor", "admin"]


def require_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def _user_brief(user: User) -> schemas.MessageUserBrief:
    return schemas.MessageUserBrief(
        id=user.id,
        name=user.name or user.email,
        email=user.email,
        role=user.role,
    )


def _message_response(msg: models.Message, db: Session) -> schemas.MessageResponse:
    sender = db.query(User).filter(User.id == msg.sender_id).first()
    recipient = db.query(User).filter(User.id == msg.recipient_id).first()
    return schemas.MessageResponse(
        id=msg.id,
        sender_id=msg.sender_id,
        recipient_id=msg.recipient_id,
        body=msg.body,
        read_at=msg.read_at,
        created_at=msg.created_at,
        sender_name=sender.name if sender else None,
        recipient_name=recipient.name if recipient else None,
    )


def _partner_ids(db: Session, user_id: int) -> set[int]:
    rows = (
        db.query(models.Message.sender_id, models.Message.recipient_id)
        .filter(or_(models.Message.sender_id == user_id, models.Message.recipient_id == user_id))
        .all()
    )
    partners = set()
    for sender_id, recipient_id in rows:
        partners.add(recipient_id if sender_id == user_id else sender_id)
    return partners


def _has_published_content(db: Session, user_id: int) -> bool:
    return user_id in _published_author_ids(db)


def _published_author_ids(db: Session) -> set[int]:
    ids: set[int] = set()
    for model in (models.News, models.Event, models.Innovation):
        rows = (
            db.query(model.author_id)
            .filter(model.author_id.isnot(None), model.status == "approved")
            .distinct()
            .all()
        )
        ids.update(row[0] for row in rows)
    return ids


def _can_message_user(db: Session, current_user: User, target_id: int) -> bool:
    if current_user.id == target_id:
        return False
    target = db.query(User).filter(User.id == target_id, User.is_active == True).first()
    if not target:
        return False
    if current_user.role in ADMIN_ROLES:
        return True
    if target.role in ADMIN_ROLES:
        return True
    if _has_published_content(db, target_id):
        return True
    return target_id in _partner_ids(db, current_user.id)


@router.get("/messages/conversations", response_model=List[schemas.ConversationResponse])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    messages = (
        db.query(models.Message)
        .filter(or_(models.Message.sender_id == current_user.id, models.Message.recipient_id == current_user.id))
        .order_by(models.Message.created_at.desc())
        .all()
    )

    latest_by_partner: dict[int, models.Message] = {}
    for msg in messages:
        partner_id = msg.recipient_id if msg.sender_id == current_user.id else msg.sender_id
        if partner_id not in latest_by_partner:
            latest_by_partner[partner_id] = msg

    conversations = []
    for partner_id, last_msg in latest_by_partner.items():
        partner = db.query(User).filter(User.id == partner_id).first()
        if not partner:
            continue
        unread = (
            db.query(func.count(models.Message.id))
            .filter(
                models.Message.sender_id == partner_id,
                models.Message.recipient_id == current_user.id,
                models.Message.read_at == None,
            )
            .scalar()
            or 0
        )
        conversations.append(
            schemas.ConversationResponse(
                user=_user_brief(partner),
                last_message=last_msg.body,
                last_message_at=last_msg.created_at,
                last_sender_id=last_msg.sender_id,
                unread_count=unread,
            )
        )

    conversations.sort(
        key=lambda c: c.last_message_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return conversations


@router.get("/messages/contacts", response_model=List[schemas.MessageUserBrief])
def search_contacts(
    q: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    query = db.query(User).filter(User.id != current_user.id, User.is_active == True)

    if current_user.role not in ADMIN_ROLES:
        partners = _partner_ids(db, current_user.id)
        allowed = partners | _published_author_ids(db)
        if allowed:
            query = query.filter(or_(User.role.in_(ADMIN_ROLES), User.id.in_(allowed)))
        else:
            query = query.filter(User.role.in_(ADMIN_ROLES))

    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(User.name.like(term), User.email.like(term)))

    users = query.order_by(User.name.asc()).limit(30).all()
    return [_user_brief(u) for u in users]


@router.get("/messages/with/{user_id}", response_model=List[schemas.MessageResponse])
def get_thread(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    if not _can_message_user(db, current_user, user_id):
        raise HTTPException(status_code=403, detail="Cannot access this conversation")

    messages = (
        db.query(models.Message)
        .filter(
            or_(
                and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == user_id),
                and_(models.Message.sender_id == user_id, models.Message.recipient_id == current_user.id),
            )
        )
        .order_by(models.Message.created_at.asc())
        .all()
    )

    now = datetime.now(timezone.utc)
    db.query(models.Message).filter(
        models.Message.sender_id == user_id,
        models.Message.recipient_id == current_user.id,
        models.Message.read_at == None,
    ).update({"read_at": now}, synchronize_session=False)
    db.commit()

    return [_message_response(m, db) for m in messages]


@router.post("/messages", response_model=schemas.MessageResponse)
def send_message(
    data: schemas.MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    body = (data.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is required")
    if not _can_message_user(db, current_user, data.recipient_id):
        raise HTTPException(status_code=403, detail="Cannot message this user")

    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=data.recipient_id,
        body=body,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    recipient = db.query(User).filter(User.id == data.recipient_id).first()
    if recipient:
        notifications_service.notify_new_message(db, recipient, current_user, body)
        db.commit()
    return _message_response(msg, db)


@router.patch("/messages/with/{user_id}/read")
def mark_thread_read(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    if not _can_message_user(db, current_user, user_id):
        raise HTTPException(status_code=403, detail="Cannot access this conversation")

    now = datetime.now(timezone.utc)
    updated = (
        db.query(models.Message)
        .filter(
            models.Message.sender_id == user_id,
            models.Message.recipient_id == current_user.id,
            models.Message.read_at == None,
        )
        .update({"read_at": now}, synchronize_session=False)
    )
    db.commit()
    return {"marked_read": updated}


@router.get("/messages/unread-count", response_model=schemas.UnreadCountResponse)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    count = (
        db.query(func.count(models.Message.id))
        .filter(
            models.Message.recipient_id == current_user.id,
            models.Message.read_at == None,
        )
        .scalar()
        or 0
    )
    return schemas.UnreadCountResponse(count=count)
