"""
Event Registration Routes
---------------------------------------------------------------------------
Public endpoints:
  POST   /events/{event_id}/register        – authenticated users register
  DELETE /events/{event_id}/register        – authenticated users cancel
  GET    /events/my-registrations           – list user's registered events
  GET    /events/{event_id}/registration-status – check if user is registered

Marketing Admin endpoints (requires marketing_admin, admin, or super_admin role):
  GET    /events                            – list all events (admin view)
  POST   /events                            – create new event
  GET    /events/{event_id}                 – get single event
  PUT    /events/{event_id}                 – edit event
  DELETE /events/{event_id}                 – delete event
  GET    /events/{event_id}/participants    – list registrations for an event
  PUT    /events/{event_id}/participants/{reg_id}/status – update registration status
  DELETE /events/{event_id}/participants/{reg_id}        – remove participant
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
import models, schemas
from database import get_db
from auth import get_current_user
from models import User
import notifications_service

router = APIRouter()

# ---------------------------------------------------------------------------
# Role guards
# ---------------------------------------------------------------------------

MARKETING_ADMIN_ROLES = {"marketing_admin", "super_admin", "admin", "content_editor"}

def require_auth(current_user: User = Depends(get_current_user)):
    """Any authenticated user."""
    return current_user

def require_marketing_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in MARKETING_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Marketing admin access required")
    return current_user

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _event_or_404(db: Session, event_id: int) -> models.Event:
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

def _reg_or_404(db: Session, event_id: int, reg_id: int) -> models.EventRegistration:
    reg = db.query(models.EventRegistration).filter(
        models.EventRegistration.id == reg_id,
        models.EventRegistration.event_id == event_id,
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    return reg

def _enrich_registration(db: Session, reg: models.EventRegistration) -> dict:
    event = db.query(models.Event).filter(models.Event.id == reg.event_id).first()
    return {
        "id": reg.id,
        "event_id": reg.event_id,
        "user_id": reg.user_id,
        "status": reg.status,
        "notes": reg.notes,
        "created_at": reg.created_at,
        "event_title": event.title if event else None,
        "event_date": event.date if event else None,
        "event_location": event.location if event else None,
        "event_image": event.image if event else None,
    }

def _enrich_participant(db: Session, reg: models.EventRegistration) -> dict:
    user = db.query(User).filter(User.id == reg.user_id).first()
    return {
        "id": reg.id,
        "event_id": reg.event_id,
        "user_id": reg.user_id,
        "user_name": user.name if user else None,
        "user_email": user.email if user else None,
        "status": reg.status,
        "notes": reg.notes,
        "created_at": reg.created_at,
    }

def _event_to_dict(event: models.Event) -> dict:
    data = {}
    for col in event.__table__.columns:
        val = getattr(event, col.key)
        if val is not None and hasattr(val, "isoformat"):
            val = val.isoformat()
        data[col.key] = val
    return data

# ---------------------------------------------------------------------------
# User-facing: Registration actions
# ---------------------------------------------------------------------------

@router.post("/events/{event_id}/register")
def register_for_event(
    event_id: int,
    data: schemas.EventRegistrationCreate = schemas.EventRegistrationCreate(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Register the authenticated user for an event."""
    event = _event_or_404(db, event_id)
    if event.status != "approved":
        raise HTTPException(status_code=400, detail="Event is not available for registration")

    # Check for existing registration
    existing = db.query(models.EventRegistration).filter(
        models.EventRegistration.event_id == event_id,
        models.EventRegistration.user_id == current_user.id,
    ).first()

    if existing:
        if existing.status == "cancelled":
            # Re-activate cancelled registration
            existing.status = "confirmed"
            existing.notes = data.notes
            existing.ticket_type = data.ticket_type
            existing.guests = data.guests
            existing.payment_method = data.payment_method
            db.commit()
            db.refresh(existing)
            # Bump attendees
            event.attendees = (event.attendees or 0) + 1
            db.commit()
            return {
                "message": "Registration confirmed",
                "registration": _enrich_registration(db, existing),
                "registered": True,
            }
        raise HTTPException(status_code=409, detail="Already registered for this event")

    reg = models.EventRegistration(
        event_id=event_id,
        user_id=current_user.id,
        status="confirmed",
        notes=data.notes,
        ticket_type=data.ticket_type,
        guests=data.guests,
        payment_method=data.payment_method,
        payment_phone=data.payment_phone,
        payment_status="paid" if data.ticket_type == "vip" else "pending"
    )
    db.add(reg)
    event.attendees = (event.attendees or 0) + 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Already registered for this event")
    db.refresh(reg)
    db.refresh(event)

    # Notify event author
    if event.author_id and event.author_id != current_user.id:
        notifications_service.create_notification(
            db,
            event.author_id,
            "event_registration",
            "New Event Registration",
            f"{current_user.name} registered for '{event.title}'",
        )

    # Notify the user (Confirmation)
    notifications_service.create_notification(
        db,
        current_user.id,
        "event_registration_confirmed",
        "Registration Confirmed",
        f"You have successfully registered for '{event.title}'.",
    )
    
    db.commit()

    return {
        "message": "Successfully registered",
        "registration": _enrich_registration(db, reg),
        "registered": True,
    }


