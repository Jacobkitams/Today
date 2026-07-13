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
    if current_user.role not in ["super_admin", "innovation_admin"]:
        raise HTTPException(status_code=403, detail="Innovation Admin access required")
    return current_user

# --- STATS ---
@router.get("/stats")
def get_innovation_stats(db: Session = Depends(get_db), current_user: User = Depends(require_innovation_admin)):
    total = db.query(models.Innovation).count()
    pending = db.query(models.Innovation).filter(models.Innovation.status == "pending").count()
    approved = db.query(models.Innovation).filter(models.Innovation.status == "approved").count()
    rejected = db.query(models.Innovation).filter(models.Innovation.status == "rejected").count()
    
    # Active users who submitted an innovation
    active_users = db.query(models.Innovation.author_id).distinct().count()
    
    return {
        "total_innovations": total,
        "pending_submissions": pending,
        "approved_projects": approved,
        "rejected_projects": rejected,
        "active_users": active_users
    }

# --- PROJECTS ---
@router.get("/projects", response_model=List[schemas.InnovationResponse])
def list_innovation_projects(
    status: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_innovation_admin)
):
    query = db.query(models.Innovation)
    if status and status != "all":
        query = query.filter(models.Innovation.status == status)
    return query.order_by(models.Innovation.created_at.desc()).all()

@router.put("/projects/{project_id}/status")
def update_project_status(
    project_id: int, 
    data: schemas.ContentStatusUpdate,
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_innovation_admin)
):
    project = db.query(models.Innovation).filter(models.Innovation.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if data.status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    project.status = data.status
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    if project.author_id:
        notifications_service.notify_content_status(
            db, project.author_id, "innovations", project.title or "Untitled", data.status
        )
    db.commit()
    return {"message": f"Project {data.status}", "id": project_id}

@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_innovation_admin)):
    project = db.query(models.Innovation).filter(models.Innovation.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db.delete(project)
    db.commit()
    return {"message": "Project deleted successfully"}

# --- USERS ---
@router.get("/users")
def get_innovation_users(db: Session = Depends(get_db), current_user: User = Depends(require_innovation_admin)):
    # Users who have submitted an innovation
    user_ids = db.query(models.Innovation.author_id).filter(models.Innovation.author_id.isnot(None)).distinct().all()
    user_ids = [uid[0] for uid in user_ids]
    
    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
    result = []
    for u in users:
        submissions = db.query(models.Innovation).filter(models.Innovation.author_id == u.id).count()
        result.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "submissions": submissions,
            "joined": str(u.created_at)
        })
    return result
