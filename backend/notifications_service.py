import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from typing import Optional

from sqlalchemy.orm import Session

import models
from models import User

ADMIN_ROLES = ["super_admin", "content_editor", "admin"]

CONTENT_TYPE_LABELS = {
    "news": "News",
    "events": "Event",
    "innovations": "Innovation",
    "startups": "Startup",
    "alumni": "Alumni Profile",
    "community": "Community Item",
    "publications": "Publication",
    "research-areas": "Research Area",
    "research-labs": "Research Lab",
    "tech-park": "Tech Park Item",
}

ROLE_PANEL_PREFIX = {
    "registered_user": "ru",
    "donor_partner": "dp",
}


def _truncate(text: str, limit: int = 120) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def panel_prefix_for_role(role: str) -> str:
    if role in ADMIN_ROLES:
        return "admin"
    return ROLE_PANEL_PREFIX.get(role, "ru")


def author_tab_for_content(content_type: str, role: str) -> str:
    if content_type == "news":
        return "stories" if role == "registered_user" else "submissions"
    if content_type in ("innovations", "startups", "community", "publications"):
        return "submissions"
    if content_type == "alumni":
        return "profile" if role == "registered_user" else "overview"
    if content_type == "events":
        return "events" if role == "registered_user" else "submissions"
    return "submissions"


def link_for_user(user: User, tab: str, extra: Optional[str | int] = None) -> str:
    prefix = panel_prefix_for_role(user.role)
    link = f"{prefix}:{tab}"
    if extra is not None:
        link = f"{link}:{extra}"
    return link


def create_notification(
    db: Session,
    user_id: int,
    type: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
) -> None:
    if not user_id:
        return
    db.add(
        models.Notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            link=link,
        )
    )


def notify_admins(
    db: Session,
    type: str,
    title: str,
    body: Optional[str] = None,
    link: str = "admin:approvals",
    exclude_user_id: Optional[int] = None,
) -> None:
    query = db.query(User).filter(User.role.in_(ADMIN_ROLES), User.is_active == True)
    if exclude_user_id:
        query = query.filter(User.id != exclude_user_id)
    for admin in query.all():
        create_notification(db, admin.id, type, title, body, link)


def notify_content_pending(
    db: Session,
    content_type: str,
    title: str,
    submitter: User,
) -> None:
    label = CONTENT_TYPE_LABELS.get(content_type, content_type.replace("-", " ").title())
    submitter_name = submitter.name or submitter.email
    notify_admins(
        db,
        "pending_approval",
        f"New {label} pending review",
        f'"{title}" submitted by {submitter_name} needs approval.',
        "admin:approvals",
        exclude_user_id=submitter.id if submitter.role in ADMIN_ROLES else None,
    )


def notify_content_status(
    db: Session,
    author_id: Optional[int],
    content_type: str,
    title: str,
    status: str,
) -> None:
    if not author_id:
        return
    author = db.query(User).filter(User.id == author_id).first()
    if not author:
        return

    label = CONTENT_TYPE_LABELS.get(content_type, content_type.replace("-", " ").title())
    tab = author_tab_for_content(content_type, author.role)
    link = link_for_user(author, tab)

    if status == "approved":
        create_notification(
            db,
            author.id,
            "content_approved",
            f"Your {label} was approved",
            f'"{title}" is now live on IUEA Today.',
            link,
        )
    elif status == "rejected":
        create_notification(
            db,
            author.id,
            "content_rejected",
            f"Your {label} was not approved",
            f'"{title}" was rejected. You may revise and resubmit.',
            link,
        )


def notify_new_message(db: Session, recipient: User, sender: User, body: str) -> None:
    sender_name = sender.name or sender.email
    link = link_for_user(recipient, "messages", sender.id)
    create_notification(
        db,
        recipient.id,
        "new_message",
        f"New message from {sender_name}",
        _truncate(body),
        link,
    )


def notify_content_comment(
    db: Session,
    author_id: Optional[int],
    commenter: User,
    content_type: str,
    content_title: str,
    message: str,
    parent_author_id: Optional[int] = None,
) -> None:
    commenter_name = commenter.name or commenter.email
    preview = _truncate(message)

    if parent_author_id and parent_author_id != commenter.id:
        parent = db.query(User).filter(User.id == parent_author_id).first()
        if parent:
            tab = author_tab_for_content(content_type, parent.role)
            create_notification(
                db,
                parent.id,
                "comment_reply",
                f"{commenter_name} replied to your comment",
                f'On "{content_title}": {preview}',
                link_for_user(parent, tab),
            )

    if parent_author_id or not author_id or author_id == commenter.id:
        return
    if parent_author_id == author_id:
        return

    author = db.query(User).filter(User.id == author_id).first()
    if not author:
        return

    tab = author_tab_for_content(content_type, author.role)
    create_notification(
        db,
        author.id,
        "story_comment",
        f"New comment on your {CONTENT_TYPE_LABELS.get(content_type, 'content').lower()}",
        f'{commenter_name} commented on "{content_title}": {preview}',
        link_for_user(author, tab),
    )


def notify_role_updated(db: Session, user: User, new_role: str) -> None:
    role_label = new_role.replace("_", " ").title()
    tab = "profile" if new_role == "registered_user" else "overview"
    link = f"{panel_prefix_for_role(new_role)}:{tab}"
    create_notification(
        db,
        user.id,
        "role_updated",
        "Your account role was updated",
        f"Your role is now {role_label}. Sign out and back in if your dashboard does not update.",
        link,
    )