@router.delete("/events/{event_id}/register")
def cancel_event_registration(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Cancel the authenticated user's registration for an event."""
    reg = db.query(models.EventRegistration).filter(
        models.EventRegistration.event_id == event_id,
        models.EventRegistration.user_id == current_user.id,
    ).first()
    if not reg or reg.status == "cancelled":
        raise HTTPException(status_code=404, detail="No active registration found")

    reg.status = "cancelled"
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if event:
        event.attendees = max((event.attendees or 1) - 1, 0)
    db.commit()
    return {"message": "Registration cancelled", "registered": False}


@router.get("/events/my-registrations", response_model=List[schemas.EventRegistrationResponse])
def get_my_registrations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Return all events the current user has registered for (non-cancelled)."""
    regs = db.query(models.EventRegistration).filter(
        models.EventRegistration.user_id == current_user.id,
        models.EventRegistration.status != "cancelled",
    ).order_by(models.EventRegistration.created_at.desc()).all()
    return [_enrich_registration(db, r) for r in regs]


@router.get("/events/{event_id}/registration-status")
def get_registration_status(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    """Return whether the current user is registered for an event."""
    reg = db.query(models.EventRegistration).filter(
        models.EventRegistration.event_id == event_id,
        models.EventRegistration.user_id == current_user.id,
        models.EventRegistration.status != "cancelled",
    ).first()
    return {"registered": reg is not None, "registration_id": reg.id if reg else None, "status": reg.status if reg else None}


# ---------------------------------------------------------------------------
# Marketing Admin: Event CRUD
# ---------------------------------------------------------------------------

@router.get("/admin/events")
def list_admin_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketing_admin),
):
    events = db.query(models.Event).order_by(models.Event.created_at.desc()).all()
    return [_event_to_dict(e) for e in events]


@router.post("/admin/events")
def create_admin_event(
    data: schemas.EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketing_admin),
):
    event = models.Event(
        **data.dict(),
        author_id=current_user.id,
        status="approved",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return {"message": "Event created", "event": _event_to_dict(event)}


@router.get("/admin/events/{event_id}")
def get_admin_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketing_admin),
):
    return _event_to_dict(_event_or_404(db, event_id))


@router.put("/admin/events/{event_id}")
def update_admin_event(
    event_id: int,
    data: schemas.AdminContentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketing_admin),
):
    event = _event_or_404(db, event_id)
    for key, value in data.dict(exclude_unset=True).items():
        if hasattr(event, key):
            setattr(event, key, value)
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return {"message": "Event updated", "event": _event_to_dict(event)}


@router.delete("/admin/events/{event_id}")
def delete_admin_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketing_admin),
):
    event = _event_or_404(db, event_id)
    # Remove registrations first
    db.query(models.EventRegistration).filter(
        models.EventRegistration.event_id == event_id
    ).delete()
    db.delete(event)
    db.commit()
    return {"message": "Event deleted"}


# ---------------------------------------------------------------------------
# Marketing Admin: Participant Management
# ---------------------------------------------------------------------------

@router.get("/admin/events/{event_id}/participants", response_model=List[schemas.EventRegistrationAdminView])
def list_participants(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketing_admin),
):
    _event_or_404(db, event_id)
    regs = db.query(models.EventRegistration).filter(
        models.EventRegistration.event_id == event_id,
    ).order_by(models.EventRegistration.created_at.desc()).all()
    return [_enrich_participant(db, r) for r in regs]


@router.put("/admin/events/{event_id}/participants/{reg_id}/status")
def update_participant_status(
    event_id: int,
    reg_id: int,
    data: schemas.EventRegistrationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketing_admin),
):
    valid_statuses = {"confirmed", "cancelled", "waitlisted"}
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    reg = _reg_or_404(db, event_id, reg_id)
    reg.status = data.status
    db.commit()
    return {"message": f"Registration status updated to {data.status}"}


@router.delete("/admin/events/{event_id}/participants/{reg_id}")
def remove_participant(
    event_id: int,
    reg_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_marketing_admin),
):
    reg = _reg_or_404(db, event_id, reg_id)
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if event and reg.status == "confirmed":
        event.attendees = max((event.attendees or 1) - 1, 0)
    db.delete(reg)
    db.commit()
    return {"message": "Participant removed"}
