import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import models, schemas
from database import get_db
from auth import get_current_user
from models import User
import notifications_service

router = APIRouter()

# --- Role Guard ---
def require_innovation_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["super_admin", "innovation_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Innovation Admin access required")
    return current_user

INNOVATION_ADMIN_TYPES = [
    ("innovations", models.Innovation),
    ("startups", models.Startup)
]

def _activity_title(item, content_type: str) -> str:
    if hasattr(item, "title") and item.title:
        return item.title
    if hasattr(item, "name") and item.name:
        return item.name
    return f"Untitled {content_type}"

# --- STATS ---
@router.get("/stats")
def get_innovation_stats(db: Session = Depends(get_db), current_user: User = Depends(require_innovation_admin)):
    innovations = db.query(models.Innovation).count()
    startups = db.query(models.Startup).count()
    
    pending_innovations = db.query(models.Innovation).filter(models.Innovation.status == "pending").count()
    pending_startups = db.query(models.Startup).filter(models.Startup.status == "pending").count()
    pending_requests = db.query(models.FormSubmission).filter(
        models.FormSubmission.form_type.in_(["innovation_join", "startup_join"]), 
        models.FormSubmission.status == "pending"
    ).count()
    
    return {
        "total_innovations": innovations,
        "total_startups": startups,
        "pending_items": pending_innovations + pending_startups + pending_requests
    }

# --- CONTENT ---
@router.get("/content/{content_type}")
def get_innovation_admin_items(
    content_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_innovation_admin)
):
    if content_type == "requests":
        items = db.query(models.FormSubmission).filter(
            models.FormSubmission.form_type.in_(["innovation_join", "startup_join"])
        ).order_by(models.FormSubmission.created_at.desc()).all()
        return items

    model_map = dict(INNOVATION_ADMIN_TYPES)
    model = model_map.get(content_type)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid content type.")
    
    items = db.query(model).order_by(model.created_at.desc()).all()
    # attach author if exists
    result = []
    for item in items:
        item_dict = {c.name: getattr(item, c.name) for c in item.__table__.columns}
        if hasattr(item, "author_id") and item.author_id:
            author = db.query(models.User).filter(models.User.id == item.author_id).first()
            if author:
                item_dict["author"] = {"name": author.name, "email": author.email}
        result.append(item_dict)
    return result

@router.delete("/content/{content_type}/{content_id}")
def delete_innovation_admin_item(
    content_type: str,
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_innovation_admin),
):
    if content_type == "requests":
        item = db.query(models.FormSubmission).filter(models.FormSubmission.id == content_id).first()
    else:
        model_map = dict(INNOVATION_ADMIN_TYPES)
        model = model_map.get(content_type)
        if not model:
            raise HTTPException(status_code=400, detail="Invalid content type.")
        item = db.query(model).filter(model.id == content_id).first()
        
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    db.delete(item)
    db.commit()
    return {"message": "Deleted"}

@router.patch("/content/{content_type}/{content_id}/{action}")
def update_innovation_admin_item_status(
    content_type: str,
    content_id: int,
    action: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_innovation_admin),
):
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    status = "approved" if action == "approve" else "rejected"

    if content_type == "requests":
        item = db.query(models.FormSubmission).filter(models.FormSubmission.id == content_id).first()
    else:
        model_map = dict(INNOVATION_ADMIN_TYPES)
        model = model_map.get(content_type)
        if not model:
            raise HTTPException(status_code=400, detail="Invalid content type.")
        item = db.query(model).filter(model.id == content_id).first()
        
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    item.status = status
    if hasattr(item, "updated_at"):
        item.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    # Handle user creation and welcome message for approved requests
    if content_type == "requests" and action == "approve":
        email = getattr(item, "email", None)
        if email:
            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                from auth import get_password_hash
                import secrets
                temp_password = secrets.token_urlsafe(12)
                user = models.User(
                    email=email,
                    first_name=getattr(item, "first_name", "Student"),
                    last_name=getattr(item, "last_name", ""),
                    hashed_password=get_password_hash(temp_password),
                    role="student"
                )
                db.add(user)
                db.commit()
                db.refresh(user)
            
            # Send welcome message from Admin
            msg_body = f"Hello {user.first_name}! Your request to join has been approved. Welcome to the platform!"
            message = models.Message(
                sender_id=current_user.id,
                recipient_id=user.id,
                body=msg_body
            )
            db.add(message)
            db.commit()

    # Notifications
    if content_type != "requests":
        author_id = getattr(item, "author_id", None)
        title = _activity_title(item, content_type)
        notifications_service.notify_content_status(db, author_id, content_type, title, status)
        db.commit()
        
    return {"message": f"Successfully {status}"}
